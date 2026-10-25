// Converts microphone audio to the contract's format: 16 kHz, mono, signed
// 16-bit little-endian PCM, in frames of 50 ms.

export const TARGET_RATE = 16_000;
export const FRAME_SAMPLES = 800; // 50 ms at 16 kHz

export class PcmConverter {
  // Input samples per output sample.
  readonly #ratio: number;
  #inputCount = 0;
  #outputCount = 0;
  #sum = 0;
  #summed = 0;
  #frame = new DataView(new ArrayBuffer(FRAME_SAMPLES * 2));
  #filled = 0;

  constructor(inputRate: number) {
    if (inputRate < TARGET_RATE) {
      throw new Error(`input rate ${inputRate} is below ${TARGET_RATE}`);
    }
    this.#ratio = inputRate / TARGET_RATE;
  }

  // Takes float samples (-1 to 1) and returns the frames they complete.
  push(samples: Float32Array): ArrayBuffer[] {
    const frames: ArrayBuffer[] = [];
    for (const sample of samples) {
      this.#sum += sample;
      this.#summed++;
      this.#inputCount++;
      // Each output sample is the average of the input samples in its span.
      if (this.#inputCount >= (this.#outputCount + 1) * this.#ratio) {
        this.#write(this.#sum / this.#summed, frames);
        this.#sum = 0;
        this.#summed = 0;
        this.#outputCount++;
      }
    }
    return frames;
  }

  // Returns the samples of an unfinished frame, if any, as a shorter frame.
  flush(): ArrayBuffer | undefined {
    if (this.#filled === 0) {
      return undefined;
    }
    const rest = this.#frame.buffer.slice(0, this.#filled * 2);
    this.#filled = 0;
    return rest;
  }

  #write(value: number, frames: ArrayBuffer[]) {
    const clipped = Math.max(-1, Math.min(1, value));
    const pcm = Math.round(clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff);
    this.#frame.setInt16(this.#filled * 2, pcm, true);
    this.#filled++;
    if (this.#filled === FRAME_SAMPLES) {
      frames.push(this.#frame.buffer);
      this.#frame = new DataView(new ArrayBuffer(FRAME_SAMPLES * 2));
      this.#filled = 0;
    }
  }
}
