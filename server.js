"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const ws_1 = __importStar(require("ws"));
const fs_1 = require("fs");
const path_1 = require("path");
// ----------------------
//  STATIC FILE SERVER
// ----------------------
const server = (0, http_1.createServer)((req, res) => {
    const url = req.url || "/";
    if (url.startsWith("/public/")) {
        const filePath = (0, path_1.join)(__dirname, "front", url);
        if (!(0, fs_1.existsSync)(filePath) || !(0, fs_1.statSync)(filePath).isFile()) {
            res.writeHead(404);
            return res.end("Not found");
        }
        return sendFile(res, filePath);
    }
    let filePath = "";
    if (url === "/" || url === "/index.html") {
        filePath = (0, path_1.join)(__dirname, "front", "index.html");
    }
    else if (url === "/main.js") {
        filePath = (0, path_1.join)(__dirname, "front", "main.js");
    }
    else if (url === "/main.css") {
        filePath = (0, path_1.join)(__dirname, "front", "main.css");
    }
    else {
        res.writeHead(404);
        return res.end("Not found");
    }
    sendFile(res, filePath);
});
function sendFile(res, filePath) {
    const ext = (0, path_1.extname)(filePath);
    const contentTypes = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".mp3": "audio/mpeg",
        ".mp4": "video/mp4",
    };
    const contentType = contentTypes[ext] || "application/octet-stream";
    const data = (0, fs_1.readFileSync)(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
}
// ----------------------
//  WEBSOCKET SERVER
// ----------------------
const wss = new ws_1.WebSocketServer({ server });
const rooms = {};
function updateRooms() {
    const publicData = Object.values(rooms).map(r => ({
        id: r.id,
        players: r.players.length
    }));
    wss.clients.forEach(c => {
        if (c.readyState === ws_1.default.OPEN) {
            c.send(JSON.stringify({ type: "rooms", rooms: publicData }));
        }
    });
}
wss.on("connection", (ws) => {
    let currentRoom = null;
    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            switch (data.type) {
                case "createRoom": {
                    const id = Date.now().toString();
                    rooms[id] = { id, players: [ws] };
                    currentRoom = rooms[id];
                    updateRooms();
                    break;
                }
                case "joinRoom": {
                    const room = rooms[data.roomId];
                    if (!room)
                        return;
                    room.players.push(ws);
                    currentRoom = room;
                    updateRooms();
                    break;
                }
                case "attack": {
                    if (!currentRoom)
                        return;
                    currentRoom.players.forEach(p => {
                        if (p !== ws && p.readyState === ws_1.default.OPEN) {
                            p.send(JSON.stringify({
                                type: "attack",
                                x: data.x,
                                y: data.y
                            }));
                        }
                    });
                    break;
                }
            }
        }
        catch (e) {
            console.log("Bad JSON:", e);
        }
    });
    ws.on("close", () => {
        if (currentRoom) {
            currentRoom.players = currentRoom.players.filter(p => p !== ws);
            if (currentRoom.players.length === 0) {
                delete rooms[currentRoom.id];
            }
            updateRooms();
        }
    });
});
// ----------------------
//  START SERVER
// ----------------------
const PORT = 8181;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
