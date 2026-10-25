// Serves the example page and dist/ for trying dicta-js by hand. Run it with
// `npm run example`, which builds first.

import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

const PORT = Number(process.env.PORT || 4174);
const ROOT = new URL("../", import.meta.url);
const TYPES: Record<string, string> = {
  "/example/index.html": "text/html",
};

async function handle(request: IncomingMessage, response: ServerResponse) {
  let { pathname } = new URL(request.url ?? "/", "http://localhost");
  if (pathname === "/") {
    pathname = "/example/index.html";
  }
  const allowed = pathname in TYPES || pathname.startsWith("/dist/");
  try {
    if (!allowed || pathname.includes("..")) {
      throw new Error("not found");
    }
    const file = await readFile(new URL(pathname.slice(1), ROOT));
    response.writeHead(200, {
      "content-type": TYPES[pathname] ?? "text/javascript",
    });
    response.end(file);
  } catch {
    response.writeHead(404).end();
  }
}

createServer((request, response) => void handle(request, response)).listen(
  PORT,
  () => console.log(`example on http://localhost:${PORT}`),
);
