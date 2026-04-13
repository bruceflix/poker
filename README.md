# Texas Hold'em Poker Table

A browser-based, multi-player Texas Hold'em tournament game for up to 8 players on a single keyboard. No frameworks, no dependencies — pure vanilla JS and CSS.

![Version](https://img.shields.io/badge/version-v1.20.40-blue)

---

## Features

- **Up to 8 players** simultaneously on one keyboard
- **Full tournament mode** — blind escalation, side pots, bust-out order, winner screen
- **Animations** — card deal, community card flip, chip push, chip collection into pot
- **3D chip stacks** — colour-coded denominations (25 / 50 / 100 / 500 / 1K)
- **Sound effects** — Kenney CC0 casino sounds, toggleable mute
- **Save / load** — multiple named saves via localStorage, with full state validation on load
- **Hand history** — each player can review their last 5 hands mid-game
- **Responsive layout** — works at 1080p, 4K, ultrawide; player boxes snap to screen edges
- **6 table colour themes**

---

## Keyboard Controls

Each player is assigned a row of 5 keys. The default layout for 8 players:

| Player | PEEK | FOLD / HISTORY | CHECK / CALL | BET / RAISE | ALL-IN |
|--------|------|----------------|--------------|-------------|--------|
| P1 | `1` | `2` | `3` | `4` | `5` |
| P2 | `6` | `7` | `8` | `9` | `0` |
| P3 | `Q` | `W` | `E` | `R` | `T` |
| P4 | `Y` | `U` | `I` | `O` | `P` |
| P5 | `A` | `S` | `D` | `F` | `G` |
| P6 | `H` | `J` | `K` | `L` | `;` |
| P7 | `Z` | `X` | `C` | `V` | `B` |
| P8 | `N` | `M` | `,` | `.` | `/` |

- **PEEK** — hold to peek at your hole cards
- **HISTORY** — press when it's not your turn to view your last 5 hands
- **BET / RAISE** — enters bet sizing mode; use `- BET` / `+ BET` to adjust in big blind increments, `CONFIRM` to place, `CANCEL` to exit

---

## Running

Any static file server on port 8888:

```bash
cd ~/poker
python3 -m http.server 8888
```

Then open `http://localhost:8888` in a browser.

---

## File Structure

```
poker/
├── index.html          # Entry point — loads scripts in order
├── constants.js        # All shared constants (loaded first)
├── version.js          # VERSION string
├── hand-evaluator.js   # Pure hand evaluation (no DOM)
├── audio.js            # Sound effect management
├── game.js             # Core game engine / state machine
├── controls.js         # Keyboard input handling
├── ui.js               # All rendering and animations
├── app.js              # App controller + save/load
├── style.css           # All styling
└── sounds/             # Kenney CC0 .ogg audio files
```

### Script load order

`constants.js` → `version.js` → `hand-evaluator.js` → `audio.js` → `game.js` → `controls.js` → `ui.js` → `app.js`

All modules are IIFEs exposing globals. No bundler, no ES modules — load order matters.

---

## Architecture

### State management (`game.js`)

- `Game.getState()` returns a **shallow snapshot clone** — players, pots, community cards, and acted-set are all cloned so callers cannot accidentally corrupt live state
- All array updates use **spread assignment** rather than `.push()` — every mutation produces a new reference
- `Game.setPaused(val)` is the only correct way to toggle pause — direct mutation of the snapshot has no effect on the real state or the blind timer

### Layout (`ui.js`)

- 8 player sections positioned absolutely around the table with `rotate(0/90/180/270deg)` so each player's "local top" faces the centre
- **Critical constraint:** section height must stay under 324px — when rotated 90°, height becomes visual width, and adjacent left/right players at 1080p have a 324px gap
- `repositionPlayersToEdge()` snaps each section to exactly 10px from its nearest screen edge after every render, at any resolution

### Animations

All animations use `position: fixed` elements appended to `document.body` and cleaned up after the transition ends. A `void el.offsetWidth` forced reflow is used before adding transition classes to guarantee the browser commits the "from" state.

### Constants (`constants.js`)

All magic values — key bindings, blind schedules, chip denominations, seat positions, background presets, card symbols — live in a single `CONSTANTS` global object with one source of truth.

---

## Blind Schedules

| Preset | Level Duration | Levels |
|--------|---------------|--------|
| Turbo | 3 min | 9 levels up to 2000/4000 |
| Standard | 8 min | 10 levels up to 2000/4000 |
| Deep | 15 min | 12 levels up to 2000/4000 |

---

## Save / Load

Games can be saved mid-session with a custom name via the settings overlay (⚙). Saves are stored in `localStorage`. On load, the save is fully validated (player fields, phase, pot structure, blind level range) before any state is restored — corrupt saves show an error and return to the menu.

---

## Credits

Sound effects: [Kenney](https://kenney.nl) (CC0)
