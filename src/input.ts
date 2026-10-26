// The <dicta-input> element: a text field and a push-to-talk microphone button.

import { type Capture, startCapture } from "./audio/capture.ts";
import { VoiceDetector } from "./audio/detector.ts";
import { Connection, type Transcript } from "./connection.ts";

const DEFAULT_INPUTS = "text voice";
const LISTEN_MODES = ["hold", "toggle"] as const;
type ListenMode = (typeof LISTEN_MODES)[number];
const DEFAULT_LISTEN_MODES = "hold toggle";
const LISTEN_MODE_NAMES: Record<ListenMode, string> = {
  hold: "Hold to talk",
  toggle: "Hands-free",
};
// The user's choice of listen mode, kept in the browser.
const LISTEN_MODE_STORAGE_KEY = "dicta-voice-listen-mode";
const SUBMIT_MODES = ["review", "auto"] as const;
type SubmitMode = (typeof SUBMIT_MODES)[number];
const DEFAULT_SUBMIT_MODES = "review auto";
// The user's choice of submit mode, kept in the browser.
const SUBMIT_MODE_STORAGE_KEY = "dicta-voice-submit-mode";
// Audio captured after the user ends an utterance, so the last word is not cut.
const POST_ROLL_MS = 300;
// A toggle session without speech for this long ends by itself.
const IDLE_SESSION_MS = 5 * 60 * 1000;

const STYLE = `
  :host {
    display: block;
  }
  .caption:empty,
  .status:empty {
    display: none;
  }
  textarea:focus-visible,
  button:focus-visible {
    outline: 2px solid #1a5fb4;
    outline-offset: 2px;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: end;
  }
  textarea {
    flex: 1;
    box-sizing: border-box;
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #888;
    font: inherit;
    line-height: 1.4;
    resize: none;
    overflow-y: auto;
    /* 5 lines, then it scrolls. */
    max-height: calc(5lh + 1rem + 2px);
  }
  [hidden] {
    display: none;
  }
  /* For screen readers only. */
  .announcer {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
`;

type Input = "text" | "voice" | "mixed";

// The modes named in an attribute's value, in its order.
function allowedModes<T extends string>(value: string, modes: readonly T[]) {
  const words = value.split(/\s+/);
  return modes
    .filter((mode) => words.includes(mode))
    .sort((a, b) => words.indexOf(a) - words.indexOf(b));
}

// The mode the user chose on this page, else the one stored in the browser,
// when it is allowed; otherwise the first allowed mode.
function choose<T extends string>(
  allowed: T[],
  chosen: string | undefined,
  key: string,
): T {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
  } catch {
    // Storage can fail, as in some private windows.
  }
  for (const mode of [chosen, stored]) {
    if (allowed.includes(mode as T)) {
      return mode as T;
    }
  }
  return allowed[0]!;
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage, the choice lasts until the page is left.
  }
}

const MICROPHONE_ICON = `<svg viewBox="0 0 24 24" width="24" height="24"
  aria-hidden="true" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0
  0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7
  7 0 0 0 19 11h-2z"/></svg>`;

export class DictaInput extends HTMLElement {
  static observedAttributes = [
    "inputs",
    "label",
    "placeholder",
    "voice-listen-modes",
    "voice-submit-modes",
  ];

  // Set by the application; see specs/architecture.md (Element).
  getToken: (() => Promise<string>) | undefined;

  #caption: HTMLDivElement;
  // The visible status line: listening, each voice final, failures.
  #status: HTMLDivElement;
  // The same text for screen readers, so hiding the status line does not
  // silence it.
  #announcer: HTMLDivElement;
  #field: HTMLTextAreaElement;
  #button: HTMLButtonElement;
  #listenModeSelect: HTMLSelectElement;
  // The mode the user chose here, for when storage fails.
  #chosenListenMode: string | undefined;
  #submitModeSwitch: HTMLLabelElement;
  #reviewBox: HTMLInputElement;
  #chosenSubmitMode: string | undefined;
  #connection: Connection | undefined;
  // The capture of the hold utterance or toggle session.
  #capture: Promise<Capture> | undefined;
  #detector: VoiceDetector | undefined;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  // During a hold utterance or a whole toggle session.
  #listening = false;
  #ending = false;
  // The last voice final with text since the listening started.
  #heard: string | undefined;
  // Whether voice finals go into the field, fixed for each listening.
  #review = false;
  // In review, the field's text around the interim text while it is shown.
  #interim: { before: string; after: string } | undefined;
  // What went into the field since it was last submitted or empty.
  #typed = false;
  #spoken = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.#caption = document.createElement("div");
    this.#caption.className = "caption";
    this.#caption.part.add("caption");
    this.#status = document.createElement("div");
    this.#status.className = "status";
    this.#status.part.add("status");
    this.#status.setAttribute("aria-hidden", "true");
    this.#announcer = document.createElement("div");
    this.#announcer.className = "announcer";
    this.#announcer.setAttribute("role", "status");
    this.#field = document.createElement("textarea");
    this.#field.rows = 1;
    this.#field.part.add("field");
    this.#field.addEventListener("keydown", (event) => this.#onFieldKey(event));
    this.#field.addEventListener("input", () => {
      this.#typed = this.#field.value !== "";
      this.#spoken &&= this.#typed;
      this.#fit();
    });
    this.#button = document.createElement("button");
    this.#button.type = "button";
    this.#button.part.add("button");
    this.#button.innerHTML = MICROPHONE_ICON;
    this.#button.setAttribute("aria-label", "Speak");
    this.#button.setAttribute("aria-pressed", "false");
    this.#button.addEventListener("pointerdown", (event) => {
      this.#button.setPointerCapture(event.pointerId);
      this.#press();
    });
    this.#button.addEventListener("pointerup", () => this.#release());
    this.#button.addEventListener("pointercancel", () => this.#release());
    this.#button.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (!event.repeat) {
          this.#press();
        }
      }
    });
    this.#button.addEventListener("keyup", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        this.#release();
      }
    });
    const row = document.createElement("div");
    row.className = "row";
    this.#listenModeSelect = document.createElement("select");
    this.#listenModeSelect.part.add("voice-listen-mode");
    this.#listenModeSelect.setAttribute("aria-label", "Voice mode");
    for (const mode of LISTEN_MODES) {
      this.#listenModeSelect.append(new Option(LISTEN_MODE_NAMES[mode], mode));
    }
    this.#listenModeSelect.addEventListener("change", () => {
      this.#chosenListenMode = this.#listenModeSelect.value;
      store(LISTEN_MODE_STORAGE_KEY, this.#chosenListenMode);
    });
    this.#reviewBox = document.createElement("input");
    this.#reviewBox.type = "checkbox";
    this.#reviewBox.addEventListener("change", () => {
      this.#chosenSubmitMode = this.#reviewBox.checked ? "review" : "auto";
      store(SUBMIT_MODE_STORAGE_KEY, this.#chosenSubmitMode);
    });
    this.#submitModeSwitch = document.createElement("label");
    this.#submitModeSwitch.part.add("voice-submit-mode");
    this.#submitModeSwitch.append(this.#reviewBox, " Review before sending");
    row.append(this.#field, this.#button, this.#listenModeSelect);
    root.append(
      style,
      this.#caption,
      row,
      this.#submitModeSwitch,
      this.#status,
      this.#announcer,
    );
  }

  connectedCallback() {
    this.#render();
  }

  disconnectedCallback() {
    clearTimeout(this.#idleTimer);
    this.#connection?.close();
    this.#connection = undefined;
    this.#stopCapture();
  }

  attributeChangedCallback() {
    this.#render();
  }

  #render() {
    const inputs = (this.getAttribute("inputs") ?? DEFAULT_INPUTS).split(/\s+/);
    this.#field.hidden = !inputs.includes("text");
    this.#button.hidden = !inputs.includes("voice");
    this.#listenModeSelect.hidden =
      this.#button.hidden || this.#allowedListenModes().length < 2;
    this.#listenModeSelect.value = this.#listenMode();
    this.#submitModeSwitch.hidden =
      this.#field.hidden ||
      this.#button.hidden ||
      this.#allowedSubmitModes().length < 2;
    this.#reviewBox.checked = this.#submitMode() === "review";
    const placeholder = this.getAttribute("placeholder");
    if (placeholder) {
      this.#field.placeholder = placeholder;
    } else {
      this.#field.removeAttribute("placeholder");
    }
    const name = this.getAttribute("label") || placeholder;
    if (name) {
      this.#field.setAttribute("aria-label", name);
    } else {
      this.#field.removeAttribute("aria-label");
    }
  }

  #onFieldKey(event: KeyboardEvent) {
    // Enter while an input method is composing text belongs to the composition.
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
      return;
    }
    event.preventDefault();
    const text = this.#field.value.trim();
    if (!text || this.#interim) {
      return;
    }
    const input =
      this.#typed && this.#spoken ? "mixed" : this.#spoken ? "voice" : "text";
    this.#field.value = "";
    this.#typed = false;
    this.#spoken = false;
    this.#fit();
    this.#sendText(text, input);
  }

  // Grows the field with its content; max-height stops it at 5 lines.
  #fit() {
    const field = this.#field;
    field.style.height = "auto";
    const borders = field.offsetHeight - field.clientHeight;
    field.style.height = `${field.scrollHeight + borders}px`;
  }

  #sendText(text: string, input: Input) {
    this.dispatchEvent(
      new CustomEvent("dicta-text", {
        detail: { text, input },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // The modes the integrator allows, the first one the default.
  #allowedListenModes(): ListenMode[] {
    const allowed = allowedModes(
      this.getAttribute("voice-listen-modes") ?? DEFAULT_LISTEN_MODES,
      LISTEN_MODES,
    );
    return allowed.length > 0 ? allowed : ["hold"];
  }

  #allowedSubmitModes(): SubmitMode[] {
    const allowed = allowedModes(
      this.getAttribute("voice-submit-modes") ?? DEFAULT_SUBMIT_MODES,
      SUBMIT_MODES,
    );
    return allowed.length > 0 ? allowed : ["review"];
  }

  #listenMode(): ListenMode {
    return choose(
      this.#allowedListenModes(),
      this.#chosenListenMode,
      LISTEN_MODE_STORAGE_KEY,
    );
  }

  // Without text input there is no field to review in.
  #submitMode(): SubmitMode {
    if (this.#field.hidden) {
      return "auto";
    }
    return choose(
      this.#allowedSubmitModes(),
      this.#chosenSubmitMode,
      SUBMIT_MODE_STORAGE_KEY,
    );
  }

  // The modes cannot change during an utterance or session.
  #lockSwitches(locked: boolean) {
    this.#listenModeSelect.disabled = locked;
    this.#reviewBox.disabled = locked;
  }

  // While listening, the mode of the current utterance or session counts: a
  // toggle session has a detector.
  #press() {
    if (!this.#listening) {
      this.#start();
    } else if (this.#detector) {
      void this.#end();
    }
  }

  #release() {
    if (this.#listening && !this.#detector) {
      void this.#end();
    }
  }

  // Starts a hold utterance or a toggle session.
  #start() {
    if (this.#listening || this.#ending) {
      return;
    }
    this.#listening = true;
    this.#heard = undefined;
    this.#review = this.#submitMode() === "review";
    this.#button.setAttribute("aria-pressed", "true");
    this.#lockSwitches(true);
    this.#setStatus("Listening");
    if (!this.#connection || this.#connection.closed) {
      this.#connection = new Connection(
        {
          server: this.getAttribute("server") ?? "",
          lang: this.getAttribute("lang") ?? undefined,
          getToken: this.getToken,
        },
        {
          onTranscript: (transcript) => this.#onTranscript(transcript),
          onClose: () => this.#onClose(),
        },
      );
    }
    const connection = this.#connection;
    // In toggle, the detector decides what is sent and where utterances end.
    const detector =
      this.#listenMode() === "toggle" ? new VoiceDetector() : undefined;
    this.#detector = detector;
    const onFrame = (frame: ArrayBuffer) => {
      if (!detector) {
        connection.sendAudio(frame);
        return;
      }
      const { send, end } = detector.push(frame);
      for (const item of send) {
        connection.sendAudio(item);
      }
      if (send.length > 0) {
        this.#restartIdleTimer();
      }
      if (end) {
        connection.end();
      }
    };
    if (detector) {
      this.#restartIdleTimer();
    }
    // Started in the press handler: Safari starts audio only from a user action.
    const capture = startCapture(onFrame);
    capture.catch(() => this.#onClose());
    this.#capture = capture;
  }

  // Ends the hold utterance or the toggle session.
  async #end() {
    if (!this.#listening) {
      return;
    }
    this.#listening = false;
    this.#ending = true;
    this.#button.setAttribute("aria-pressed", "false");
    this.#lockSwitches(false);
    clearTimeout(this.#idleTimer);
    const capture = this.#capture;
    const connection = this.#connection;
    const detector = this.#detector;
    // Outside speech, a toggle session just stops.
    const speaking = !detector || detector.speaking;
    if (speaking) {
      await new Promise((resolve) => setTimeout(resolve, POST_ROLL_MS));
    }
    try {
      await (await capture)?.stop();
      // The detector may have ended the utterance itself meanwhile.
      if (!detector || detector.speaking) {
        connection?.end();
      }
      if (this.#status.textContent?.startsWith("Listening")) {
        this.#setStatus(this.#heard ?? "");
      }
    } catch {
      // The microphone failed; #onClose has already cleaned up.
    }
    if (this.#capture === capture) {
      this.#capture = undefined;
    }
    this.#ending = false;
  }

  #restartIdleTimer() {
    clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => void this.#end(), IDLE_SESSION_MS);
  }

  #onTranscript({ text, final }: Transcript) {
    if (this.#review) {
      this.#showInField(text, final);
    } else {
      this.#caption.textContent = final ? "" : text;
    }
    if (!final || !text) {
      return;
    }
    // While listening goes on, the status keeps saying so.
    this.#heard = text;
    this.#setStatus(this.#listening ? `Listening. Heard: ${text}` : text);
    if (!this.#review) {
      this.#sendText(text, "voice");
    }
  }

  // Shows the text at the cursor, in place of the selection, until the final.
  #showInField(text: string, final: boolean) {
    // Nothing to show or remove, so a selection stays as it is.
    if (!text && !this.#interim) {
      return;
    }
    const field = this.#field;
    this.#interim ??= {
      before: field.value.slice(0, field.selectionStart),
      after: field.value.slice(field.selectionEnd),
    };
    let { before, after } = this.#interim;
    if (text) {
      if (before && !/\s$/.test(before)) {
        before += " ";
      }
      if (after && !/^\s/.test(after)) {
        after = ` ${after}`;
      }
    }
    field.value = before + text + after;
    field.readOnly = !final;
    if (final) {
      this.#interim = undefined;
      this.#spoken ||= text !== "";
      const cursor = (before + text).length;
      field.setSelectionRange(cursor, cursor);
    }
    this.#fit();
  }

  // Puts back the field's text without the interim text.
  #removeInterim() {
    if (this.#interim) {
      this.#field.value = this.#interim.before + this.#interim.after;
      this.#field.readOnly = false;
      this.#interim = undefined;
      this.#fit();
    }
  }

  // The connection closed or the microphone failed: listening is over.
  #onClose() {
    if (this.#listening || this.#ending) {
      this.#setStatus("Voice failed");
    }
    clearTimeout(this.#idleTimer);
    this.#stopCapture();
    this.#listening = false;
    this.#button.setAttribute("aria-pressed", "false");
    this.#lockSwitches(false);
    this.#caption.textContent = "";
    this.#removeInterim();
  }

  #setStatus(text: string) {
    this.#status.textContent = text;
    this.#announcer.textContent = text;
  }

  #stopCapture() {
    const capture = this.#capture;
    this.#capture = undefined;
    capture?.then((started) => started.stop()).catch(() => {});
  }
}
