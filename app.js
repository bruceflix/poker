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

    function loadFromSave(saved) {
        // Restore game state
        Game.restoreState(saved.gameState);
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
        UI.updateTable(Game.getState(), null);
    }

    function togglePause(forceTo) {
        const state = Game.getState();
        if (!state) return;
        if (forceTo !== undefined) {
            state.paused = !!forceTo;
        } else {
            state.paused = !state.paused;
        }
        UI.updateTable(state, getAckInfo());
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

        // Restore Sets
        const state = JSON.parse(JSON.stringify(data.gameState), (key, val) => {
            if (val && val.__set) return new Set(val.__set);
            return val;
        });
        data.gameState = state;
        return data;
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
