//this is a chess game server built using node.js, express, socket.io and chess.js. It allows two players to play chess in real-time, while also allowing spectators to watch the game. The server manages player connections, game state, and move validation using the chess.js library.
const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");

const app = express();

const server = http.createServer(app);
const io = socket(server);

const chess = new Chess();
const RESET_DELAY_MS = 5000;
let resetTimer = null;

let players = {};

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.get("/vendor/chess.js", (req, res) => {
  res.sendFile(path.join(__dirname, "node_modules", "chess.js", "dist", "esm", "chess.js"));
});

app.get("/", (req, res) => {
  res.render("index", { title: "janaChess" });
});

function getGameOverPayload() {
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
  
  if (!players.white) {
    players.white = uniquesocket.id;
    uniquesocket.emit("playerRole", "w");
    console.log(`Assigned White (w) to socket: ${uniquesocket.id}`);
  } else if (!players.black) {
    players.black = uniquesocket.id;
    uniquesocket.emit("playerRole", "b");
    console.log(`Assigned Black (b) to socket: ${uniquesocket.id}`);
  } else {
    uniquesocket.emit("spectatorRole");
    console.log(`Assigned Spectator to socket: ${uniquesocket.id}`);
  }
  uniquesocket.emit("boardState", chess.fen());

  uniquesocket.on("disconnect", function () {
    console.log(`Socket disconnected: ${uniquesocket.id}`);
    if (uniquesocket.id === players.white) {
      players.white = null;
      console.log("White player slot is now empty.");
    } else if (uniquesocket.id === players.black) {
      players.black = null;
      console.log("Black player slot is now empty.");
    }
  });

  uniquesocket.on("move", (move) => {
    try {
      if (chess.isGameOver()) return;
      if (chess.turn() == 'w' && uniquesocket.id != players.white) return;
      if (chess.turn() == 'b' && uniquesocket.id != players.black) return;

      const result = chess.move(move);
      if (result) {
        console.log(`Valid move: ${result.san} by ${result.color === 'w' ? 'White' : 'Black'}`);
        io.emit("move", move);
        io.emit("boardState", chess.fen());
        if (chess.isGameOver() && !resetTimer) {
          console.log("Game over! Result payload:", getGameOverPayload());
          io.emit("gameOver", getGameOverPayload());
          resetTimer = setTimeout(() => {
            chess.reset();
            console.log("Game has been reset.");
            io.emit("boardState", chess.fen());
            io.emit("gameReset");
            resetTimer = null;
          }, RESET_DELAY_MS);
        }
      } else {
        console.log("Invalid move rejected:", move);
        uniquesocket.emit("invalidMove", move);
      }
    }
    catch (err) {
      console.log("Error processing move:", err.message);
      uniquesocket.emit("invalidMove", move);
    }
  });
});

server.listen(3000, function () {
  console.log("Server is running on port 3000");
});
