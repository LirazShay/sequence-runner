import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"]
]);

function resolveRequestPath(urlPath) {
  if (urlPath === "/runner.js") {
    return path.join(root, "runner.js");
  }

  if (urlPath === "/mock-chatgpt.js") {
    return path.join(root, "tests/mock-chatgpt/mock-chatgpt.js");
  }

  if (urlPath === "/mock-chatgpt.css") {
    return path.join(root, "tests/mock-chatgpt/mock-chatgpt.css");
  }

  return path.join(root, "tests/mock-chatgpt/index.html");
}

const server = http.createServer((request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    const filePath = resolveRequestPath(requestUrl.pathname);
    const body = fs.readFileSync(filePath);
    const contentType = contentTypes.get(path.extname(filePath)) || "application/octet-stream";

    response.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(String(error?.stack || error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock ChatGPT lab: http://127.0.0.1:${port}/?runner=1`);
});
