#!/usr/bin/env node
// Local test server for the BaaS entry — run with: node dist/serve.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

process.env.STATIC_BASE_URL = process.env.STATIC_BASE_URL || "/";
process.env.JAY_BACKEND_DIR = process.env.JAY_BACKEND_DIR || "/Users/yoav/work/jay/wix/examples/store-light/build/v0.0.1/backend";
const entry = await import("./entry.mjs");
const handler = entry.default?.fetch || entry.fetch;
const PORT = parseInt(process.env.PORT || "4000", 10);
const FRONTEND_DIR = "/Users/yoav/work/jay/wix/examples/store-light/build/v0.0.1/frontend";

const MIME = {
    ".js": "application/javascript", ".mjs": "application/javascript",
    ".css": "text/css", ".html": "text/html", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
    ".woff2": "font/woff2", ".woff": "font/woff",
};

function serveStatic(pathname, res) {
    const fp = path.join(FRONTEND_DIR, pathname);
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) return false;
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    fs.createReadStream(fp).pipe(res);
    return true;
}

http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://" + req.headers.host);
    if (serveStatic(url.pathname, res)) return;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    const init = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = Readable.toWeb(req); init.duplex = "half";
    }
    try {
        const response = await handler(new Request(url, init));
        const rh = {}; response.headers.forEach((v, k) => { rh[k] = v; });
        res.writeHead(response.status, rh);
        if (response.body) {
            const reader = response.body.getReader();
            while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
        }
        res.end();
    } catch (err) { console.error("Handler error:", err); res.writeHead(500); res.end("Internal Server Error"); }
}).listen(PORT, () => {
    console.log("Local test server at http://localhost:" + PORT);
    console.log("Frontend: " + FRONTEND_DIR);
});
