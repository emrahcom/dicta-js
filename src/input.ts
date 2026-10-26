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
// In the text field, works like the microphone button.
const SHORTCUT = "Control+Shift+Space";
// A toggle session without speech for this long ends by itself.
const IDLE_SESSION_MS = 5 * 60 * 1000;
// A connection not used for this long after listening is closed.
const IDLE_CONNECTION_MS = 60 * 1000;

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
  /* The microphone button and the settings arrow look like one control. */
  .voice {
    display: flex;
  }
  /* 24 px wide at least, the WCAG target size. */
  .settings {
    padding-inline: 4px;
    border-left: none;
  }
  .settings:disabled {
    color: #888;
  }
  /* Placed under the arrow when it opens. */
  .panel {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 0.5rem;
    border: 1px solid #888;
    background: #fff;
    color: #222;
  }
  .panel fieldset {
    margin: 0 0 0.5rem;
    padding: 0;
    border: none;
  }
  .panel label {
    display: block;
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
  button {
    padding: calc(0.25rem + 2px);
    border: 1px solid #888;
    background: #fff;
    color: #222;
    line-height: 0;
  }
  /* A hold on a touch screen is not taken as a scroll, selection or callout. */
  .microphone {
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  /* Listening: filled and a thicker border, so not by color alone. The padding
     makes up for the border, so the size stays the same. */
  button[aria-pressed="true"] {
    padding: 0.25rem;
    border: 3px solid #0b3a75;
    background: #1a5fb4;
    color: #fff;
  }
  [hidden] {
    display: none !important;
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

const SEND_ICON = `<svg viewBox="0 0 24 24" width="24" height="24"
  aria-hidden="true" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15
  2z"/></svg>`;

const ARROW_ICON = `<svg viewBox="0 0 16 24" width="16" height="24"
  aria-hidden="true" fill="currentColor"><path d="M3 10l5 5 5-5z"/></svg>`;

// A pointer press on a button keeps the focus where it is, so the cursor stays
// in the text field.
function keepFocus(button: HTMLButtonElement) {
  button.addEventListener("mousedown", (event) => event.preventDefault());
}

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

  // Carries the custom state `listening`, for the page's CSS.
  #internals: ElementInternals;
  #caption: HTMLDivElement;
  // The visible status line: listening, each voice final, failures.
  #status: HTMLDivElement;
  // The same text for screen readers, so hiding the status line does not
  // silence it.
  #announcer: HTMLDivElement;
  #field: HTMLTextAreaElement;
  #button: HTMLButtonElement;
  #sendButton: HTMLButtonElement;
  // A key holds the button: Space or Enter on it, or Ctrl+Shift+Space in the
  // text field.
  #keyDown = false;
  // A press while an utterance is ending, started when it is done: whether it
  // is a toggle press.
  #pressWhileEnding: boolean | undefined;
  // A pointer press on the button, whose click is then ignored.
  #pointerPressed = false;
  // Opens the voice settings panel.
  #settingsButton: HTMLButtonElement;
  #panel: HTMLDivElement;
  #listenModeSwitch: HTMLFieldSetElement;
  #listenModeRadios: HTMLInputElement[];
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
  #closeTimer: ReturnType<typeof setTimeout> | undefined;
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
    this.#internals = this.attachInternals();
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
    this.#field.addEventListener("keyup", (event) => {
      if (event.code === "Space" && this.#keyDown) {
        this.#keyDown = false;
        this.#release();
      }
    });
    this.#field.addEventListener("blur", () => this.#releaseKey());
    this.#field.addEventListener("input", () => {
      this.#typed = this.#field.value !== "";
      this.#spoken &&= this.#typed;
      this.#fit();
    });
    this.#button = document.createElement("button");
    this.#button.type = "button";
    this.#button.part.add("button");
    this.#button.className = "microphone";
    this.#button.innerHTML = MICROPHONE_ICON;
    this.#button.setAttribute("aria-label", "Speak");
    this.#button.title = "Speak (Ctrl+Shift+Space)";
    this.#button.setAttribute("aria-pressed", "false");
    keepFocus(this.#button);
    this.#button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      this.#button.setPointerCapture(event.pointerId);
      this.#pointerPressed = true;
      this.#press();
    });
    this.#button.addEventListener("pointerup", () => this.#release());
    this.#button.addEventListener("pointercancel", () => {
      this.#pointerPressed = false;
      this.#release();
    });
    // A click alone comes from a screen reader, or from the page's code; it
    // cannot be held, so it works as a toggle press.
    this.#button.addEventListener("click", () => {
      if (this.#pointerPressed) {
        this.#pointerPressed = false;
      } else {
        this.#press(true);
      }
    });
    this.#button.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (!event.repeat) {
          this.#keyDown = true;
          this.#press();
        }
      }
    });
    this.#button.addEventListener("keyup", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        this.#keyDown = false;
        this.#release();
      }
    });
    this.#button.addEventListener("blur", () => this.#releaseKey());
    this.#sendButton = document.createElement("button");
    this.#sendButton.type = "button";
    this.#sendButton.part.add("send");
    this.#sendButton.innerHTML = SEND_ICON;
    this.#sendButton.setAttribute("aria-label", "Send");
    keepFocus(this.#sendButton);
    this.#sendButton.addEventListener("click", () => this.#submit());
    this.#listenModeSwitch = document.createElement("fieldset");
    this.#listenModeSwitch.part.add("voice-listen-mode");
    const legend = document.createElement("legend");
    legend.textContent = "Listen mode";
    this.#listenModeSwitch.append(legend);
    this.#listenModeRadios = LISTEN_MODES.map((mode) => {
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "listen-mode";
      radio.value = mode;
      radio.addEventListener("change", () => {
        this.#chosenListenMode = mode;
        store(LISTEN_MODE_STORAGE_KEY, mode);
      });
      const label = document.createElement("label");
      label.append(radio, ` ${LISTEN_MODE_NAMES[mode]}`);
      this.#listenModeSwitch.append(label);
      return radio;
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
    this.#panel = document.createElement("div");
    this.#panel.className = "panel";
    this.#panel.popover = "auto";
    this.#panel.append(this.#listenModeSwitch, this.#submitModeSwitch);
    this.#panel.addEventListener("beforetoggle", (event) => {
      if ((event as ToggleEvent).newState === "open") {
        this.#placePanel();
      }
    });
    this.#settingsButton = document.createElement("button");
    this.#settingsButton.type = "button";
    this.#settingsButton.className = "settings";
    this.#settingsButton.part.add("voice-settings");
    this.#settingsButton.innerHTML = ARROW_ICON;
    this.#settingsButton.setAttribute("aria-label", "Voice settings");
    this.#settingsButton.popoverTargetElement = this.#panel;
    const voice = document.createElement("div");
    voice.className = "voice";
    voice.append(this.#button, this.#settingsButton);
    const row = document.createElement("div");
    row.className = "row";
    row.append(this.#field, this.#sendButton, voice);
    root.append(
      style,
      this.#caption,
      row,
      this.#panel,
      this.#status,
      this.#announcer,
    );
  }

  connectedCallback() {
    this.#render();
  }

  disconnectedCallback() {
    this.#reset();
    this.#setStatus("");
    clearTimeout(this.#closeTimer);
    this.#connection?.close();
    this.#connection = undefined;
  }

  attributeChangedCallback() {
    this.#render();
  }

  #render() {
    const inputs = (this.getAttribute("inputs") ?? DEFAULT_INPUTS).split(/\s+/);
    this.#field.hidden = !inputs.includes("text");
    this.#button.hidden = !inputs.includes("voice");
    this.#sendButton.hidden = this.#field.hidden;
    if (this.#button.hidden) {
      this.#field.removeAttribute("aria-keyshortcuts");
    } else {
      this.#field.setAttribute("aria-keyshortcuts", SHORTCUT);
    }
    this.#listenModeSwitch.hidden = this.#allowedListenModes().length < 2;
    const listenMode = this.#listenMode();
    for (const radio of this.#listenModeRadios) {
      radio.checked = radio.value === listenMode;
    }
    this.#submitModeSwitch.hidden =
      this.#field.hidden || this.#allowedSubmitModes().length < 2;
    this.#reviewBox.checked = this.#submitMode() === "review";
    this.#settingsButton.hidden =
      this.#button.hidden ||
      (this.#listenModeSwitch.hidden && this.#submitModeSwitch.hidden);
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
    if (
      event.code === "Space" &&
      event.ctrlKey &&
      event.shiftKey &&
      !this.#button.hidden
    ) {
      event.preventDefault();
      if (!event.repeat) {
        this.#keyDown = true;
        this.#press();
      }
      return;
    }
    // Enter while an input method is composing text belongs to the composition.
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
      return;
    }
    event.preventDefault();
    this.#submit();
  }

  #submit() {
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
  #showListening(listening: boolean) {
    this.#button.setAttribute("aria-pressed", String(listening));
    if (listening) {
      this.#internals.states.add("listening");
    } else {
      this.#internals.states.delete("listening");
    }
    this.#settingsButton.disabled = listening;
    if (listening && this.#panel.matches(":popover-open")) {
      this.#panel.hidePopover();
    }
  }

  // Puts the panel under the arrow, or over it in the lower half of the
  // viewport, so it stays on screen; its right edge is on the arrow's.
  #placePanel() {
    const arrow = this.#settingsButton.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    const below = arrow.top + arrow.bottom < clientHeight;
    const style = this.#panel.style;
    style.top = below ? `${arrow.bottom + 4}px` : "auto";
    style.bottom = below ? "auto" : `${clientHeight - arrow.top + 4}px`;
    style.right = `${clientWidth - arrow.right}px`;
  }

  // While listening, the mode of the current utterance or session counts: a
  // toggle session has a detector.
  #press(toggle = this.#listenMode() === "toggle") {
    if (this.#ending) {
      this.#pressWhileEnding = toggle;
    } else if (!this.#listening) {
      this.#start(toggle);
    } else if (this.#detector) {
      void this.#end();
    }
  }

  #release() {
    if (this.#pressWhileEnding === false) {
      this.#pressWhileEnding = undefined;
    } else if (this.#listening && !this.#detector) {
      void this.#end();
    }
  }

  // The key release may never come once the focus has gone, for example to
  // another window.
  #releaseKey() {
    if (this.#keyDown) {
      this.#keyDown = false;
      this.#release();
    }
  }

  // Starts a hold utterance or a toggle session.
  #start(toggle: boolean) {
    if (this.#listening || this.#ending) {
      return;
    }
    this.#listening = true;
    clearTimeout(this.#closeTimer);
    this.#heard = undefined;
    this.#review = this.#submitMode() === "review";
    this.#showListening(true);
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
    const detector = toggle ? new VoiceDetector() : undefined;
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
    this.#showListening(false);
    this.#closeLater();
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
    const toggle = this.#pressWhileEnding;
    this.#pressWhileEnding = undefined;
    if (toggle !== undefined) {
      this.#start(toggle);
    }
  }

  // An idle connection holds a speech-to-text session open on the server.
  #closeLater() {
    clearTimeout(this.#closeTimer);
    this.#closeTimer = setTimeout(
      () => this.#connection?.close(),
      IDLE_CONNECTION_MS,
    );
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
    this.#reset();
  }

  // Stops listening and clears what it showed.
  #reset() {
    this.#pressWhileEnding = undefined;
    this.#keyDown = false;
    clearTimeout(this.#idleTimer);
    this.#stopCapture();
    this.#listening = false;
    this.#showListening(false);
    this.#closeLater();
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
