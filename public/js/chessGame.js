// Initialize a socket connection to the server
import { Chess } from "/vendor/chess.js";

const socket = io();

// Create a new Chess game instance
const chess = new Chess();

// Select DOM elements
const boardelement = document.querySelector('.chessboard');
const btnFlipBoard = document.getElementById('btn-flip-board');
const btnCopyLink = document.getElementById('btn-copy-link');

// Variables to keep track of the dragged piece and its source square
let draggedPiece = null;
let sourceSquare = null;

// Variable to store the player's role (white 'w', black 'b', or spectator null)
let playerRole = null;
let gameOverActive = false;
let boardFlipped = false; // Manual view flip toggle

// Function to calculate captured pieces
const getCapturedPieces = () => {
    const startingPieces = {
        w: { p: 8, r: 2, n: 2, b: 2, q: 1 },
        b: { p: 8, r: 2, n: 2, b: 2, q: 1 }
    };
    
    // Count pieces currently on the board
    const currentPieces = {
        w: { p: 0, r: 0, n: 0, b: 0, q: 0 },
        b: { p: 0, r: 0, n: 0, b: 0, q: 0 }
    };
    
    chess.board().forEach(row => {
        row.forEach(square => {
            if (square && square.type !== 'k') { // King cannot be captured
                currentPieces[square.color][square.type]++;
            }
        });
    });
    
    // Calculate captured pieces
    const captured = {
        w: [], // White pieces captured (held by Black)
        b: []  // Black pieces captured (held by White)
    };
    
    // White pieces captured
    for (const type in startingPieces.w) {
        const count = startingPieces.w[type] - currentPieces.w[type];
        for (let i = 0; i < count; i++) {
            captured.w.push(type);
        }
    }
    
    // Black pieces captured
    for (const type in startingPieces.b) {
        const count = startingPieces.b[type] - currentPieces.b[type];
        for (let i = 0; i < count; i++) {
            captured.b.push(type);
        }
    }
    
    return captured;
};

// Function to render the chessboard
const renderBoard = () => {
    // Get the current board state
    const board = chess.board();
    // Clear the existing board
    boardelement.innerHTML = "";
    
    // Iterate through each row of the board
    board.forEach((row, rowindex) => {
        // Iterate through each square in the row
        row.forEach((square, squareIndex) => {
            // Create a new div element for the square
            const squareElement = document.createElement("div");
            
            // Add appropriate classes to the square (light or dark)
            squareElement.classList.add("square",
                rowindex % 2 === squareIndex % 2 ? "light" : "dark");
            
            // Set data attributes for row and column
            squareElement.dataset.row = rowindex;
            squareElement.dataset.column = squareIndex;
            
            // If there's a piece on this square
            if (square) {
                // Create a new div element for the piece
                const pieceElement = document.createElement("div");
                
                // Add appropriate classes to the piece (white or black)
                pieceElement.classList.add("piece", square.color === "w" ? "white" : "black");
                
                // Set the piece's Unicode character
                pieceElement.innerText = getPieceUnicode(square);
                
                // Make the piece draggable if it's the player's turn and piece
                pieceElement.draggable = !gameOverActive && playerRole === square.color && playerRole === chess.turn();
                pieceElement.classList.toggle("draggable", pieceElement.draggable);

                // Add dragstart event listener to the piece
                pieceElement.addEventListener("dragstart", (e) => {
                    if (pieceElement.draggable) {
                        // Set the dragged piece and its source square
                        draggedPiece = pieceElement;
                        sourceSquare = { row: rowindex, col: squareIndex };
                        pieceElement.classList.add("dragging");
                        // Set the drag data (required for Firefox)
                        e.dataTransfer.setData("text/plain", "");
                    }
                });

                pieceElement.addEventListener("dragend", () => {
                    pieceElement.classList.remove("dragging");
                });

                // Append the piece to the square
                squareElement.appendChild(pieceElement);
            }

            // Add dragover event listener to the square
            squareElement.addEventListener("dragover", function (e) {
                // Prevent default to allow drop
                e.preventDefault();
            });

            // Add drop event listener to the square
            squareElement.addEventListener("drop", function (e) {
                // Prevent default browser behavior
                e.preventDefault();
                if (draggedPiece) {
                    // Get the target square coordinates
                    const TargetSource = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.column),
                    };
                    // Handle the move
                    handleMove(sourceSquare, TargetSource);
                    draggedPiece = null;
                    sourceSquare = null;
                }
            });
            
            // Append the square to the board
            boardelement.append(squareElement);
        });
    });

    // Flip the board if the player is black (or manually toggled)
    const shouldFlip = (playerRole === "b" && !boardFlipped) || (playerRole !== "b" && boardFlipped);
    if (shouldFlip) {
        boardelement.classList.add("flipped");
    } else {
        boardelement.classList.remove("flipped");
    }

    // Update all status panels on render
    updateUIElements();
};

// Function to handle a move
const handleMove = (source, target) => {
    // Create a move object in the format required by chess.js
    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: 'q', // Always promote to queen for simplicity
    };
    // Emit the move to the server
    socket.emit("move", move);
};

// Function to get the Unicode character for a chess piece
// We use solid filled pieces for both White and Black to be visually symmetric,
// and append \uFE0E (Variation Selector-15) to force text-style monochrome rendering on Windows/e-mail clients.
const getPieceUnicode = (piece) => {
    const unicodePieces = {
        p: "\u265f", // Solid pawn
        r: "\u265c", // Solid rook
        n: "\u265e", // Solid knight
        b: "\u265d", // Solid bishop
        q: "\u265b", // Solid queen
        k: "\u265a"  // Solid king
    };
    return (unicodePieces[piece.type] || "") + "\uFE0E";
};

// Function to update role, turn, move history, and captured pieces UI
const updateUIElements = () => {
    updateRoleUI();
    updateStatusUI();
    updateMoveHistoryUI();
    
    // Update captured pieces
    const captured = getCapturedPieces();
    updateCapturedPiecesUI(captured);
};

// Function to update the role badge and names
const updateRoleUI = () => {
    const roleBadge = document.getElementById("role-badge");
    const playerUsername = document.getElementById("player-username");
    const oppUsername = document.getElementById("opp-username");
    const playerAvatar = document.getElementById("player-avatar");
    const oppAvatar = document.getElementById("opp-avatar");
    
    if (!roleBadge) return;

    if (playerRole === "w") {
        roleBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-white ring-2 ring-emerald-500/40"></span> Playing as White`;
        roleBadge.className = "px-3 py-1 text-xs font-semibold bg-zinc-900 border border-zinc-800 rounded-full text-zinc-200 flex items-center gap-2 shadow-sm";
        
        playerUsername.innerText = "You (White)";
        playerAvatar.innerText = "W";
        playerAvatar.className = "w-6 h-6 rounded bg-zinc-100 text-zinc-950 flex items-center justify-center text-xs font-bold shadow";
        
        oppUsername.innerText = "Opponent (Black)";
        oppAvatar.innerText = "B";
        oppAvatar.className = "w-6 h-6 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-bold shadow";
    } else if (playerRole === "b") {
        roleBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-zinc-950 ring-2 ring-emerald-500/40"></span> Playing as Black`;
        roleBadge.className = "px-3 py-1 text-xs font-semibold bg-zinc-900 border border-zinc-800 rounded-full text-zinc-200 flex items-center gap-2 shadow-sm";
        
        playerUsername.innerText = "You (Black)";
        playerAvatar.innerText = "B";
        playerAvatar.className = "w-6 h-6 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-bold shadow-sm";
        
        oppUsername.innerText = "Opponent (White)";
        oppAvatar.innerText = "W";
        oppAvatar.className = "w-6 h-6 rounded bg-zinc-100 text-zinc-950 flex items-center justify-center text-xs font-bold shadow";
    } else {
        roleBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Spectating`;
        roleBadge.className = "px-3 py-1 text-xs font-semibold bg-blue-950/20 border border-blue-900/30 rounded-full text-blue-400 flex items-center gap-2 shadow-sm";
        
        playerUsername.innerText = "White Player";
        playerAvatar.innerText = "W";
        playerAvatar.className = "w-6 h-6 rounded bg-zinc-100 text-zinc-950 flex items-center justify-center text-xs font-bold shadow";
        
        oppUsername.innerText = "Black Player";
        oppAvatar.innerText = "B";
        oppAvatar.className = "w-6 h-6 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-bold shadow";
    }
};

// Function to update turn card and check alert
const updateStatusUI = () => {
    const turnDot = document.getElementById("turn-dot");
    const turnLabel = document.getElementById("turn-label");
    const turnCard = document.getElementById("turn-card");
    const statusAlert = document.getElementById("status-alert");
    
    if (!turnDot || !turnLabel || !turnCard) return;

    const turn = chess.turn(); // 'w' or 'b'
    const isPlayerTurn = playerRole === turn;
    
    if (turn === 'w') {
        turnDot.className = "w-3 h-3 rounded-full bg-zinc-100 border border-zinc-300 shadow-sm";
        turnLabel.innerText = "White's Turn";
    } else {
        turnDot.className = "w-3 h-3 rounded-full bg-zinc-950 border border-zinc-800 shadow-sm";
        turnLabel.innerText = "Black's Turn";
    }
    
    // Highlight turn card if it is this client's turn
    if (playerRole && isPlayerTurn && !gameOverActive) {
        turnCard.classList.add("active-turn-glow", "border-emerald-500/40", "bg-emerald-950/20");
        turnCard.classList.remove("border-zinc-800", "bg-zinc-900/40");
        turnLabel.classList.add("text-emerald-400");
        turnLabel.classList.remove("text-zinc-300");
    } else {
        turnCard.classList.remove("active-turn-glow", "border-emerald-500/40", "bg-emerald-950/20");
        turnCard.classList.add("border-zinc-800", "bg-zinc-900/40");
        turnLabel.classList.remove("text-emerald-400");
        turnLabel.classList.add("text-zinc-300");
    }
    
    // Update check indicator
    if (statusAlert) {
        if (chess.inCheck() && !chess.isGameOver()) {
            statusAlert.innerText = "CHECK";
            statusAlert.className = "text-xs text-amber-400 font-bold bg-amber-950/40 border border-amber-900/30 px-3 py-1.5 rounded-lg active-turn-glow";
            statusAlert.classList.remove("hidden");
        } else {
            statusAlert.classList.add("hidden");
        }
    }
};

// Function to update the scrollable move history
const updateMoveHistoryUI = () => {
    const history = chess.history({ verbose: true });
    const emptyState = document.getElementById("move-history-empty");
    const gridState = document.getElementById("move-history-grid");
    const moveCountElement = document.getElementById("move-count");
    
    if (!emptyState || !gridState || !moveCountElement) return;

    if (history.length === 0) {
        emptyState.classList.remove("hidden");
        gridState.classList.add("hidden");
        moveCountElement.innerText = "0 moves";
        return;
    }
    
    emptyState.classList.add("hidden");
    gridState.classList.remove("hidden");
    moveCountElement.innerText = `${history.length} move${history.length > 1 ? "s" : ""}`;
    
    gridState.innerHTML = "";
    
    // Group moves into pairs (turns)
    for (let i = 0; i < history.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const whiteMove = history[i];
        const blackMove = history[i + 1];
        
        // White move cell
        const whiteCell = document.createElement("div");
        whiteCell.className = "flex items-center gap-2 text-zinc-200 py-0.5";
        whiteCell.innerHTML = `<span class="text-zinc-600 text-xs w-6 text-right font-mono">${moveNumber}.</span> <span class="font-semibold">${whiteMove.san}</span>`;
        gridState.appendChild(whiteCell);
        
        // Black move cell (if exists)
        const blackCell = document.createElement("div");
        blackCell.className = "flex items-center gap-2 text-zinc-400 py-0.5 pl-4";
        if (blackMove) {
            blackCell.innerHTML = `<span class="font-semibold text-zinc-300">${blackMove.san}</span>`;
        } else {
            blackCell.innerHTML = `<span class="text-zinc-700 font-light italic text-xs font-mono">...</span>`;
        }
        gridState.appendChild(blackCell);
    }
    
    // Scroll to the bottom of the container
    const container = document.getElementById("move-history-container");
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
};

// Function to update captured pieces trophy lists
const updateCapturedPiecesUI = (captured) => {
    const oppCapturedElement = document.getElementById("opp-captured");
    const playerCapturedElement = document.getElementById("player-captured");
    
    if (!oppCapturedElement || !playerCapturedElement) return;
    
    oppCapturedElement.innerHTML = "";
    playerCapturedElement.innerHTML = "";
    
    // Standard monochrome symbols for captured trophies
    const unicodeSymbols = {
        w: { p: "♙", r: "♖", n: "♘", b: "♗", q: "♕" },
        b: { p: "♟", r: "♜", n: "♞", b: "♝", q: "♛" }
    };
    
    let oppCapturedList = [];
    let playerCapturedList = [];
    
    if (playerRole === "w") {
        // Player is White (has Black's pieces). Opponent is Black (has White's pieces).
        playerCapturedList = captured.b.map(type => `<span class="text-zinc-500 font-normal px-0.5" title="Black Captured Pawn/Piece">${unicodeSymbols.b[type]}</span>`);
        oppCapturedList = captured.w.map(type => `<span class="text-zinc-300 font-normal px-0.5" title="White Captured Pawn/Piece">${unicodeSymbols.w[type]}</span>`);
    } else if (playerRole === "b") {
        // Player is Black (has White's pieces). Opponent is White (has Black's pieces).
        playerCapturedList = captured.w.map(type => `<span class="text-zinc-300 font-normal px-0.5" title="White Captured Pawn/Piece">${unicodeSymbols.w[type]}</span>`);
        oppCapturedList = captured.b.map(type => `<span class="text-zinc-500 font-normal px-0.5" title="Black Captured Pawn/Piece">${unicodeSymbols.b[type]}</span>`);
    } else {
        // Spectator view: top shows Black's captures (White pieces), bottom shows White's captures (Black pieces)
        oppCapturedList = captured.w.map(type => `<span class="text-zinc-300 font-normal px-0.5">${unicodeSymbols.w[type]}</span>`);
        playerCapturedList = captured.b.map(type => `<span class="text-zinc-500 font-normal px-0.5">${unicodeSymbols.b[type]}</span>`);
    }
    
    oppCapturedElement.innerHTML = oppCapturedList.join("");
    playerCapturedElement.innerHTML = playerCapturedList.join("");
};

// Socket event listener for receiving player role
socket.on("playerRole", function (role) {
    playerRole = role;
    renderBoard();
});

// Socket event listener for receiving moves
socket.on("move", function (move) {
    // Apply the move to the local chess instance
    chess.move(move);
    // Re-render the board
    renderBoard();
});

// Socket event listener for spectator role
socket.on("spectatorRole", function () {
    playerRole = null;
    renderBoard();
});

// Socket event listener for receiving board state
socket.on("boardState", function (fen) {
    // Only load if the board state actually differs, to prevent wiping move history
    if (chess.fen() !== fen) {
        chess.load(fen);
        renderBoard();
    }
});

// Socket event listener for game over
socket.on("gameOver", function (payload) {
    gameOverActive = true;
    showPopup(buildGameOverMessage(payload));
});

// Socket event listener for game reset
socket.on("gameReset", function () {
    gameOverActive = false;
    closePopup();
    renderBoard();
});

// Event listener for manual view flip toggle
if (btnFlipBoard) {
    btnFlipBoard.addEventListener("click", () => {
        boardFlipped = !boardFlipped;
        renderBoard();
    });
}

// Event listener for clipboard invite link copy
if (btnCopyLink) {
    btnCopyLink.addEventListener("click", () => {
        navigator.clipboard.writeText(window.location.href)
            .then(() => {
                const originalHTML = btnCopyLink.innerHTML;
                btnCopyLink.innerHTML = `
                    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    Copied!
                `;
                btnCopyLink.classList.add("border-emerald-500/50", "text-emerald-400");
                btnCopyLink.classList.remove("border-zinc-800", "text-zinc-300");
                setTimeout(() => {
                    btnCopyLink.innerHTML = originalHTML;
                    btnCopyLink.classList.remove("border-emerald-500/50", "text-emerald-400");
                    btnCopyLink.classList.add("border-zinc-800", "text-zinc-300");
                }, 2000);
            })
            .catch(err => {
                console.error("Failed to copy URL:", err);
            });
    });
}

function buildGameOverMessage(payload) {
    const resetSeconds = Math.floor((payload?.resetAfterMs || 5000) / 1000);

    if (payload?.reason === "checkmate") {
        const winnerRole = payload.winner === "white" ? "w" : "b";
        const winnerLabel = payload.winner === "white" ? "White" : "Black";
        if (!playerRole) {
            return `${winnerLabel} wins by checkmate. Restarting in ${resetSeconds}s...`;
        }
        if (playerRole === winnerRole) {
            return `You won by checkmate! Restarting in ${resetSeconds}s...`;
        }
        return `You lost by checkmate. Restarting in ${resetSeconds}s...`;
    }

    if (payload?.reason === "stalemate") {
        return `Draw by stalemate. Restarting in ${resetSeconds}s...`;
    }

    if (payload?.reason === "draw") {
        return `Draw. Restarting in ${resetSeconds}s...`;
    }

    return `Game over. Restarting in ${resetSeconds}s...`;
}

// Function to show the game over popup
function showPopup(message) {
    const popup = document.getElementById('game-over-popup');
    const popupMessage = document.getElementById('popup-message');
    if (popup && popupMessage) {
        popupMessage.textContent = message;
        popup.classList.remove('hidden');
    }
}

// Function to close the game over popup
function closePopup() {
    const popup = document.getElementById('game-over-popup');
    if (popup) {
        popup.classList.add('hidden');
    }
}

// Add event listener for the close button on the popup
const closePopupBtn = document.getElementById('close-popup');
if (closePopupBtn) {
    closePopupBtn.addEventListener('click', closePopup);
}

// Initial board render
renderBoard();
