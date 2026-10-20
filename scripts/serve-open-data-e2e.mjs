// Offline static production-build harness; no API or provider forwarding.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";
const root = resolve("apps/web/dist");
const nginx = await readFile("apps/web/nginx.conf", "utf8");
const csp = /add_header Content-Security-Policy "([^"\n]+)"/.exec(nginx)?.[1];
if (!csp) throw new Error("Production CSP missing");
// This harness serves plain http on 127.0.0.1. WebKit applies upgrade-insecure-requests
// to loopback and fetches the bundle over https, which has no certificate here. Production
// is https, so drop only that directive; script-src, worker-src and the rest stay exact.
const servedCsp = csp.replace(/;\s*upgrade-insecure-requests\b/, "");
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
createServer(async (request, response) => {
  response.setHeader("Content-Security-Policy", servedCsp);
  response.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const path = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const file = resolve(root, "." + path);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    let bytes, extension;
    try {
      bytes = await readFile(file);
      extension = extname(file);
    } catch {
      if (extname(path) || path.startsWith("/v1/")) {
        response.writeHead(404).end();
        return;
      }
      bytes = await readFile(resolve(root, "index.html"));
      extension = ".html";
    }
    response.setHeader(
      "Content-Type",
      mime[extension] ?? "application/octet-stream",
    );
    if (
      bytes.length >= 1024 &&
      /gzip/.test(request.headers["accept-encoding"] ?? "") &&
      [".js", ".css", ".json", ".wasm"].includes(extension)
    ) {
      bytes = gzipSync(bytes);
      response.setHeader("Content-Encoding", "gzip");
    }
    response.end(bytes);
  } catch {
    response.writeHead(500).end();
  }
}).listen(Number(process.env.PW_SQL_PORT ?? 5175), "127.0.0.1");
