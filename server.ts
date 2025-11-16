import http from "http";
import path from "path";
import fs from "fs";
import WebSocket, { WebSocketServer } from "ws";

const PORT = 8181;
const FRONT_DIR = path.join(__dirname, "..", "front");

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

//----------------------------------------------------
// STATIC SERVER
//----------------------------------------------------
const server = http.createServer((req, res) => {
    let urlPath = req.url === "/" ? "/index.html" : req.url!;
    let filePath = path.join(FRONT_DIR, urlPath);

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
        res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
        res.end(content);
    });
});

//----------------------------------------------------
// WEBSOCKET SERVER
//----------------------------------------------------
const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
    console.log("WS connected");

    // отправляем JSON, а не строку!
    ws.send(JSON.stringify({ type: "CONNECTED" }));

    ws.on("message", msg => {
        console.log("Message:", msg.toString());
        ws.send(
            JSON.stringify({
                type: "MESSAGE",
                data: msg.toString()
            })
        );
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
