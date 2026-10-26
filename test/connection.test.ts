import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { type TestContext, test } from "node:test";
import { type WebSocket as ServerSocket, WebSocketServer } from "ws";
import {
  Connection,
  type ConnectionOptions,
  type Transcript,
} from "../src/connection.ts";

type Received = { data: Buffer; isBinary: boolean };

// A local dicta-server stand-in. Resolves each connection with its socket, the
// upgrade request and the messages it receives.
async function fakeServer(t: TestContext) {
  const server = new WebSocketServer({
    port: 0,
    handleProtocols: (protocols) => (protocols.has("dicta") ? "dicta" : false),
  });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        for (const client of server.clients) {
          client.terminate();
        }
        server.close(resolve);
      }),
  );
  const connection = new Promise<{
    socket: ServerSocket;
    request: IncomingMessage;
    received: Received[];
  }>((resolve) => {
    server.once("connection", (socket, request) => {
      const received: Received[] = [];
      socket.on("message", (data, isBinary) =>
        received.push({ data: data as Buffer, isBinary }),
      );
      resolve({ socket, request, received });
    });
  });
  const { port } = server.address() as AddressInfo;
  return { url: `ws://localhost:${port}`, connection };
}

function connect(options: ConnectionOptions) {
  const transcripts: Transcript[] = [];
  let closes = 0;
  let onClosed = () => {};
  const closed = new Promise<void>((resolve) => (onClosed = resolve));
  const connection = new Connection(options, {
    onTranscript: (transcript) => transcripts.push(transcript),
    onClose: () => {
      closes++;
      onClosed();
    },
  });
  return { connection, transcripts, closes: () => closes, closed };
}

async function until(check: () => boolean) {
  while (!check()) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("connects with lang and the token in the subprotocol header", async (t) => {
  const server = await fakeServer(t);
  const { connection } = connect({
    server: server.url,
    lang: "de-DE",
    getToken: async () => "a.b.c",
  });
  t.after(() => connection.close());

  const { request } = await server.connection;

  assert.equal(request.url, "/dicta/v1/listen?lang=de-DE");
  assert.equal(request.headers["sec-websocket-protocol"], "dicta, a.b.c");
});

test("connects with only dicta in the header without getToken", async (t) => {
  const server = await fakeServer(t);
  const { connection } = connect({ server: server.url });
  t.after(() => connection.close());

  const { request } = await server.connection;

  assert.equal(request.url, "/dicta/v1/listen");
  assert.equal(request.headers["sec-websocket-protocol"], "dicta");
});

test("keeps audio and end until ready, then sends them in order", async (t) => {
  const server = await fakeServer(t);
  const { connection } = connect({ server: server.url });
  t.after(() => connection.close());
  connection.sendAudio(new Uint8Array([1, 2]).buffer);
  connection.sendAudio(new Uint8Array([3]).buffer);
  connection.end();
  const { socket, received } = await server.connection;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(received, []);

  socket.send(JSON.stringify({ type: "ready", sessionId: "s" }));
  await until(() => received.length === 3);
  connection.sendAudio(new Uint8Array([4]).buffer);
  await until(() => received.length === 4);

  assert.deepEqual(received, [
    { data: Buffer.from([1, 2]), isBinary: true },
    { data: Buffer.from([3]), isBinary: true },
    { data: Buffer.from('{"type":"end"}'), isBinary: false },
    { data: Buffer.from([4]), isBinary: true },
  ]);
});

test("reports transcripts and ignores other messages", async (t) => {
  const server = await fakeServer(t);
  const { connection, transcripts } = connect({ server: server.url });
  t.after(() => connection.close());
  const { socket } = await server.connection;

  socket.send(JSON.stringify({ type: "ready", sessionId: "s" }));
  socket.send("not json");
  socket.send(JSON.stringify({ type: "later", text: "x" }));
  socket.send(Buffer.from([1]));
  socket.send(
    JSON.stringify({ type: "transcript", text: "add", final: false }),
  );
  socket.send(JSON.stringify({ type: "transcript", text: "", final: true }));
  await until(() => transcripts.length === 2);

  assert.deepEqual(transcripts, [
    { text: "add", final: false },
    { text: "", final: true },
  ]);
});

test("reports a close by the server once", async (t) => {
  const server = await fakeServer(t);
  const { connection, closes, closed } = connect({ server: server.url });
  const { socket } = await server.connection;

  socket.close(4001);
  await closed;
  connection.sendAudio(new Uint8Array([1]).buffer);
  connection.close();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(closes(), 1);
  assert.equal(connection.closed, true);
});

test("reports a failing getToken without opening a socket", async (t) => {
  const server = await fakeServer(t);
  let connected = false;
  void server.connection.then(() => (connected = true));
  const { closes, closed } = connect({
    server: server.url,
    getToken: async () => {
      throw new Error("no token");
    },
  });

  await closed;
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(closes(), 1);
  assert.equal(connected, false);
});

test("reports an empty token without opening a socket", async (t) => {
  const server = await fakeServer(t);
  let connected = false;
  void server.connection.then(() => (connected = true));
  const { connection, closes, closed } = connect({
    server: server.url,
    getToken: async () => "",
  });

  await closed;
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(closes(), 1);
  assert.equal(connection.closed, true);
  assert.equal(connected, false);
});

test("reports a missing server", async () => {
  const { connection, closes, closed } = connect({ server: "" });

  await closed;

  assert.equal(closes(), 1);
  assert.equal(connection.closed, true);
});

test("reports nothing when the client closes", async (t) => {
  const server = await fakeServer(t);
  const { connection, closes } = connect({ server: server.url });
  const { socket } = await server.connection;
  const serverClosed = new Promise((resolve) => socket.once("close", resolve));

  connection.close();
  await serverClosed;
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(closes(), 0);
});
