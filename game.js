/*
 * Battleship — vanilla JS implementation.
 *
 * Phases:
 *   1. "setup"  — player clicks a ship then clicks a cell on their board to place it.
 *                 Orientation is toggled via the Rotate button (or R key).
 *   2. "play"   — player and AI alternate turns firing at each other's grids.
 *                 AI uses a hunt-and-target algorithm.
 *   3. "over"   — a winner is declared; player can start a new game.
 */

(() => {
    "use strict";

    // ===== Constants =====
    const BOARD_SIZE = 10;
    const SHIP_DEFS = [
        { name: "Carrier", size: 5 },
        { name: "Battleship", size: 4 },
        { name: "Cruiser", size: 3 },
        { name: "Submarine", size: 3 },
        { name: "Destroyer", size: 2 },
    ];
    const AI_MOVE_DELAY_MS = 650;

    // ===== DOM refs =====
    const playerBoardEl = document.getElementById("player-board");
    const aiBoardEl = document.getElementById("ai-board");
    const statusEl = document.getElementById("status");
    const turnEl = document.getElementById("turn-indicator");
    const playerActionEl = document.getElementById("player-action");
    const enemyActionEl = document.getElementById("enemy-action");
    const shipListEl = document.getElementById("ship-list");
    const rotateBtn = document.getElementById("rotate-btn");
    const randomBtn = document.getElementById("random-btn");
    const clearBtn = document.getElementById("clear-btn");
    const startBtn = document.getElementById("start-btn");
    const resetBtn = document.getElementById("reset-btn");
    const setupPanel = document.getElementById("setup-panel");

    // ===== Game state =====
    let phase = "setup"; // "setup" | "play" | "over"
    let orientation = "H"; // "H" or "V"
    let selectedShipIdx = null;
    let playerFleet = []; // { name, size, cells: [[r,c], ...], hits: Set("r,c") }
    let aiFleet = [];
    let playerShots = createGrid(null); // null | "hit" | "miss" — AI's shots at the player
    let aiShots = createGrid(null);     // null | "hit" | "miss" — player's shots at the AI
    let playerShips = createGrid(null); // shipIdx or null
    let aiShips = createGrid(null);
    let currentTurn = "player"; // "player" | "ai"
    let aiBusy = false;

    // AI targeting state
    let aiMode = "hunt"; // "hunt" | "target"
    let aiTargetQueue = []; // cells to try next (adjacent to hits)
    let aiHitStack = []; // consecutive hits on the current target ship

    // ===== Utilities =====
    function createGrid(fill) {
        const g = new Array(BOARD_SIZE);
        for (let r = 0; r < BOARD_SIZE; r++) {
            g[r] = new Array(BOARD_SIZE).fill(fill);
        }
        return g;
    }

    function inBounds(r, c) {
        return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
    }

    function cellsForShip(row, col, size, orient) {
        const cells = [];
        for (let i = 0; i < size; i++) {
            const r = orient === "H" ? row : row + i;
            const c = orient === "H" ? col + i : col;
            cells.push([r, c]);
        }
        return cells;
    }

    function canPlace(shipsGrid, cells) {
        for (const [r, c] of cells) {
            if (!inBounds(r, c)) return false;
            if (shipsGrid[r][c] !== null) return false;
        }
        return true;
    }

    function placeShip(shipsGrid, fleet, name, size, cells) {
        const idx = fleet.length;
        for (const [r, c] of cells) shipsGrid[r][c] = idx;
        fleet.push({ name, size, cells, hits: new Set() });
        return idx;
    }

    function randomInt(n) {
        return Math.floor(Math.random() * n);
    }

    function cellLabel(r, c) {
        return `${String.fromCharCode(65 + c)}${r + 1}`;
    }

    function shipOrientation(ship) {
        if (ship.cells.length < 2) return "H";
        return ship.cells[0][0] === ship.cells[1][0] ? "H" : "V";
    }

    function shipCellIndex(ship, r, c) {
        return ship.cells.findIndex(([rr, cc]) => rr === r && cc === c);
    }

    function randomFleet(shipsGrid, fleet) {
        for (const def of SHIP_DEFS) {
            let placed = false;
            while (!placed) {
                const orient = Math.random() < 0.5 ? "H" : "V";
                const row = randomInt(BOARD_SIZE);
                const col = randomInt(BOARD_SIZE);
                const cells = cellsForShip(row, col, def.size, orient);
                if (canPlace(shipsGrid, cells)) {
                    placeShip(shipsGrid, fleet, def.name, def.size, cells);
                    placed = true;
                }
            }
        }
    }

    function allSunk(fleet) {
        return fleet.every(ship => ship.hits.size === ship.size);
    }

    // ===== Rendering =====
    function buildBoard(el, clickHandler, hoverHandler, leaveHandler) {
        el.innerHTML = "";
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = document.createElement("div");
                cell.className = "cell";
                cell.dataset.row = r;
                cell.dataset.col = c;
                if (clickHandler) {
                    cell.classList.add("interactive");
                    cell.addEventListener("click", () => clickHandler(r, c));
                }
                if (hoverHandler) cell.addEventListener("mouseenter", () => hoverHandler(r, c));
                if (leaveHandler) cell.addEventListener("mouseleave", () => leaveHandler(r, c));
                el.appendChild(cell);
            }
        }
    }

    function cellEl(boardEl, r, c) {
        return boardEl.children[r * BOARD_SIZE + c];
    }

    function renderPlayerBoard() {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const el = cellEl(playerBoardEl, r, c);
                el.className = "cell";
                if (phase === "setup") el.classList.add("interactive");

                const shipIdx = playerShips[r][c];
                const shot = playerShots[r][c];
                if (shot === "hit") {
                    const ship = playerFleet[shipIdx];
                    if (ship && ship.hits.size === ship.size) {
                        el.classList.add("sunk");
                    } else {
                        el.classList.add("hit");
                    }
                } else if (shot === "miss") {
                    el.classList.add("miss");
                } else if (shipIdx !== null) {
                    const ship = playerFleet[shipIdx];
                    const pos = shipCellIndex(ship, r, c);
                    const orient = shipOrientation(ship);
                    el.classList.add("ship");
                    el.classList.add(orient === "H" ? "ship-h" : "ship-v");
                    if (pos === 0) el.classList.add("ship-bow");
                    else if (pos === ship.size - 1) el.classList.add("ship-stern");
                    else el.classList.add("ship-mid");
                    // Place a single deck feature on one cell per ship.
                    if (pos === Math.floor((ship.size - 1) / 2)) {
                        el.classList.add("ship-deck");
                    }
                }
            }
        }
    }

    function renderAiBoard() {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const el = cellEl(aiBoardEl, r, c);
                el.className = "cell";
                if (phase === "play" && currentTurn === "player" && aiShots[r][c] === null) {
                    el.classList.add("interactive");
                }
                const shot = aiShots[r][c];
                if (shot === "hit") {
                    const shipIdx = aiShips[r][c];
                    const ship = aiFleet[shipIdx];
                    if (ship && ship.hits.size === ship.size) {
                        el.classList.add("sunk");
                    } else {
                        el.classList.add("hit");
                    }
                } else if (shot === "miss") {
                    el.classList.add("miss");
                }
            }
        }
    }

    function renderShipList() {
        shipListEl.innerHTML = "";
        SHIP_DEFS.forEach((def, i) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ship-option";
            btn.textContent = `${def.name} (${def.size})`;
            const isPlaced = playerFleet.some(s => s.name === def.name);
            if (isPlaced) btn.classList.add("placed");
            if (selectedShipIdx === i && !isPlaced) btn.classList.add("selected");
            btn.disabled = isPlaced;
            btn.addEventListener("click", () => {
                if (isPlaced) return;
                selectedShipIdx = i;
                renderShipList();
            });
            shipListEl.appendChild(btn);
        });
    }

    function updateStatus(text, variant) {
        statusEl.textContent = text;
        statusEl.classList.remove("win", "lose");
        if (variant === "win") statusEl.classList.add("win");
        if (variant === "lose") statusEl.classList.add("lose");
    }

    // Per-side shot log: each side keeps its own line so a player's result is not
    // overwritten by the AI's counter-turn.
    function setActionLine(el, text, variant) {
        el.textContent = text;
        el.classList.remove("hit", "miss", "sunk");
        if (variant) el.classList.add(variant);
    }
    function updatePlayerAction(text, variant) {
        setActionLine(playerActionEl, text, variant);
    }
    function updateEnemyAction(text, variant) {
        setActionLine(enemyActionEl, text, variant);
    }
    function clearActionLines() {
        updatePlayerAction("");
        updateEnemyAction("");
    }

    function updateTurnIndicator() {
        if (phase === "setup") {
            turnEl.textContent = "";
        } else if (phase === "over") {
            turnEl.textContent = "Game over.";
        } else {
            turnEl.textContent = currentTurn === "player" ? "Your turn — fire at enemy waters." : "Enemy is firing...";
        }
    }

    // ===== Setup phase =====
    function nextUnplacedIdx() {
        for (let i = 0; i < SHIP_DEFS.length; i++) {
            if (!playerFleet.some(s => s.name === SHIP_DEFS[i].name)) return i;
        }
        return null;
    }

    function clearPreview() {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const el = cellEl(playerBoardEl, r, c);
                el.classList.remove("ship-preview", "preview-invalid");
            }
        }
    }

    function handleSetupHover(r, c) {
        if (phase !== "setup" || selectedShipIdx === null) return;
        clearPreview();
        const def = SHIP_DEFS[selectedShipIdx];
        const cells = cellsForShip(r, c, def.size, orientation);
        const ok = canPlace(playerShips, cells);
        for (const [cr, cc] of cells) {
            if (!inBounds(cr, cc)) continue;
            const el = cellEl(playerBoardEl, cr, cc);
            el.classList.add(ok ? "ship-preview" : "preview-invalid");
        }
    }

    function handleSetupLeave() {
        if (phase !== "setup") return;
        clearPreview();
    }

    function handleSetupClick(r, c) {
        if (phase !== "setup") return;
        if (selectedShipIdx === null) {
            selectedShipIdx = nextUnplacedIdx();
            if (selectedShipIdx === null) return;
            renderShipList();
        }
        const def = SHIP_DEFS[selectedShipIdx];
        const cells = cellsForShip(r, c, def.size, orientation);
        if (!canPlace(playerShips, cells)) {
            updateStatus(`Can't place ${def.name} there. Try another cell.`);
            return;
        }
        placeShip(playerShips, playerFleet, def.name, def.size, cells);
        clearPreview();
        selectedShipIdx = nextUnplacedIdx();
        renderShipList();
        renderPlayerBoard();
        if (playerFleet.length === SHIP_DEFS.length) {
            startBtn.disabled = false;
            updateStatus("Fleet ready. Click Start Game to begin.");
        } else {
            const remaining = SHIP_DEFS.length - playerFleet.length;
            updateStatus(`Ship placed. ${remaining} remaining.`);
        }
    }

    function toggleOrientation() {
        orientation = orientation === "H" ? "V" : "H";
        rotateBtn.textContent = `Rotate: ${orientation === "H" ? "Horizontal" : "Vertical"}`;
    }

    function randomizePlayerFleet() {
        playerShips = createGrid(null);
        playerFleet = [];
        randomFleet(playerShips, playerFleet);
        selectedShipIdx = null;
        startBtn.disabled = false;
        renderShipList();
        renderPlayerBoard();
        updateStatus("Fleet randomized. Click Start Game to begin.");
    }

    function clearPlayerFleet() {
        playerShips = createGrid(null);
        playerFleet = [];
        selectedShipIdx = nextUnplacedIdx();
        startBtn.disabled = true;
        renderShipList();
        renderPlayerBoard();
        updateStatus("Board cleared. Place your ships to begin.");
    }

    // ===== Play phase =====
    function startGame() {
        if (playerFleet.length !== SHIP_DEFS.length) return;
        aiShips = createGrid(null);
        aiFleet = [];
        randomFleet(aiShips, aiFleet);
        playerShots = createGrid(null);
        aiShots = createGrid(null);
        aiMode = "hunt";
        aiTargetQueue = [];
        aiHitStack = [];
        currentTurn = "player";
        phase = "play";
        setupPanel.hidden = true;
        updateStatus("Battle begins — take your shot!");
        clearActionLines();
        updateTurnIndicator();
        renderPlayerBoard();
        renderAiBoard();
    }

    function handleAiBoardClick(r, c) {
        if (phase !== "play" || currentTurn !== "player" || aiBusy) return;
        if (aiShots[r][c] !== null) return;

        const shipIdx = aiShips[r][c];
        if (shipIdx !== null) {
            aiShots[r][c] = "hit";
            aiFleet[shipIdx].hits.add(`${r},${c}`);
            const ship = aiFleet[shipIdx];
            if (ship.hits.size === ship.size) {
                updatePlayerAction(`${cellLabel(r, c)} — direct hit, sank the ${ship.name}!`, "sunk");
            } else {
                updatePlayerAction(`${cellLabel(r, c)} — Hit!`, "hit");
            }
        } else {
            aiShots[r][c] = "miss";
            updatePlayerAction(`${cellLabel(r, c)} — Miss.`, "miss");
        }
        renderAiBoard();

        if (allSunk(aiFleet)) {
            endGame("player");
            return;
        }

        currentTurn = "ai";
        updateTurnIndicator();
        aiBusy = true;
        setTimeout(aiTurn, AI_MOVE_DELAY_MS);
    }

    // ===== AI hunt & target =====
    function adjacentCells(r, c) {
        return [
            [r - 1, c],
            [r + 1, c],
            [r, c - 1],
            [r, c + 1],
        ].filter(([rr, cc]) => inBounds(rr, cc));
    }

    function pickHuntCell() {
        // Checkerboard parity for hunting — minimum ship size is 2, so every
        // ship must touch at least one cell where (r+c) is even.
        const candidates = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (playerShots[r][c] !== null) continue;
                if ((r + c) % 2 === 0) candidates.push([r, c]);
            }
        }
        if (candidates.length === 0) {
            // Fallback — any remaining cell.
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (playerShots[r][c] === null) candidates.push([r, c]);
                }
            }
        }
        return candidates[randomInt(candidates.length)];
    }

    function queueTargetsAroundHit(r, c) {
        // When multiple hits line up, prioritize the line's direction.
        const hits = aiHitStack;
        let directions;
        if (hits.length >= 2) {
            const [r0, c0] = hits[0];
            const [r1, c1] = hits[1];
            if (r0 === r1) {
                // horizontal line — try left/right of extremes only
                directions = [[0, -1], [0, 1]];
            } else {
                directions = [[-1, 0], [1, 0]];
            }
            // Replace queue entirely with extreme ends.
            aiTargetQueue = [];
            const sorted = hits.slice().sort((a, b) =>
                directions[0][0] !== 0 ? a[0] - b[0] : a[1] - b[1]
            );
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const ends = [
                [first[0] + directions[0][0], first[1] + directions[0][1]],
                [last[0] + directions[1][0], last[1] + directions[1][1]],
            ];
            for (const [nr, nc] of ends) {
                if (inBounds(nr, nc) && playerShots[nr][nc] === null) {
                    aiTargetQueue.push([nr, nc]);
                }
            }
        } else {
            for (const [nr, nc] of adjacentCells(r, c)) {
                if (playerShots[nr][nc] !== null) continue;
                if (!aiTargetQueue.some(([qr, qc]) => qr === nr && qc === nc)) {
                    aiTargetQueue.push([nr, nc]);
                }
            }
        }
    }

    function aiTurn() {
        if (phase !== "play") return;

        let target = null;
        while (aiMode === "target" && aiTargetQueue.length > 0) {
            const [r, c] = aiTargetQueue.shift();
            if (playerShots[r][c] === null) {
                target = [r, c];
                break;
            }
        }
        if (!target) {
            aiMode = "hunt";
            aiHitStack = [];
            aiTargetQueue = [];
            target = pickHuntCell();
        }

        const [r, c] = target;
        const shipIdx = playerShips[r][c];
        if (shipIdx !== null) {
            playerShots[r][c] = "hit";
            const ship = playerFleet[shipIdx];
            ship.hits.add(`${r},${c}`);

            if (ship.hits.size === ship.size) {
                updateEnemyAction(`${cellLabel(r, c)} — sank your ${ship.name}!`, "sunk");
                // Reset targeting state — the current ship is done.
                aiMode = "hunt";
                aiHitStack = [];
                aiTargetQueue = [];
            } else {
                updateEnemyAction(`${cellLabel(r, c)} — Hit!`, "hit");
                aiMode = "target";
                aiHitStack.push([r, c]);
                queueTargetsAroundHit(r, c);
            }
        } else {
            playerShots[r][c] = "miss";
            updateEnemyAction(`${cellLabel(r, c)} — Miss.`, "miss");
        }
        renderPlayerBoard();

        if (allSunk(playerFleet)) {
            endGame("ai");
            return;
        }

        currentTurn = "player";
        aiBusy = false;
        updateTurnIndicator();
    }

    // ===== Game over =====
    function endGame(winner) {
        phase = "over";
        aiBusy = false;
        if (winner === "player") {
            updateStatus("Victory! You sank the entire enemy fleet.", "win");
        } else {
            updateStatus("Defeat. Your fleet has been destroyed.", "lose");
        }
        updateTurnIndicator();
        renderPlayerBoard();
        renderAiBoard();
    }

    function newGame() {
        phase = "setup";
        orientation = "H";
        selectedShipIdx = null;
        playerFleet = [];
        aiFleet = [];
        playerShots = createGrid(null);
        aiShots = createGrid(null);
        playerShips = createGrid(null);
        aiShips = createGrid(null);
        currentTurn = "player";
        aiBusy = false;
        aiMode = "hunt";
        aiTargetQueue = [];
        aiHitStack = [];
        startBtn.disabled = true;
        setupPanel.hidden = false;
        rotateBtn.textContent = "Rotate: Horizontal";
        renderShipList();
        renderPlayerBoard();
        renderAiBoard();
        updateStatus("Place your ships to begin.");
        clearActionLines();
        updateTurnIndicator();
    }

    // ===== Wire up =====
    function init() {
        buildBoard(playerBoardEl, handleSetupClick, handleSetupHover, handleSetupLeave);
        buildBoard(aiBoardEl, handleAiBoardClick, null, null);

        rotateBtn.addEventListener("click", toggleOrientation);
        randomBtn.addEventListener("click", randomizePlayerFleet);
        clearBtn.addEventListener("click", clearPlayerFleet);
        startBtn.addEventListener("click", startGame);
        resetBtn.addEventListener("click", newGame);

        document.addEventListener("keydown", (e) => {
            if (e.key === "r" || e.key === "R") {
                if (phase === "setup") toggleOrientation();
            }
        });

        newGame();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
