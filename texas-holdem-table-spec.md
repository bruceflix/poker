# Texas Hold'em Poker Table — Full Build Spec

## Overview

Build a full-screen web application that simulates a professional Texas Hold'em tournament on a large monitor laid flat like a poker table. Up to 8 players stand around the monitor. The computer acts as dealer and strict rule enforcer. No human dealer is needed.

The app is a single self-contained project (HTML/CSS/JS or React) that runs in a browser (Chrome/Edge on Windows). No server, no network, no installs. Just open the file(s) and go full-screen.

---

## Pre-Game Config Screen

A setup screen (operated by mouse and/or keyboard) before any cards are dealt. Must configure:

- **Number of players**: selectable from 2 to 8
- **Player names**: text input for each player
- **Seat assignment**: choice of manual seat picking OR random seat placement
- **Starting chip count**: configurable (e.g. 1000, 5000, 10000, or custom)
- **Blind structure presets**:
  - **Turbo**: short levels, fast escalation
  - **Standard**: moderate pace
  - **Deep Stack**: long levels, slow escalation
  - **Custom**: manually define starting blinds, level duration (minutes), and escalation multiplier or schedule
- **First to act**: randomly chosen at game start (random dealer button placement)

Once config is confirmed, transition to the table view and begin the first hand.

---

## Table Layout & Visual Style

- **Full-screen green baize background** (poker table felt look)
- **Slightly arcadey style**: bold colours, chunky chip graphics, card flip animations, clear readable fonts at distance
- **8 player positions** arranged around the edge of the screen (even if fewer players, positions space evenly)
- **Each player's section faces outward** from the table centre, rotated so the player standing at that edge reads their own section naturally (text/cards oriented toward that edge)
- **Centre of table** displays:
  - Community cards (with flip animation as dealt)
  - Total pot amount
  - Side pot breakdown (if applicable)
  - Current blind level (e.g. "Blinds: 100/200")
  - Time remaining until next blind level (countdown timer)
  - Hand number

### Per-Player Section (around the edge)

Each player's area shows:

- Player name
- Chip count (updated in real time)
- Two hole cards (face-down by default; only revealed while that player's PEEK key is held)
- Current bet placed in front of them (chips/amount)
- Position badge: DEALER / SB / BB as applicable
- **When it's their turn**: highlighted/glowing border, and key action labels shown (e.g. the key prompts for their 5 keys with current available actions)
- **When eliminated**: greyed out / marked as "BUSTED"

---

## Controls — 5 Keys Per Player

Each player has 5 dedicated keyboard keys. Keys are dual-purpose depending on context.

### Key Mapping Per Player

| Position  | Key 1 (Peek) | Key 2 | Key 3 | Key 4 | Key 5 |
|-----------|-------------|-------|-------|-------|-------|
| Player 1  | 1           | 2     | 3     | 4     | 5     |
| Player 2  | 6           | 7     | 8     | 9     | 0     |
| Player 3  | Q           | W     | E     | R     | T     |
| Player 4  | Y           | U     | I     | O     | P     |
| Player 5  | A           | S     | D     | F     | G     |
| Player 6  | H           | J     | K     | L     | ;     |
| Player 7  | Z           | X     | C     | V     | B     |
| Player 8  | N           | M     | ,     | .     | /     |

40 keys total. All standard keys — no modifiers, no special keys, no function keys.

### Key Functions — Default Mode (player's turn to act)

| Key | Action         |
|-----|----------------|
| 1   | **PEEK** (hold to reveal own cards) |
| 2   | **FOLD**       |
| 3   | **CHECK / CALL** (context-dependent: check if no bet to match, call if there is) |
| 4   | **BET / RAISE** (enters bet-sizing mode) |
| 5   | **ALL-IN**     |

### Key Functions — Bet Sizing Mode (after pressing Key 4)

| Key | Action                |
|-----|-----------------------|
| 1   | **PEEK** (still works) |
| 2   | **DECREASE** bet amount |
| 3   | **CANCEL** (return to default mode) |
| 4   | **INCREASE** bet amount |
| 5   | **CONFIRM** bet/raise  |

Bet sizing increments/decrements should be sensible (e.g. big blind increments, or percentage of pot). Show the current bet amount prominently in the player's section while sizing.

### Key Lockout Rules

- **When it is NOT your turn**: only Key 1 (PEEK) responds. All other keys are locked. No out-of-turn actions are possible.
- **Eliminated players**: all 5 keys are completely locked.
- **When there is no valid check option**: Key 3 shows CALL only. When there is nothing to call, Key 3 shows CHECK only.

---

## Game Engine — Tournament Texas Hold'em Rules

### Core Flow

1. Dealer button placed randomly for the first hand
2. Dealer button rotates clockwise each hand
3. Small blind and big blind posted automatically (deducted from chip stacks)
4. Two hole cards dealt to each active player
5. Betting rounds: **Pre-flop → Flop (3 cards) → Turn (1 card) → River (1 card)**
6. Showdown if 2+ players remain after the river
7. Best 5-card hand from 7 cards (2 hole + 5 community) wins the pot
8. Pot awarded, chip counts updated, next hand begins

### Betting Rules (strictly enforced)

- Betting proceeds clockwise from the designated starting position
- Only the active player can act — all other player inputs are locked
- **Minimum raise** = the size of the previous raise (or the big blind if no raise yet)
- A player cannot bet less than the minimum raise
- **Check** is only available if no bet has been made in the current round
- **Call** matches the current highest bet exactly
- If a player doesn't have enough chips to call, they can only **ALL-IN** or **FOLD**
- When a player goes all-in for less than a full raise, it does NOT reopen the action for players who have already acted (unless it is a full raise or more)

### Side Pots

- When a player goes all-in against one or more larger stacks, side pots are created automatically
- Side pot breakdown should be displayed visually in the centre of the table
- At showdown, each pot is awarded to the best hand among players eligible for that pot

### Showdown

- Auto-evaluate the best 5-card hand for each remaining player
- Display the winning hand name (e.g. "Full House, Kings over Threes")
- Reveal all remaining players' cards at showdown
- Brief pause to show the result before collecting the pot and starting the next hand

### Elimination & End Game

- A player is eliminated when their chip count reaches zero
- Eliminated players are marked as "BUSTED" with a finishing position (e.g. "8th", "7th"...)
- Game ends when one player holds all chips — display a winner announcement
- Offer option to return to the config screen for a new game

### Blind Level Escalation

- A countdown timer runs for each blind level
- When the timer expires, blinds increase to the next level
- Display a brief on-screen alert when blinds go up (e.g. "BLINDS UP! Now 200/400")
- Play an audio warning beep ~30 seconds before blinds increase

### Preset Blind Schedules (examples — adjust as sensible)

**Turbo** (3-minute levels):
25/50 → 50/100 → 100/200 → 150/300 → 200/400 → 300/600 → 500/1000 → 1000/2000 → 2000/4000

**Standard** (8-minute levels):
25/50 → 50/100 → 75/150 → 100/200 → 150/300 → 200/400 → 300/600 → 500/1000 → 1000/2000 → 2000/4000

**Deep Stack** (15-minute levels):
25/50 → 50/100 → 75/150 → 100/200 → 150/300 → 200/400 → 300/600 → 400/800 → 500/1000 → 750/1500 → 1000/2000 → 2000/4000

---

## Sound Effects

Include the following audio cues (can be generated programmatically with Web Audio API, no external files needed):

- **Card deal**: swoosh/slide sound when cards are dealt
- **Card flip**: snap sound when community cards are revealed
- **Chip bet**: clinking/stacking sound when a bet is placed
- **Fold**: soft thud or card toss sound
- **Check**: tap/knock sound
- **All-in**: dramatic escalating sound
- **Win**: arcadey fanfare when a player wins a pot
- **Blinds warning**: beep at ~30 seconds before blind level increase
- **Blinds up**: alert chime when blinds increase
- **Player eliminated**: bust/crash sound
- **Game over / winner**: extended victory fanfare

---

## Hand Evaluation

Implement a full Texas Hold'em hand evaluator that:

- Takes 7 cards (2 hole + 5 community) and determines the best 5-card hand
- Correctly ranks all hand types: Royal Flush, Straight Flush, Four of a Kind, Full House, Flush, Straight, Three of a Kind, Two Pair, One Pair, High Card
- Handles kicker comparisons correctly
- Handles ties and split pots
- Handles the wheel straight (A-2-3-4-5) correctly
- Handles ace-high straights correctly

---

## Technical Requirements

- Single-page web application (HTML + CSS + JS, or a React build)
- No backend server, no network dependency, no database
- Runs entirely in the browser — open the file and go
- Must work in full-screen mode (F11 in Chrome/Edge)
- Responsive to window size but optimised for large landscape displays (e.g. 55"+ TV or monitor)
- All assets self-contained (no external CDN dependencies, no image files needed — use CSS/SVG/Canvas for all graphics)
- Playing cards rendered as styled elements (not image files)
- Sound effects generated via Web Audio API (no audio files)

---

## Edge Cases to Handle

- **Heads-up (2 players)**: dealer posts the small blind, other player posts the big blind. Dealer acts first pre-flop, second post-flop.
- **All players all-in**: skip remaining betting rounds, deal out remaining community cards, go straight to showdown.
- **Single player remaining (everyone else folds)**: award pot immediately, do NOT reveal the winner's cards.
- **Split pot**: divide chips equally, remainder chip goes to the player closest to the left of the dealer button.
- **Player can't afford the big blind**: they are forced all-in for whatever they have.
- **Side pots with multiple all-ins at different amounts**: create the correct number of side pots, each with the correct eligible players.
- **Simultaneous key presses**: ignore any key presses from non-active players (except peek).

---

## Summary of Screens

1. **Config screen** — set up the tournament (mouse/keyboard input)
2. **Table screen** — the main game (keyboard input per player, 5 keys each)
3. **Winner screen** — final result with option to play again

---

## Priority

Get the game engine and rule enforcement bulletproof first. Visual polish and sound effects can be layered on after the core works correctly. A working game with basic visuals is far more valuable than a pretty game that miscalculates side pots.
