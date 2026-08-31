const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socket(server);

const RESET_DELAY_MS = 5000;

// Room storage: roomId -> { chess: Chess, players: { white: null, black: null }, resetTimer: null }
const rooms = {};

function getOrCreateRoom(roomId) {
  const id = roomId || "default";
  if (!rooms[id]) {
    rooms[id] = {
      chess: new Chess(),
      players: { white: null, black: null },
      resetTimer: null
    };
  }
  return rooms[id];
}

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.get("/vendor/chess.js", (req, res) => {
  res.sendFile(path.join(__dirname, "node_modules", "chess.js", "dist", "esm", "chess.js"));
});

app.get("/", (req, res) => {
  res.render("index", { title: "janaChess" });
});

function getGameOverPayload(chess) {
  if (chess.isCheckmate()) {
    return {
      reason: "checkmate",
      winner: chess.turn() === "w" ? "black" : "white",
      resetAfterMs: RESET_DELAY_MS,
    };
  }
  if (chess.isStalemate()) {
    return { reason: "stalemate", winner: null, resetAfterMs: RESET_DELAY_MS };
  }
  if (chess.isDraw()) {
    return { reason: "draw", winner: null, resetAfterMs: RESET_DELAY_MS };
  }
  return { reason: "gameover", winner: null, resetAfterMs: RESET_DELAY_MS };
}

io.on("connection", function (uniquesocket) {
  console.log(`Socket connected: ${uniquesocket.id}`);
  let currentRoomId = "default";

  uniquesocket.on("joinRoom", (requestedRoomId) => {
    const roomId = (requestedRoomId && typeof requestedRoomId === "string" && requestedRoomId.trim() !== "")
      ? requestedRoomId.trim()
      : "default";

    // Leave previous room if joined
    if (currentRoomId) {
      uniquesocket.leave(currentRoomId);
      const prevRoom = rooms[currentRoomId];
      if (prevRoom) {
        if (prevRoom.players.white === uniquesocket.id) prevRoom.players.white = null;
        if (prevRoom.players.black === uniquesocket.id) prevRoom.players.black = null;
      }
    }

    currentRoomId = roomId;
    uniquesocket.join(roomId);
    const room = getOrCreateRoom(roomId);

    if (!room.players.white) {
      room.players.white = uniquesocket.id;
      uniquesocket.emit("playerRole", "w");
      console.log(`Assigned White (w) to socket ${uniquesocket.id} in room [${roomId}]`);
    } else if (!room.players.black) {
      room.players.black = uniquesocket.id;
      uniquesocket.emit("playerRole", "b");
      console.log(`Assigned Black (b) to socket ${uniquesocket.id} in room [${roomId}]`);
    } else {
      uniquesocket.emit("spectatorRole");
      console.log(`Assigned Spectator to socket ${uniquesocket.id} in room [${roomId}]`);
    }

    uniquesocket.emit("boardState", room.chess.fen());
  });

  // Auto-join default room on initial connection if joinRoom not called immediately
  setTimeout(() => {
    if (!uniquesocket.rooms.has(currentRoomId)) {
      uniquesocket.emit("joinRoom", "default");
    }
  }, 100);

  uniquesocket.on("disconnect", function () {
    console.log(`Socket disconnected: ${uniquesocket.id} from room [${currentRoomId}]`);
    const room = rooms[currentRoomId];
    if (room) {
      if (uniquesocket.id === room.players.white) {
        room.players.white = null;
        console.log(`White player slot is now empty in room [${currentRoomId}]`);
      } else if (uniquesocket.id === room.players.black) {
        room.players.black = null;
        console.log(`Black player slot is now empty in room [${currentRoomId}]`);
      }
    }
  });

  uniquesocket.on("move", (move) => {
    try {
      const room = rooms[currentRoomId] || getOrCreateRoom("default");
      const chess = room.chess;

      if (chess.isGameOver()) {
        uniquesocket.emit("invalidMove", { move, reason: "Game is over" });
        return;
      }

      if (chess.turn() === "w" && uniquesocket.id !== room.players.white) {
        uniquesocket.emit("invalidMove", { move, reason: "Not White player's turn" });
        return;
      }

      if (chess.turn() === "b" && uniquesocket.id !== room.players.black) {
        uniquesocket.emit("invalidMove", { move, reason: "Not Black player's turn" });
        return;
      }

      const result = chess.move(move);
      if (result) {
        console.log(`Room [${currentRoomId}] Valid move: ${result.san} by ${result.color === "w" ? "White" : "Black"}`);
        io.to(currentRoomId).emit("move", move);
        io.to(currentRoomId).emit("boardState", chess.fen());

        if (chess.isGameOver() && !room.resetTimer) {
          console.log(`Room [${currentRoomId}] Game over! Payload:`, getGameOverPayload(chess));
          io.to(currentRoomId).emit("gameOver", getGameOverPayload(chess));
          room.resetTimer = setTimeout(() => {
            chess.reset();
            console.log(`Room [${currentRoomId}] Game has been reset.`);
            io.to(currentRoomId).emit("boardState", chess.fen());
            io.to(currentRoomId).emit("gameReset");
            room.resetTimer = null;
          }, RESET_DELAY_MS);
        }
      } else {
        console.log(`Room [${currentRoomId}] Invalid move rejected:`, move);
        uniquesocket.emit("invalidMove", { move, reason: "Illegal chess move" });
      }
    } catch (err) {
      console.log("Error processing move:", err.message);
      uniquesocket.emit("invalidMove", { move, reason: err.message });
    }
  });
});

server.listen(3000, function () {
  console.log("Server is running on port 3000");
});
