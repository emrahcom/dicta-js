import assert from "node:assert/strict";
import { test } from "node:test";
import { VoiceDetector } from "../../src/audio/detector.ts";

const FRAME_SAMPLES = 800; // 50 ms at 16 kHz

// A repeatable pseudo-random source, so the noise is the same in every run.
function random(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

// 50 ms frames of `ms` audio, each sample given by `sample(index)` (-1 to 1).
function frames(ms: number, sample: (index: number) => number) {
  const result: ArrayBuffer[] = [];
  for (let start = 0; start < (ms / 1000) * 16000; start += FRAME_SAMPLES) {
    const view = new DataView(new ArrayBuffer(FRAME_SAMPLES * 2));
    for (let i = 0; i < FRAME_SAMPLES; i++) {
      view.setInt16(i * 2, Math.round(sample(start + i) * 32767), true);
    }
    result.push(view.buffer);
  }
  return result;
}

const next = random(1);
const noise = (ms: number, amplitude: number) =>
  frames(ms, () => (next() * 2 - 1) * amplitude);
const tone = (ms: number) =>
  frames(ms, (i) => 0.3 * Math.sin((2 * Math.PI * 300 * i) / 16000));

// Runs the frames through a detector and returns what it sent, as the input
// positions of the sent frames, and the positions of the ends.
function detect(input: ArrayBuffer[]) {
  const detector = new VoiceDetector();
  const sent: number[] = [];
  const ends: number[] = [];
  input.forEach((frame, index) => {
    const { send, end } = detector.push(frame);
    for (const item of send) {
      sent.push(input.indexOf(item));
    }
    if (end) {
      ends.push(index);
    }
  });
  return { sent, ends };
}

test("sends nothing for silence", () => {
  assert.deepEqual(detect(frames(2000, () => 0)), { sent: [], ends: [] });
});

test("sends nothing for steady noise", () => {
  assert.deepEqual(detect(noise(5000, 0.05)), { sent: [], ends: [] });
});

test("sends one utterance with the 300 ms before it", () => {
  // Quiet 0-19, tone 20-29, quiet 30-59.
  const input = [...noise(1000, 0.001), ...tone(500), ...noise(1500, 0.001)];

  const { sent, ends } = detect(input);

  // 6 frames before the tone, the tone, then 800 ms (16 frames) of silence.
  assert.deepEqual(
    sent,
    Array.from({ length: 6 + 10 + 16 }, (_, i) => 14 + i),
  );
  assert.deepEqual(ends, [45]);
});

test("keeps one utterance across a pause shorter than 800 ms", () => {
  const input = [
    ...noise(1000, 0.001),
    ...tone(500),
    ...noise(500, 0.001),
    ...tone(500),
    ...noise(1500, 0.001),
  ];

  assert.equal(detect(input).ends.length, 1);
});

test("makes two utterances across a pause longer than 800 ms", () => {
  const input = [
    ...noise(1000, 0.001),
    ...tone(500),
    ...noise(1200, 0.001),
    ...tone(500),
    ...noise(1500, 0.001),
  ];

  const { sent, ends } = detect(input);

  assert.equal(ends.length, 2);
  // Each utterance starts with the 300 ms before its tone.
  assert.ok(sent.includes(14) && sent.includes(48));
});

test("learns a louder background, so new steady noise stops being speech", () => {
  // Quiet for 1 s, then steady noise starts, as when a fan is turned on.
  const input = [...noise(1000, 0.001), ...noise(8000, 0.05)];

  const { sent, ends } = detect(input);

  // The noise is speech at first, until the background has risen to it.
  assert.equal(ends.length, 1);
  assert.ok(ends[0]! < input.length - 40, `end at ${ends[0]}`);
  assert.equal(sent.at(-1), ends[0]);
});
