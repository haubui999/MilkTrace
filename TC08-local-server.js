
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const allowed = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/trace.js", ["trace.js", "text/javascript; charset=utf-8"]]
]);

http.createServer(async (req, res) => {
  const pathname = new URL(
    req.url,
    "http://localhost"
  ).pathname;

  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    return res.end();
  }

  const target = allowed.get(pathname);

  if (!target) {
    res.writeHead(404);
    return res.end("Not Found");
  }

  try {
    const content = await fs.readFile(
      path.join(root, target[0])
    );

    res.writeHead(200, {
      "Content-Type": target[1],
      "Cache-Control": "no-store"
    });

    res.end(content);

  } catch (error) {
    res.writeHead(500);
    res.end(error.message);
  }

}).listen(8080, "127.0.0.1", () => {
  console.log(
    "Mo http://localhost:8080/index.html?id=2"
  );
  console.log("Nhan Ctrl+C de dung server.");
});
