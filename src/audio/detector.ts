// Finds utterances in 50 ms PCM frames by their level against the background
// noise level, which it learns as it goes.

const PRE_ROLL_FRAMES = 6; // 300 ms before speech
const END_SILENCE_FRAMES = 16; // 800 ms of silence ends an utterance
// A frame is speech when it is this much louder than the background.
const SPEECH_MARGIN_DB = 10;
// Quieter frames are never speech, however quiet the background is.
const MIN_SPEECH_DB = -55;
// How fast the background level follows a louder level, per frame. A drop is
// followed at once.
const BACKGROUND_RISE = 0.02;

export type Detection = {
  // The frames to send: the 300 ms before speech at its start, then every frame
  // of the utterance.
  send: ArrayBuffer[];
  // True for the frame that ends the utterance.
  end: boolean;
};

export class VoiceDetector {
  #background: number | undefined;
  #before: ArrayBuffer[] = [];
  #speaking = false;
  #silentFrames = 0;

  // True from the start of speech until the end of the utterance.
  get speaking() {
    return this.#speaking;
  }

  push(frame: ArrayBuffer): Detection {
    const level = levelDb(frame);
    const speech = this.#isSpeech(level);
    this.#learn(level);

    if (!this.#speaking) {
      if (!speech) {
        this.#before.push(frame);
        if (this.#before.length > PRE_ROLL_FRAMES) {
          this.#before.shift();
        }
        return { send: [], end: false };
      }
      this.#speaking = true;
      this.#silentFrames = 0;
      const send = [...this.#before, frame];
      this.#before = [];
      return { send, end: false };
    }

    this.#silentFrames = speech ? 0 : this.#silentFrames + 1;
    if (this.#silentFrames < END_SILENCE_FRAMES) {
      return { send: [frame], end: false };
    }
    this.#speaking = false;
    return { send: [frame], end: true };
  }

  #isSpeech(level: number) {
    return (
      this.#background !== undefined &&
      level > MIN_SPEECH_DB &&
      level > this.#background + SPEECH_MARGIN_DB
    );
  }

  // The background follows drops at once and rises slowly, so steady noise
  // becomes background while speech, which varies, stays above it.
  #learn(level: number) {
    if (this.#background === undefined || level < this.#background) {
      this.#background = level;
    } else {
      this.#background += (level - this.#background) * BACKGROUND_RISE;
    }
  }
}

// The RMS level of a frame of 16-bit little-endian samples, in dB below full
// scale.
function levelDb(frame: ArrayBuffer) {
  const view = new DataView(frame);
  const count = frame.byteLength / 2;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const sample = view.getInt16(i * 2, true) / 32768;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / Math.max(count, 1));
  return 20 * Math.log10(Math.max(rms, 1e-10));
}
