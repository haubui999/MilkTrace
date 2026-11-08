
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const PORT = 8080;
const HOST = "0.0.0.0";

// Chi cho phep truy cap cac file can cho giao dien.
// Khong cung cap file .env hoac PRIVATE_KEY.

const allowed = new Map([
  [
    "/",
    ["index.html", "text/html; charset=utf-8"]
  ],
  [
    "/index.html",
    ["index.html", "text/html; charset=utf-8"]
  ],
  [
    "/trace.js",
    ["trace.js", "application/javascript; charset=utf-8"]
  ],
  [
    "/vendor/ethers.umd.min.js",
    [
      "node_modules/ethers/dist/ethers.umd.min.js",
      "application/javascript; charset=utf-8"
    ]
  ],
  [
    "/vendor/qrcode.min.js",
    [
      "node_modules/qrcodejs/qrcode.min.js",
      "application/javascript; charset=utf-8"
    ]
  ]
]);

const server = http.createServer(async (req, res) => {
  const pathname = new URL(
    req.url,
    "http://localhost"
  ).pathname;

  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== "GET") {
    res.writeHead(405);
    return res.end("Method Not Allowed");
  }

  const target = allowed.get(pathname);

  if (!target) {
    res.writeHead(404);
    return res.end("Not Found");
  }

  try {
    const filePath = path.join(root, target[0]);
    const data = await fs.readFile(filePath);

    res.writeHead(200, {
      "Content-Type": target[1],
      "Cache-Control": "no-store"
    });

    res.end(data);

  } catch (error) {
    console.error("Khong doc duoc file:", error.message);

    res.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log("===== TC-10 LAN SERVER =====");
  console.log("Server dang chay tai cong 8080");
  console.log("Da cho phep tai ethers.js va qrcode.js");
  console.log("Mo trang web bang dia chi IPv4 cua may.");
  console.log("Nhan Ctrl+C de dung server.");
});
