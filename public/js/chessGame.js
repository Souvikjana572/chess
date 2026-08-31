// Initialize a socket connection to the server
import { Chess } from "/vendor/chess.js";

const socket = io();

// Parse room ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room") || "default";

// Create a new Chess game instance
const chess = new Chess();

// Select DOM elements
const boardelement = document.querySelector('.chessboard');
const btnFlipBoard = document.getElementById('btn-flip-board');
const btnCopyLink = document.getElementById('btn-copy-link');
const roomBadge = document.getElementById('room-badge');
const promotionModal = document.getElementById('promotion-modal');
const toastContainer = document.getElementById('toast-container');

if (roomBadge) {
    roomBadge.innerText = `Room: ${roomId}`;
}

// Variables for drag, selection, and game state
let draggedPiece = null;
let sourceSquare = null;
let selectedSquare = null; // { row, col }
let legalMoveTargets = []; // array of { toRow, toCol, verbose }
let lastMove = null; // { fromSquare: {row, col}, toSquare: {row, col} }
let pendingPromotion = null; // { source, target }

let playerRole = null;
let gameOverActive = false;
let boardFlipped = false; // Manual view flip toggle

// Emit joinRoom on initial socket connection
socket.on("connect", () => {
    socket.emit("joinRoom", roomId);
});

const squareToAlgebraic = (row, col) => {
    return `${String.fromCharCode(97 + col)}${8 - row}`;
};

const algebraicToSquare = (squareStr) => {
    if (!squareStr || squareStr.length < 2) return null;
    const col = squareStr.charCodeAt(0) - 97;
    const row = 8 - parseInt(squareStr[1]);
    return { row, col };
};

// Toast message helper
const showToast = (message, isError = true) => {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `px-4 py-2 rounded-xl text-xs font-semibold shadow-lg backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto border flex items-center gap-2 ${
        isError 
            ? "bg-red-950/80 border-red-800/80 text-red-200 shadow-red-950/40" 
            : "bg-emerald-950/80 border-emerald-800/80 text-emerald-200 shadow-emerald-950/40"
    }`;
    toast.innerHTML = `
        <svg class="w-4 h-4 shrink-0 ${isError ? 'text-red-400' : 'text-emerald-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isError ? 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' : 'M5 13l4 4L19 7'}"></path>
        </svg>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.remove("translate-y-2", "opacity-0");
    });

    setTimeout(() => {
        toast.classList.add("opacity-0", "translate-y-2");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Calculate captured pieces
const getCapturedPieces = () => {
    const startingPieces = {
        w: { p: 8, r: 2, n: 2, b: 2, q: 1 },
        b: { p: 8, r: 2, n: 2, b: 2, q: 1 }
    };
    const currentPieces = {
        w: { p: 0, r: 0, n: 0, b: 0, q: 0 },
        b: { p: 0, r: 0, n: 0, b: 0, q: 0 }
    };
    
    chess.board().forEach(row => {
        row.forEach(square => {
            if (square && square.type !== 'k') {
                currentPieces[square.color][square.type]++;
            }
        });
    });
    
    const captured = { w: [], b: [] };
    for (const type in startingPieces.w) {
        const count = startingPieces.w[type] - currentPieces.w[type];
        for (let i = 0; i < count; i++) captured.w.push(type);
    }
    for (const type in startingPieces.b) {
        const count = startingPieces.b[type] - currentPieces.b[type];
        for (let i = 0; i < count; i++) captured.b.push(type);
    }
    return captured;
};

// Function to render board programmatically without CSS rotation bugs
const renderBoard = () => {
    const board = chess.board();
    boardelement.innerHTML = "";

    const shouldFlip = (playerRole === "b" && !boardFlipped) || (playerRole !== "b" && boardFlipped);
    const rowIndices = shouldFlip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const colIndices = shouldFlip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    rowIndices.forEach((rowindex) => {
        colIndices.forEach((squareIndex) => {
            const square = board[rowindex][squareIndex];
            const squareElement = document.createElement("div");
            
            squareElement.classList.add(
                "square",
                rowindex % 2 === squareIndex % 2 ? "light" : "dark"
            );
            
            squareElement.dataset.row = rowindex;
            squareElement.dataset.column = squareIndex;

            // Highlight selected square
            if (selectedSquare && selectedSquare.row === rowindex && selectedSquare.col === squareIndex) {
                squareElement.classList.add("square-selected");
            }

            // Highlight last move
            if (lastMove && (
                (lastMove.fromSquare.row === rowindex && lastMove.fromSquare.col === squareIndex) ||
                (lastMove.toSquare.row === rowindex && lastMove.toSquare.col === squareIndex)
            )) {
                squareElement.classList.add("square-last-move");
            }

            // Highlight legal move targets
            const legalTarget = legalMoveTargets.find(m => m.toRow === rowindex && m.toCol === squareIndex);
            if (legalTarget) {
                const indicator = document.createElement("div");
                if (square) {
                    indicator.classList.add("legal-move-capture");
                } else {
                    indicator.classList.add("legal-move-dot");
                }
                squareElement.appendChild(indicator);
            }

            // Piece rendering
            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece", square.color === "w" ? "white" : "black");
                pieceElement.innerText = getPieceUnicode(square);
                
                const isMyPiece = playerRole === square.color;
                const isMyTurn = playerRole === chess.turn();
                
                pieceElement.draggable = !gameOverActive && isMyPiece && isMyTurn;
                pieceElement.classList.toggle("draggable", pieceElement.draggable);

                pieceElement.addEventListener("dragstart", (e) => {
                    if (pieceElement.draggable) {
                        draggedPiece = pieceElement;
                        sourceSquare = { row: rowindex, col: squareIndex };
                        pieceElement.classList.add("dragging");
                        e.dataTransfer.setData("text/plain", "");
                        
                        selectSquare(rowindex, squareIndex);
                    }
                });

                pieceElement.addEventListener("dragend", () => {
                    pieceElement.classList.remove("dragging");
                });

                squareElement.appendChild(pieceElement);
            }

            // Click / Tap listener for square
            squareElement.addEventListener("click", (e) => {
                e.stopPropagation();
                handleSquareSelect(rowindex, squareIndex);
            });

            // Dragover listener
            squareElement.addEventListener("dragover", (e) => {
                e.preventDefault();
            });

            // Drop listener
            squareElement.addEventListener("drop", (e) => {
                e.preventDefault();
                if (draggedPiece && sourceSquare) {
                    const targetSquare = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.column),
                    };
                    attemptMove(sourceSquare, targetSquare);
                    draggedPiece = null;
                    sourceSquare = null;
                }
            });

            boardelement.appendChild(squareElement);
        });
    });

    updateUIElements();
};

const selectSquare = (row, col) => {
    const square = chess.board()[row][col];
    if (!square) {
        selectedSquare = null;
        legalMoveTargets = [];
        renderBoard();
        return;
    }

    const isMyPiece = playerRole === square.color;
    const isMyTurn = playerRole === chess.turn();

    if (!gameOverActive && isMyPiece && isMyTurn) {
        selectedSquare = { row, col };
        const alg = squareToAlgebraic(row, col);
        const moves = chess.moves({ square: alg, verbose: true });
        legalMoveTargets = moves.map(m => {
            const dest = algebraicToSquare(m.to);
            return { toRow: dest.row, toCol: dest.col, verbose: m };
        });
    } else {
        selectedSquare = null;
        legalMoveTargets = [];
    }
    renderBoard();
};

const handleSquareSelect = (row, col) => {
    if (gameOverActive || !playerRole || playerRole !== chess.turn()) {
        selectedSquare = null;
        legalMoveTargets = [];
        renderBoard();
        return;
    }

    if (selectedSquare) {
        // Deselect if clicking the same square
        if (selectedSquare.row === row && selectedSquare.col === col) {
            selectedSquare = null;
            legalMoveTargets = [];
            renderBoard();
            return;
        }

        // Check if clicking a legal target
        const targetMove = legalMoveTargets.find(m => m.toRow === row && m.toCol === col);
        if (targetMove) {
            attemptMove(selectedSquare, { row, col });
            selectedSquare = null;
            legalMoveTargets = [];
            return;
        }

        // Switch selection if clicking another of own pieces
        const clickedSquarePiece = chess.board()[row][col];
        if (clickedSquarePiece && clickedSquarePiece.color === playerRole) {
            selectSquare(row, col);
            return;
        }

        // Otherwise clear selection
        selectedSquare = null;
        legalMoveTargets = [];
        renderBoard();
    } else {
        const square = chess.board()[row][col];
        if (square && square.color === playerRole) {
            selectSquare(row, col);
        }
    }
};

const attemptMove = (source, target) => {
    if (source.row === target.row && source.col === target.col) {
        return;
    }

    const fromAlg = squareToAlgebraic(source.row, source.col);
    const toAlg = squareToAlgebraic(target.row, target.col);

    const piece = chess.get(fromAlg);
    const isPawn = piece && piece.type === 'p';
    const isPromotionRank = (piece && piece.color === 'w' && target.row === 0) || 
                           (piece && piece.color === 'b' && target.row === 7);

    const moves = chess.moves({ square: fromAlg, verbose: true });
    const isValid = moves.some(m => m.to === toAlg);

    if (!isValid) {
        showToast("Illegal move!", true);
        selectedSquare = null;
        legalMoveTargets = [];
        renderBoard();
        return;
    }

    if (isPawn && isPromotionRank) {
        pendingPromotion = { source, target };
        if (promotionModal) {
            promotionModal.classList.remove("hidden");
        }
        return;
    }

    executeMove(source, target, 'q');
};

const executeMove = (source, target, promotionPiece = 'q') => {
    const move = {
        from: squareToAlgebraic(source.row, source.col),
        to: squareToAlgebraic(target.row, target.col),
        promotion: promotionPiece,
    };
    
    lastMove = {
        fromSquare: { row: source.row, col: source.col },
        toSquare: { row: target.row, col: target.col }
    };
    
    socket.emit("move", move);
    selectedSquare = null;
    legalMoveTargets = [];
};

// Promotion Modal setup
if (promotionModal) {
    const options = promotionModal.querySelectorAll('.promotion-option');
    options.forEach(btn => {
        btn.addEventListener('click', () => {
            const chosenPiece = btn.dataset.piece || 'q';
            promotionModal.classList.add("hidden");
            if (pendingPromotion) {
                executeMove(pendingPromotion.source, pendingPromotion.target, chosenPiece);
                pendingPromotion = null;
            }
        });
    });
}

// Function to get Unicode character for pieces
const getPieceUnicode = (piece) => {
    const unicodePieces = {
        p: "\u265f",
        r: "\u265c",
        n: "\u265e",
        b: "\u265d",
        q: "\u265b",
        k: "\u265a"
    };
    return (unicodePieces[piece.type] || "") + "\uFE0E";
};

// Function to update UI elements
const updateUIElements = () => {
    updateRoleUI();
    updateStatusUI();
    updateMoveHistoryUI();
    const captured = getCapturedPieces();
    updateCapturedPiecesUI(captured);
};

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

const updateStatusUI = () => {
    const turnDot = document.getElementById("turn-dot");
    const turnLabel = document.getElementById("turn-label");
    const turnCard = document.getElementById("turn-card");
    const statusAlert = document.getElementById("status-alert");
    
    if (!turnDot || !turnLabel || !turnCard) return;

    const turn = chess.turn();
    const isPlayerTurn = playerRole === turn;
    
    if (turn === 'w') {
        turnDot.className = "w-3 h-3 rounded-full bg-zinc-100 border border-zinc-300 shadow-sm";
        turnLabel.innerText = "White's Turn";
    } else {
        turnDot.className = "w-3 h-3 rounded-full bg-zinc-950 border border-zinc-800 shadow-sm";
        turnLabel.innerText = "Black's Turn";
    }
    
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
    
    for (let i = 0; i < history.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const whiteMove = history[i];
        const blackMove = history[i + 1];
        
        const whiteCell = document.createElement("div");
        whiteCell.className = "flex items-center gap-2 text-zinc-200 py-0.5";
        whiteCell.innerHTML = `<span class="text-zinc-600 text-xs w-6 text-right font-mono">${moveNumber}.</span> <span class="font-semibold">${whiteMove.san}</span>`;
        gridState.appendChild(whiteCell);
        
        const blackCell = document.createElement("div");
        blackCell.className = "flex items-center gap-2 text-zinc-400 py-0.5 pl-4";
        if (blackMove) {
            blackCell.innerHTML = `<span class="font-semibold text-zinc-300">${blackMove.san}</span>`;
        } else {
            blackCell.innerHTML = `<span class="text-zinc-700 font-light italic text-xs font-mono">...</span>`;
        }
        gridState.appendChild(blackCell);
    }
    
    const container = document.getElementById("move-history-container");
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
};

const updateCapturedPiecesUI = (captured) => {
    const oppCapturedElement = document.getElementById("opp-captured");
    const playerCapturedElement = document.getElementById("player-captured");
    if (!oppCapturedElement || !playerCapturedElement) return;
    
    oppCapturedElement.innerHTML = "";
    playerCapturedElement.innerHTML = "";
    
    const unicodeSymbols = {
        w: { p: "♙", r: "♖", n: "♘", b: "♗", q: "♕" },
        b: { p: "♟", r: "♜", n: "♞", b: "♝", q: "♛" }
    };
    
    let oppCapturedList = [];
    let playerCapturedList = [];
    
    if (playerRole === "w") {
        playerCapturedList = captured.b.map(type => `<span class="text-zinc-500 font-normal px-0.5">${unicodeSymbols.b[type]}</span>`);
        oppCapturedList = captured.w.map(type => `<span class="text-zinc-300 font-normal px-0.5">${unicodeSymbols.w[type]}</span>`);
    } else if (playerRole === "b") {
        playerCapturedList = captured.w.map(type => `<span class="text-zinc-300 font-normal px-0.5">${unicodeSymbols.w[type]}</span>`);
        oppCapturedList = captured.b.map(type => `<span class="text-zinc-500 font-normal px-0.5">${unicodeSymbols.b[type]}</span>`);
    } else {
        oppCapturedList = captured.w.map(type => `<span class="text-zinc-300 font-normal px-0.5">${unicodeSymbols.w[type]}</span>`);
        playerCapturedList = captured.b.map(type => `<span class="text-zinc-500 font-normal px-0.5">${unicodeSymbols.b[type]}</span>`);
    }
    
    oppCapturedElement.innerHTML = oppCapturedList.join("");
    playerCapturedElement.innerHTML = playerCapturedList.join("");
};

// Socket event listeners
socket.on("playerRole", function (role) {
    playerRole = role;
    renderBoard();
});

socket.on("move", function (move) {
    const fromSquare = algebraicToSquare(move.from);
    const toSquare = algebraicToSquare(move.to);
    if (fromSquare && toSquare) {
        lastMove = { fromSquare, toSquare };
    }
    chess.move(move);
    renderBoard();
});

socket.on("spectatorRole", function () {
    playerRole = null;
    renderBoard();
});

socket.on("boardState", function (fen) {
    if (chess.fen() !== fen) {
        chess.load(fen);
        renderBoard();
    }
});

socket.on("invalidMove", function (data) {
    showToast(data?.reason || "Invalid move!", true);
    renderBoard();
});

socket.on("gameOver", function (payload) {
    gameOverActive = true;
    showPopup(buildGameOverMessage(payload));
});

socket.on("gameReset", function () {
    gameOverActive = false;
    lastMove = null;
    selectedSquare = null;
    legalMoveTargets = [];
    closePopup();
    renderBoard();
});

// Flip Board button
if (btnFlipBoard) {
    btnFlipBoard.addEventListener("click", () => {
        boardFlipped = !boardFlipped;
        renderBoard();
    });
}

// Copy Invite Link button
if (btnCopyLink) {
    btnCopyLink.addEventListener("click", () => {
        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
        navigator.clipboard.writeText(inviteUrl)
            .then(() => {
                const originalHTML = btnCopyLink.innerHTML;
                btnCopyLink.innerHTML = `
                    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    Copied Link!
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

function showPopup(message) {
    const popup = document.getElementById('game-over-popup');
    const popupMessage = document.getElementById('popup-message');
    if (popup && popupMessage) {
        popupMessage.textContent = message;
        popup.classList.remove('hidden');
    }
}

function closePopup() {
    const popup = document.getElementById('game-over-popup');
    if (popup) {
        popup.classList.add('hidden');
    }
}

const closePopupBtn = document.getElementById('close-popup');
if (closePopupBtn) {
    closePopupBtn.addEventListener('click', closePopup);
}

// Initial render
renderBoard();
