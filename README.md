# Chess Multiplayer (Node + Socket.IO)

Real-time multiplayer chess app built with Node.js, Express, Socket.IO, and chess.js.

## Prerequisites

- Node.js 18+ (recommended)
- npm

## Setup

Run these commands in the project folder:

```powershell
npm init -y
npm install express socket.io chess.js ejs
```

## Run

```powershell
node app.js
```

Server starts at:

- http://localhost:3000

## How to Play

- Open `http://localhost:3000` in two browser windows/tabs.
- First connection becomes White, second becomes Black.
- Additional connections become spectators.

## Project Structure

- `app.js` - Express + Socket.IO server and game state handling
- `views/index.ejs` - Main HTML view
- `public/js/chessGame.js` - Client-side board rendering and move logic

## Notes

- The app currently runs directly with `node app.js`.
- If you want, you can add a `start` script later to run with `npm start`.
