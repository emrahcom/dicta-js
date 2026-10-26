// The <dicta-input> element: a text field and a push-to-talk microphone button.

import { type Capture, startCapture } from "./audio/capture.ts";
import { VoiceDetector } from "./audio/detector.ts";
import { Connection, type Transcript } from "./connection.ts";

const DEFAULT_INPUTS = "text voice";
const VOICE_MODES = ["hold", "toggle"] as const;
type VoiceMode = (typeof VOICE_MODES)[number];
const DEFAULT_VOICE_MODES = "hold toggle";
const MODE_NAMES: Record<VoiceMode, string> = {
  hold: "Hold to talk",
  toggle: "Hands-free",
};
// The user's choice of voice mode, kept in the browser.
const MODE_STORAGE_KEY = "dicta-voice-mode";
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
`;

const MICROPHONE_ICON = `<svg viewBox="0 0 24 24" width="24" height="24"
  aria-hidden="true" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0
  0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7
  7 0 0 0 19 11h-2z"/></svg>`;

export class DictaInput extends HTMLElement {
  static observedAttributes = ["inputs", "label", "placeholder", "voice-modes"];

  // Set by the application; see specs/architecture.md (Element).
  getToken: (() => Promise<string>) | undefined;

  #caption: HTMLDivElement;
  // Announced by screen readers: listening, each voice final, failures.
  #status: HTMLDivElement;
  #field: HTMLTextAreaElement;
  #button: HTMLButtonElement;
  #modeSelect: HTMLSelectElement;
  // The mode the user chose here, for when storage fails.
  #chosenMode: string | undefined;
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

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.#caption = document.createElement("div");
    this.#caption.className = "caption";
    this.#status = document.createElement("div");
    this.#status.className = "status";
    this.#status.setAttribute("role", "status");
    this.#field = document.createElement("textarea");
    this.#field.rows = 1;
    this.#field.addEventListener("keydown", (event) => this.#onFieldKey(event));
    this.#field.addEventListener("input", () => this.#fit());
    this.#button = document.createElement("button");
    this.#button.type = "button";
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
    this.#modeSelect = document.createElement("select");
    this.#modeSelect.setAttribute("aria-label", "Voice mode");
    for (const mode of VOICE_MODES) {
      this.#modeSelect.append(new Option(MODE_NAMES[mode], mode));
    }
    this.#modeSelect.addEventListener("change", () => {
      this.#chosenMode = this.#modeSelect.value;
      try {
        localStorage.setItem(MODE_STORAGE_KEY, this.#modeSelect.value);
      } catch {
        // Without storage, the choice lasts until the page is left.
      }
    });
    row.append(this.#field, this.#button, this.#modeSelect);
    root.append(style, this.#caption, row, this.#status);
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
    this.#modeSelect.hidden =
      this.#button.hidden || this.#allowedModes().length < 2;
    this.#modeSelect.value = this.#mode();
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
    if (!text) {
      return;
    }
    this.#field.value = "";
    this.#fit();
    this.#sendText(text, "text");
  }

  // Grows the field with its content; max-height stops it at 5 lines.
  #fit() {
    const field = this.#field;
    field.style.height = "auto";
    const borders = field.offsetHeight - field.clientHeight;
    field.style.height = `${field.scrollHeight + borders}px`;
  }

  #sendText(text: string, input: "text" | "voice") {
    this.dispatchEvent(
      new CustomEvent("dicta-text", {
        detail: { text, input },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // The modes the integrator allows, the first one the default.
  #allowedModes(): VoiceMode[] {
    const words = (
      this.getAttribute("voice-modes") ?? DEFAULT_VOICE_MODES
    ).split(/\s+/);
    const allowed = VOICE_MODES.filter((mode) => words.includes(mode)).sort(
      (a, b) => words.indexOf(a) - words.indexOf(b),
    );
    return allowed.length > 0 ? allowed : ["hold"];
  }

  // The user's choice when it is allowed, otherwise the default.
  #mode(): VoiceMode {
    const allowed = this.#allowedModes();
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MODE_STORAGE_KEY);
    } catch {
      // Storage can fail, as in some private windows.
    }
    for (const mode of [this.#chosenMode, stored]) {
      if (allowed.includes(mode as VoiceMode)) {
        return mode as VoiceMode;
      }
    }
    return allowed[0]!;
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
    this.#button.setAttribute("aria-pressed", "true");
    this.#modeSelect.disabled = true;
    this.#status.textContent = "Listening";
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
      this.#mode() === "toggle" ? new VoiceDetector() : undefined;
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
    this.#modeSelect.disabled = false;
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
        this.#status.textContent = this.#heard ?? "";
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
    if (!final) {
      this.#caption.textContent = text;
      return;
    }
    this.#caption.textContent = "";
    if (text) {
      // While listening goes on, the status keeps saying so.
      this.#heard = text;
      this.#status.textContent = this.#listening
        ? `Listening. Heard: ${text}`
        : text;
      this.#sendText(text, "voice");
    }
  }

  // The connection closed or the microphone failed: listening is over.
  #onClose() {
    if (this.#listening || this.#ending) {
      this.#status.textContent = "Voice failed";
    }
    clearTimeout(this.#idleTimer);
    this.#stopCapture();
    this.#listening = false;
    this.#button.setAttribute("aria-pressed", "false");
    this.#modeSelect.disabled = false;
    this.#caption.textContent = "";
  }

  #stopCapture() {
    const capture = this.#capture;
    this.#capture = undefined;
    capture?.then((started) => started.stop()).catch(() => {});
  }
}
