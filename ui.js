// ui.js — Table rendering, config screen, settings overlay, save/load

if (typeof CONSTANTS === 'undefined') throw new Error('ui.js: constants.js must be loaded first');

const UI = (() => {
    // Layout constants live in constants.js — reference via CONSTANTS.*
    const { SEAT_POSITIONS, EDGE_MARGIN, CHIP_DENOMS, BG_PRESETS } = CONSTANTS;

    function getPositionsForCount(n) {
        const all = SEAT_POSITIONS.slice(0, 8);
        if (n >= 8) return all.map(p => ({ ...p }));
        const mapping = {
            2: [0, 4],
            3: [0, 3, 5],
            4: [0, 2, 4, 6],
            5: [0, 2, 3, 5, 7],
            6: [0, 1, 3, 4, 6, 7],
            7: [0, 1, 2, 4, 5, 6, 7],
        };
        return (mapping[n] || []).map(i => ({ ...SEAT_POSITIONS[i] }));
    }

    // repositionPlayersToEdge: after DOM render, nudge each player section so
    // the edge it faces is exactly EDGE_MARGIN px from the screen boundary.
    // This works at any resolution (1080p, 4K, ultrawide, etc.).

    function repositionPlayersToEdge() {
        if (!positions.length) return;
        const W = window.innerWidth;
        const H = window.innerHeight;
        positions.forEach((pos, i) => {
            const section = document.getElementById(`player-${i}`);
            if (!section) return;
            const rect = section.getBoundingClientRect();
            let dl = 0, dt = 0;
            switch (pos.rot) {
                case 90:  dl = EDGE_MARGIN - rect.left; break;               // left side → push right until left edge = EDGE_MARGIN
                case 270: dl = (W - EDGE_MARGIN) - rect.right; break;        // right side → push left until right edge = W - EDGE_MARGIN
                case 180: dt = EDGE_MARGIN - rect.top; break;                // top → push down until top edge = EDGE_MARGIN
                default:  dt = (H - EDGE_MARGIN) - rect.bottom; break;       // bottom → push up until bottom edge = H - EDGE_MARGIN
            }
            if (dl !== 0) { pos.left += dl / W * 100; section.style.left = pos.left + '%'; }
            if (dt !== 0) { pos.top  += dt / H * 100; section.style.top  = pos.top  + '%'; }
        });
    }

    let positions = [];
    let _resizeHandler = null;
    let bgColor = '#0d4b1e'; // default green
    let lastHandResult = null;
    let historyOpenFor = -1;
    let overlayShownForHand = -1;
    let lastRenderedPhase = null;

    // --- Deal animation state ---
    // dealAnim: { handNumber, dealtTo: { playerIdx: cardCount } } | null
    let dealAnim = null;

    // --- Community card flip animation state ---
    let commRevealedCount  = 0;    // how many community cards are fully face-up
    let commAnimating      = false; // flip sequence in progress — skip re-entry
    let commHandNumber     = -1;   // reset tracking when a new hand starts

    // --- Bet collection animation state ---
    // Bet amounts from the most-recent render — used to animate sweeping chips
    // from player bet labels to the pot when a betting round ends.
    let lastRenderedBets = {}; // { playerIdx: amount }

    // Last ackInfo passed to updateTable — used by the deferred runout re-render
    let lastAckInfo = null;


    function renderChips(amount) {
        if (!amount || amount <= 0) return '';
        let remaining = amount;
        const stacks = [];
        for (const d of CHIP_DENOMS) {
            const count = Math.floor(remaining / d.v);
            if (count > 0) { stacks.push({ ...d, count }); remaining -= count * d.v; }
        }
        if (stacks.length === 0) return '';

        return `<div class="chip-stacks-row">${stacks.map(s => {
            const vis = Math.min(s.count, 10);
            const STEP = 10;   // px between chips in stack
            const FACE_H = 26; // px height of ellipse face
            const stackH = FACE_H + (vis - 1) * STEP;
            // idx 0 = bottom chip, idx vis-1 = top chip
            const coins = Array.from({ length: vis }, (_, idx) => {
                const isTop = idx === vis - 1;
                const bottom = idx * STEP;
                const sideCol = `color-mix(in srgb,${s.bg} 55%,#000)`;
                const dropCol = `color-mix(in srgb,${s.bg} 30%,#000)`;
                return `<div class="chip-coin${isTop ? ' chip-coin-top' : ''}" style="bottom:${bottom}px;z-index:${idx+1};background:${s.bg};box-shadow:0 ${STEP}px 0 ${sideCol},0 ${STEP+5}px 7px ${dropCol}"><span class="chip-val" style="color:${s.fg}">${s.label}</span></div>`;
            }).join('');
            return `<div class="chip-3d-stack">
                <div class="chip-coins" style="height:${stackH + STEP + 4}px">${coins}</div>
            </div>`;
        }).join('')}</div>`;
    }


    function applyBg(idx) {
        const preset = BG_PRESETS[idx] || BG_PRESETS[0];
        bgColor = preset.color;
        const app = document.getElementById('app');
        if (app && app.classList.contains('table-screen')) {
            app.style.background = preset.color;
            app.style.backgroundImage = preset.grad;
        }
    }

    let currentBgIndex = 0;

    // ---- CONFIG SCREEN ----
    function showConfig(onStart, savedGames) {
        const app = document.getElementById('app');
        app.innerHTML = '';
        app.className = 'config-screen';
        app.style.background = '';
        app.style.backgroundImage = '';

        // Check for saved games
        const saves = SaveLoad.list();

        const container = document.createElement('div');
        container.className = 'config-container';

        const savesSection = saves.length > 0 ? `
            <div class="config-saves-section">
                <label>Load Saved Game</label>
                <div class="saves-list">
                    ${saves.map(s => `
                        <div class="save-row">
                            <button class="save-load-btn" data-save="${escHtml(s.name)}">
                                <strong>${escHtml(s.name)}</strong>
                                <small>Hand #${s.hand} &mdash; ${s.playersAlive} players alive</small>
                            </button>
                            <button class="save-delete-btn" data-save="${escHtml(s.name)}" title="Delete">&#10005;</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        container.innerHTML = `
            <div class="config-hero">
                <div class="config-brand">Brett's</div>
                <div class="suit-row">&#9824; &#9829; &#9827; &#9830;</div>
                <h1>Texas Hold'em</h1>
                <p>Tournament Setup</p>
                <p class="config-version">${typeof VERSION !== 'undefined' ? VERSION : ''}</p>
            </div>

            ${savesSection}

            <div class="config-body">
                <div class="config-col">
                    <div class="config-section">
                        <label>Number of Players</label>
                        <div class="player-count-row">
                            ${[2,3,4,5,6,7,8].map(n =>
                                `<button class="count-btn ${n===4?'active':''}" data-count="${n}">${n}</button>`
                            ).join('')}
                        </div>
                    </div>

                    <div class="config-section">
                        <label>Player Names &amp; Keys</label>
                        <div id="playerNameInputs"></div>
                    </div>
                </div>

                <div class="config-col">
                    <div class="config-section">
                        <label>Starting Chips</label>
                        <div class="chip-row">
                            ${[1000,5000,10000,25000].map(c =>
                                `<button class="chip-btn ${c===5000?'active':''}" data-chips="${c}">${c.toLocaleString()}</button>`
                            ).join('')}
                            <input type="number" id="customChips" placeholder="Custom" min="100" step="100">
                        </div>
                    </div>

                    <div class="config-section">
                        <label>Blind Structure</label>
                        <div class="blind-row">
                            ${['turbo','standard','deep'].map(b =>
                                `<button class="blind-btn ${b==='standard'?'active':''}" data-blind="${b}">
                                    ${b.charAt(0).toUpperCase()+b.slice(1)}
                                    <small>${b==='turbo'?'3 min':b==='standard'?'8 min':'15 min'} levels</small>
                                </button>`
                            ).join('')}
                        </div>
                    </div>

                    <div class="config-section">
                        <label>Table Colour</label>
                        <div class="bg-row">
                            ${BG_PRESETS.map((p, i) =>
                                `<button class="bg-btn ${i===0?'active':''}" data-bg="${i}" style="background:${p.color}"
                                    title="${p.name}"></button>`
                            ).join('')}
                        </div>
                    </div>

                    <div class="config-section">
                        <label>Seat Assignment</label>
                        <div class="seat-row">
                            <button class="seat-btn" data-seat="random">Random</button>
                            <button class="seat-btn active" data-seat="manual">As Entered</button>
                        </div>
                    </div>

                    <div class="config-section">
                        <label>Buy-in per Player</label>
                        <div class="buyin-row">
                            <button class="buyin-btn active" data-buyin="0">None</button>
                            ${[5,10,20,50].map(v =>
                                `<button class="buyin-btn" data-buyin="${v}">&pound;${v}</button>`
                            ).join('')}
                            <input type="number" id="customBuyin" placeholder="Custom" min="1" step="1">
                        </div>
                    </div>
                </div>
            </div>

            <div id="prizeBreakdown" class="prize-breakdown"></div>

            <button id="startGameBtn" class="start-btn">DEAL 'EM!</button>
        `;
        app.appendChild(container);

        let playerCount = 4;
        let startingChips = 5000;
        let blindPreset = 'standard';
        let seatMode = 'manual';
        let buyIn = 0;
        currentBgIndex = 0;

        const AI_NAMES = [
            'Doctor Doom','Captain Chaos','Baron Von Fold','Lady Luckystrikes',
            'Turbo Tilt','Professor Pocket','Señor All-In','The Grim Caller',
            'Commander Raisealot','El Foldo Grande','Sir Bluffs-a-Lot',
            'The Pot Goblin','Ace McSmasher','Rex Reckless','Princess Pot-Steal',
            'Bandit McBet','Captain Overcall','Count Rakeula','General Tilt',
            'Bluffmaster Flash','Doctor Showdown','Lady Donkament','Sgt Shove-It',
            'Madame Fullhouse','The Dark Raiser','Mega Muck','Zap Overdrive',
            'Sly McRivercard','Thunderfold McGee','The Magnificent Bluff',
        ];
        function randomAIName() {
            return AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
        }

        function calcPrizes(pool, count) {
            // Tiers: 1st=50%, 2nd=25%, 3rd=15%, 4th=10%. Only pay places that exist.
            const rawPcts = [0.50, 0.25, 0.15, 0.10];
            const places  = Math.min(count, rawPcts.length);
            // Floor each to nearest 5, then distribute remainder to higher places
            let amounts = rawPcts.slice(0, places).map(pct => Math.floor(pool * pct / 5) * 5);
            let leftover = pool - amounts.reduce((s, a) => s + a, 0);
            for (let i = 0; i < amounts.length && leftover >= 5; i++) {
                amounts[i] += 5;
                leftover   -= 5;
            }
            // Any sub-5 remainder (pool not divisible by 5) goes to 1st
            if (leftover > 0) amounts[0] += leftover;
            return amounts;
        }

        function renderPrizes() {
            const el = document.getElementById('prizeBreakdown');
            if (!el) return;
            if (buyIn === 0) { el.innerHTML = ''; return; }
            const pool   = buyIn * playerCount;
            const prizes = calcPrizes(pool, playerCount);
            const labels = ['1st', '2nd', '3rd', '4th'];
            const rows   = prizes.map((amt, i) =>
                `<div class="pz-row"><span class="pz-place">${labels[i]}</span><span class="pz-amt">&pound;${amt.toLocaleString()}</span></div>`
            ).join('');
            const none = playerCount > prizes.length
                ? `<div class="pz-row pz-none"><span class="pz-place">${prizes.length + 1}${prizes.length + 1 < playerCount ? '–' + playerCount : ''}${prizes.length + 1 < playerCount ? 'th' : ''}</span><span class="pz-amt">–</span></div>`
                : '';
            el.innerHTML = `<div class="pz-header">Prize Pool &mdash; <span class="pz-pool">&pound;${pool.toLocaleString()}</span> (${playerCount} &times; &pound;${buyIn})</div><div class="pz-rows">${rows}${none}</div>`;
        }

        function renderNameInputs() {
            const div = document.getElementById('playerNameInputs');
            // Preserve values across re-renders (e.g. player count change)
            const prevNames = Array.from(div.querySelectorAll('.player-name-input')).map(el => el.value);
            const prevAI    = Array.from(div.querySelectorAll('.player-ai-check')).map(el => el.checked);
            const isFirst   = prevAI.length === 0;
            div.innerHTML = '';
            for (let i = 0; i < playerCount; i++) {
                const row = document.createElement('div');
                row.className = 'name-input-row';
                const keyHint   = CONSTANTS.KEY_MAP[i].join(' ').toUpperCase();
                const aiDefault = isFirst ? (i > 0) : (prevAI[i] ?? (i > 0));
                const aiChecked = aiDefault ? ' checked' : '';
                let nameVal;
                if (prevNames[i] !== undefined && prevNames[i] !== '') {
                    nameVal = prevNames[i];
                } else if (i === 0) {
                    nameVal = 'Player 1';
                } else {
                    nameVal = randomAIName();
                }
                row.innerHTML = `
                    <span class="seat-num">P${i+1}</span>
                    <input type="text" class="player-name-input" data-index="${i}"
                           placeholder="Player ${i+1}" maxlength="16" value="${escHtml(nameVal)}">
                    <label class="ai-label"><input type="checkbox" class="player-ai-check" data-index="${i}"${aiChecked}> AI</label>
                    <span class="key-hint">Keys: ${keyHint}</span>
                `;
                div.appendChild(row);
            }
        }

        container.querySelectorAll('.count-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                playerCount = parseInt(btn.dataset.count);
                renderNameInputs();
                renderPrizes();
            });
        });

        container.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                startingChips = parseInt(btn.dataset.chips);
                const customChipsEl = document.getElementById('customChips');
                if (customChipsEl) customChipsEl.value = '';
            });
        });
        document.getElementById('customChips')?.addEventListener('input', (e) => {
            if (e.target.value) {
                container.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
                startingChips = parseInt(e.target.value) || 5000;
            }
        });

        container.querySelectorAll('.blind-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.blind-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                blindPreset = btn.dataset.blind;
            });
        });

        container.querySelectorAll('.bg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentBgIndex = parseInt(btn.dataset.bg);
            });
        });

        container.querySelectorAll('.seat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.seat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                seatMode = btn.dataset.seat;
            });
        });

        container.querySelectorAll('.buyin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.buyin-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                buyIn = parseInt(btn.dataset.buyin);
                const customEl = document.getElementById('customBuyin');
                if (customEl) customEl.value = '';
                renderPrizes();
            });
        });
        document.getElementById('customBuyin')?.addEventListener('input', (e) => {
            if (e.target.value) {
                container.querySelectorAll('.buyin-btn').forEach(b => b.classList.remove('active'));
                buyIn = parseInt(e.target.value) || 10;
                renderPrizes();
            }
        });

        // Load saved game buttons
        container.querySelectorAll('.save-load-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.save;
                const data = SaveLoad.load(name);
                if (data) {
                    onStart(null, data); // null config = loading saved game
                }
            });
        });
        container.querySelectorAll('.save-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                SaveLoad.remove(btn.dataset.save);
                showConfig(onStart); // refresh
            });
        });

        renderNameInputs();
        renderPrizes();

        // Auto-fill funny name when AI is ticked on a default-named player
        document.getElementById('playerNameInputs').addEventListener('change', (e) => {
            if (!e.target.classList.contains('player-ai-check')) return;
            const idx = parseInt(e.target.dataset.index);
            const nameInput = document.querySelector(`.player-name-input[data-index="${idx}"]`);
            if (e.target.checked && (!nameInput.value || nameInput.value === `Player ${idx+1}`)) {
                nameInput.value = randomAIName();
            }
        });

        document.getElementById('startGameBtn')?.addEventListener('click', () => {
            const inputs   = container.querySelectorAll('.player-name-input');
            const aiChecks = container.querySelectorAll('.player-ai-check');
            let players = Array.from(inputs).map((inp, idx) => ({
                name: inp.value.trim() || `Player ${parseInt(inp.dataset.index)+1}`,
                isAI: aiChecks[idx] ? aiChecks[idx].checked : false,
            }));

            if (seatMode === 'random') {
                for (let i = players.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [players[i], players[j]] = [players[j], players[i]];
                }
            }

            onStart({
                playerNames: players.map(p => p.name),
                isAI:        players.map(p => p.isAI),
                startingChips,
                blindPreset,
                bgIndex: currentBgIndex,
            });
        });
    }

    // ---- TABLE VIEW ----
    function showTable(state) {
        const app = document.getElementById('app');
        app.className = 'table-screen';

        const preset = BG_PRESETS[currentBgIndex] || BG_PRESETS[0];
        app.style.background = preset.color;
        app.style.backgroundImage = preset.grad;

        positions = getPositionsForCount(state.players.length);
        if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
        _resizeHandler = () => {
            positions = getPositionsForCount(state.players.length);
            state.players.forEach((_, i) => {
                const s = document.getElementById(`player-${i}`);
                if (s && positions[i]) {
                    const p = positions[i];
                    s.style.left = p.left + '%';
                    s.style.top  = p.top  + '%';
                    s.style.transform = `translate(-50%,-50%) rotate(${p.rot}deg)`;
                }
            });
            requestAnimationFrame(repositionPlayersToEdge);
        };
        window.addEventListener('resize', _resizeHandler);

        app.innerHTML = `
            <div id="table">
                <div id="table-controls">
                    <button id="pauseBtn" class="table-btn" title="Pause/Resume">&#9646;&#9646;</button>
                    <button id="muteBtn" class="table-btn" title="Mute/Unmute">${Audio.isMuted() ? '🔇' : '🔊'}</button>
                    <button id="settingsBtn" class="table-btn" title="Settings">&#9881;</button>
                    <button id="quitBtn" class="table-btn table-btn-quit" title="Quit to Menu">&#10006;</button>
                </div>
                <div id="pause-banner" class="hidden">PAUSED</div>
                <div id="center-info">
                    <div id="community-cards"></div>
                    <div id="pot-display"></div>
                    <div id="blind-info"></div>
                    <div id="hand-info"></div>
                    <div id="blind-timer"></div>
                    <div id="blind-alert" class="blind-alert hidden"></div>
                    <div id="showdown-info" class="hidden"></div>
                    <div id="last-hand-display" class="hidden"></div>
                </div>
                <div id="player-sections"></div>
                <div id="winner-overlay" class="hidden"></div>
                <div id="hand-rank-sheet" class="hidden"></div>
            </div>
            <div id="settings-overlay" class="overlay hidden"></div>
        `;

        const sections = document.getElementById('player-sections');
        state.players.forEach((p, i) => {
            const pos = positions[i];
            const section = document.createElement('div');
            section.className = 'player-section';
            section.id = `player-${i}`;
            section.style.left = pos.left + '%';
            section.style.top = pos.top + '%';
            section.style.transform = `translate(-50%, -50%) rotate(${pos.rot}deg)`;
            section.innerHTML = buildPlayerHTML(p, i);
            sections.appendChild(section);
        });

        // Nudge all sections to their nearest screen edge after layout
        requestAnimationFrame(repositionPlayersToEdge);

        document.getElementById('pauseBtn')?.addEventListener('click', () => {
            App.togglePause();
        });
        document.getElementById('muteBtn')?.addEventListener('click', (e) => {
            const nowMuted = Audio.toggleMute();
            e.currentTarget.textContent = nowMuted ? '🔇' : '🔊';
        });
        document.getElementById('quitBtn')?.addEventListener('click', () => {
            App.togglePause(true);
            showConfirmDialog('Quit to main menu?', () => App.returnToMenu(), () => App.togglePause(false));
        });

        document.getElementById('settingsBtn')?.addEventListener('click', () => {
            App.togglePause(true); // force pause
            showSettingsOverlay(state);
        });

        // Delegated click handler for mouse-clickable action buttons and ACK prompts
        document.getElementById('table')?.addEventListener('click', (e) => {
            const ackEl = e.target.closest('[data-ack-player]');
            if (ackEl) {
                Controls.triggerAction(parseInt(ackEl.dataset.ackPlayer), -1);
                return;
            }
            const keyEl = e.target.closest('[data-keyindex]');
            if (!keyEl) return;
            Controls.triggerAction(parseInt(keyEl.dataset.player), parseInt(keyEl.dataset.keyindex));
        });
    }

    function buildPlayerHTML(p, i) {
        const turnText = p.isAI ? '&#129302; AI TURN' : '&#9658; YOUR TURN';
        return `
            <div class="player-bet-label" id="bet-${i}"></div>
            <div class="your-turn-indicator hidden" id="turn-${i}">${turnText}</div>
            <div class="player-header">
                <div class="player-name">${escHtml(p.name)}</div>
                <div class="player-badge" id="badge-${i}"></div>
            </div>
            <div class="player-main-row">
                <div class="player-cards" id="cards-${i}"></div>
                <div class="player-right-col">
                    <div class="player-chips" id="chips-${i}"></div>
                </div>
            </div>
            <div class="player-keys" id="keys-${i}"></div>
            <div class="player-bet-sizing hidden" id="sizing-${i}"></div>
            <div class="player-status" id="status-${i}"></div>
        `;
    }

    function updateTable(state, ackInfo = null) {
        if (!state) return;
        lastAckInfo = ackInfo;
        // Ensure positions is always populated before any player update runs.
        // Guards against updateTable being called before showTable (e.g. from a save/load path).
        if (positions.length === 0) {
            positions = getPositionsForCount(state.players.length);
        }

        // Detect round-end moment: when phase transitions away from a betting round,
        // bets have just been swept into the pot. Animate chips flying to the pot
        // BEFORE we clear the bet labels below.
        const bettingPhases = ['preflop', 'flop', 'turn', 'river'];
        if (state.phase !== lastRenderedPhase && bettingPhases.includes(lastRenderedPhase)) {
            animateBetCollection(lastRenderedBets);
        }

        updateCommunityCards(state);
        updatePotDisplay(state);
        updateBlindInfo(state);
        updateHandInfo(state);
        updateBlindTimer(state);

        // Pause banner
        const pauseBanner = document.getElementById('pause-banner');
        if (pauseBanner) {
            pauseBanner.classList.toggle('hidden', !state.paused);
        }

        // Pause button icon
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.innerHTML = state.paused ? '&#9654;' : '&#9646;&#9646;';
            pauseBtn.title = state.paused ? 'Resume' : 'Pause';
        }

        // On every phase transition, force-clear all bet displays
        // before individual player updates run (guards against any stale state)
        if (state.phase !== lastRenderedPhase) {
            lastRenderedPhase = state.phase;
            state.players.forEach((_, i) => {
                const betEl = document.getElementById(`bet-${i}`);
                if (betEl) betEl.textContent = '';
                // Also ensure any stale sizing display is cleared on phase change
                const sizingEl = document.getElementById(`sizing-${i}`);
                if (sizingEl) sizingEl.classList.add('hidden');
            });
        }

        state.players.forEach((p, i) => {
            updatePlayer(state, p, i, ackInfo);
        });

        // Record last hand result (for the pill display), but don't show central overlay
        if ((state.phase === 'showdown' || state.phase === 'handOver') && state.showdownResults) {
            recordHandResult(state);
        }
        const overlayEl = document.getElementById('winner-overlay');
        if (overlayEl) overlayEl.classList.add('hidden');
        const sd = document.getElementById('showdown-info');
        if (sd && state.phase !== 'gameOver') sd.classList.add('hidden');
        updateLastHandDisplay(state);

        // Hand rank reference sheet — visible whenever a player's history panel is open
        const hrSheet = document.getElementById('hand-rank-sheet');
        if (hrSheet) {
            if (historyOpenFor !== -1) {
                if (hrSheet.classList.contains('hidden')) {
                    hrSheet.innerHTML = buildHandRankSheet();
                }
                hrSheet.classList.remove('hidden');
            } else {
                hrSheet.classList.add('hidden');
            }
        }

        scheduleReposition();
    }

    // Schedule repositionPlayersToEdge for after the current render — de-duped so
    // rapid updateTable calls only trigger one reposition per animation frame.
    let _repositionPending = false;
    function scheduleReposition() {
        if (_repositionPending) return;
        _repositionPending = true;
        requestAnimationFrame(() => {
            _repositionPending = false;
            repositionPlayersToEdge();
        });
    }

    function updateCommunityCards(state) {
        const el = document.getElementById('community-cards');
        if (!el) return;

        // Reset counters at the start of each new hand
        if (state.handNumber !== commHandNumber) {
            commHandNumber    = state.handNumber;
            commRevealedCount = 0;
            commAnimating     = false;
        }

        const total = state.communityCards.length;

        // Nothing new — just render what's revealed so far
        if (total <= commRevealedCount) {
            renderCommunityStatic(el, state, commRevealedCount);
            return;
        }

        // Animation already running — don't interfere (re-rendering mid-flip detaches animated elements)
        if (commAnimating) return;

        // New cards appeared — start a flip sequence
        const newCount  = total - commRevealedCount;
        // Runout: multiple new cards AND phase is already showdown (board ran out all at once)
        const isRunout  = newCount >= 2 && state.phase === 'showdown';
        const gapMs     = isRunout ? 1000 : 500; // ms between successive flips
        const initialMs = isRunout ? 800  : 0;   // pause before very first card

        // Render initial state (backs for new cards) BEFORE setting commAnimating,
        // so the guard below won't block this first render.
        renderCommunityStatic(el, state, commRevealedCount);
        commAnimating = true;

        // Capture start index — commRevealedCount grows as each card flips, so we
        // must use the value frozen at animation start when computing DOM positions.
        const startRevealedCount = commRevealedCount;
        let seq = 0;
        function flipNext() {
            if (seq >= newCount) {
                // Pause briefly after the last card settles before announcing results.
                // commAnimating stays true during this window so ACK is still blocked.
                if (state.phase === 'showdown' || state.phase === 'handOver') {
                    setTimeout(() => {
                        commAnimating = false;
                        const current = Game.getState();
                        if (current && (current.phase === 'showdown' || current.phase === 'handOver')) {
                            updateTable(current, lastAckInfo);
                        }
                    }, 400);
                } else {
                    commAnimating = false;
                }
                return;
            }

            const cardIdx = startRevealedCount + seq; // fixed: was commRevealedCount+seq (grew each flip)
            const delay   = seq === 0 ? initialMs : gapMs;

            setTimeout(() => {
                const cardEls = el.querySelectorAll('.card');
                const target  = cardEls[cardIdx];
                if (!target) { commRevealedCount++; seq++; flipNext(); return; }

                // Phase 1: rotate face-down card 90° (hiding it)
                target.style.transition = 'transform 0.15s ease-in';
                target.style.transform  = 'rotateY(90deg)';

                setTimeout(() => {
                    // Phase 2: re-query element at same slot (DOM may have shifted),
                    // swap in face-up card, animate in from -90° → 0°
                    const currentEls = el.querySelectorAll('.card');
                    const slot       = currentEls[cardIdx];

                    const faceHtml = renderCard(state.communityCards[cardIdx], true);
                    const tmp = document.createElement('div');
                    tmp.innerHTML = faceHtml;
                    const faceEl = tmp.firstElementChild;
                    faceEl.style.transform  = 'rotateY(-90deg)';
                    faceEl.style.transition = 'none';

                    if (slot && slot.parentNode) {
                        slot.replaceWith(faceEl);
                    } else {
                        // Fallback: element was detached (rare) — append to keep count correct
                        el.appendChild(faceEl);
                    }

                    void faceEl.offsetWidth; // force reflow so Phase-2 transition fires
                    faceEl.style.transition = 'transform 0.2s ease-out';
                    faceEl.style.transform  = 'rotateY(0deg)';

                    Audio.cardFlip();
                    commRevealedCount++;
                    seq++;
                    flipNext();
                }, 160);
            }, delay);
        }

        flipNext();
    }

    // Render revealed cards face-up, remaining as backs/slots (no animation)
    function renderCommunityStatic(el, state, revealedCount) {
        let html = '';
        for (let i = 0; i < state.communityCards.length; i++) {
            html += i < revealedCount
                ? renderCard(state.communityCards[i], true)
                : renderCard(null, false);
        }
        // Only show empty slots once at least one card has been dealt (flop or later).
        // Before the flop, communityCards.length === 0 — rendering 5 huge dashed
        // placeholders clutters the center and can visually encroach on the top
        // player section at 1080p.
        if (state.communityCards.length > 0) {
            for (let i = state.communityCards.length; i < 5; i++) {
                html += '<div class="card card-slot"></div>';
            }
        }
        // Only update DOM if content changed (avoids killing in-progress transitions)
        if (el.dataset.staticKey !== `${revealedCount}/${state.communityCards.length}`) {
            el.dataset.staticKey = `${revealedCount}/${state.communityCards.length}`;
            el.innerHTML = html;
        }
    }

    function updatePotDisplay(state) {
        const el = document.getElementById('pot-display');
        if (!el) return;
        const totalPot = state.pots.reduce((sum, p) => sum + p.amount, 0) +
                         state.players.reduce((sum, p) => sum + p.bet, 0);
        if (totalPot === 0) { el.innerHTML = ''; return; }

        let html = `<div class="pot-chips">${renderChips(totalPot)}</div>`;
        html += `<div class="pot-total">POT: ${totalPot.toLocaleString()}</div>`;
        const nonEmptyPots = state.pots.filter(p => p.amount > 0);
        if (nonEmptyPots.length > 1) {
            html += '<div class="side-pots">';
            nonEmptyPots.forEach((p, i) => {
                html += `<span class="side-pot">${i === 0 ? 'Main' : 'Side ' + i}: ${p.amount.toLocaleString()}</span>`;
            });
            html += '</div>';
        }
        el.innerHTML = html;
    }

    function updateBlindInfo(state) {
        const el = document.getElementById('blind-info');
        if (!el) return;
        el.textContent = `Blinds: ${Game.smallBlind().toLocaleString()} / ${Game.bigBlind().toLocaleString()}`;
    }

    function updateHandInfo(state) {
        const el = document.getElementById('hand-info');
        if (!el) return;
        el.textContent = `Hand #${state.handNumber}`;
    }

    function updateBlindTimer(state) {
        const el = document.getElementById('blind-timer');
        if (!el) return;
        const mins = Math.floor(state.blindTimeRemaining / 60);
        const secs = state.blindTimeRemaining % 60;
        el.textContent = `Next level: ${mins}:${secs.toString().padStart(2, '0')}`;
        el.className = state.blindTimeRemaining <= 30 ? 'timer-warning' : '';
    }

    function updatePlayer(state, p, i, ackInfo = null) {
        const section = document.getElementById(`player-${i}`);
        if (!section) return;

        const isActive = state.activePlayerIndex === i && !p.eliminated && !p.folded && !p.allIn;

        // Auto-close history panel when it's this player's turn
        if (isActive && historyOpenFor === i) {
            historyOpenFor = -1;
            const panel = document.getElementById('hand-history-panel');
            if (panel) panel.classList.remove('visible');
        }

        section.className = 'player-section' +
            (isActive ? ' active-player' : '') +
            (p.eliminated ? ' eliminated' : '') +
            (p.folded ? ' folded' : '') +
            (p.allIn ? ' all-in' : '');

        const pos = positions[i];
        if (!pos) return;
        section.style.left = pos.left + '%';
        section.style.top = pos.top + '%';
        section.style.transform = `translate(-50%, -50%) rotate(${pos.rot}deg)`;

        const turnEl = document.getElementById(`turn-${i}`);
        if (turnEl) turnEl.classList.toggle('hidden', !isActive);

        // Badge
        const badge = document.getElementById(`badge-${i}`);
        if (badge && !p.eliminated) {
            const active = Game.activePlayers();
            const isHeadsUp = active.length === 2;
            let badges = [];
            if (p.isAI) badges.push('AI');
            if (state.dealerIndex === i) badges.push('D');
            let sbIdx, bbIdx;
            if (isHeadsUp) {
                sbIdx = state.dealerIndex;
                bbIdx = Game.nextActiveFrom(state.dealerIndex);
            } else {
                sbIdx = Game.nextActiveFrom(state.dealerIndex);
                bbIdx = Game.nextActiveFrom(sbIdx);
            }
            if (sbIdx === i) badges.push('SB');
            if (bbIdx === i) badges.push('BB');
            badge.innerHTML = badges.map(b =>
                `<span class="badge badge-${b.toLowerCase()}">${b}</span>`
            ).join(' ');
        } else if (badge) {
            badge.innerHTML = '';
        }

        // Cards (or inline hand history)
        const cardsEl = document.getElementById(`cards-${i}`);
        if (cardsEl) {
            if (dealAnim && dealAnim.handNumber === state.handNumber) {
                // During deal animation: show only the card backs that have arrived so far
                const arrivedCount = dealAnim.dealtTo[i] || 0;
                cardsEl.innerHTML = Array.from({ length: arrivedCount }, () => renderCard(null, false)).join('');
            } else if (historyOpenFor === i) {
                cardsEl.innerHTML = buildHandHistoryInline(p, state);
            } else if (p.eliminated || p.cards.length === 0) {
                cardsEl.innerHTML = '';
            } else if ((state.phase === 'showdown') && !p.folded) {
                cardsEl.innerHTML = p.cards.map(c => renderCard(c, true)).join('');
            } else if (Controls.isPeeking(i)) {
                cardsEl.innerHTML = p.cards.map(c => renderCard(c, true)).join('');
            } else {
                cardsEl.innerHTML = p.cards.map(() => renderCard(null, false)).join('');
            }
        }

        // Chips
        const chipsEl = document.getElementById(`chips-${i}`);
        if (chipsEl) {
            if (p.eliminated) {
                chipsEl.innerHTML = '';
            } else {
                chipsEl.innerHTML = `${renderChips(p.chips)}<div class="chips-total">${p.chips.toLocaleString()}</div>`;
            }
        }

        // Bet label — floats above the box; during showdown/handOver shows hand result instead
        const betEl = document.getElementById(`bet-${i}`);
        if (betEl) {
            const inFinish = state.phase === 'showdown' || state.phase === 'handOver';
            // Suppress result announcement while community cards are still being revealed
            const revealPending = inFinish && (commAnimating || commRevealedCount < state.communityCards.length);
            if (inFinish && state.showdownResults && !p.eliminated && !revealPending) {
                let isWinner = false, winnerHand = null, loserHand = null;
                for (const r of state.showdownResults) {
                    const w = r.winners.find(w => w.seatIndex === i);
                    if (w) { isWinner = true; winnerHand = w.hand; break; }
                }
                if (!isWinner && state.phase === 'showdown') {
                    for (const r of state.showdownResults) {
                        const h = r.allHands && r.allHands.find(h => h.seatIndex === i);
                        if (h && !p.folded) { loserHand = h.hand; break; }
                    }
                }
                if (isWinner) {
                    betEl.textContent = winnerHand ? `\u2605 ${winnerHand.handName}` : '\u2605 WINS POT';
                    betEl.className = 'player-bet-label player-result-winner';
                } else if (loserHand) {
                    betEl.textContent = loserHand.handName;
                    betEl.className = 'player-bet-label player-result-loser';
                } else {
                    betEl.textContent = '';
                    betEl.className = 'player-bet-label';
                }
            } else {
                const activeBettingPhase = ['preflop', 'flop', 'turn', 'river'].includes(state.phase);
                const hasAmount = activeBettingPhase && p.bet > 0 && p.lastAction !== 'CHECK' && p.lastAction !== 'FOLD';
                const hasAction = activeBettingPhase && p.lastAction;
                if (hasAction || hasAmount) {
                    const actionKey = p.lastAction ? p.lastAction.toLowerCase().replace('-','') : '';
                    const actionHtml = hasAction
                        ? `<span class="bet-action-word action-${actionKey}">${p.lastAction}</span>`
                        : '';
                    const amountHtml = hasAmount
                        ? `<span class="bet-amount-word">${p.bet.toLocaleString()}</span>`
                        : '';
                    betEl.innerHTML = actionHtml + amountHtml;
                    betEl.className = 'player-bet-label';
                } else {
                    betEl.textContent = '';
                    betEl.className = 'player-bet-label';
                }
                lastRenderedBets[i] = hasAmount ? p.bet : 0;
            }
        }

        // Keys
        const keysEl = document.getElementById(`keys-${i}`);
        if (keysEl) {
            const inFinish = state.phase === 'showdown' || state.phase === 'handOver';
            if (p.eliminated) {
                keysEl.innerHTML = '';
            } else if (inFinish) {
                const revealPending = commAnimating || commRevealedCount < state.communityCards.length;
                if (!revealPending && ackInfo && ackInfo.playersToAck.includes(i)) {
                    const hasAcked = ackInfo.ackedPlayers.has(i);
                    keysEl.innerHTML = hasAcked
                        ? '<span class="ack-waiting">Waiting for others\u2026</span>'
                        : `<span class="ack-prompt" data-ack-player="${i}">Press any key to continue</span>`;
                } else if (revealPending) {
                    keysEl.innerHTML = ''; // hold until all cards are shown
                }
            } else if (isActive) {
                if (p.isAI) {
                    keysEl.innerHTML = '<span class="ai-thinking">&#129302; Thinking\u2026</span>';
                } else {
                    const labels = Controls.getKeyLabels(i);
                    const keys = Controls.getKeyMap(i);
                    keysEl.innerHTML = labels.map((label, k) =>
                        `<span class="key-label" data-player="${i}" data-keyindex="${k}"><kbd>${keys[k].toUpperCase()}</kbd><span class="key-action">${label}</span></span>`
                    ).join('');
                }
            } else if (!p.isAI) {
                const keys = Controls.getKeyMap(i);
                keysEl.innerHTML =
                    `<span class="key-label peek-only"><kbd>${keys[0].toUpperCase()}</kbd><span class="key-action">PEEK</span></span>` +
                    `<span class="key-label peek-only"><kbd>${keys[1].toUpperCase()}</kbd><span class="key-action">HISTORY</span></span>`;
            } else {
                keysEl.innerHTML = ''; // AI players have no keyboard controls
            }
        }

        // Sizing
        const sizingEl = document.getElementById(`sizing-${i}`);
        if (sizingEl) {
            if (state.betSizingMode && state.betSizingPlayer === i) {
                sizingEl.classList.remove('hidden');
                sizingEl.innerHTML = `<div class="sizing-amount">${state.betSizingAmount.toLocaleString()}</div>`;
            } else {
                sizingEl.classList.add('hidden');
            }
        }

        // Status
        const statusEl = document.getElementById(`status-${i}`);
        if (statusEl) {
            if (p.eliminated) {
                statusEl.textContent = `BUSTED ${getOrdinal(p.finishPosition)}`;
                statusEl.className = 'player-status busted';
            } else if (p.allIn) {
                statusEl.textContent = 'ALL-IN';
                statusEl.className = 'player-status allin-status';
            } else if (p.folded) {
                statusEl.textContent = 'FOLDED';
                statusEl.className = 'player-status folded-status';
            } else {
                statusEl.textContent = '';
                statusEl.className = 'player-status';
            }
        }
    }

    // Map game rank (2–14) to SVG filename rank letter
    function rankToSvgKey(rank) {
        if (rank === 14) return 'A';
        if (rank === 10) return 'T';
        if (rank === 11) return 'J';
        if (rank === 12) return 'Q';
        if (rank === 13) return 'K';
        return String(rank);
    }

    function renderCard(card, faceUp) {
        if (!faceUp || !card) {
            return `<img src="cards/1B.svg" class="card card-back-img" draggable="false">`;
        }
        const suit   = CONSTANTS.SUITS[card.suit];           // 'hearts' / 'diamonds' / …
        const sLetter = suit[0].toUpperCase();                // H / D / C / S
        const rLetter = rankToSvgKey(card.rank);
        return `<img src="cards/${rLetter}${sLetter}.svg" class="card card-img" draggable="false">`;
    }

    // ---- HAND HISTORY (inline in card box) ----
    function toggleHandHistory(playerIndex, state) {
        historyOpenFor = (historyOpenFor === playerIndex) ? -1 : playerIndex;
        updateTable(state);
    }

    function buildHandHistoryInline(p, state) {
        const history = (p.handHistory || [])
            .filter(e => e.handNum !== state.handNumber)  // exclude current hand
            .slice(-5).reverse();                          // most recent first

        if (history.length === 0) {
            return '<div class="hh-inline"><span class="hh-no-history">No past hands</span></div>';
        }

        const rows = history.map(entry => {
            const cardsHtml = entry.cards.map(c => renderCard(c, true)).join('');
            return `<div class="hh-row">
                <span class="hh-row-label">H${entry.handNum}</span>
                <div class="hh-row-cards">${cardsHtml}</div>
            </div>`;
        }).join('');

        return `<div class="hh-inline">${rows}</div>`;
    }

    // ---- CONFIRM DIALOG ----
    function showConfirmDialog(message, onConfirm, onCancel) {
        const overlay = document.getElementById('settings-overlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <p class="confirm-msg">${escHtml(message)}</p>
                <div class="confirm-btns">
                    <button id="confirmYes" class="confirm-btn confirm-btn-yes">Yes, Quit</button>
                    <button id="confirmNo"  class="confirm-btn confirm-btn-no">Cancel</button>
                </div>
            </div>
        `;
        overlay.querySelector('#confirmYes').addEventListener('click', () => {
            overlay.classList.add('hidden');
            onConfirm?.();
        });
        overlay.querySelector('#confirmNo').addEventListener('click', () => {
            overlay.classList.add('hidden');
            onCancel?.();
        });
    }

    // ---- SETTINGS OVERLAY ----
    function showSettingsOverlay(state) {
        const overlay = document.getElementById('settings-overlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');

        const blindMins = Math.floor(state.blindDuration / 60);
        const blindSecs = state.blindDuration % 60;

        overlay.innerHTML = `
            <div class="settings-panel">
                <h2>Settings</h2>

                <div class="settings-section">
                    <h3>Player Names</h3>
                    <div class="settings-names">
                        ${state.players.map((p, i) => `
                            <div class="settings-name-row">
                                <span class="seat-num">P${i+1}</span>
                                <input type="text" class="settings-name-input" data-index="${i}"
                                    value="${escHtml(p.name)}" maxlength="12"
                                    ${p.eliminated ? 'disabled' : ''}>
                                ${p.eliminated ? '<span class="eliminated-tag">OUT</span>' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="settings-section">
                    <h3>Blind Timer</h3>
                    <div class="settings-timer-row">
                        <label>Level duration:</label>
                        <input type="number" id="settingsBlindMins" value="${blindMins}" min="1" max="60" style="width:60px"> min
                        <input type="number" id="settingsBlindSecs" value="${blindSecs}" min="0" max="59" style="width:60px"> sec
                    </div>
                    <div class="settings-timer-row">
                        <label>Current blind level:</label>
                        <span>${Game.smallBlind()} / ${Game.bigBlind()}</span>
                        <button id="blindUpBtn" class="small-btn">Advance Blinds</button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>Table Colour</h3>
                    <div class="bg-row">
                        ${BG_PRESETS.map((p, i) =>
                            `<button class="bg-btn settings-bg-btn ${i===currentBgIndex?'active':''}"
                                data-bg="${i}" style="background:${p.color}" title="${p.name}"></button>`
                        ).join('')}
                    </div>
                </div>

                <div class="settings-section">
                    <h3>Save Game</h3>
                    <div class="save-game-row">
                        <input type="text" id="saveGameName" placeholder="Save name..." maxlength="30">
                        <button id="saveGameBtn" class="small-btn">Save</button>
                    </div>
                    <div id="saveConfirm" class="save-confirm hidden"></div>
                </div>

                <div class="settings-buttons">
                    <button id="settingsResumeBtn" class="start-btn">Resume Game</button>
                    <button id="settingsMenuBtn" class="menu-btn">Back to Menu</button>
                </div>
            </div>
        `;

        // Bg colour buttons
        overlay.querySelectorAll('.settings-bg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('.settings-bg-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentBgIndex = parseInt(btn.dataset.bg);
                applyBg(currentBgIndex);
            });
        });

        // Advance blinds
        document.getElementById('blindUpBtn')?.addEventListener('click', () => {
            Game.advanceBlindLevel();
            showSettingsOverlay(Game.getState()); // refresh
        });

        // Save game
        document.getElementById('saveGameBtn')?.addEventListener('click', () => {
            const name = document.getElementById('saveGameName').value.trim();
            if (!name) { document.getElementById('saveGameName').focus(); return; }
            SaveLoad.save(name, Game.getState(), currentBgIndex);
            const confirm = document.getElementById('saveConfirm');
            if (confirm) {
                confirm.textContent = `Saved "${name}"!`;
                confirm.classList.remove('hidden');
                setTimeout(() => confirm.classList.add('hidden'), 2000);
            }
        });

        // Resume
        document.getElementById('settingsResumeBtn')?.addEventListener('click', () => {
            // Apply name changes
            const inputs = overlay.querySelectorAll('.settings-name-input');
            inputs.forEach(inp => {
                const idx = parseInt(inp.dataset.index);
                const newName = inp.value.trim();
                if (newName && !state.players[idx].eliminated) {
                    state.players[idx].name = newName;
                    const nameEl = document.querySelector(`#player-${idx} .player-name`);
                    if (nameEl) nameEl.textContent = newName;
                }
            });

            // Apply timer duration change
            const mins = parseInt(document.getElementById('settingsBlindMins')?.value) || 0;
            const secs = parseInt(document.getElementById('settingsBlindSecs')?.value) || 0;
            const newDuration = mins * 60 + secs;
            if (newDuration > 0) {
                state.blindDuration = newDuration;
            }

            overlay.classList.add('hidden');
            App.togglePause(false); // force unpause
        });

        // Back to menu
        document.getElementById('settingsMenuBtn')?.addEventListener('click', () => {
            if (confirm('Return to menu? Unsaved progress will be lost.')) {
                overlay.classList.add('hidden');
                Game.stopBlindTimer();
                Controls.destroy();
                App.start();
            }
        });
    }

    function recordHandResult(state) {
        // Only process once per hand
        if (state.handNumber === overlayShownForHand) return;
        overlayShownForHand = state.handNumber;

        if (!state.showdownResults) return;
        const result = state.showdownResults[0];
        if (!result) return;

        // Save for last-hand display pill
        lastHandResult = result;
    }

    function updateLastHandDisplay(state) {
        const el = document.getElementById('last-hand-display');
        if (!el) return;
        const showIn = ['preflop','flop','turn','river','idle'];
        if (!showIn.includes(state.phase) || !lastHandResult) {
            el.classList.add('hidden');
            return;
        }
        const winner = lastHandResult.winners[0];
        const hand   = winner && winner.hand;
        const winnerName = lastHandResult.winners.map(w => w.name).join(' & ');
        const handText   = hand ? hand.description : 'uncontested';
        el.classList.remove('hidden');
        el.innerHTML = `<div class="last-hand-pill">
            <span class="last-hand-label">Last Hand</span>
            <span class="last-hand-text">
                <span class="lh-winner">${escHtml(winnerName)}</span>
                &nbsp;&middot;&nbsp;<span class="lh-hand">${escHtml(handText)}</span>
            </span>
        </div>`;
    }

    function showBlindAlert(sb, bb) {
        const el = document.getElementById('blind-alert');
        if (!el) return;
        el.textContent = `BLINDS UP! Now ${sb.toLocaleString()} / ${bb.toLocaleString()}`;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 3000);
    }

    function showGameOver(state, onNewGame) {
        const el = document.getElementById('showdown-info');
        if (!el) return;
        el.classList.remove('hidden');

        const winner = state.players.find(p => !p.eliminated);
        const sorted = [...state.players].sort((a, b) => a.finishPosition - b.finishPosition);

        el.innerHTML = `<div class="game-over">
            <h2>\u{1F3C6} ${escHtml(winner.name)} WINS! \u{1F3C6}</h2>
            <div class="final-standings">
                <h3>Final Standings</h3>
                ${sorted.map(p => `<div class="standing">${getOrdinal(p.finishPosition)} \u2014 ${escHtml(p.name)}</div>`).join('')}
            </div>
            <button id="newGameBtn" class="start-btn">NEW GAME</button>
        </div>`;

        document.getElementById('newGameBtn')?.addEventListener('click', onNewGame);
    }

    function getOrdinal(n) {
        if (!n) return '';
        const s = ['th','st','nd','rd'];
        const v = n % 100;
        return n + (s[(v-20)%10] || s[v] || s[0]);
    }

    function escHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function setCurrentBgIndex(idx) { currentBgIndex = idx; }
    function getCurrentBgIndex() { return currentBgIndex; }

    // ---- DEAL ANIMATION ----
    function animateDeal(state) {
        const active = state.players.filter(p => !p.eliminated);
        if (!active.length) return;

        // Initialise per-player dealt counts
        dealAnim = { handNumber: state.handNumber, dealtTo: {} };
        active.forEach(p => { dealAnim.dealtTo[p.seatIndex] = 0; });

        // Build deal sequence: twice around table in seat order
        const seq = [];
        for (let round = 0; round < 2; round++) {
            for (const p of active) seq.push(p.seatIndex);
        }

        // Show table with 0 cards so the deal animation builds them up
        updateTable(state, null);

        const CX = window.innerWidth  / 2;
        const CY = window.innerHeight / 2;
        const CW = 52, CH = 76; // flying card dimensions

        let idx = 0;
        function dealOne() {
            if (!dealAnim) return; // cancelled (e.g. game reset)
            if (idx >= seq.length) {
                dealAnim = null;
                updateTable(Game.getState(), null);
                return;
            }

            const pi      = seq[idx];
            const section = document.getElementById(`player-${pi}`);
            if (!section) { idx++; dealOne(); return; }

            const rect  = section.getBoundingClientRect();
            const destX = rect.left + rect.width  / 2 - CW / 2;
            const destY = rect.top  + rect.height / 2 - CH / 2;

            // Create a flying card-back element at table centre
            const fly = document.createElement('div');
            fly.className = 'flying-deal-card';
            fly.innerHTML = '<img src="cards/1B.svg" style="width:100%;height:100%;display:block;">';
            fly.style.left = `${CX - CW / 2}px`;
            fly.style.top  = `${CY - CH / 2}px`;
            document.body.appendChild(fly);

            // Force reflow so the browser commits the initial position as the "from" state
            // before we add the transition class. Without this, rapid card creation means
            // the browser collapses the append + transition into one frame and skips animating.
            void fly.offsetWidth;
            fly.classList.add('flying-deal-card--go');
            fly.style.transform = `translate(${destX - (CX - CW/2)}px, ${destY - (CY - CH/2)}px)`;

            setTimeout(() => {
                fly.remove();
                if (!dealAnim) return; // cancelled mid-animation (e.g. game reset)
                dealAnim.dealtTo[pi] = (dealAnim.dealtTo[pi] || 0) + 1;
                // Update just that player's card area
                const cardsEl = document.getElementById(`cards-${pi}`);
                if (cardsEl) {
                    const count = dealAnim.dealtTo[pi];
                    cardsEl.innerHTML = Array.from({ length: count }, () => renderCard(null, false)).join('');
                }
                Audio.cardFlip();
                idx++;
                setTimeout(dealOne, 60); // 60ms gap between successive cards
            }, 280);
        }

        dealOne();
    }

    // ---- BET COLLECTION ANIMATION ----
    // Called when a betting round ends (phase change detected in updateTable).
    // Animates chip stacks flying from each player's bet label to the pot display,
    // like a dealer sweeping chips into the middle of the table.
    function animateBetCollection(bets) {
        const potEl = document.getElementById('pot-display');
        if (!potEl) return;
        const potRect = potEl.getBoundingClientRect();
        const toX = potRect.left + potRect.width  / 2;
        const toY = potRect.top  + potRect.height / 2;

        let anyBet = false;
        Object.entries(bets).forEach(([idxStr, amount]) => {
            if (!amount) return;
            anyBet = true;
            const betEl = document.getElementById(`bet-${idxStr}`);
            if (!betEl) return;
            const betRect = betEl.getBoundingClientRect();

            const fly = document.createElement('div');
            fly.className = 'flying-chip-push';
            fly.innerHTML = renderChips(amount);
            fly.style.left = '-9999px';
            fly.style.top  = '-9999px';
            document.body.appendChild(fly);

            const fw = fly.offsetWidth;
            const fh = fly.offsetHeight;
            const fromX = betRect.left + betRect.width  / 2;
            const fromY = betRect.top  + betRect.height / 2;

            fly.style.left = `${fromX - fw / 2}px`;
            fly.style.top  = `${fromY - fh / 2}px`;

            void fly.offsetWidth;
            fly.classList.add('flying-chip-push--go');
            fly.style.transform = `translate(${toX - fromX}px, ${toY - fromY}px)`;

            setTimeout(() => fly.remove(), 380);
        });

        if (anyBet) Audio.chipPush();
    }

    // ---- CHIP PUSH ANIMATION ----
    // Called after Game.confirmBet() — animates a chip stack flying from the
    // player's chip pile (fromRect captured before the state update) to the
    // bet label above the player box.
    function animateChipPush(playerIdx, amount, fromRect) {
        const betEl = document.getElementById(`bet-${playerIdx}`);
        if (!betEl || !fromRect || amount <= 0) return;

        const toRect = betEl.getBoundingClientRect();
        const fromX = fromRect.left + fromRect.width  / 2;
        const fromY = fromRect.top  + fromRect.height / 2;
        const toX   = toRect.left   + toRect.width    / 2;
        const toY   = toRect.top    + toRect.height   / 2;

        const fly = document.createElement('div');
        fly.className = 'flying-chip-push';
        fly.innerHTML = renderChips(amount);

        // Append off-screen first to measure dimensions, then reposition
        fly.style.left = '-9999px';
        fly.style.top  = '-9999px';
        document.body.appendChild(fly);

        const fw = fly.offsetWidth;
        const fh = fly.offsetHeight;

        fly.style.left = `${fromX - fw / 2}px`;
        fly.style.top  = `${fromY - fh / 2}px`;

        const dx = toX - fromX;
        const dy = toY - fromY;

        requestAnimationFrame(() => {
            fly.classList.add('flying-chip-push--go');
            fly.style.transform = `translate(${dx}px, ${dy}px)`;
            setTimeout(() => {
                Audio.chipPush();
                fly.remove();
            }, 340);
        });
    }

    // ---- HAND RANKING REFERENCE SHEET ----
    // Shown as a fixed side panel whenever a player's hand history is open.
    // suit indices: 0=hearts(red), 1=diamonds(red), 2=clubs(dark), 3=spades(dark)
    function buildHandRankSheet() {
        const HANDS = [
            { rank:  1, name: 'Royal Flush',     desc: 'A K Q J 10, same suit',   cards: [{r:14,s:3},{r:13,s:3},{r:12,s:3},{r:11,s:3},{r:10,s:3}] },
            { rank:  2, name: 'Straight Flush',  desc: 'Five in a row, same suit', cards: [{r:9,s:0},{r:8,s:0},{r:7,s:0},{r:6,s:0},{r:5,s:0}] },
            { rank:  3, name: 'Four of a Kind',  desc: 'Four matching ranks',      cards: [{r:14,s:0},{r:14,s:1},{r:14,s:2},{r:14,s:3},{r:13,s:3}] },
            { rank:  4, name: 'Full House',      desc: 'Three + a pair',           cards: [{r:13,s:0},{r:13,s:2},{r:13,s:3},{r:12,s:0},{r:12,s:1}] },
            { rank:  5, name: 'Flush',           desc: 'Five cards, same suit',    cards: [{r:14,s:1},{r:11,s:1},{r:9,s:1},{r:4,s:1},{r:2,s:1}] },
            { rank:  6, name: 'Straight',        desc: 'Five in a row, any suits', cards: [{r:10,s:3},{r:9,s:0},{r:8,s:1},{r:7,s:2},{r:6,s:3}] },
            { rank:  7, name: 'Three of a Kind', desc: 'Three matching ranks',     cards: [{r:8,s:0},{r:8,s:2},{r:8,s:3},{r:14,s:1},{r:13,s:3}] },
            { rank:  8, name: 'Two Pair',        desc: 'Two different pairs',      cards: [{r:14,s:0},{r:14,s:3},{r:13,s:1},{r:13,s:2},{r:9,s:3}] },
            { rank:  9, name: 'One Pair',        desc: 'Two matching ranks',       cards: [{r:11,s:0},{r:11,s:3},{r:14,s:1},{r:13,s:2},{r:12,s:3}] },
            { rank: 10, name: 'High Card',       desc: 'Best single card wins',   cards: [{r:14,s:3},{r:13,s:0},{r:11,s:1},{r:8,s:2},{r:3,s:3}] },
        ];
        const rows = HANDS.map(h => {
            const cardsHtml = h.cards.map(c => renderCard({ rank: c.r, suit: c.s }, true)).join('');
            return `<div class="hr-row">
                <div class="hr-info">
                    <span class="hr-rank-num">${h.rank}</span>
                    <div class="hr-text">
                        <div class="hr-name">${h.name}</div>
                        <div class="hr-desc">${h.desc}</div>
                    </div>
                </div>
                <div class="hr-cards">${cardsHtml}</div>
            </div>`;
        }).join('');
        return `<div class="hr-title">&#9824; Hand Rankings <span class="hr-subtitle">(best \u2192 worst)</span></div>${rows}`;
    }

    function isCardsAnimating() {
        return commAnimating;
    }

    return {
        showConfig, showTable, updateTable, showBlindAlert, showGameOver,
        applyBg, setCurrentBgIndex, getCurrentBgIndex, BG_PRESETS,
        toggleHandHistory, animateDeal, animateChipPush, isCardsAnimating
    };
})();
