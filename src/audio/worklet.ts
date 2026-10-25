// The AudioWorklet that converts microphone audio into contract frames. It
// posts each frame as an ArrayBuffer, and on any message from the page it posts
// the rest of the last frame and then `{ done: true }`.

import { PcmConverter } from "./converter.ts";

// Globals of the AudioWorklet scope, which the DOM types do not include.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: typeof AudioWorkletProcessor,
): void;

class CaptureProcessor extends AudioWorkletProcessor {
  #converter = new PcmConverter(sampleRate);
  #stopped = false;

  constructor() {
    super();
    this.port.onmessage = () => {
      this.#stopped = true;
      const rest = this.#converter.flush();
      if (rest) {
        this.port.postMessage(rest, [rest]);
      }
      this.port.postMessage({ done: true });
    };
  }

  process(inputs: Float32Array[][]) {
    if (this.#stopped) {
      return false;
    }
    const samples = inputs[0]?.[0];
    if (samples) {
      for (const frame of this.#converter.push(samples)) {
        this.port.postMessage(frame, [frame]);
      }
    }
    return true;
  }
}

registerProcessor("dicta-capture", CaptureProcessor);
