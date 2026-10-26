// The voice settings: the listen and submit modes the integrator allows, the
// user's choice among them, and the panel where the user makes it.

export const LISTEN_MODES = ["hold", "toggle"] as const;
export type ListenMode = (typeof LISTEN_MODES)[number];
const DEFAULT_LISTEN_MODES = "hold toggle";
const LISTEN_MODE_NAMES: Record<ListenMode, string> = {
  hold: "Hold to talk",
  toggle: "Hands-free",
};
// The user's choice of listen mode, kept in the browser.
const LISTEN_MODE_STORAGE_KEY = "dicta-voice-listen-mode";
export const SUBMIT_MODES = ["review", "auto"] as const;
export type SubmitMode = (typeof SUBMIT_MODES)[number];
const DEFAULT_SUBMIT_MODES = "review auto";
// The user's choice of submit mode, kept in the browser.
const SUBMIT_MODE_STORAGE_KEY = "dicta-voice-submit-mode";

export const SETTINGS_STYLE = `
  /* 24 px wide at least, the WCAG target size. */
  .settings {
    padding-inline: 4px;
    border-left: none;
  }
  .settings:disabled {
    color: #888;
  }
  /* Placed next to the arrow when it opens. */
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
`;

const ARROW_ICON = `<svg viewBox="0 0 16 24" width="16" height="24"
  aria-hidden="true" fill="currentColor"><path d="M3 10l5 5 5-5z"/></svg>`;

// The modes named in an attribute's value, in its order.
export function allowedModes<T extends string>(
  value: string,
  modes: readonly T[],
) {
  const words = value.split(/\s+/);
  return modes
    .filter((mode) => words.includes(mode))
    .sort((a, b) => words.indexOf(a) - words.indexOf(b));
}

// The mode the user chose on this page, else the one stored in the browser,
// when it is allowed; otherwise the first allowed mode.
export function choose<T extends string>(
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

// What the settings depend on in the element.
export type SettingsInput = {
  // The values of voice-listen-modes and voice-submit-modes.
  listenModes: string | null;
  submitModes: string | null;
  text: boolean;
  voice: boolean;
};

// The arrow next to the microphone button and the panel it opens.
export class VoiceSettings {
  readonly arrow: HTMLButtonElement;
  readonly panel: HTMLDivElement;
  #input: SettingsInput = {
    listenModes: null,
    submitModes: null,
    text: true,
    voice: true,
  };
  #listenModeSwitch: HTMLFieldSetElement;
  #listenModeRadios: HTMLInputElement[];
  // The mode the user chose here, for when storage fails.
  #chosenListenMode: string | undefined;
  #submitModeSwitch: HTMLLabelElement;
  #reviewBox: HTMLInputElement;
  #chosenSubmitMode: string | undefined;

  constructor() {
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
    this.panel = document.createElement("div");
    this.panel.className = "panel";
    this.panel.popover = "auto";
    this.panel.append(this.#listenModeSwitch, this.#submitModeSwitch);
    this.panel.addEventListener("beforetoggle", (event) => {
      if ((event as ToggleEvent).newState === "open") {
        this.#place();
      }
    });
    this.arrow = document.createElement("button");
    this.arrow.type = "button";
    this.arrow.className = "settings";
    this.arrow.part.add("voice-settings");
    this.arrow.innerHTML = ARROW_ICON;
    this.arrow.setAttribute("aria-label", "Voice settings");
    this.arrow.popoverTargetElement = this.panel;
  }

  // Shows the switches the integrator allows, set to the current modes.
  render(input: SettingsInput) {
    this.#input = input;
    this.#listenModeSwitch.hidden = this.#allowedListenModes().length < 2;
    const listenMode = this.listenMode();
    for (const radio of this.#listenModeRadios) {
      radio.checked = radio.value === listenMode;
    }
    this.#submitModeSwitch.hidden =
      !input.text || this.#allowedSubmitModes().length < 2;
    this.#reviewBox.checked = this.submitMode() === "review";
    this.arrow.hidden =
      !input.voice ||
      (this.#listenModeSwitch.hidden && this.#submitModeSwitch.hidden);
  }

  listenMode(): ListenMode {
    return choose(
      this.#allowedListenModes(),
      this.#chosenListenMode,
      LISTEN_MODE_STORAGE_KEY,
    );
  }

  // Without text input there is no field to review in.
  submitMode(): SubmitMode {
    if (!this.#input.text) {
      return "auto";
    }
    return choose(
      this.#allowedSubmitModes(),
      this.#chosenSubmitMode,
      SUBMIT_MODE_STORAGE_KEY,
    );
  }

  // The modes cannot change during an utterance or session.
  lock(listening: boolean) {
    this.arrow.disabled = listening;
    if (listening && this.panel.matches(":popover-open")) {
      this.panel.hidePopover();
    }
  }

  // The modes the integrator allows, the first one the default.
  #allowedListenModes(): ListenMode[] {
    const allowed = allowedModes(
      this.#input.listenModes ?? DEFAULT_LISTEN_MODES,
      LISTEN_MODES,
    );
    return allowed.length > 0 ? allowed : ["hold"];
  }

  #allowedSubmitModes(): SubmitMode[] {
    const allowed = allowedModes(
      this.#input.submitModes ?? DEFAULT_SUBMIT_MODES,
      SUBMIT_MODES,
    );
    return allowed.length > 0 ? allowed : ["review"];
  }

  // Puts the panel under the arrow, or over it in the lower half of the
  // viewport, so it stays on screen; its right edge is on the arrow's.
  #place() {
    const arrow = this.arrow.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    const below = arrow.top + arrow.bottom < clientHeight;
    const style = this.panel.style;
    style.top = below ? `${arrow.bottom + 4}px` : "auto";
    style.bottom = below ? "auto" : `${clientHeight - arrow.top + 4}px`;
    style.right = `${clientWidth - arrow.right}px`;
  }
}
