// controls.js — Keyboard input handling for 8 players × 5 keys

if (typeof CONSTANTS === 'undefined') throw new Error('controls.js: constants.js must be loaded first');

const Controls = (() => {
    // Key bindings and labels live in constants.js — reference via CONSTANTS.*
    const { KEY_MAP, KEY_LABELS_DEFAULT, KEY_LABELS_CALL, KEY_LABELS_SIZING } = CONSTANTS;

    let peekingPlayers = new Set();
    let onAction = null; // callback: (playerIndex, action, data) => void
    let numPlayers = 8;

    // Reverse lookup: key string -> { player, keyIndex }
    let keyLookup = {};

    // Guard against duplicate event listeners from multiple init() calls
    let initialized = false;

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

    function init(playerCount, actionCallback) {
        // Always destroy first so re-initialisation never stacks listeners
        destroy();

        onAction = actionCallback;
        buildLookup(playerCount);
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        initialized = true;
    }

    function destroy() {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        peekingPlayers.clear();
        initialized = false;
    }

    function handleKeyDown(e) {
        // Don't capture if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        // Defensive: e.key can be null/undefined in some browser edge cases
        if (!e.key) return;
        const key = e.key.toLowerCase();
        const mapping = keyLookup[key];
        if (!mapping) return;

        e.preventDefault();
        const { player, keyIndex } = mapping;
        const state = Game.getState();
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
            // Bet sizing mode
            switch (keyIndex) {
                case 1: // Decrease
                    Game.adjustBet(-1);
                    Audio.chipAdjust();
                    if (onAction) onAction(player, 'adjustBet', -1);
                    break;
                case 2: // Cancel
                    Game.cancelBetSizing();
                    if (onAction) onAction(player, 'cancelBet', null);
                    break;
                case 3: // Increase
                    Game.adjustBet(1);
                    Audio.chipAdjust();
                    if (onAction) onAction(player, 'adjustBet', 1);
                    break;
                case 4: // Confirm
                    const betAmount = Game.getState().betSizingAmount;
                    const chipEl = document.getElementById(`chips-${player}`);
                    const chipRect = chipEl ? chipEl.getBoundingClientRect() : null;
                    Game.confirmBet();
                    if (chipRect) UI.animateChipPush(player, betAmount, chipRect);
                    if (onAction) onAction(player, 'confirmBet', null);
                    break;
            }
        } else {
            // Default mode
            switch (keyIndex) {
                case 1: // Fold
                    Game.fold(player);
                    if (onAction) onAction(player, 'fold', null);
                    break;
                case 2: // Check/Call
                    if (state.currentBet > p.bet) {
                        Game.call(player);
                        if (onAction) onAction(player, 'call', null);
                    } else {
                        Game.check(player);
                        if (onAction) onAction(player, 'check', null);
                    }
                    break;
                case 3: // Bet/Raise
                    Game.enterBetSizing(player);
                    if (onAction) onAction(player, 'enterBetSizing', null);
                    break;
                case 4: // All-in
                    Game.allIn(player);
                    if (onAction) onAction(player, 'allIn', null);
                    break;
            }
        }
    }

    function handleKeyUp(e) {
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

    function isPeeking(playerIndex) {
        return peekingPlayers.has(playerIndex);
    }

    function getKeyLabels(playerIndex) {
        const state = Game.getState();
        if (!state) return KEY_LABELS_DEFAULT;

        if (state.betSizingMode && state.betSizingPlayer === playerIndex) {
            return KEY_LABELS_SIZING;
        }

        const p = state.players[playerIndex];
        if (state.currentBet > p.bet) {
            return KEY_LABELS_CALL;
        }
        return KEY_LABELS_DEFAULT;
    }

    function getKeyMap(playerIndex) {
        return KEY_MAP[playerIndex];
    }

    return { init, destroy, isPeeking, getKeyLabels, getKeyMap, KEY_MAP };
})();
