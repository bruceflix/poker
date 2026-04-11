// game.js — Core Texas Hold'em tournament engine

if (typeof CONSTANTS === 'undefined') throw new Error('game.js: constants.js must be loaded first');

const Game = (() => {
    // Card/rank/blind constants live in constants.js — reference via CONSTANTS.*
    const { SUITS, RANK_SYMBOLS, SUIT_SYMBOLS, BLIND_SCHEDULES } = CONSTANTS;

    let state = null;

    function createDeck() {
        const deck = [];
        for (let s = 0; s < 4; s++) {
            for (let r = 2; r <= 14; r++) {
                deck.push({ rank: r, suit: s });
            }
        }
        return deck;
    }

    function shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    function cardStr(c) {
        return RANK_SYMBOLS[c.rank] + SUIT_SYMBOLS[SUITS[c.suit]];
    }

    // Initialize game from config
    function init(config) {
        const { playerNames, startingChips, blindPreset, customBlinds } = config;
        const n = playerNames.length;

        let schedule;
        if (blindPreset === 'custom' && customBlinds) {
            schedule = customBlinds;
        } else {
            schedule = BLIND_SCHEDULES[blindPreset] || BLIND_SCHEDULES.standard;
        }

        state = {
            players: playerNames.map((name, i) => ({
                name,
                chips: startingChips,
                cards: [],
                folded: false,
                allIn: false,
                eliminated: false,
                seatIndex: i,
                bet: 0,
                totalBetThisHand: 0,
                finishPosition: null,
                handHistory: []
            })),
            communityCards: [],
            deck: [],
            pots: [{ amount: 0, eligible: [] }],
            dealerIndex: Math.floor(Math.random() * n),
            activePlayerIndex: -1,
            phase: 'idle', // idle, preflop, flop, turn, river, showdown, handOver, gameOver
            blindLevel: 0,
            blindSchedule: schedule.levels,
            blindDuration: schedule.duration,
            blindTimeRemaining: schedule.duration,
            blindWarningPlayed: false,
            handNumber: 0,
            currentBet: 0,
            minRaise: 0,
            lastRaiserIndex: -1,
            firstActorIndex: -1,
            actedThisRound: new Set(),
            betSizingMode: false,
            betSizingPlayer: -1,
            betSizingAmount: 0,
            showdownResults: null,
            eliminatedThisHand: [],
            totalPlayers: n,
            paused: false,
            blindTimerInterval: null,
            onUpdate: null, // callback for UI updates
        };
        return state;
    }

    // Return a shallow snapshot — callers get fresh array/set references so they
    // cannot accidentally corrupt live state through the returned object.
    function getState() {
        if (!state) return null;
        return {
            ...state,
            players:             state.players.map(p => ({ ...p })),
            communityCards:      [...state.communityCards],
            pots:                state.pots.map(p => ({ ...p, eligible: [...p.eligible] })),
            actedThisRound:      new Set(state.actedThisRound),
            eliminatedThisHand:  [...state.eliminatedThisHand],
        };
    }

    function activePlayers() {
        return state.players.filter(p => !p.eliminated);
    }

    function playersInHand() {
        return state.players.filter(p => !p.eliminated && !p.folded);
    }

    function playersStillBetting() {
        return state.players.filter(p => !p.eliminated && !p.folded && !p.allIn);
    }

    function smallBlind() {
        return state.blindSchedule[Math.min(state.blindLevel, state.blindSchedule.length - 1)][0];
    }

    function bigBlind() {
        return state.blindSchedule[Math.min(state.blindLevel, state.blindSchedule.length - 1)][1];
    }

    // Find next active (non-eliminated) player seat index clockwise from idx
    function nextActiveFrom(idx, skip = 0) {
        let count = 0;
        let i = (idx + 1) % state.players.length;
        while (count < state.players.length * 2) {
            if (!state.players[i].eliminated) {
                if (skip <= 0) return i;
                skip--;
            }
            i = (i + 1) % state.players.length;
            count++;
        }
        return -1;
    }

    // Find next player in hand (not folded, not eliminated) from idx
    function nextInHandFrom(idx) {
        let i = (idx + 1) % state.players.length;
        let count = 0;
        while (count < state.players.length) {
            if (!state.players[i].eliminated && !state.players[i].folded) return i;
            i = (i + 1) % state.players.length;
            count++;
        }
        return -1;
    }

    // Find next player who can still bet (not all-in, not folded, not eliminated)
    function nextBettingFrom(idx) {
        let i = (idx + 1) % state.players.length;
        let count = 0;
        while (count < state.players.length) {
            if (!state.players[i].eliminated && !state.players[i].folded && !state.players[i].allIn) return i;
            i = (i + 1) % state.players.length;
            count++;
        }
        return -1;
    }

    // Start a new hand
    function startHand() {
        state.handNumber++;
        state.deck = shuffle(createDeck());
        state.communityCards = [];
        state.pots = [{ amount: 0, eligible: [] }];
        state.currentBet = 0;
        state.minRaise = bigBlind();
        state.lastRaiserIndex = -1;
        state.showdownResults = null;
        state.eliminatedThisHand = [];
        state.betSizingMode = false;

        // Reset player hand state
        for (const p of state.players) {
            p.cards = [];
            p.folded = false;
            p.allIn = false;
            p.bet = 0;
            p.totalBetThisHand = 0;
        }

        // Move dealer button
        if (state.handNumber > 1) {
            state.dealerIndex = nextActiveFrom(state.dealerIndex);
        }

        const active = activePlayers();
        const isHeadsUp = active.length === 2;

        // Post blinds
        let sbIndex, bbIndex;
        if (isHeadsUp) {
            // Heads-up: dealer posts SB, other posts BB
            sbIndex = state.dealerIndex;
            bbIndex = nextActiveFrom(state.dealerIndex);
        } else {
            sbIndex = nextActiveFrom(state.dealerIndex);
            bbIndex = nextActiveFrom(sbIndex);
        }

        postBlind(sbIndex, smallBlind());
        postBlind(bbIndex, bigBlind());

        state.currentBet = bigBlind();
        state.minRaise = bigBlind();

        // Deal hole cards and record in hand history
        for (const p of activePlayers()) {
            p.cards = [state.deck.pop(), state.deck.pop()];
            p.handHistory.push({ handNum: state.handNumber, cards: [...p.cards] });
            if (p.handHistory.length > 5) p.handHistory.shift();
        }

        // Set first to act pre-flop
        if (isHeadsUp) {
            // Heads-up: dealer (SB) acts first pre-flop
            state.firstActorIndex = sbIndex;
        } else {
            state.firstActorIndex = nextActiveFrom(bbIndex);
        }

        state.actedThisRound = new Set();
        state.activePlayerIndex = state.firstActorIndex;
        state.phase = 'preflop';

        // If active player is all-in from blind, skip to next
        if (state.players[state.activePlayerIndex].allIn) {
            advanceAction();
        }

        notify();
        return { sbIndex, bbIndex };
    }

    function postBlind(playerIndex, amount) {
        const p = state.players[playerIndex];
        const actual = Math.min(amount, p.chips);
        p.chips -= actual;
        p.bet = actual;
        p.totalBetThisHand = actual;
        if (p.chips === 0) p.allIn = true;
    }

    // Player actions
    function fold(playerIndex) {
        if (!canAct(playerIndex)) return false;
        state.players[playerIndex].folded = true;
        // Shallow-clone the Set so we never mutate the existing reference
        state.actedThisRound = new Set([...state.actedThisRound, playerIndex]);
        Audio.fold();

        // Check if only one player remains
        const remaining = playersInHand();
        if (remaining.length === 1) {
            awardPotToLastPlayer(remaining[0]);
            return true;
        }
        advanceAction();
        return true;
    }

    function check(playerIndex) {
        if (!canAct(playerIndex)) return false;
        const p = state.players[playerIndex];
        if (state.currentBet > p.bet) return false; // Must call, not check
        state.actedThisRound = new Set([...state.actedThisRound, playerIndex]);
        Audio.check();
        advanceAction();
        return true;
    }

    function call(playerIndex) {
        if (!canAct(playerIndex)) return false;
        const p = state.players[playerIndex];
        const toCall = state.currentBet - p.bet;
        if (toCall <= 0) return check(playerIndex);

        if (p.chips <= toCall) {
            // All-in call
            return allIn(playerIndex);
        }

        p.chips -= toCall;
        p.bet += toCall;
        p.totalBetThisHand += toCall;
        state.actedThisRound = new Set([...state.actedThisRound, playerIndex]);
        Audio.chipBet();
        advanceAction();
        return true;
    }

    function raise(playerIndex, totalBetAmount) {
        if (!canAct(playerIndex)) return false;
        const p = state.players[playerIndex];
        const raiseBy = totalBetAmount - state.currentBet;

        if (raiseBy < state.minRaise && totalBetAmount < p.chips + p.bet) {
            return false; // Raise too small (unless it's an all-in)
        }
        if (totalBetAmount > p.chips + p.bet) {
            return false; // Can't bet more than you have
        }

        const cost = totalBetAmount - p.bet;
        if (cost >= p.chips) {
            return allIn(playerIndex);
        }

        p.chips -= cost;
        state.minRaise = totalBetAmount - state.currentBet; // New min raise = size of this raise
        state.currentBet = totalBetAmount;
        p.bet = totalBetAmount;
        p.totalBetThisHand += cost;
        state.lastRaiserIndex = playerIndex;

        // Reopens action for everyone except raiser — new Set reference
        state.actedThisRound = new Set([playerIndex]);
        Audio.chipBet();
        advanceAction();
        return true;
    }

    function allIn(playerIndex) {
        if (!canAct(playerIndex)) return false;
        const p = state.players[playerIndex];
        const totalBet = p.bet + p.chips;
        const raiseAmount = totalBet - state.currentBet;

        p.totalBetThisHand += p.chips;
        p.bet = totalBet;
        p.chips = 0;
        p.allIn = true;

        // If it's a full raise, reopen action
        if (raiseAmount >= state.minRaise) {
            state.minRaise = raiseAmount;
            state.currentBet = totalBet;
            state.lastRaiserIndex = playerIndex;
            state.actedThisRound = new Set([playerIndex]);
        } else {
            // Short all-in: update current bet if higher but don't reopen
            if (totalBet > state.currentBet) {
                state.currentBet = totalBet;
            }
            state.actedThisRound = new Set([...state.actedThisRound, playerIndex]);
        }

        Audio.allIn();
        advanceAction();
        return true;
    }

    function canAct(playerIndex) {
        const phase = state.phase;
        if (phase !== 'preflop' && phase !== 'flop' && phase !== 'turn' && phase !== 'river') {
            return false;
        }
        return state.activePlayerIndex === playerIndex &&
               !state.players[playerIndex].eliminated &&
               !state.players[playerIndex].folded &&
               !state.players[playerIndex].allIn;
    }

    function getAvailableActions(playerIndex) {
        if (!canAct(playerIndex)) return [];
        // No actions allowed outside of betting phases
        if (state.phase !== 'preflop' && state.phase !== 'flop' && state.phase !== 'turn' && state.phase !== 'river') {
            return [];
        }
        const p = state.players[playerIndex];
        const actions = [];

        if (state.currentBet > p.bet) {
            actions.push('call');
            actions.push('fold');
        } else {
            actions.push('check');
            // Can still fold even if check is available (though unusual)
            actions.push('fold');
        }

        // Can raise if chips allow
        const costToCall = state.currentBet - p.bet;
        if (p.chips > costToCall) {
            actions.push('raise');
        }

        actions.push('allin');
        return actions;
    }

    function getCallAmount(playerIndex) {
        const p = state.players[playerIndex];
        return Math.min(state.currentBet - p.bet, p.chips);
    }

    function getMinRaise() {
        return state.currentBet + state.minRaise;
    }

    function getMaxRaise(playerIndex) {
        const p = state.players[playerIndex];
        return p.bet + p.chips;
    }

    // Advance to the next player who needs to act, or end the round
    function advanceAction() {
        const betting = playersStillBetting();
        const inHand = playersInHand();

        // If only one player left in hand, they win
        if (inHand.length === 1) {
            awardPotToLastPlayer(inHand[0]);
            return;
        }

        // If no one left to bet (all folded or all-in), run out the board
        if (betting.length === 0) {
            collectBetsIntoPot();
            runOutBoard();
            return;
        }

        // If only one player can bet and they've matched the current bet, end round
        if (betting.length === 1) {
            const sole = betting[0];
            if (sole.bet >= state.currentBet && state.actedThisRound.has(sole.seatIndex)) {
                endBettingRound();
                return;
            }
        }

        // Find next player to act
        let next = state.activePlayerIndex;
        let loops = 0;
        while (loops < state.players.length) {
            next = nextBettingFrom(next);
            if (next === -1) {
                endBettingRound();
                return;
            }
            // Has this player already acted and matched the bet?
            if (state.actedThisRound.has(next) && state.players[next].bet >= state.currentBet) {
                // Check if we've gone around — everyone has acted
                if (allActed()) {
                    endBettingRound();
                    return;
                }
                loops++;
                continue;
            }
            break;
        }

        if (loops >= state.players.length) {
            endBettingRound();
            return;
        }

        state.activePlayerIndex = next;
        notify();
    }

    function allActed() {
        for (const p of playersStillBetting()) {
            if (!state.actedThisRound.has(p.seatIndex) || p.bet < state.currentBet) {
                return false;
            }
        }
        return true;
    }

    function endBettingRound() {
        collectBetsIntoPot();

        const inHand = playersInHand();
        if (inHand.length === 1) {
            awardPotToLastPlayer(inHand[0]);
            return;
        }

        const canStillBet = playersStillBetting();
        if (canStillBet.length <= 1) {
            // Everyone is all-in (or at most one player can still act)
            // If exactly one can bet, they can't bet against themselves — run out
            if (canStillBet.length === 1 && inHand.length > 1) {
                // One player with chips vs all-in players — run out the board
                runOutBoard();
                return;
            } else if (canStillBet.length === 0) {
                runOutBoard();
                return;
            }
        }

        // Advance phase
        advancePhase();
    }

    function advancePhase() {
        state.actedThisRound = new Set();
        state.currentBet = 0;
        state.minRaise = bigBlind();
        state.betSizingMode = false;
        state.betSizingPlayer = -1;

        // Reset bets for new round
        for (const p of state.players) p.bet = 0;

        const isHeadsUp = activePlayers().length === 2;

        // Use spread assignment so each phase transition produces a new array reference,
        // preventing stale references held by callers from reflecting new cards.
        switch (state.phase) {
            case 'preflop':
                state.phase = 'flop';
                state.communityCards = [
                    ...state.communityCards,
                    state.deck.pop(), state.deck.pop(), state.deck.pop()
                ];
                Audio.cardFlip();
                break;
            case 'flop':
                state.phase = 'turn';
                state.communityCards = [...state.communityCards, state.deck.pop()];
                Audio.cardFlip();
                break;
            case 'turn':
                state.phase = 'river';
                state.communityCards = [...state.communityCards, state.deck.pop()];
                Audio.cardFlip();
                break;
            case 'river':
                doShowdown();
                return;
        }

        // Post-flop: first to act is first active player after dealer
        if (isHeadsUp) {
            // Heads-up post-flop: non-dealer acts first
            state.activePlayerIndex = nextActiveFrom(state.dealerIndex);
            // Make sure they're in hand and can bet
            if (state.players[state.activePlayerIndex].folded || state.players[state.activePlayerIndex].allIn) {
                advanceAction();
                return;
            }
        } else {
            let first = nextActiveFrom(state.dealerIndex);
            // Find first non-folded, non-all-in player
            let count = 0;
            while (count < state.players.length) {
                if (!state.players[first].folded && !state.players[first].allIn) break;
                first = nextActiveFrom(first);
                count++;
            }
            state.activePlayerIndex = first;
        }

        state.firstActorIndex = state.activePlayerIndex;

        // Check if active player can actually act
        if (state.players[state.activePlayerIndex].allIn || state.players[state.activePlayerIndex].folded) {
            advanceAction();
        } else {
            notify();
        }
    }

    function runOutBoard() {
        // Build the remaining community cards into a new array — avoids in-place mutation
        // so any caller holding a reference to the old communityCards array is unaffected.
        const cards = [...state.communityCards];
        while (cards.length < 5) {
            cards.push(state.deck.pop());
        }
        state.communityCards = cards;

        if (state.phase !== 'river') {
            state.phase = 'river';
        }
        Audio.cardFlip();
        doShowdown();
    }

    function collectBetsIntoPot() {
        // Build side pots from current bets
        const bettors = state.players.filter(p => p.bet > 0);
        if (bettors.length === 0) return;

        // Get unique bet amounts from all-in players, sorted ascending
        const allInBets = bettors.filter(p => p.allIn).map(p => p.bet);
        const tiers = [...new Set(allInBets)].sort((a, b) => a - b);

        // Also need to handle the case where no one is all-in
        let prevTier = 0;
        for (const tier of tiers) {
            const eligible = state.players.filter(p => !p.eliminated && !p.folded && p.bet > prevTier)
                .map(p => p.seatIndex);
            let potAmount = 0;
            for (const p of bettors) {
                const contribution = Math.min(p.bet, tier) - Math.min(p.bet, prevTier);
                potAmount += contribution;
            }
            if (potAmount > 0) {
                addToPots(potAmount, eligible);
            }
            prevTier = tier;
        }

        // Remaining bets above the highest all-in tier
        const eligible = state.players.filter(p => !p.eliminated && !p.folded && p.bet > prevTier)
            .map(p => p.seatIndex);
        let remaining = 0;
        for (const p of bettors) {
            remaining += Math.max(0, p.bet - prevTier);
        }
        if (remaining > 0) {
            addToPots(remaining, eligible);
        }

        // Clear bets
        for (const p of state.players) p.bet = 0;
    }

    function addToPots(amount, eligible) {
        // Try to merge with last pot if same eligible set
        const last = state.pots[state.pots.length - 1];
        const sameEligible = last && last.eligible.length === eligible.length &&
            last.eligible.every(e => eligible.includes(e));
        if (sameEligible) {
            // Replace last pot with updated amount — new object reference
            state.pots = [
                ...state.pots.slice(0, -1),
                { ...last, amount: last.amount + amount }
            ];
        } else {
            state.pots = [...state.pots, { amount, eligible: [...eligible] }];
        }
    }

    function doShowdown() {
        state.phase = 'showdown';
        collectBetsIntoPot();

        // Clean up empty pots and the initial empty pot
        state.pots = state.pots.filter(p => p.amount > 0);

        const results = [];

        for (const pot of state.pots) {
            const contenders = pot.eligible
                .map(i => state.players[i])
                .filter(p => !p.folded);

            if (contenders.length === 0) continue;

            // Evaluate hands
            const evals = contenders.map(p => ({
                player: p,
                eval: HandEvaluator.evaluate([...p.cards, ...state.communityCards])
            }));

            // Sort by best hand
            evals.sort((a, b) => HandEvaluator.compareScores(b.eval.score, a.eval.score));

            // Find winners (could be ties)
            const bestScore = evals[0].eval.score;
            const winners = evals.filter(e => HandEvaluator.compareScores(e.eval.score, bestScore) === 0);

            const share = Math.floor(pot.amount / winners.length);
            let remainder = pot.amount - share * winners.length;

            // Remainder chip goes to closest to dealer's left
            for (const w of winners) {
                w.player.chips += share;
            }

            if (remainder > 0) {
                // Give remainder to player closest to dealer's left
                const dealerLeft = getClosestToLeft(winners.map(w => w.player.seatIndex), state.dealerIndex);
                state.players[dealerLeft].chips += remainder;
            }

            results.push({
                pot: pot.amount,
                winners: winners.map(w => ({
                    name: w.player.name,
                    seatIndex: w.player.seatIndex,
                    hand: w.eval
                })),
                allHands: evals.map(e => ({
                    name: e.player.name,
                    seatIndex: e.player.seatIndex,
                    hand: e.eval
                }))
            });
        }

        state.showdownResults = results;
        Audio.win();
        notify();
    }

    function getClosestToLeft(seatIndices, dealerIndex) {
        let i = (dealerIndex + 1) % state.players.length;
        while (true) {
            if (seatIndices.includes(i)) return i;
            i = (i + 1) % state.players.length;
        }
    }

    function awardPotToLastPlayer(player) {
        collectBetsIntoPot();
        let total = 0;
        for (const pot of state.pots) total += pot.amount;
        player.chips += total;
        state.pots = [{ amount: 0, eligible: [] }];
        state.phase = 'handOver';
        state.showdownResults = [{ pot: total, winners: [{ name: player.name, seatIndex: player.seatIndex }] }];
        if (total > 0) Audio.win();
        notify();
    }

    function finishHand() {
        // Check for eliminated players
        const remainingActive = activePlayers();
        const elimOrder = remainingActive.filter(p => p.chips === 0);

        for (const p of elimOrder) {
            p.eliminated = true;
            const remainingNow = state.players.filter(pp => !pp.eliminated).length;
            p.finishPosition = remainingNow + 1;
            // Spread assignment — new array reference each elimination
            state.eliminatedThisHand = [...state.eliminatedThisHand, p];
            Audio.playerBust();
        }

        // Check for winner
        const alive = activePlayers();
        if (alive.length === 1) {
            alive[0].finishPosition = 1;
            state.phase = 'gameOver';
            Audio.gameOver();
            notify();
            return;
        }

        state.phase = 'idle';
        notify();
    }

    // Blind timer
    function startBlindTimer() {
        if (state.blindTimerInterval) clearInterval(state.blindTimerInterval);
        state.blindTimeRemaining = state.blindDuration;
        state.blindWarningPlayed = false;

        state.blindTimerInterval = setInterval(() => {
            if (state.paused || state.phase === 'gameOver') return;
            state.blindTimeRemaining--;

            if (state.blindTimeRemaining <= 30 && !state.blindWarningPlayed) {
                state.blindWarningPlayed = true;
                Audio.blindsWarning();
            }

            if (state.blindTimeRemaining <= 0) {
                advanceBlindLevel();
            }
            notify();
        }, 1000);
    }

    function advanceBlindLevel() {
        if (state.blindLevel < state.blindSchedule.length - 1) {
            state.blindLevel++;
        }
        state.blindTimeRemaining = state.blindDuration;
        state.blindWarningPlayed = false;
        Audio.blindsUp();
        notify();
    }

    function stopBlindTimer() {
        if (state.blindTimerInterval) {
            clearInterval(state.blindTimerInterval);
            state.blindTimerInterval = null;
        }
    }

    // Bet sizing helpers
    function enterBetSizing(playerIndex) {
        const minBet = getMinRaise();
        state.betSizingMode = true;
        state.betSizingPlayer = playerIndex;
        state.betSizingAmount = Math.min(minBet, state.players[playerIndex].chips + state.players[playerIndex].bet);
        notify();
    }

    function adjustBet(delta) {
        if (!state.betSizingMode) return;
        const p = state.players[state.betSizingPlayer];
        const maxBet = p.chips + p.bet;
        const minBet = Math.min(getMinRaise(), maxBet); // can't require more chips than player has
        const bb = bigBlind();
        state.betSizingAmount = Math.max(minBet, Math.min(maxBet, state.betSizingAmount + delta * bb));
        notify();
    }

    function cancelBetSizing() {
        state.betSizingMode = false;
        state.betSizingPlayer = -1;
        notify();
    }

    function confirmBet() {
        if (!state.betSizingMode) return false;
        const pi = state.betSizingPlayer;
        const amount = state.betSizingAmount;
        state.betSizingMode = false;
        state.betSizingPlayer = -1;
        return raise(pi, amount);
    }

    function notify() {
        if (state.onUpdate) state.onUpdate(state);
    }

    function setUpdateCallback(cb) {
        state.onUpdate = cb;
    }

    function setPaused(val) {
        if (!state) return;
        state.paused = !!val;
        notify();
    }

    // Restore state from a saved game object — shallow-clone so future mutations
    // to live state do not corrupt the caller's saved copy.
    function restoreState(saved) {
        state = {
            ...saved,
            players:            saved.players.map(p => ({ ...p })),
            communityCards:     [...(saved.communityCards || [])],
            pots:               (saved.pots || []).map(p => ({ ...p, eligible: [...(p.eligible || [])] })),
            eliminatedThisHand: [...(saved.eliminatedThisHand || [])],
        };
        // Ensure non-serializable defaults
        state.onUpdate = null;
        state.blindTimerInterval = null;
        state.paused = false;
        if (!(state.actedThisRound instanceof Set)) {
            state.actedThisRound = new Set(state.actedThisRound || []);
        }
        // Ensure hand history exists for all players (older saves may lack it)
        for (const p of state.players) {
            if (!p.handHistory) p.handHistory = [];
        }
    }

    return {
        init, getState, startHand, finishHand, restoreState, setPaused,
        fold, check, call, raise, allIn,
        canAct, getAvailableActions, getCallAmount, getMinRaise, getMaxRaise,
        enterBetSizing, adjustBet, cancelBetSizing, confirmBet,
        startBlindTimer, stopBlindTimer, advanceBlindLevel,
        smallBlind, bigBlind, activePlayers, playersInHand,
        setUpdateCallback, cardStr, nextActiveFrom,
        RANK_SYMBOLS, SUIT_SYMBOLS, SUITS, BLIND_SCHEDULES
    };
})();
