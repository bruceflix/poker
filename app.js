// app.js — Main application controller

const App = (() => {
    let handInProgress = false;
    let autoAdvanceTimer = null;
    let lastBlindLevel = 0;

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
        Game.startHand();
        Audio.cardDeal();
        UI.updateTable(Game.getState());
    }

    function togglePause(forceTo) {
        const state = Game.getState();
        if (!state) return;
        if (forceTo !== undefined) {
            state.paused = !!forceTo;
        } else {
            state.paused = !state.paused;
        }
        UI.updateTable(state);
    }

    function onStateUpdate(state) {
        UI.updateTable(state);

        if (state.blindLevel !== lastBlindLevel) {
            lastBlindLevel = state.blindLevel;
            UI.showBlindAlert(Game.smallBlind(), Game.bigBlind());
        }

        if (state.phase === 'showdown' || state.phase === 'handOver') {
            // Only start the timer once — don't reset it on every blind-timer tick
            if (!autoAdvanceTimer) {
                const delay = state.phase === 'showdown' ? 4000 : 2500;
                autoAdvanceTimer = setTimeout(() => {
                    autoAdvanceTimer = null;

                    // Don't advance while paused — re-fetch live state
                    const currentState = Game.getState();
                    if (currentState && currentState.paused) {
                        waitForUnpause(() => finishAndAdvance());
                        return;
                    }
                    finishAndAdvance();
                }, delay);
            }
        }
    }

    function waitForUnpause(cb) {
        const check = setInterval(() => {
            const state = Game.getState();
            if (state && !state.paused) {
                clearInterval(check);
                cb();
            }
        }, 200);
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
        UI.updateTable(Game.getState());
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
