import * as fs from "fs";
import * as path from "path";
import * as http from "http";

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg"
};

export const httpServer = http.createServer((req, res) => {
    const root = path.resolve();
    const urlPath = req.url === "/" ? "/front/index.html" : "/front" + req.url;

    const filePath = path.join(root, urlPath);
    const ext = path.extname(filePath);
    const mime = mimeTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": mime });
        res.end(data);
    });
});
