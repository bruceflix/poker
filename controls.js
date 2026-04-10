// controls.js — Keyboard input handling for 8 players × 5 keys

const Controls = (() => {
    // Key mappings: each player has [peek, key2, key3, key4, key5]
    const KEY_MAP = [
        ['1', '2', '3', '4', '5'],       // Player 1
        ['6', '7', '8', '9', '0'],       // Player 2
        ['q', 'w', 'e', 'r', 't'],       // Player 3
        ['y', 'u', 'i', 'o', 'p'],       // Player 4
        ['a', 's', 'd', 'f', 'g'],       // Player 5
        ['h', 'j', 'k', 'l', ';'],       // Player 6
        ['z', 'x', 'c', 'v', 'b'],       // Player 7
        ['n', 'm', ',', '.', '/'],        // Player 8
    ];

    const KEY_LABELS_DEFAULT = ['PEEK', 'FOLD', 'CHECK', 'BET', 'ALL-IN'];
    const KEY_LABELS_CALL = ['PEEK', 'FOLD', 'CALL', 'RAISE', 'ALL-IN'];
    const KEY_LABELS_SIZING = ['PEEK', '- BET', 'CANCEL', '+ BET', 'CONFIRM'];

    let peekingPlayers = new Set();
    let onAction = null; // callback: (playerIndex, action, data) => void
    let numPlayers = 8;

    // Reverse lookup: key string -> { player, keyIndex }
    let keyLookup = {};

    function buildLookup(n) {
        numPlayers = n;
        keyLookup = {};
        for (let p = 0; p < n; p++) {
            for (let k = 0; k < 5; k++) {
                keyLookup[KEY_MAP[p][k]] = { player: p, keyIndex: k };
            }
        }
    }

    function init(playerCount, actionCallback) {
        onAction = actionCallback;
        buildLookup(playerCount);
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
    }

    function destroy() {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        peekingPlayers.clear();
    }

    function handleKeyDown(e) {
        // Don't capture if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

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
