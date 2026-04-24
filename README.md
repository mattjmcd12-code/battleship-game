# Battleship

A browser-based implementation of the classic Battleship game. Play against an AI opponent that uses a real hunt-and-target algorithm — no random-fire pushover.

**Zero install, zero build.** Open `index.html` in any modern browser and play.

## Play

- **Hosted:** Visit `https://mattjmcd12-code.github.io/battleship-game/`.
- **Local:** clone the repo and open `index.html` directly in your browser — no server, no build step, no dependencies.

## Features

- **Standard 10×10 boards** — yours on the left, the enemy's on the right, both visible at once.
- **Five ships:** Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).
- **Manual fleet placement** — click a ship, hover the board for a live preview (blue = valid, red = overlap/out-of-bounds), click to commit. Press **R** or click **Rotate** to toggle horizontal/vertical. **Random Placement** and **Clear Board** buttons included.
- **Stylized ships** — each ship renders as a tapered blue capsule with a gradient hull, dark outline, and a centered turret dome on one cell. Pure CSS; no images or external assets.
- **Hunt-and-target AI** — the AI fires on a checkerboard-parity pattern during the hunt phase (guaranteed to touch every ship, since the shortest ship is 2 cells). On a hit, it switches to target mode, queues the four adjacent cells, and once it has two in-line hits it extends the search along that line only. On a sink it returns to hunt mode and clears state.
- **Clear feedback** — separate persistent "You:" and "Enemy:" action lines show each side's last shot (`F4 — Hit!`, `C3 — sank your Destroyer!`) so the AI's counter-turn never overwrites your own result. Hits render red with `✕`, misses grey with `•`, sunk ships dark red.
- **Keyboard shortcut:** **R** toggles ship orientation during setup.
- **New Game** button fully resets the game without a page refresh.
- **Mobile-friendly** — boards stack vertically below ~720px wide.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure, grid containers, setup + controls markup |
| `styles.css` | Dark theme, grid layout, ship/hit/miss/sunk styling, responsive rules |
| `game.js`   | Game engine: ship placement, turn logic, AI hunt-and-target, rendering |

No frameworks, no bundlers, no npm. All three files are plain static assets.

## How the AI works

The AI has two modes:

1. **Hunt** — picks a random unshot cell where `(row + col)` is even (checkerboard parity). Because the smallest ship is 2 cells, every ship must cross at least one parity-even cell, so this halves the search space while guaranteeing eventual contact.
2. **Target** — on a hit, queues the four orthogonal neighbors. As successive hits accumulate, the AI detects the ship's orientation (same row → horizontal; same column → vertical) and narrows the queue to only the two ends of the current hit line. When a ship is sunk, it resets to hunt mode with an empty queue.

Implementation lives in `game.js` — see `pickHuntCell`, `queueTargetsAroundHit`, and `aiTurn`.

