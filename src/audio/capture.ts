// Captures the microphone and delivers contract frames from the AudioWorklet in
// worklet.ts.

export type Capture = {
  // Delivers the rest of the last frame, then releases the microphone.
  stop: () => Promise<void>;
};

const WORKLET_URL = new URL("./worklet.js", import.meta.url);
// After the microphone is granted, audio processing must start within this. A
// browser can leave it stopped, for example without a sound system.
const START_LIMIT_MS = 5000;

// Call it from the user's press: Safari starts audio only from a user action.
// Rejects when the microphone is denied or missing, or when audio processing
// does not start. Waiting for the permission answer has no limit.
export async function startCapture(
  onFrame: (frame: ArrayBuffer) => void,
): Promise<Capture> {
  // Created before any await, while the press still counts as a user action.
  const context = new AudioContext();
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    await within(
      (async () => {
        await context.audioWorklet.addModule(WORKLET_URL);
        await context.resume();
      })(),
      START_LIMIT_MS,
    );
  } catch (err) {
    stopTracks(stream);
    // Not awaited: a context that did not start may not close either.
    context.close().catch(() => {});
    throw err;
  }

  const source = context.createMediaStreamSource(stream);
  // Mixed down to mono. Connected to the output so every browser keeps it
  // running; it writes nothing, so nothing is played.
  const node = new AudioWorkletNode(context, "dicta-capture", {
    channelCount: 1,
    channelCountMode: "explicit",
  });
  let onDone = () => {};
  const done = new Promise<void>((resolve) => (onDone = resolve));
  node.port.onmessage = (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      onFrame(event.data);
    } else {
      onDone();
    }
  };
  source.connect(node).connect(context.destination);

  return {
    async stop() {
      node.port.postMessage("stop");
      await done;
      source.disconnect();
      node.disconnect();
      stopTracks(stream);
      await context.close();
    },
  };
}

function within(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("audio processing did not start")),
      ms,
    );
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function stopTracks(stream: MediaStream | undefined) {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}
