// test-100.js - Simulate 100 games of poker
const fs = require('fs');

// Mock Audio first
global.Audio = {
    fold: () => {},
    check: () => {},
    chipBet: () => {},
    allIn: () => {},
    cardFlip: () => {},
    win: () => {},
    playerBust: () => {},
    gameOver: () => {},
    blindsWarning: () => {},
    blindsUp: () => {}
};

// Load modules
const code = `
${fs.readFileSync('./hand-evaluator.js', 'utf8')}

${fs.readFileSync('./game.js', 'utf8')}

module.exports = { Game, HandEvaluator };
`;

fs.writeFileSync('/tmp/poker-modules.js', code);
const { Game, HandEvaluator } = require('/tmp/poker-modules.js');

// Simple AI strategy
function getAIAction(playerIndex) {
    const state = Game.getState();
    const player = state.players[playerIndex];
    const available = Game.getAvailableActions(playerIndex);
    const handValue = evaluateHandStrength(player.cards, state.communityCards);
    const callAmount = Game.getCallAmount(playerIndex);
    const potTotal = state.pots.reduce((s, p) => s + p.amount, 0);
    const potOdds = callAmount > 0 ? callAmount / (potTotal + callAmount) : 0;

    if (!available || available.length === 0) {
        return null;
    }

    if (available.length === 1 && available[0] === 'fold') {
        return 'fold';
    }

    if (state.currentBet > player.bet && handValue < 0.3) {
        return available.includes('fold') ? 'fold' : available[0];
    }

    if (handValue >= 0.4 || potOdds > 0.3) {
        if (available.includes('call')) return 'call';
        if (available.includes('check')) return 'check';
        return available[0];
    }

    if (handValue >= 0.7 && available.includes('raise')) {
        const minRaise = Game.getMinRaise();
        const maxRaise = Game.getMaxRaise(playerIndex);
        const raiseAmount = Math.min(minRaise + (maxRaise - minRaise) * 0.3, maxRaise);
        return 'raise:' + Math.round(raiseAmount);
    }

    if (available.includes('check')) return 'check';
    if (available.includes('call')) return 'call';
    if (available.includes('fold')) return 'fold';
    return available[0];
}

function evaluateHandStrength(holeCards, communityCards) {
    if (!holeCards || holeCards.length < 2) return 0;

    const allCards = [...holeCards, ...communityCards];
    if (allCards.length < 5) {
        const ranks = holeCards.map(c => c.rank).sort((a, b) => b - a);
        const isPair = ranks[0] === ranks[1];
        const gap = ranks[0] - ranks[1];
        const isHighCards = ranks[0] >= 12;

        if (isPair && ranks[0] >= 9) return 0.8;
        if (isPair) return 0.6;
        if (isHighCards && gap <= 3) return 0.7;
        if (isHighCards) return 0.5;
        if (gap <= 2) return 0.4;
        return 0.3;
    }

    const eval = HandEvaluator.evaluate(allCards);
    const handType = eval.handType;
    const strength = [0, 0.3, 0.4, 0.5, 0.6, 0.65, 0.75, 0.85, 0.95, 1.0];
    return strength[handType] || 0;
}

function executeAction(action, playerIndex) {
    if (!action) return false;
    if (action === 'fold') return Game.fold(playerIndex);
    if (action === 'check') return Game.check(playerIndex);
    if (action === 'call') return Game.call(playerIndex);
    if (action === 'allin') return Game.allIn(playerIndex);
    if (action.startsWith('raise:')) {
        const amount = parseInt(action.split(':')[1]);
        return Game.raise(playerIndex, amount);
    }
    return false;
}

// Run simulation
const issues = [];
let totalGames = 100;
let completedGames = 0;
let totalHands = 0;

console.log("Starting simulation of 100 poker games...\n");

for (let gameNum = 1; gameNum <= totalGames; gameNum++) {
    try {
        Game.init({
            playerNames: ['Alice', 'Bob', 'Charlie', 'Diana'],
            startingChips: 1000,
            blindPreset: 'turbo'
        });

        let handNum = 0;
        const maxHands = 1000;

        while (handNum < maxHands) {
            handNum++;
            const alive = Game.activePlayers();
            if (alive.length <= 1) {
                break;
            }

            Game.startHand();
            totalHands++;

            let actionCount = 0;
            const maxActions = 500;

            while (actionCount < maxActions) {
                const state = Game.getState();

                if (state.phase === 'gameOver' || state.phase === 'handOver') {
                    break;
                }

                const activeIdx = state.activePlayerIndex;
                if (activeIdx === -1 || !state.players[activeIdx]) {
                    break;
                }

                const action = getAIAction(activeIdx);
                const success = executeAction(action, activeIdx);

                if (!success && state.activePlayerIndex === activeIdx) {
                    const foldSuccess = Game.fold(activeIdx);
                    if (!foldSuccess) {
                        issues.push(`Game ${gameNum}, Hand ${handNum}: Action failed and couldn't fold`);
                        break;
                    }
                }

                actionCount++;
            }

            if (actionCount >= maxActions) {
                issues.push(`Game ${gameNum}, Hand ${handNum}: Exceeded max actions`);
                break;
            }

            Game.finishHand();
        }

        completedGames++;

        // Check final state validity
        const state = Game.getState();
        const alive = state.players.filter(p => !p.eliminated);
        const totalChips = state.players.reduce((s, p) => s + p.chips, 0);
        const expectedChips = 4 * 1000;

        if (totalChips !== expectedChips) {
            issues.push(`Game ${gameNum}: Chip count mismatch! Expected ${expectedChips}, got ${totalChips}`);
        }

        if (alive.length > 1) {
            issues.push(`Game ${gameNum}: Game ended with ${alive.length} players alive`);
        }

        if (gameNum % 10 === 0) {
            process.stdout.write(`${gameNum} `);
        } else {
            process.stdout.write('.');
        }

    } catch (error) {
        completedGames++;
        issues.push(`Game ${gameNum}: CRASH - ${error.message}`);
        process.stdout.write('X');
    }
}

// Report
console.log(`\n\n=== POKER GAME SIMULATION REPORT (100 GAMES) ===\n`);
console.log(`Completed games: ${completedGames}/${totalGames}`);
console.log(`Total hands played: ${totalHands}`);
console.log(`Average hands per game: ${(totalHands / completedGames).toFixed(2)}`);
console.log(`Issues found: ${issues.length}\n`);

if (issues.length > 0) {
    console.log('ISSUES DETECTED:');
    issues.forEach(issue => console.log(`  ✗ ${issue}`));
} else {
    console.log('✓ SUCCESS - All 100 games completed without issues!');
}

console.log('\n=== END REPORT ===\n');
