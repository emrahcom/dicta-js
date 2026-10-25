// The <dicta-input> element. Only the text input exists so far.

const DEFAULT_INPUTS = "text voice";

const STYLE = `
  :host {
    display: block;
  }
  textarea {
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
`;

export class DictaInput extends HTMLElement {
  static observedAttributes = ["inputs", "placeholder"];

  #field: HTMLTextAreaElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.#field = document.createElement("textarea");
    this.#field.rows = 1;
    this.#field.addEventListener("keydown", (event) => this.#onKeyDown(event));
    this.#field.addEventListener("input", () => this.#fit());
    root.append(style, this.#field);
  }

  connectedCallback() {
    this.#render();
  }

  attributeChangedCallback() {
    this.#render();
  }

  #render() {
    const inputs = (this.getAttribute("inputs") ?? DEFAULT_INPUTS).split(/\s+/);
    this.#field.hidden = !inputs.includes("text");
    const placeholder = this.getAttribute("placeholder");
    if (placeholder) {
      this.#field.placeholder = placeholder;
      this.#field.setAttribute("aria-label", placeholder);
    } else {
      this.#field.removeAttribute("placeholder");
      this.#field.removeAttribute("aria-label");
    }
  }

  #onKeyDown(event: KeyboardEvent) {
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
    this.dispatchEvent(
      new CustomEvent("dicta-text", {
        detail: { text, input: "text" },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // Grows the field with its content; max-height stops it at 5 lines.
  #fit() {
    const field = this.#field;
    field.style.height = "auto";
    const borders = field.offsetHeight - field.clientHeight;
    field.style.height = `${field.scrollHeight + borders}px`;
  }
}
