//this is a chess game server built using node.js, express, socket.io and chess.js. It allows two players to play chess in real-time, while also allowing spectators to watch the game. The server manages player connections, game state, and move validation using the chess.js library.
const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");
const { title } = require("process");

const app = express();

const server = http.createServer(app);
const io = socket(server);

const chess = new Chess();

let players = {};
let currentPlayer = "w";

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("index", { title: "janaChess" });
});

io.on("connection", function (uniquesocket) {
  console.log("connected bro");
  if (!players.white) {
    players.white = uniquesocket.id;
    uniquesocket.emit("playerRole", "w");
  } else if (!players.black) {
    players.black = uniquesocket.id;
    uniquesocket.emit("playerRole", "b");
  } else {
    uniquesocket.emit("spectatorRole");
  }

  uniquesocket.on("disconnect", function () {
    if (uniquesocket.id === players.white) {
      players.white = null;
    } else if (uniquesocket.id === players.black) {
      players.black = null;
    }
  });

  uniquesocket.on("move", (move) => {
    try {
      if (chess.turn() == 'w' && uniquesocket.id != players.white) return;
      if (chess.turn() == 'b' && uniquesocket.id != players.black) return;

      const result = chess.move(move);
      if (result) {
        currentPlayer = chess.turn();
        io.emit("move", move);
        io.emit("boardState", chess.fen());
      } else {
        console.log("invalidMove :", move)
        uniquesocket.emit("invalidMove", move);
      }
    }
    catch (err) {
      console.log(err);
      uniquesocket.emit("invalidMove :", move);
    }
  });
});

server.listen(3000, function () {
  console.log("Server is running on port 3000");
});
