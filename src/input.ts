// The <dicta-input> element: a text field and a push-to-talk microphone button.

import { type Capture, startCapture } from "./audio/capture.ts";
import { Connection, type Transcript } from "./connection.ts";

const DEFAULT_INPUTS = "text voice";
// Audio captured after the user ends an utterance, so the last word is not cut.
const POST_ROLL_MS = 300;

const STYLE = `
  :host {
    display: block;
  }
  .caption:empty {
    display: none;
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
  static observedAttributes = ["inputs", "label", "placeholder"];

  // Set by the application; see specs/architecture.md (Element).
  getToken: (() => Promise<string>) | undefined;

  #caption: HTMLDivElement;
  #field: HTMLTextAreaElement;
  #button: HTMLButtonElement;
  #connection: Connection | undefined;
  // The capture of the utterance being spoken or ended.
  #capture: Promise<Capture> | undefined;
  #speaking = false;
  #ending = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.#caption = document.createElement("div");
    this.#caption.className = "caption";
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
    row.append(this.#field, this.#button);
    root.append(style, this.#caption, row);
  }

  connectedCallback() {
    this.#render();
  }

  disconnectedCallback() {
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

  #toggleMode() {
    return this.getAttribute("voice-mode") === "toggle";
  }

  #press() {
    if (this.#toggleMode() && this.#speaking) {
      void this.#end();
    } else {
      this.#start();
    }
  }

  #release() {
    if (!this.#toggleMode()) {
      void this.#end();
    }
  }

  #start() {
    if (this.#speaking || this.#ending) {
      return;
    }
    this.#speaking = true;
    this.#button.setAttribute("aria-pressed", "true");
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
    // Started in the press handler: Safari starts audio only from a user action.
    const capture = startCapture((frame) => connection.sendAudio(frame));
    capture.catch(() => this.#onClose());
    this.#capture = capture;
  }

  async #end() {
    if (!this.#speaking) {
      return;
    }
    this.#speaking = false;
    this.#ending = true;
    this.#button.setAttribute("aria-pressed", "false");
    const capture = this.#capture;
    const connection = this.#connection;
    await new Promise((resolve) => setTimeout(resolve, POST_ROLL_MS));
    try {
      await (await capture)?.stop();
      connection?.end();
    } catch {
      // The microphone failed; #onClose has already cleaned up.
    }
    if (this.#capture === capture) {
      this.#capture = undefined;
    }
    this.#ending = false;
  }

  #onTranscript({ text, final }: Transcript) {
    if (!final) {
      this.#caption.textContent = text;
      return;
    }
    this.#caption.textContent = "";
    if (text) {
      this.#sendText(text, "voice");
    }
  }

  // The connection closed or the microphone failed: the utterance is over.
  #onClose() {
    this.#stopCapture();
    this.#speaking = false;
    this.#button.setAttribute("aria-pressed", "false");
    this.#caption.textContent = "";
  }

  #stopCapture() {
    const capture = this.#capture;
    this.#capture = undefined;
    capture?.then((started) => started.stop()).catch(() => {});
  }
}
