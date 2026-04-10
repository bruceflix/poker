// app.js — Main application controller

const App = (() => {
    let handInProgress = false;
    let lastBlindLevel = 0;

    // Acknowledgment tracking — all non-eliminated players must press a key
    // after each hand before the next deal begins.
    let ackedPlayers   = new Set();
    let ackedHandNumber = -1;
    let playersToAck   = [];

    function getAckInfo() {
        return playersToAck.length ? { ackedPlayers, playersToAck } : null;
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
        Controls.init(state.players.length, onPlayerAction);

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
        Controls.init(state.players.length, onPlayerAction);

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
        handInProgress = true;
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
        }

        if (state.blindLevel !== lastBlindLevel) {
            lastBlindLevel = state.blindLevel;
            UI.showBlindAlert(Game.smallBlind(), Game.bigBlind());
        }

        UI.updateTable(state, getAckInfo());
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
        if (action === 'history') {
            UI.toggleHandHistory(playerIndex, Game.getState());
            return;
        }

        if (action === 'ack') {
            const state = Game.getState();
            if (!state) return;
            if (state.phase !== 'showdown' && state.phase !== 'handOver') return;
            ackedPlayers.add(playerIndex);
            const allAcked = playersToAck.every(i => ackedPlayers.has(i));
            UI.updateTable(state, getAckInfo());
            if (allAcked) {
                // Brief pause so the "all ready" state is visible before dealing
                setTimeout(() => finishAndAdvance(), 500);
            }
            return;
        }

        UI.updateTable(Game.getState(), getAckInfo());
    }

    return { start, togglePause };
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
