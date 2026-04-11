// controls.js — Keyboard input handling for 8 players × 5 keys
//
// Controls is a pure input translator. It detects which key was pressed,
// resolves the intended action, and fires onAction(player, action, data).
// It never calls Game.* or UI.* directly — all state reads go through the
// injected getState function supplied by the caller via init().

if (typeof CONSTANTS === 'undefined') throw new Error('controls.js: constants.js must be loaded first');

const Controls = (() => {
    // Key bindings and labels live in constants.js — reference via CONSTANTS.*
    const { KEY_MAP, KEY_LABELS_DEFAULT, KEY_LABELS_CALL, KEY_LABELS_SIZING } = CONSTANTS;

    let peekingPlayers = new Set();
    let onAction = null; // callback: (playerIndex, action, data) => void
    let getState = null; // injected by init() — no direct Game dependency
    let numPlayers = 8;

    // Reverse lookup: key string -> { player, keyIndex }
    let keyLookup = {};

    // Listeners are added exactly once (lazily). initialized gates all handler logic.
    let initialized = false;
    let listenersAttached = false;

    function buildLookup(n) {
        numPlayers = n;
        keyLookup = {};
        for (let p = 0; p < n; p++) {
            const row = KEY_MAP[p] || []; // guard: playerCount > KEY_MAP.length would crash without this
            for (let k = 0; k < row.length; k++) {
                keyLookup[row[k]] = { player: p, keyIndex: k };
            }
        }
    }

    function init(playerCount, actionCallback, getStateFn) {
        onAction = actionCallback;
        getState = getStateFn;
        buildLookup(playerCount);
        // Attach listeners exactly once — handlers check `initialized` internally
        if (!listenersAttached) {
            document.addEventListener('keydown', handleKeyDown);
            document.addEventListener('keyup', handleKeyUp);
            listenersAttached = true;
        }
        initialized = true;
    }

    function destroy() {
        peekingPlayers.clear();
        initialized = false;
        // Listeners stay attached but are now gated off by initialized = false
    }

    function handleKeyDown(e) {
        if (!initialized) return;
        // Don't capture if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        // Defensive: e.key can be null/undefined in some browser edge cases
        if (!e.key) return;
        const key = e.key.toLowerCase();
        const mapping = keyLookup[key];
        if (!mapping) return;

        e.preventDefault();
        const { player, keyIndex } = mapping;
        const state = getState();
        if (!state || state.phase === 'gameOver') return;

        const p = state.players[player];
        if (!p || p.eliminated) return;

        // During showdown/handOver: any key from a non-eliminated player = acknowledge
        if (state.phase === 'showdown' || state.phase === 'handOver') {
            if (onAction) onAction(player, 'ack', null);
            return;
        }

        // Key 0 = Peek — always works (hold)
        if (keyIndex === 0) {
            peekingPlayers.add(player);
            if (onAction) onAction(player, 'peek', true);
            return;
        }

        // Key 1 for non-active players = hand history toggle
        if (keyIndex === 1 && state.activePlayerIndex !== player && !p.folded && !p.eliminated) {
            if (onAction) onAction(player, 'history', null);
            return;
        }

        // Non-peek keys only work when it's your turn
        if (state.activePlayerIndex !== player) return;
        if (p.folded || p.allIn) return;

        if (state.betSizingMode && state.betSizingPlayer === player) {
            // Bet sizing mode — gather chip rect before firing so app.js can animate
            switch (keyIndex) {
                case 1: // Decrease
                    if (onAction) onAction(player, 'adjustBet', -1);
                    break;
                case 2: // Cancel
                    if (onAction) onAction(player, 'cancelBet', null);
                    break;
                case 3: // Increase
                    if (onAction) onAction(player, 'adjustBet', 1);
                    break;
                case 4: { // Confirm — snapshot pre-confirmation state for animation
                    const betAmount = state.betSizingAmount;
                    const chipEl = document.getElementById(`chips-${player}`);
                    const chipRect = chipEl ? chipEl.getBoundingClientRect() : null;
                    if (onAction) onAction(player, 'confirmBet', { betAmount, chipRect });
                    break;
                }
            }
        } else {
            // Default mode
            switch (keyIndex) {
                case 1: // Fold
                    if (onAction) onAction(player, 'fold', null);
                    break;
                case 2: // Check/Call
                    if (state.currentBet > p.bet) {
                        if (onAction) onAction(player, 'call', null);
                    } else {
                        if (onAction) onAction(player, 'check', null);
                    }
                    break;
                case 3: // Bet/Raise
                    if (onAction) onAction(player, 'enterBetSizing', null);
                    break;
                case 4: // All-in
                    if (onAction) onAction(player, 'allIn', null);
                    break;
            }
        }
    }

    function handleKeyUp(e) {
        if (!initialized) return;
        // Defensive: e.key can be null/undefined in some browser edge cases
        if (!e.key) return;
        const key = e.key.toLowerCase();
        const mapping = keyLookup[key];
        if (!mapping) return;

        const { player, keyIndex } = mapping;
        if (keyIndex === 0) {
            peekingPlayers.delete(player);
            if (onAction) onAction(player, 'peek', false);
        }
    }

    // Mouse click equivalent — same logic as handleKeyDown minus peek (hold) and keyup
    function triggerAction(player, keyIndex) {
        if (!initialized) return;
        const state = getState();
        if (!state || state.phase === 'gameOver') return;

        const p = state.players[player];
        if (!p || p.eliminated) return;

        if (state.phase === 'showdown' || state.phase === 'handOver') {
            if (onAction) onAction(player, 'ack', null);
            return;
        }

        if (keyIndex === 0) return; // peek = hold; not meaningful for click

        if (keyIndex === 1 && state.activePlayerIndex !== player && !p.folded && !p.eliminated) {
            if (onAction) onAction(player, 'history', null);
            return;
        }

        if (state.activePlayerIndex !== player) return;
        if (p.folded || p.allIn) return;

        if (state.betSizingMode && state.betSizingPlayer === player) {
            switch (keyIndex) {
                case 1: if (onAction) onAction(player, 'adjustBet', -1); break;
                case 2: if (onAction) onAction(player, 'cancelBet', null); break;
                case 3: if (onAction) onAction(player, 'adjustBet', 1); break;
                case 4: {
                    const betAmount = state.betSizingAmount;
                    const chipEl = document.getElementById(`chips-${player}`);
                    const chipRect = chipEl ? chipEl.getBoundingClientRect() : null;
                    if (onAction) onAction(player, 'confirmBet', { betAmount, chipRect });
                    break;
                }
            }
        } else {
            switch (keyIndex) {
                case 1: if (onAction) onAction(player, 'fold', null); break;
                case 2:
                    if (state.currentBet > p.bet) {
                        if (onAction) onAction(player, 'call', null);
                    } else {
                        if (onAction) onAction(player, 'check', null);
                    }
                    break;
                case 3: if (onAction) onAction(player, 'enterBetSizing', null); break;
                case 4: if (onAction) onAction(player, 'allIn', null); break;
            }
        }
    }

    function isPeeking(playerIndex) {
        return peekingPlayers.has(playerIndex);
    }

    function getKeyLabels(playerIndex) {
        const state = getState ? getState() : null;
        if (!state) return KEY_LABELS_DEFAULT;

        if (state.betSizingMode && state.betSizingPlayer === playerIndex) {
            return KEY_LABELS_SIZING;
        }

        const p = state.players[playerIndex];
        if (p && state.currentBet > p.bet) {
            return KEY_LABELS_CALL;
        }
        return KEY_LABELS_DEFAULT;
    }

    function getKeyMap(playerIndex) {
        return KEY_MAP[playerIndex];
    }

    return { init, destroy, isPeeking, getKeyLabels, getKeyMap, triggerAction, KEY_MAP };
})();
