// The WebSocket connection to dicta-server, as defined in dicta-server's
// specs/contract-protocol.md.

export type Transcript = { text: string; final: boolean };

export type ConnectionOptions = {
  server: string;
  lang?: string;
  getToken?: () => Promise<string>;
};

export type ConnectionEvents = {
  onTranscript: (transcript: Transcript) => void;
  // Called once when the connection ends without close() being called,
  // including when it cannot be set up.
  onClose: () => void;
};

const PROTOCOL = "dicta";
const LISTEN_PATH = "/dicta/v1/listen";

export class Connection {
  readonly #events: ConnectionEvents;
  #socket: WebSocket | undefined;
  #ready = false;
  #closed = false;
  // Audio frames and `end` given before `ready`, sent in order after it.
  #waiting: (ArrayBuffer | string)[] = [];

  constructor(options: ConnectionOptions, events: ConnectionEvents) {
    this.#events = events;
    void this.#open(options);
  }

  get closed() {
    return this.#closed;
  }

  sendAudio(frame: ArrayBuffer) {
    this.#send(frame);
  }

  end() {
    this.#send(JSON.stringify({ type: "end" }));
  }

  close() {
    this.#closed = true;
    this.#socket?.close();
  }

  async #open({ server, lang, getToken }: ConnectionOptions) {
    try {
      const protocols = [PROTOCOL];
      if (getToken) {
        protocols.push(await getToken());
      }
      if (this.#closed) {
        return;
      }
      const url = new URL(LISTEN_PATH, server);
      if (lang) {
        url.searchParams.set("lang", lang);
      }
      const socket = new WebSocket(url, protocols);
      socket.binaryType = "arraybuffer";
      socket.onmessage = (event) => this.#onMessage(event.data);
      // An error is always followed by a close, so only the close is handled.
      socket.onclose = () => this.#fail();
      this.#socket = socket;
    } catch {
      // getToken failed, or the server URL or the token is not valid.
      this.#fail();
    }
  }

  #onMessage(data: unknown) {
    if (typeof data !== "string") {
      return;
    }
    let message: { type?: unknown; text?: unknown; final?: unknown };
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (message?.type === "ready") {
      this.#ready = true;
      for (const item of this.#waiting) {
        this.#socket?.send(item);
      }
      this.#waiting = [];
    } else if (message?.type === "transcript") {
      this.#events.onTranscript({
        text: typeof message.text === "string" ? message.text : "",
        final: message.final === true,
      });
    }
  }

  #send(item: ArrayBuffer | string) {
    if (this.#closed) {
      return;
    }
    if (this.#ready) {
      this.#socket?.send(item);
    } else {
      this.#waiting.push(item);
    }
  }

  #fail() {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#events.onClose();
  }
}
