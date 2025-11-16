import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

// --- Настройки портов ---
const HTTP_PORT = 8181;
const WS_PORT = 8081;
const MAX_PLAYERS_PER_ROOM = 2;

// --- В памяти ---
interface Player {
  id: string;
  login: string;
  password: string;
  ws: WebSocket;
}

interface Room {
  id: string;
  players: Player[];
  ships?: Record<string, any>;
  turn?: string;
}

const players: Record<string, Player> = {};
const rooms: Record<string, Room> = {};

// --- HTTP сервер ---
const server = createServer((req, res) => {
  const url = req.url || "/";
  let filePath: string;

  // При запросе "/" отдаём index.html из front/
  if (url === "/" || url === "/index.html") {
    filePath = join(__dirname, "front", "index.html");
  } else if (url === "/main.js") {
    filePath = join(__dirname, "front", "main.js");
  } else if (url === "/main.css") {
    filePath = join(__dirname, "front", "main.css");
  } else {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = filePath.split(".").pop();
  const contentType =
    ext === "js" ? "text/javascript" :
    ext === "css" ? "text/css" :
    "text/html";

  const data = readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(data);
});

server.listen(HTTP_PORT, () => {
  console.log(`HTTP frontend running on http://localhost:${HTTP_PORT}`);
});

// --- WebSocket сервер ---
const wss = new WebSocketServer({ port: WS_PORT });
wss.on("listening", () => console.log(`WS server running on ws://localhost:${WS_PORT}`));

function updateRooms() {
  const roomList = Object.values(rooms).map(r => ({
    roomId: r.id,
    players: r.players.map(p => p.login)
  }));

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "update_room", rooms: roomList }));
    }
  }
}

wss.on("connection", (ws: WebSocket) => {
  console.log("New client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("Received:", data);

      switch (data.type) {

        case "reg": {
          const { login, password } = data;
          let playerId = Object.keys(players).find(id => players[id].login === login);

          if (!playerId) {
            playerId = randomUUID();
            players[playerId] = { id: playerId, login, password, ws };
          } else if (players[playerId].password !== password) {
            ws.send(JSON.stringify({ type: "reg", success: false, message: "Wrong password" }));
            return;
          } else players[playerId].ws = ws;

          ws.send(JSON.stringify({ type: "reg", success: true, playerId }));
          break;
        }

        case "create_room": {
          const player = players[data.playerId];
          if (!player) return;
          const roomId = randomUUID();
          rooms[roomId] = { id: roomId, players: [player] };
          ws.send(JSON.stringify({ type: "create_game", roomId, playerId: player.id }));
          updateRooms();
          break;
        }

        case "join_room": {
          const room = rooms[data.roomId];
          const player = players[data.playerId];
          if (!room || !player || room.players.length >= MAX_PLAYERS_PER_ROOM) return;

          room.players.push(player);
          ws.send(JSON.stringify({ type: "create_game", roomId: room.id, playerId: player.id }));

          if (room.players.length === 2) {
            room.turn = room.players[0].id;
            room.players.forEach(p => p.ws.send(JSON.stringify({ type: "start_game", roomId: room.id, turn: room.turn })));
          }
          updateRooms();
          break;
        }

        case "attack": {
          const { roomId, playerId, x, y } = data;
          const room = rooms[roomId];
          if (!room || room.turn !== playerId) return;

          const hit = Math.random() > 0.5;
          room.players.forEach(p => p.ws.send(JSON.stringify({ type: "attack", x, y, hit })));

          if (!hit) {
            room.turn = room.players.find(p => p.id !== playerId)?.id;
            room.players.forEach(p => p.ws.send(JSON.stringify({ type: "turn", turn: room.turn })));
          }
          break;
        }

      }
    } catch (err) {
      console.error("Invalid message", err);
    }
  });

  ws.on("close", () => console.log("Client disconnected"));
});
