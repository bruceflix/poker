// ui.js — Table rendering, config screen, settings overlay, save/load

const UI = (() => {
    // Seat positions: [left%, top%, rotation degrees]
    // Pulled inward from edges so sections never clip at 1080p
    const SEAT_POSITIONS = [
        { left: 22, top: 85, rot: 0 },      // P1: bottom-left
        { left: 8,  top: 62, rot: 90 },      // P2: left-lower
        { left: 8,  top: 30, rot: 90 },      // P3: left-upper
        { left: 22, top: 12, rot: 180 },     // P4: top-left
        { left: 60, top: 12, rot: 180 },     // P5: top-right
        { left: 82, top: 30, rot: 270 },     // P6: right-upper
        { left: 82, top: 62, rot: 270 },     // P7: right-lower
        { left: 60, top: 85, rot: 0 },       // P8: bottom-right
    ];

    function getPositionsForCount(n) {
        if (n >= 8) return SEAT_POSITIONS.slice(0, 8);
        const mapping = {
            2: [0, 4],
            3: [0, 3, 5],
            4: [0, 2, 4, 6],
            5: [0, 2, 3, 5, 7],
            6: [0, 1, 3, 4, 6, 7],
            7: [0, 1, 2, 4, 5, 6, 7],
        };
        return (mapping[n] || []).map(i => SEAT_POSITIONS[i]);
    }

    let positions = [];
    let bgColor = '#0d4b1e'; // default green
    let lastHandResult = null;
    let overlayShownForHand = -1;

    // Traditional poker chip colour scheme
    const CHIP_DENOMS = [
        { v: 25000, bg: '#7B0000', bd: '#C41E3A' },
        { v: 5000,  bg: '#B5006E', bd: '#FF4DB5' },
        { v: 1000,  bg: '#D84315', bd: '#FF8A65' },
        { v: 500,   bg: '#6A1B9A', bd: '#CE93D8' },
        { v: 100,   bg: '#1C1C1C', bd: '#757575' },
        { v: 25,    bg: '#1B5E20', bd: '#66BB6A' },
        { v: 10,    bg: '#0D47A1', bd: '#64B5F6' },
        { v: 5,     bg: '#B71C1C', bd: '#FF7043' },
        { v: 1,     bg: '#CFD8DC', bd: '#90A4AE' },
    ];

    function renderChipDots(amount) {
        if (!amount || amount <= 0) return '';
        let remaining = amount;
        const dots = [];
        for (const d of CHIP_DENOMS) {
            if (remaining <= 0 || dots.length >= 5) break;
            const count = Math.floor(remaining / d.v);
            if (count > 0) {
                const show = Math.min(count, 2);
                for (let i = 0; i < show && dots.length < 5; i++) {
                    dots.push(`<span class="chip-dot" style="background:${d.bg};border-color:${d.bd}"></span>`);
                }
                remaining -= count * d.v;
            }
        }
        return dots.length ? `<span class="chip-dots">${dots.join('')}</span>` : '';
    }

    const BG_PRESETS = [
        { name: 'Classic Green', color: '#0d4b1e', grad: 'radial-gradient(ellipse at center, #1a6b2e 0%, #0d4b1e 50%, #092f14 100%)' },
        { name: 'Casino Blue', color: '#0a2a4a', grad: 'radial-gradient(ellipse at center, #144a7a 0%, #0a2a4a 50%, #061a30 100%)' },
        { name: 'Royal Purple', color: '#2a0a4a', grad: 'radial-gradient(ellipse at center, #4a1a7a 0%, #2a0a4a 50%, #1a0630 100%)' },
        { name: 'Dark Red', color: '#3a0a0a', grad: 'radial-gradient(ellipse at center, #6a1a1a 0%, #3a0a0a 50%, #200606 100%)' },
        { name: 'Midnight', color: '#0a0a1a', grad: 'radial-gradient(ellipse at center, #1a1a3a 0%, #0a0a1a 50%, #050510 100%)' },
        { name: 'Charcoal', color: '#1a1a1a', grad: 'radial-gradient(ellipse at center, #2a2a2a 0%, #1a1a1a 50%, #0a0a0a 100%)' },
    ];

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

        let savesHtml = '';
        if (saves.length > 0) {
            savesHtml = `
                <div class="config-section">
                    <label>Load Saved Game</label>
                    <div class="saves-list">
                        ${saves.map(s => `
                            <div class="save-row">
                                <button class="save-load-btn" data-save="${escHtml(s.name)}">
                                    <strong>${escHtml(s.name)}</strong>
                                    <small>${s.date} &mdash; Hand #${s.hand}, ${s.playersAlive} players alive</small>
                                </button>
                                <button class="save-delete-btn" data-save="${escHtml(s.name)}" title="Delete">X</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <hr class="config-divider">
            `;
        }

        container.innerHTML = `
            <h1>&#9824; TEXAS HOLD'EM &#9829;</h1>
            <h2>Tournament Setup</h2>

            ${savesHtml}

            <div class="config-section">
                <label>Number of Players</label>
                <div class="player-count-row">
                    ${[2,3,4,5,6,7,8].map(n =>
                        `<button class="count-btn ${n===4?'active':''}" data-count="${n}">${n}</button>`
                    ).join('')}
                </div>
            </div>

            <div class="config-section">
                <label>Player Names</label>
                <div id="playerNameInputs"></div>
            </div>

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
                    <button class="seat-btn active" data-seat="random">Random</button>
                    <button class="seat-btn" data-seat="manual">As Entered</button>
                </div>
            </div>

            <button id="startGameBtn" class="start-btn">DEAL 'EM!</button>
        `;
        app.appendChild(container);

        let playerCount = 4;
        let startingChips = 5000;
        let blindPreset = 'standard';
        let seatMode = 'random';
        currentBgIndex = 0;

        function renderNameInputs() {
            const div = document.getElementById('playerNameInputs');
            div.innerHTML = '';
            for (let i = 0; i < playerCount; i++) {
                const row = document.createElement('div');
                row.className = 'name-input-row';
                const keyHint = Controls.KEY_MAP[i].join(' ').toUpperCase();
                row.innerHTML = `
                    <span class="seat-num">P${i+1}</span>
                    <input type="text" class="player-name-input" data-index="${i}"
                           placeholder="Player ${i+1}" maxlength="12" value="Player ${i+1}">
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
            });
        });

        container.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                startingChips = parseInt(btn.dataset.chips);
                document.getElementById('customChips').value = '';
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

        document.getElementById('startGameBtn').addEventListener('click', () => {
            const inputs = container.querySelectorAll('.player-name-input');
            let names = Array.from(inputs).map(inp => inp.value.trim() || `Player ${parseInt(inp.dataset.index)+1}`);

            if (seatMode === 'random') {
                for (let i = names.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [names[i], names[j]] = [names[j], names[i]];
                }
            }

            onStart({
                playerNames: names,
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

        app.innerHTML = `
            <div id="table">
                <div id="table-controls">
                    <button id="pauseBtn" class="table-btn" title="Pause/Resume">&#9646;&#9646;</button>
                    <button id="settingsBtn" class="table-btn" title="Settings">&#9881;</button>
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

        document.getElementById('pauseBtn').addEventListener('click', () => {
            App.togglePause();
        });
        document.getElementById('settingsBtn').addEventListener('click', () => {
            App.togglePause(true); // force pause
            showSettingsOverlay(state);
        });
    }

    function buildPlayerHTML(p, i) {
        return `
            <div class="your-turn-indicator hidden" id="turn-${i}">&#9658; YOUR TURN</div>
            <div class="player-name">${escHtml(p.name)}</div>
            <div class="player-badge" id="badge-${i}"></div>
            <div class="player-cards" id="cards-${i}"></div>
            <div class="player-chips" id="chips-${i}"></div>
            <div class="player-bet" id="bet-${i}"></div>
            <div class="player-keys" id="keys-${i}"></div>
            <div class="player-bet-sizing hidden" id="sizing-${i}"></div>
            <div class="player-status" id="status-${i}"></div>
        `;
    }

    function updateTable(state) {
        if (!state) return;

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

        state.players.forEach((p, i) => {
            updatePlayer(state, p, i);
        });

        if ((state.phase === 'showdown' || state.phase === 'handOver') && state.showdownResults) {
            showWinnerOverlay(state);
        } else {
            const overlayEl = document.getElementById('winner-overlay');
            if (overlayEl) overlayEl.classList.add('hidden');
        }
        const sd = document.getElementById('showdown-info');
        if (sd && state.phase !== 'gameOver') sd.classList.add('hidden');
        updateLastHandDisplay(state);
    }

    function updateCommunityCards(state) {
        const el = document.getElementById('community-cards');
        if (!el) return;
        el.innerHTML = state.communityCards.map(c => renderCard(c, true)).join('');
        for (let i = state.communityCards.length; i < 5; i++) {
            el.innerHTML += '<div class="card card-slot"></div>';
        }
    }

    function updatePotDisplay(state) {
        const el = document.getElementById('pot-display');
        if (!el) return;
        const totalPot = state.pots.reduce((sum, p) => sum + p.amount, 0) +
                         state.players.reduce((sum, p) => sum + p.bet, 0);
        if (totalPot === 0) { el.innerHTML = ''; return; }

        let html = `<div class="pot-total">POT: ${totalPot.toLocaleString()}</div>`;
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

    function updatePlayer(state, p, i) {
        const section = document.getElementById(`player-${i}`);
        if (!section) return;

        const isActive = state.activePlayerIndex === i && !p.eliminated && !p.folded && !p.allIn;

        section.className = 'player-section' +
            (isActive ? ' active-player' : '') +
            (p.eliminated ? ' eliminated' : '') +
            (p.folded ? ' folded' : '') +
            (p.allIn ? ' all-in' : '');

        const pos = positions[i];
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

        // Cards
        const cardsEl = document.getElementById(`cards-${i}`);
        if (cardsEl) {
            if (p.eliminated || p.cards.length === 0) {
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
                chipsEl.innerHTML = renderChipDots(p.chips) + p.chips.toLocaleString();
            }
        }

        // Bet — only show during active betting phases
        const betEl = document.getElementById(`bet-${i}`);
        if (betEl) {
            const activeBettingPhase = ['preflop', 'flop', 'turn', 'river'].includes(state.phase);
            const showBet = activeBettingPhase && p.bet > 0;
            betEl.textContent = showBet ? `Bet: ${p.bet.toLocaleString()}` : '';
            betEl.className = 'player-bet' + (showBet ? ' has-bet' : '');
        }

        // Keys
        const keysEl = document.getElementById(`keys-${i}`);
        if (keysEl) {
            if (p.eliminated) {
                keysEl.innerHTML = '';
            } else if (isActive) {
                const labels = Controls.getKeyLabels(i);
                const keys = Controls.getKeyMap(i);
                keysEl.innerHTML = labels.map((label, k) =>
                    `<span class="key-label"><kbd>${keys[k].toUpperCase()}</kbd> ${label}</span>`
                ).join('');
            } else {
                const keys = Controls.getKeyMap(i);
                keysEl.innerHTML = `<span class="key-label peek-only"><kbd>${keys[0].toUpperCase()}</kbd> PEEK</span>`;
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

    function renderCard(card, faceUp) {
        if (!faceUp || !card) {
            return '<div class="card card-back"><div class="card-back-pattern"></div></div>';
        }
        const suitClass = Game.SUITS[card.suit];
        const isRed = card.suit <= 1;
        const symbol = Game.RANK_SYMBOLS[card.rank];
        const suitChar = Game.SUIT_SYMBOLS[Game.SUITS[card.suit]];
        return `<div class="card card-face ${suitClass} ${isRed ? 'red' : 'black'}">
            <span class="card-rank">${symbol}</span>
            <span class="card-suit">${suitChar}</span>
        </div>`;
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
            const mins = parseInt(document.getElementById('settingsBlindMins').value) || 0;
            const secs = parseInt(document.getElementById('settingsBlindSecs').value) || 0;
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

    function showWinnerOverlay(state) {
        // Don't recreate if already shown for this hand
        if (state.handNumber === overlayShownForHand) return;
        overlayShownForHand = state.handNumber;

        const overlay = document.getElementById('winner-overlay');
        if (!overlay || !state.showdownResults) return;

        const result = state.showdownResults[0];
        if (!result) return;

        // Save for last-hand display
        lastHandResult = result;

        const isShowdown = state.phase === 'showdown';
        const winnerNames = result.winners.map(w => w.name).join(' & ');
        const hand = result.winners[0].hand;

        // Best 5 winning cards
        let bestCardsHtml = '';
        if (hand && hand.cards && hand.cards.length > 0) {
            bestCardsHtml = `<div class="winner-best-cards">
                ${hand.cards.map(c => renderCard(c, true)).join('')}
            </div>`;
        }

        // Losing hands (showdown only)
        let othersHtml = '';
        if (isShowdown && result.allHands && result.allHands.length > 1) {
            const losers = result.allHands.filter(h =>
                !result.winners.some(w => w.seatIndex === h.seatIndex)
            );
            if (losers.length > 0) {
                othersHtml = `<div class="winner-others">
                    ${losers.map(h =>
                        `<div class="winner-others-entry">${escHtml(h.name)}: ${escHtml(h.hand.description)}</div>`
                    ).join('')}
                </div>`;
            }
        }

        const trophy     = isShowdown ? '&#127942;' : '&#128176;';
        const winsText   = `wins ${result.pot.toLocaleString()} chips${!isShowdown ? ' (uncontested)' : ''}`;
        const handName   = hand ? hand.handName : '';
        const handDetail = hand && hand.description !== handName ? hand.description : '';

        overlay.innerHTML = `<div class="winner-banner">
            <div class="winner-trophy">${trophy}</div>
            <div class="winner-name-big">${escHtml(winnerNames)}</div>
            <div class="winner-wins-amount">${winsText}</div>
            ${handName   ? `<div class="winner-hand-type">${escHtml(handName)}</div>`     : ''}
            ${handDetail ? `<div class="winner-hand-detail">${escHtml(handDetail)}</div>` : ''}
            ${bestCardsHtml}
            ${othersHtml}
        </div>`;

        overlay.classList.remove('hidden');
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

    return {
        showConfig, showTable, updateTable, showBlindAlert, showGameOver,
        applyBg, setCurrentBgIndex, getCurrentBgIndex, BG_PRESETS
    };
})();
