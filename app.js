// app.js — Main application controller

const App = (() => {
    let handInProgress = false;
    let lastBlindLevel = 0;

    // Acknowledgment tracking — all non-eliminated players must press a key
    // after each hand before the next deal begins.
    let ackedPlayers    = new Set();
    let ackedHandNumber = -1;
    let playersToAck    = [];

    // AI turn scheduling
    let aiTimer        = null;  // pending setTimeout handle
    let aiAckScheduled = new Set(); // seat indices for which an auto-ACK is already queued

    // All-in sound lockout — blocks all actions and delays Game.allIn() until
    // sounds finish: chip crash (0–400ms) + voice starts at 600ms + voice is 2s = 2700ms total
    let allInLockout   = false;
    let allInLockTimer = null;
    const ALL_IN_LOCK_MS = 2750; // chip crash + 600ms offset + ~2s voice + 150ms buffer

    function getAckInfo() {
        return playersToAck.length
            ? { ackedPlayers: new Set(ackedPlayers), playersToAck: [...playersToAck] }
            : null;
    }

    function start() {
        UI.showConfig(startGame);
    }

    function startGame(config, savedState) {
        if (savedState) {
            // Restore saved game
            loadFromSave(savedState);
            return;
        }

        Game.init(config);
        const state = Game.getState();

        if (config.bgIndex !== undefined) {
            UI.setCurrentBgIndex(config.bgIndex);
        }

        Game.setUpdateCallback(onStateUpdate);
        UI.showTable(state);
        Controls.init(state.players.length, onPlayerAction, Game.getState);

        Game.stopBlindTimer();
        Game.startBlindTimer();
        lastBlindLevel = state.blindLevel;
        dealNextHand();
    }

    // ---- SAVE VALIDATION ----
    // Validates the structure of a save data object before attempting to restore it.
    // Returns { valid: true } or { valid: false, error: string }.
    function validateSave(data) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Save data is missing or corrupted.' };
        }

        const gs = data.gameState;
        if (!gs || typeof gs !== 'object') {
            return { valid: false, error: 'Save is missing game state.' };
        }

        // Players array
        if (!Array.isArray(gs.players) || gs.players.length < 2) {
            return { valid: false, error: 'Save has invalid player data (need at least 2 players).' };
        }

        const REQUIRED_PLAYER_FIELDS = ['name', 'chips', 'cards', 'folded', 'allIn', 'eliminated', 'seatIndex', 'bet'];
        for (let i = 0; i < gs.players.length; i++) {
            const p = gs.players[i];
            if (!p || typeof p !== 'object') {
                return { valid: false, error: `Player ${i + 1} entry is corrupt.` };
            }
            for (const field of REQUIRED_PLAYER_FIELDS) {
                if (!(field in p)) {
                    return { valid: false, error: `Player ${i + 1} is missing field: "${field}".` };
                }
            }
            if (typeof p.chips !== 'number' || p.chips < 0) {
                return { valid: false, error: `Player ${i + 1} has invalid chip count.` };
            }
        }

        // Phase
        const VALID_PHASES = ['idle', 'preflop', 'flop', 'turn', 'river', 'showdown', 'handOver', 'gameOver'];
        if (!VALID_PHASES.includes(gs.phase)) {
            return { valid: false, error: `Save has unknown game phase: "${gs.phase}".` };
        }

        // Community cards
        if (!Array.isArray(gs.communityCards) || gs.communityCards.length > 5) {
            return { valid: false, error: 'Save has invalid community cards.' };
        }

        // Pots
        if (!Array.isArray(gs.pots) || gs.pots.length === 0) {
            return { valid: false, error: 'Save has invalid pot data.' };
        }

        // Blind schedule
        if (!Array.isArray(gs.blindSchedule) || gs.blindSchedule.length === 0) {
            return { valid: false, error: 'Save has invalid blind schedule.' };
        }

        // Hand number
        if (typeof gs.handNumber !== 'number' || gs.handNumber < 0) {
            return { valid: false, error: 'Save has invalid hand number.' };
        }

        // Blind level in range
        if (typeof gs.blindLevel !== 'number' || gs.blindLevel < 0 || gs.blindLevel >= gs.blindSchedule.length) {
            return { valid: false, error: 'Save has out-of-range blind level.' };
        }

        return { valid: true, error: null };
    }

    function loadFromSave(saved) {
        // Validate before touching any game state
        const check = validateSave(saved);
        if (!check.valid) {
            console.error('[SaveLoad] Validation failed:', check.error);
            alert(`Cannot load save: ${check.error}\n\nReturning to menu.`);
            start();
            return;
        }

        try {
            Game.restoreState(saved.gameState);
        } catch (e) {
            console.error('[SaveLoad] restoreState threw:', e);
            alert('Failed to restore the saved game — the save may be corrupt.\n\nReturning to menu.');
            start();
            return;
        }

        const state = Game.getState();

        if (saved.bgIndex !== undefined) {
            UI.setCurrentBgIndex(saved.bgIndex);
        }

        Game.setUpdateCallback(onStateUpdate);
        UI.showTable(state);
        UI.applyBg(UI.getCurrentBgIndex());
        Controls.init(state.players.length, onPlayerAction, Game.getState);

        Game.stopBlindTimer();
        Game.startBlindTimer();
        lastBlindLevel = state.blindLevel;

        // If we're between hands, deal next
        if (state.phase === 'idle') {
            dealNextHand();
        } else {
            UI.updateTable(state);
        }
    }

    function dealNextHand() {
        if (aiTimer !== null) { clearTimeout(aiTimer); aiTimer = null; }
        aiAckScheduled  = new Set();
        handInProgress  = true;
        ackedPlayers    = new Set();
        ackedHandNumber = -1;
        playersToAck    = [];
        Game.startHand();
        Audio.cardDeal();
        UI.animateDeal(Game.getState());
    }

    function togglePause(forceTo) {
        const state = Game.getState();
        if (!state) return;
        // Use Game.setPaused so the real state is mutated — getState() returns
        // a snapshot clone, so direct mutation would have no lasting effect.
        const next = forceTo !== undefined ? !!forceTo : !state.paused;
        Game.setPaused(next);
        UI.updateTable(Game.getState(), getAckInfo());
    }

    function onStateUpdate(state) {
        // When first entering showdown/handOver, record which players must acknowledge
        if ((state.phase === 'showdown' || state.phase === 'handOver') &&
            ackedHandNumber !== state.handNumber) {
            ackedHandNumber = state.handNumber;
            ackedPlayers    = new Set();
            playersToAck    = state.players
                .map((p, i) => ({ p, i }))
                .filter(({ p }) => !p.eliminated)
                .map(({ i }) => i);

            // Auto-ACK for AI players — schedule once per hand per seat
            for (const pi of playersToAck) {
                const p = state.players[pi];
                if (p && p.isAI && !aiAckScheduled.has(pi)) {
                    aiAckScheduled.add(pi);
                    const delay = state.ranOutBoard
                        ? 8000 + Math.random() * 2000  // dramatic pause after full board runout
                        : 1200 + Math.random() * 800;
                    setTimeout(() => onPlayerAction(pi, 'ack', null), delay);
                }
            }
        }

        if (state.blindLevel !== lastBlindLevel) {
            lastBlindLevel = state.blindLevel;
            UI.showBlindAlert(Game.smallBlind(), Game.bigBlind());
        }

        UI.updateTable(state, getAckInfo());
        scheduleAITurn();
    }

    function finishAndAdvance() {
        Game.finishHand();
        const newState = Game.getState();
        if (newState.phase === 'gameOver') {
            handInProgress = false;
            Controls.destroy();
            UI.showGameOver(newState, () => {
                Game.stopBlindTimer();
                start();
            });
        } else {
            setTimeout(() => dealNextHand(), 1000);
        }
    }

    function onPlayerAction(playerIndex, action, data) {
        // Block all actions while all-in sound sequence is playing
        if (allInLockout && action !== 'ack') return;
        switch (action) {
            case 'fold':
                Game.fold(playerIndex);
                break;
            case 'check':
                Game.check(playerIndex);
                break;
            case 'call':
                Game.call(playerIndex);
                break;
            case 'enterBetSizing':
                Game.enterBetSizing(playerIndex);
                break;
            case 'allIn':
                Audio.allIn();
                allInLockout = true;
                clearTimeout(allInLockTimer);
                allInLockTimer = setTimeout(() => {
                    allInLockout = false;
                    Game.allIn(playerIndex);  // state update + next turn happen here
                }, ALL_IN_LOCK_MS);
                break;
            case 'adjustBet':
                Game.adjustBet(data);
                Audio.chipAdjust();
                break;
            case 'cancelBet':
                Game.cancelBetSizing();
                break;
            case 'confirmBet': {
                const { betAmount, chipRect } = data || {};
                Game.confirmBet();
                if (chipRect && betAmount) UI.animateChipPush(playerIndex, betAmount, chipRect);
                break;
            }
            case 'history':
                UI.toggleHandHistory(playerIndex, Game.getState());
                return; // no updateTable needed — UI handles it
            case 'ack': {
                const state = Game.getState();
                if (!state) return;
                if (state.phase !== 'showdown' && state.phase !== 'handOver') return;
                if (UI.isCardsAnimating()) return; // don't ACK during dramatic card reveal
                ackedPlayers.add(playerIndex);
                const allAcked = playersToAck.every(i => ackedPlayers.has(i));
                UI.updateTable(state, getAckInfo());
                if (allAcked) {
                    // Brief pause so the "all ready" state is visible before dealing
                    setTimeout(() => finishAndAdvance(), 500);
                }
                return;
            }
            // 'peek' falls through — just trigger a re-render so UI reads isPeeking()
        }

        UI.updateTable(Game.getState(), getAckInfo());
    }

    // ---- AI ENGINE ----

    // Schedule an AI action for the current active player if it's an AI seat.
    // Guards against double-scheduling: if aiTimer is already set, do nothing.
    function scheduleAITurn() {
        const state = Game.getState();
        if (!state || state.paused) return;

        const bettingPhases = ['preflop', 'flop', 'turn', 'river'];
        if (!bettingPhases.includes(state.phase)) return;

        const pi = state.activePlayerIndex;
        if (pi < 0) return;

        const p = state.players[pi];
        if (!p || !p.isAI || p.eliminated || p.folded || p.allIn) return;

        if (aiTimer !== null) return; // already scheduled

        const delay = 1600 + Math.random() * 900; // 1600–2500 ms
        aiTimer = setTimeout(() => {
            aiTimer = null;
            executeAIAction(pi);
        }, delay);
    }

    // Execute one action for an AI player.
    // Evaluates hand strength and picks a weighted-random action.
    function executeAIAction(playerIndex) {
        const state = Game.getState();
        if (!state || state.paused) return;
        if (state.activePlayerIndex !== playerIndex) return;

        const bettingPhases = ['preflop', 'flop', 'turn', 'river'];
        if (!bettingPhases.includes(state.phase)) return;

        const p = state.players[playerIndex];
        if (!p || !p.isAI || p.eliminated || p.folded || p.allIn) return;

        // --- Hand strength: 0=weak 1=medium 2=strong ---
        const allCards = [...p.cards, ...state.communityCards];
        let strength = 1;

        if (allCards.length >= 5) {
            try {
                const result   = HandEvaluator.evaluate(allCards);
                const handType = result.score[0]; // 0=high card … 9=royal flush
                if      (handType >= 6) strength = 2; // full house or better
                else if (handType >= 3) strength = 1; // trips / straight / flush
                else                    strength = 0; // high card / pair / two pair
            } catch (e) { strength = 1; }
        } else if (p.cards.length >= 2) {
            const [c1, c2] = p.cards;
            const hi      = Math.max(c1.rank, c2.rank);
            const isPair  = c1.rank === c2.rank;
            const suited  = c1.suit === c2.suit;
            if      (isPair && hi >= 10)                    strength = 2; // high pocket pair
            else if (isPair || hi >= 13 || (hi >= 11 && suited)) strength = 1; // decent holding
            else                                             strength = 0; // rags
        }

        // --- Weighted action choice ---
        const r        = Math.random();
        const canCheck = state.currentBet <= p.bet;
        const canRaise = p.chips > (state.currentBet - p.bet);

        let action;
        if (strength === 2) {
            // Strong: raise 50%, check/call 45%, fold 5%
            if      (r < 0.50 && canRaise) action = 'raise';
            else if (r < 0.95)             action = canCheck ? 'check' : 'call';
            else                           action = 'fold';
        } else if (strength === 1) {
            // Medium: check/call 75%, raise 15%, fold 10%
            if      (r < 0.15 && canRaise) action = 'raise';
            else if (r < 0.90)             action = canCheck ? 'check' : 'call';
            else                           action = 'fold';
        } else {
            // Weak: fold 50%, check/call 45%, raise 5%
            if      (r < 0.05 && canRaise) action = 'raise';
            else if (r < 0.55)             action = canCheck ? 'check' : 'call';
            else                           action = 'fold';
        }

        // Never fold when a free check is available
        if (action === 'fold' && canCheck) action = 'check';
        // Sanity: cannot check if there's a bet to call
        if (action === 'check' && !canCheck) action = 'call';

        // --- Execute ---
        if (action === 'raise') {
            const minR   = Game.getMinRaise();
            const maxR   = Game.getMaxRaise(playerIndex);
            const bb     = Game.bigBlind();
            let betAmt;
            if (strength === 2 && Math.random() < 0.2) {
                betAmt = maxR; // occasional shove with a monster
            } else {
                const mult = 2 + Math.floor(Math.random() * 3); // 2×–4× over min-raise
                betAmt = Math.min(maxR, minR + (mult - 1) * bb);
                betAmt = Math.max(minR, betAmt);
            }
            // Detect all-in raise (bet equals max possible) and play all-in audio
            if (betAmt >= maxR) Audio.allIn();
            // Call Game.raise directly — notify() fires → onStateUpdate → UI.updateTable → scheduleAITurn chains
            Game.raise(playerIndex, betAmt);
        } else if (action === 'call') {
            // Detect all-in call (chips can't cover the full call amount)
            const toCall = state.currentBet - p.bet;
            if (p.chips <= toCall) Audio.allIn();
            Game.call(playerIndex);
        } else if (action === 'check') {
            Game.check(playerIndex);
        } else {
            Game.fold(playerIndex);
        }
    }

    function returnToMenu() {
        Game.stopBlindTimer();
        Controls.destroy();
        start();
    }

    return { start, togglePause, returnToMenu };
})();

// ---- SAVE/LOAD ----
const SaveLoad = (() => {
    const STORAGE_KEY = 'poker_saves';

    function getAll() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch { return {}; }
    }

    function save(name, state, bgIndex) {
        const saves = getAll();
        // Strip non-serializable fields
        const clean = JSON.parse(JSON.stringify(state, (key, val) => {
            if (key === 'onUpdate' || key === 'blindTimerInterval') return undefined;
            if (val instanceof Set) return { __set: [...val] };
            return val;
        }));

        saves[name] = {
            gameState: clean,
            bgIndex: bgIndex,
            date: Date.now(),
            hand: state.handNumber,
            playersAlive: state.players.filter(p => !p.eliminated).length,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    }

    function load(name) {
        const saves = getAll();
        const data = saves[name];
        if (!data) return null;

        // Restore Sets, guarded against malformed values
        let state;
        try {
            state = JSON.parse(JSON.stringify(data.gameState), (key, val) => {
                if (val && typeof val === 'object' && val.__set) return new Set(val.__set);
                return val;
            });
        } catch (e) {
            console.error('[SaveLoad] Failed to deserialise save:', e);
            return null;
        }

        return { ...data, gameState: state };
    }

    function remove(name) {
        const saves = getAll();
        delete saves[name];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    }

    function list() {
        const saves = getAll();
        return Object.entries(saves).map(([name, data]) => ({
            name,
            date: data.date,
            hand: data.hand,
            playersAlive: data.playersAlive,
        }));
    }

    return { save, load, remove, list };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => {
    App.start();
});
