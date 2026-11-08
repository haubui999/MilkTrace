
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

// ========================================
// 1. LOCAL WEB SERVER CONFIGURATION
// ========================================

// Use the current working directory as the website root.
const root = process.cwd();

// Define the files that the server is allowed to serve.
const allowed = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/trace.js", ["trace.js", "text/javascript; charset=utf-8"]]
]);

// ========================================
// 2. HTTP REQUEST HANDLING
// ========================================

http.createServer(async (req, res) => {

  // Extract the requested URL pathname.
  const pathname = new URL(
    req.url,
    "http://localhost"
  ).pathname;

  // Ignore browser favicon requests.
  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    return res.end();
  }

  // Check whether the requested file is permitted.
  const target = allowed.get(pathname);

  if (!target) {
    res.writeHead(404);
    return res.end("Not Found");
  }

  try {
    // Read the requested file from the website root.
    const content = await fs.readFile(
      path.join(root, target[0])
    );

    // Return the file with the appropriate content type.
    // Disable caching to ensure the latest version is served.
    res.writeHead(200, {
      "Content-Type": target[1],
      "Cache-Control": "no-store"
    });

    res.end(content);

  } catch (error) {

    // Return an HTTP 500 response if the file cannot be read.
    res.writeHead(500);
    res.end(error.message);
  }

// ========================================
// 3. START THE LOCAL SERVER
// ========================================

}).listen(8080, "127.0.0.1", () => {

  console.log(
    "Open http://localhost:8080/index.html?id=2"
  );

  console.log(
    "Press Ctrl+C to stop the server."
  );

});
