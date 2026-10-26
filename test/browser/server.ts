// A small web server for the browser tests: an empty page that loads the built
// module, and the files in dist/. Playwright starts it (playwright.config.ts).

import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

const PORT = 4173; // also in playwright.config.ts

const DIST = new URL("../../dist/", import.meta.url);
const PAGE = `<!doctype html>
<meta charset="utf-8">
<script type="module" src="/dist/index.js"></script>
<body></body>`;
// The same page without the module, for a test that defines the element later.
const EMPTY_PAGE = `<!doctype html>
<meta charset="utf-8">
<body></body>`;

async function handle(request: IncomingMessage, response: ServerResponse) {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  try {
    if (pathname === "/" || pathname === "/empty") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(pathname === "/" ? PAGE : EMPTY_PAGE);
    } else if (pathname.startsWith("/dist/") && !pathname.includes("..")) {
      const file = await readFile(new URL(pathname.slice(6), DIST));
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(file);
    } else {
      response.writeHead(404).end();
    }
  } catch {
    response.writeHead(404).end();
  }
}

createServer((request, response) => void handle(request, response)).listen(
  PORT,
);
