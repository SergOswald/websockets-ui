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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server.ts
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const ws_1 = __importStar(require("ws"));
const crypto_1 = require("crypto");
/**
 * Battleship backend:
 * - Serves files from <projectRoot>/front
 * - WebSocket server (on same HTTP server) with JSON protocol:
 *   { type: string, data: string, id?: number }
 *
 * Handled message types from client:
 * - reg         -> register/login: data = JSON.stringify({ name, password })
 * - create_room -> data = JSON.stringify({ playerId })
 * - join_room   -> data = JSON.stringify({ playerId, roomId })
 * - send_ships  -> data = JSON.stringify({ gameId, gamePlayerId, ships })
 * - attack      -> data = JSON.stringify({ gameId, fromGamePlayerId, x, y })
 * - leave       -> data = JSON.stringify({ playerId, roomId })
 * - get_winners -> data = ""
 *
 * Server responses: same shape, data is string (JSON-stringified object)
 * Response types include: connected, reg, create_game, start_game, turn, attack, finish,
 * update_room, update_winners, personal (for errors/info)
 */
// --------------------------- CONFIG ---------------------------
const PORT = 8181;
const FRONT_DIR = path_1.default.resolve(process.cwd(), "front");
// --------------------------- HELPERS --------------------------
const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".json": "application/json; charset=utf-8",
};
function sendWS(ws, type, payload = "", id) {
    const msg = { type, data: typeof payload === "string" ? payload : JSON.stringify(payload) };
    if (typeof id === "number")
        msg.id = id;
    try {
        ws.send(JSON.stringify(msg));
    }
    catch (e) {
        console.error("WS send error:", e);
    }
}
function broadcast(clients, type, payload) {
    const s = typeof payload === "string" ? payload : JSON.stringify(payload);
    for (const c of clients) {
        if (c.readyState === ws_1.default.OPEN) {
            try {
                c.send(JSON.stringify({ type, data: s }));
            }
            catch { }
        }
    }
}
function safeParse(s) {
    if (typeof s !== "string")
        return s;
    try {
        return JSON.parse(s);
    }
    catch {
        return s;
    }
}
const Players = new Map(); // key = playerId
const LoginIndex = new Map(); // login -> playerId
function registerOrLogin(name, password) {
    // if login exists: check password -> return playerId (or null)
    const existing = LoginIndex.get(name);
    if (existing) {
        const rec = Players.get(existing);
        if (rec.password === password)
            return rec.playerId;
        return null;
    }
    else {
        const pid = (0, crypto_1.randomUUID)();
        const rec = { playerId: pid, name, password, score: 0 };
        Players.set(pid, rec);
        LoginIndex.set(name, pid);
        return pid;
    }
}
const Rooms = new Map();
const Games = new Map();
// --------------------------- HTTP STATIC SERVER ---------------------------
const server = http_1.default.createServer((req, res) => {
    const urlPath = req.url === "/" ? "/index.html" : (req.url || "/index.html");
    const filePath = path_1.default.join(FRONT_DIR, urlPath);
    // Protect from path traversal
    if (!filePath.startsWith(FRONT_DIR)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }
    fs_1.default.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        const ext = path_1.default.extname(filePath);
        const mime = mimeTypes[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime });
        res.end(data);
    });
});
// --------------------------- WEBSOCKET SERVER ---------------------------
const wss = new ws_1.WebSocketServer({ server });
function broadcastUpdateRooms() {
    const list = Array.from(Rooms.values()).map(r => ({
        roomId: r.roomId,
        name: r.name || r.roomId,
        players: r.players.map(pid => ({ playerId: pid, login: Players.get(pid)?.name }))
    }));
    const s = JSON.stringify(list);
    wss.clients.forEach(c => {
        if (c.readyState === ws_1.default.OPEN)
            c.send(JSON.stringify({ type: "update_room", data: s }));
    });
}
function broadcastUpdateWinners() {
    const winners = Array.from(Players.values())
        .sort((a, b) => b.score - a.score)
        .map(p => ({ name: p.name, score: p.score }));
    const s = JSON.stringify(winners);
    wss.clients.forEach(c => {
        if (c.readyState === ws_1.default.OPEN)
            c.send(JSON.stringify({ type: "update_winners", data: s }));
    });
}
wss.on("connection", (ws, req) => {
    console.log("WS: new connection");
    // send connected
    sendWS(ws, "connected", "");
    ws.on("message", (raw) => {
        let parsed;
        try {
            parsed = JSON.parse(raw.toString());
        }
        catch (e) {
            console.warn("Bad JSON from client:", raw.toString());
            sendWS(ws, "personal", { ok: false, message: "Invalid JSON" });
            return;
        }
        const { type } = parsed;
        const dataRaw = parsed.data;
        const data = safeParse(dataRaw);
        // logging
        console.log("CLIENT MSG:", { type, data });
        switch (type) {
            // registration/login
            case "reg": {
                const name = data?.name;
                const password = data?.password;
                if (!name || !password) {
                    sendWS(ws, "reg", { status: "error", message: "Missing name/password" });
                    break;
                }
                const pid = registerOrLogin(name, password);
                if (!pid) {
                    sendWS(ws, "reg", { status: "error", message: "Wrong password" });
                    break;
                }
                const rec = Players.get(pid);
                rec.ws = ws;
                ws.playerId = rec.playerId; // <------------------------ ДОБАВИТЬ!
                sendWS(ws, "reg", { status: "ok", playerId: pid });
                broadcastUpdateRooms();
                broadcastUpdateWinners();
                break;
            }
            // create room
            case "create_room": {
                // data: { playerId, name? }
                const playerId = data?.playerId;
                if (!playerId || !Players.has(playerId)) {
                    sendWS(ws, "personal", { ok: false, message: "Unknown playerId" });
                    break;
                }
                const roomId = (0, crypto_1.randomUUID)();
                const room = { roomId, name: data?.name || `room-${roomId.slice(0, 4)}`, players: [playerId], game: null };
                Rooms.set(roomId, room);
                sendWS(ws, "create_game", { roomId, playerId });
                broadcastUpdateRooms();
                break;
            }
            // list rooms (optional)
            case "list_rooms": {
                const arr = Array.from(Rooms.values()).map(r => ({ roomId: r.roomId, name: r.name, players: r.players.length }));
                sendWS(ws, "update_room", arr);
                break;
            }
            // join room
            case "join_room": {
                // data: { playerId, roomId }
                const playerId = data?.playerId;
                const roomId = data?.roomId;
                const room = Rooms.get(roomId);
                if (!room) {
                    sendWS(ws, "personal", { ok: false, message: "Room not found" });
                    break;
                }
                if (!Players.has(playerId)) {
                    sendWS(ws, "personal", { ok: false, message: "Unknown player" });
                    break;
                }
                if (!room.players.includes(playerId))
                    room.players.push(playerId);
                // attach player's ws for quick lookup (done on reg)
                sendWS(ws, "create_game", { roomId, playerId });
                broadcastUpdateRooms();
                // If two players now -> create game object
                if (room.players.length === 2 && !room.game) {
                    const gameId = (0, crypto_1.randomUUID)();
                    const playersForGame = room.players.map((pid, idx) => {
                        const rec = Players.get(pid);
                        return {
                            playerId: pid,
                            gamePlayerId: (0, crypto_1.randomUUID)(),
                            ws: rec.ws,
                            login: rec.name,
                            playerIdx: idx,
                            ships: undefined,
                            killedShipCount: 0,
                            shots: []
                        };
                    });
                    const game = { gameId, roomId, players: playersForGame, currentTurnIndex: 0, boardSize: 10, finished: false };
                    room.game = game;
                    Games.set(gameId, game);
                    // notify players about create_game details
                    for (const gp of game.players) {
                        if (gp.ws && gp.ws.readyState === ws_1.default.OPEN) {
                            sendWS(gp.ws, "create_game", {
                                gameId,
                                gamePlayerId: gp.gamePlayerId,
                                yourIdx: gp.playerIdx,
                                opponent: game.players.find(p => p.gamePlayerId !== gp.gamePlayerId)?.login
                            });
                        }
                    }
                }
                break;
            }
            // -----------------------------------------------------------
            // PLAY WITH BOT
            // -----------------------------------------------------------
            case "single_play": {
                // иногда клиент присылает пустую строку, тогда берём playerId из ws
                let playerId = data?.playerId;
                if (!playerId) {
                    playerId = ws.playerId;
                }
                if (!playerId || !Players.has(playerId)) {
                    sendWS(ws, "personal", { ok: false, message: "Unknown playerId" });
                    break;
                }
                // создаём комнату
                const roomId = (0, crypto_1.randomUUID)();
                const botId = "BOT";
                // регистрируем бота, если нет
                if (!Players.has(botId)) {
                    Players.set(botId, {
                        playerId: botId,
                        name: "Bot",
                        password: "",
                        score: 0,
                        ws: undefined
                    });
                }
                Rooms.set(roomId, {
                    roomId,
                    name: "Single Play Room",
                    players: [playerId, botId],
                    game: null
                });
                // создаём игру
                const gameId = (0, crypto_1.randomUUID)();
                const realPlayer = Players.get(playerId);
                const gamePlayers = [
                    {
                        playerId,
                        gamePlayerId: (0, crypto_1.randomUUID)(),
                        ws: realPlayer.ws,
                        login: realPlayer.name,
                        playerIdx: 0,
                        ships: undefined,
                        killedShipCount: 0,
                        shots: []
                    },
                    {
                        playerId: botId,
                        gamePlayerId: (0, crypto_1.randomUUID)(),
                        ws: undefined,
                        login: "Bot",
                        playerIdx: 1,
                        ships: undefined,
                        killedShipCount: 0,
                        shots: []
                    }
                ];
                const game = {
                    gameId,
                    roomId,
                    players: gamePlayers,
                    currentTurnIndex: 0,
                    boardSize: 10,
                    finished: false
                };
                Rooms.get(roomId).game = game;
                Games.set(gameId, game);
                // отправляем клиенту create_game
                sendWS(ws, "create_game", {
                    gameId,
                    gamePlayerId: gamePlayers[0].gamePlayerId,
                    yourIdx: 0,
                    opponent: "Bot"
                });
                break;
            }
            // player sends ships
            case "send_ships": {
                // data: { gameId, gamePlayerId, ships }
                const gameId = data?.gameId;
                const gpId = data?.gamePlayerId;
                const ships = data?.ships;
                if (!gameId || !gpId) {
                    sendWS(ws, "personal", { ok: false, message: "Missing gameId or gamePlayerId" });
                    break;
                }
                const game = Games.get(gameId);
                if (!game) {
                    sendWS(ws, "personal", { ok: false, message: "Game not found" });
                    break;
                }
                const gp = game.players.find(p => p.gamePlayerId === gpId);
                if (!gp) {
                    sendWS(ws, "personal", { ok: false, message: "Player not in game" });
                    break;
                }
                // basic validation and store
                gp.ships = Array.isArray(ships) ? ships.map((s) => ({ shipId: s.shipId, coords: s.coords.map((c) => ({ x: c.x, y: c.y })), hits: [] })) : [];
                sendWS(ws, "personal", { ok: true, message: "Ships accepted" });
                // if both have ships => start game
                if (game.players.every(p => p.ships && p.ships.length > 0)) {
                    // send start_game to both players (each receives their ships and opponent info; not revealing opponent ships)
                    for (const p of game.players) {
                        if (p.ws && p.ws.readyState === ws_1.default.OPEN) {
                            sendWS(p.ws, "start_game", {
                                gameId: game.gameId,
                                yourGamePlayerId: p.gamePlayerId,
                                yourShips: p.ships,
                                boardSize: game.boardSize,
                                opponent: game.players.find(x => x.gamePlayerId !== p.gamePlayerId)?.login
                            });
                        }
                    }
                    // send initial turn (playerIdx 0)
                    const current = game.players[game.currentTurnIndex];
                    broadcast(game.players.map(p => p.ws).filter(x => x && x.readyState === ws_1.default.OPEN), "turn", JSON.stringify({ currentPlayer: game.currentTurnIndex }));
                }
                break;
            }
            // attack handling
            case "attack": {
                // data: { gameId, fromGamePlayerId, x, y }
                const gameId = data?.gameId;
                const fromGP = data?.fromGamePlayerId;
                const x = data?.x;
                const y = data?.y;
                if (!gameId || !fromGP || typeof x !== "number" || typeof y !== "number") {
                    sendWS(ws, "personal", { ok: false, message: "Invalid attack payload" });
                    break;
                }
                const game = Games.get(gameId);
                if (!game) {
                    sendWS(ws, "personal", { ok: false, message: "Game not found" });
                    break;
                }
                if (game.finished) {
                    sendWS(ws, "personal", { ok: false, message: "Game finished" });
                    break;
                }
                const actorIndex = game.players.findIndex(p => p.gamePlayerId === fromGP);
                if (actorIndex === -1) {
                    sendWS(ws, "personal", { ok: false, message: "Player not in game" });
                    break;
                }
                if (actorIndex !== game.currentTurnIndex) {
                    sendWS(ws, "personal", { ok: false, message: "Not your turn" });
                    break;
                }
                const targetIndex = 1 - actorIndex;
                const actor = game.players[actorIndex];
                const target = game.players[targetIndex];
                if (!target.ships) {
                    sendWS(ws, "personal", { ok: false, message: "Opponent ships not set" });
                    break;
                }
                // check hit
                const ck = `${x}x${y}`;
                let hitShip = null;
                for (const s of target.ships) {
                    for (const c of s.coords) {
                        if (`${c.x}x${c.y}` === ck) {
                            hitShip = s;
                            break;
                        }
                    }
                    if (hitShip)
                        break;
                }
                let status = "miss"; // miss | hit | kill
                if (hitShip) {
                    hitShip.hits = hitShip.hits || [];
                    if (!hitShip.hits.includes(ck))
                        hitShip.hits.push(ck);
                    const killed = hitShip.coords.every(c => hitShip.hits.includes(`${c.x}x${c.y}`));
                    status = killed ? "kill" : "hit";
                }
                actor.shots = actor.shots || [];
                actor.shots.push({ x, y });
                if (status === "kill")
                    actor.killedShipCount = (actor.killedShipCount || 0) + 1;
                // notify both
                const attackPayload = {
                    fromGamePlayerId: actor.gamePlayerId,
                    toGamePlayerId: target.gamePlayerId,
                    x, y, status,
                    targetRemaining: target.ships.filter(s => !(s.hits && s.hits.length === s.coords.length)).length
                };
                broadcast(game.players.map(p => p.ws).filter(x => x && x.readyState === ws_1.default.OPEN), "attack", attackPayload);
                // check win
                const targetRemaining = target.ships.filter(s => !(s.hits && s.hits.length === s.coords.length)).length;
                if (targetRemaining === 0) {
                    game.finished = true;
                    game.winnerGamePlayerId = actor.gamePlayerId;
                    // update score
                    const playerRec = Players.get(actor.playerId);
                    if (playerRec) {
                        playerRec.score = (playerRec.score || 0) + 1;
                    }
                    broadcast(game.players.map(p => p.ws).filter(x => x && x.readyState === ws_1.default.OPEN), "finish", { winner: actor.gamePlayerId });
                    broadcastUpdateWinners();
                    break;
                }
                // if miss -> change turn
                if (status === "miss") {
                    game.currentTurnIndex = targetIndex;
                } // if hit/kill, same player continues
                // inform about turn
                broadcast(game.players.map(p => p.ws).filter(x => x && x.readyState === ws_1.default.OPEN), "turn", { currentPlayer: game.currentTurnIndex });
                break;
            }
            // leave room
            case "leave": {
                const playerId = data?.playerId;
                const roomId = data?.roomId;
                const room = Rooms.get(roomId);
                if (!room)
                    break;
                room.players = room.players.filter(p => p !== playerId);
                if (room.players.length === 0)
                    Rooms.delete(roomId);
                else
                    broadcastUpdateRooms();
                break;
            }
            // get winners
            case "get_winners": {
                const winners = Array.from(Players.values()).sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score }));
                sendWS(ws, "update_winners", winners);
                break;
            }
            default: {
                // unknown type: echo back as message
                sendWS(ws, "message", { note: "unknown type", type, data });
                break;
            }
        }
    });
    ws.on("close", () => {
        console.log("WS closed");
        // Optionally: cleanup ws reference from Players map
        for (const rec of Players.values()) {
            if (rec.ws === ws)
                rec.ws = undefined;
        }
    });
});
// --------------------------- START SERVER ---------------------------
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT} (WS on same port)`);
});
