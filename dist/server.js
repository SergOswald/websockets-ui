"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const ws_1 = require("ws");
const PORT = 8181;
const FRONT_DIR = path_1.default.join(__dirname, "front");
//----------------------------------------
// STATIC SERVER
//----------------------------------------
const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".json": "application/json"
};
const server = http_1.default.createServer((req, res) => {
    let filePath = req.url === "/" ? "/index.html" : req.url;
    filePath = path_1.default.join(FRONT_DIR, filePath);
    // защита от выхода из директории
    if (!filePath.startsWith(FRONT_DIR)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }
    fs_1.default.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        const ext = path_1.default.extname(filePath);
        const mime = mimeTypes[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime });
        res.end(content);
    });
});
//----------------------------------------
// WEBSOCKET SERVER
//----------------------------------------
const wss = new ws_1.WebSocketServer({ server });
wss.on("connection", ws => {
    ws.on("message", msg => {
        console.log("Message:", msg.toString());
        ws.send("OK: " + msg.toString()); // пока простая заглушка
    });
    ws.send("CONNECTED");
});
server.listen(PORT, () => {
    console.log(`HTTP + WS server running on http://localhost:${PORT}`);
});
