import http from "http";
import path from "path";
import fs from "fs";
import WebSocket, { WebSocketServer } from "ws";

const PORT = 8181;

// ----------------------------
// ПАПКА со статикой
// ----------------------------
// Берём путь относительно корня проекта, а НЕ относительно dist!
const FRONT_DIR = path.resolve(process.cwd(), "front");
console.log("FRONT_DIR:", FRONT_DIR);

// ----------------------------
// MIME TYPES
// ----------------------------

const mimeTypes: Record<string, string> = {
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

// ----------------------------
// STATIC HTTP SERVER
// ----------------------------

const server = http.createServer((req, res) => {
    let urlPath = req.url === "/" ? "/index.html" : req.url!;
    let filePath = path.join(FRONT_DIR, urlPath);

    console.log("TRY:", filePath);

    // Защита от перехода ".."
    if (!filePath.startsWith(FRONT_DIR)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }

        const ext = path.extname(filePath);
        const mime = mimeTypes[ext] || "application/octet-stream";

        res.writeHead(200, { "Content-Type": mime });
        res.end(content);
    });
});

// ----------------------------
// WEBSOCKET SERVER
// ----------------------------

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
    console.log("WS connected");

    ws.on("message", msg => {
        console.log("Message:", msg.toString());
        ws.send("OK: " + msg.toString());
    });

    ws.send("CONNECTED");
});

// ----------------------------
// START
// ----------------------------

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
