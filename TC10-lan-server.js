
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

// ========================================
// 1. LOCAL AREA NETWORK CONFIGURATION
// ========================================

const root = process.cwd();

const PORT = 8080;
const HOST = "0.0.0.0";

// Allow access only to the files required
// for the MilkTrace web interface.
// Sensitive files such as .env and PRIVATE_KEY
// are not exposed by this server.

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

// ========================================
// 2. HTTP REQUEST HANDLING
// ========================================

// Create an HTTP server for the MilkTrace website.
const server = http.createServer(async (req, res) => {

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

  // Accept only HTTP GET requests.
  if (req.method !== "GET") {
    res.writeHead(405);
    return res.end("Method Not Allowed");
  }

  // Check whether the requested file is allowed.
  const target = allowed.get(pathname);

  // Reject requests for files outside the allowlist.
  if (!target) {
    res.writeHead(404);
    return res.end("Not Found");
  }

  try {

    // Resolve the requested file from the project root.
    const filePath = path.join(root, target[0]);

    // Read the requested file.
    const data = await fs.readFile(filePath);

    // Return the file with the appropriate MIME type.
    // Disable caching to ensure updated content is loaded.
    res.writeHead(200, {
      "Content-Type": target[1],
      "Cache-Control": "no-store"
    });

    res.end(data);

  } catch (error) {

    // Log file-reading errors on the server.
    console.error(
      "Unable to read the requested file:",
      error.message
    );

    // Return an HTTP 500 response.
    res.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Server Error");
  }
});

// ========================================
// 3. START THE LAN SERVER
// ========================================

// Bind the server to all available network interfaces.
server.listen(PORT, HOST, () => {

  console.log("===== TC-10 LAN SERVER =====");

  console.log(
    "MilkTrace server is running on port 8080."
  );

  console.log(
    "Ethers.js and QRCode.js libraries are available."
  );

  console.log(
    "Open the MilkTrace website using this computer's IPv4 address."
  );

  console.log(
    "Press Ctrl+C to stop the server."
  );

});
