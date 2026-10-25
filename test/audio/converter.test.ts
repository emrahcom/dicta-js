import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FRAME_SAMPLES,
  PcmConverter,
  TARGET_RATE,
} from "../../src/audio/converter.ts";

const FRAME_BYTES = FRAME_SAMPLES * 2;

// 50 ms of input at `rate`, with every sample set to `value`.
function chunk(rate: number, value = 0) {
  return new Float32Array(Math.round(rate * 0.05)).fill(value);
}

function samples(frame: ArrayBuffer) {
  const view = new DataView(frame);
  return Array.from({ length: frame.byteLength / 2 }, (_, i) =>
    view.getInt16(i * 2, true),
  );
}

for (const rate of [16_000, 44_100, 48_000]) {
  test(`makes one 50 ms frame from 50 ms of audio at ${rate} Hz`, () => {
    const converter = new PcmConverter(rate);

    const frames = converter.push(chunk(rate));

    assert.equal(frames.length, 1);
    assert.equal(frames[0]?.byteLength, FRAME_BYTES);
    assert.equal(converter.flush(), undefined);
  });
}

test("gives the same frames for chunks that do not match frames", () => {
  const audio = new Float32Array(4800).map((_, i) => Math.sin(i / 7) * 0.8);
  const whole = new PcmConverter(48_000).push(audio);

  const chunked = new PcmConverter(48_000);
  const frames: ArrayBuffer[] = [];
  for (let i = 0; i < audio.length; i += 128) {
    frames.push(...chunked.push(audio.subarray(i, i + 128)));
  }

  assert.equal(whole.length, 2);
  assert.deepEqual(frames.map(samples), whole.map(samples));
});

test("returns the rest of an unfinished frame once", () => {
  const converter = new PcmConverter(TARGET_RATE);

  const frames = converter.push(new Float32Array(1000));

  assert.equal(frames.length, 1);
  assert.equal(converter.flush()?.byteLength, 400);
  assert.equal(converter.flush(), undefined);
});

test("converts to 16-bit little-endian and clips out-of-range samples", () => {
  const converter = new PcmConverter(TARGET_RATE);

  converter.push(new Float32Array([2, -2, 1, -1, 0.5, 0]));

  assert.deepEqual(
    samples(converter.flush()!),
    [32767, -32768, 32767, -32768, 16384, 0],
  );
});

test("averages the input samples of each output sample", () => {
  const converter = new PcmConverter(48_000);

  converter.push(new Float32Array([0.3, 0.6, 0.9, -0.3, -0.6, -0.9]));

  assert.deepEqual(samples(converter.flush()!), [
    Math.round(0.6 * 0x7fff),
    Math.round(-0.6 * 0x8000),
  ]);
});

test("keeps the frequency of a 1 kHz tone at 44.1 kHz", () => {
  const rate = 44_100;
  const tone = new Float32Array(rate).map((_, i) =>
    Math.sin((2 * Math.PI * 1000 * i) / rate),
  );
  const converter = new PcmConverter(rate);

  const output = converter.push(tone).flatMap(samples);

  assert.equal(output.length, TARGET_RATE);
  let crossings = 0;
  for (let i = 1; i < output.length; i++) {
    if (output[i - 1]! < 0 !== output[i]! < 0) {
      crossings++;
    }
  }
  // A 1 kHz tone crosses zero 2000 times per second.
  assert.ok(Math.abs(crossings - 2000) <= 2, `crossings: ${crossings}`);
});

test("refuses an input rate below 16 kHz", () => {
  assert.throws(() => new PcmConverter(8000), /below 16000/);
});
