// test-sim.js - Simulate 20 games of poker and log any issues
const fs = require('fs');

// Load all files and execute together
const code = `
${fs.readFileSync('./hand-evaluator.js', 'utf8')}

${fs.readFileSync('./game.js', 'utf8')}

// Export for use below
module.exports = { Game, HandEvaluator };
`;

// Write to a temp file and require it
fs.writeFileSync('/tmp/poker-modules.js', code);
const { Game, HandEvaluator } = require('/tmp/poker-modules.js');

if (!Game) {
    console.error("ERROR: Game module not loaded");
    process.exit(1);
}

// Mock Audio before requiring
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

// Re-require now that Audio is set up
delete require.cache[require.resolve('/tmp/poker-modules.js')];
const modules = require('/tmp/poker-modules.js');
const Game2 = modules.Game;
const HandEvaluator2 = modules.HandEvaluator;

console.log("Modules loaded successfully\n");

// Simple AI strategy
function getAIAction(playerIndex) {
    const state = Game2.getState();
    const player = state.players[playerIndex];
    const available = Game2.getAvailableActions(playerIndex);
    const handValue = evaluateHandStrength(player.cards, state.communityCards);
    const callAmount = Game2.getCallAmount(playerIndex);
    const potTotal = state.pots.reduce((s, p) => s + p.amount, 0);
    const potOdds = callAmount > 0 ? callAmount / (potTotal + callAmount) : 0;

    // No valid actions
    if (!available || available.length === 0) {
        return null;
    }

    // Forced fold
    if (available.length === 1 && available[0] === 'fold') {
        return 'fold';
    }

    // Fold weak hands when facing a bet
    if (state.currentBet > player.bet && handValue < 0.3) {
        return available.includes('fold') ? 'fold' : available[0];
    }

    // Check/call decent hands
    if (handValue >= 0.4 || potOdds > 0.3) {
        if (available.includes('call')) return 'call';
        if (available.includes('check')) return 'check';
        return available[0];
    }

    // Raise strong hands
    if (handValue >= 0.7 && available.includes('raise')) {
        const minRaise = Game2.getMinRaise();
        const maxRaise = Game2.getMaxRaise(playerIndex);
        const raiseAmount = Math.min(minRaise + (maxRaise - minRaise) * 0.3, maxRaise);
        return 'raise:' + Math.round(raiseAmount);
    }

    // Fallback
    if (available.includes('check')) return 'check';
    if (available.includes('call')) return 'call';
    if (available.includes('fold')) return 'fold';
    return available[0];
}

function evaluateHandStrength(holeCards, communityCards) {
    if (!holeCards || holeCards.length < 2) return 0;

    const allCards = [...holeCards, ...communityCards];
    if (allCards.length < 5) {
        // Preflop: estimate based on hole cards
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

    // Postflop: evaluate best hand
    const eval = HandEvaluator2.evaluate(allCards);
    const handType = eval.handType;
    const strength = [0, 0.3, 0.4, 0.5, 0.6, 0.65, 0.75, 0.85, 0.95, 1.0];
    return strength[handType] || 0;
}

function executeAction(action, playerIndex) {
    if (!action) return false;
    if (action === 'fold') return Game2.fold(playerIndex);
    if (action === 'check') return Game2.check(playerIndex);
    if (action === 'call') return Game2.call(playerIndex);
    if (action === 'allin') return Game2.allIn(playerIndex);
    if (action.startsWith('raise:')) {
        const amount = parseInt(action.split(':')[1]);
        return Game2.raise(playerIndex, amount);
    }
    return false;
}

// Run simulation
const issues = [];
let totalGames = 20;
let completedGames = 0;

console.log("Starting simulation of 20 poker games...\n");

for (let gameNum = 1; gameNum <= totalGames; gameNum++) {
    try {
        Game2.init({
            playerNames: ['Alice', 'Bob', 'Charlie', 'Diana'],
            startingChips: 1000,
            blindPreset: 'turbo'
        });

        let handNum = 0;
        const maxHands = 100;

        while (handNum < maxHands) {
            handNum++;
            const alive = Game2.activePlayers();
            if (alive.length <= 1) {
                break;
            }

            Game2.startHand();

            let actionCount = 0;
            const maxActions = 500;

            while (actionCount < maxActions) {
                const state = Game2.getState();

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
                    // Action failed but activePlayer didn't change - try folding
                    const foldSuccess = Game2.fold(activeIdx);
                    if (!foldSuccess) {
                        // If we can't fold, something is wrong
                        issues.push(`Game ${gameNum}, Hand ${handNum}: Action failed (${action}) and player couldn't fold`);
                        break;
                    }
                }

                actionCount++;
            }

            if (actionCount >= maxActions) {
                issues.push(`Game ${gameNum}, Hand ${handNum}: Exceeded max actions (possible infinite loop)`);
                break;
            }

            Game2.finishHand();
        }

        completedGames++;

        // Check final state validity
        const state = Game2.getState();
        const alive = state.players.filter(p => !p.eliminated);
        const totalChips = state.players.reduce((s, p) => s + p.chips, 0);
        const expectedChips = 4 * 1000;

        if (totalChips !== expectedChips) {
            issues.push(`Game ${gameNum}: Chip count mismatch! Expected ${expectedChips}, got ${totalChips}`);
        }

        if (alive.length > 1) {
            issues.push(`Game ${gameNum}: Game ended with ${alive.length} players alive (should be 1)`);
        }

        process.stdout.write('.');

    } catch (error) {
        completedGames++;
        issues.push(`Game ${gameNum}: CRASH - ${error.message}`);
        process.stdout.write('X');
    }
}

// Report
console.log(`\n\n=== POKER GAME SIMULATION REPORT ===\n`);
console.log(`Completed games: ${completedGames}/${totalGames}`);
console.log(`Issues found: ${issues.length}\n`);

if (issues.length > 0) {
    console.log('ISSUES DETECTED:');
    issues.forEach(issue => console.log(`  ✗ ${issue}`));
} else {
    console.log('✓ No issues detected - all 20 games completed successfully!');
}

console.log('\n=== END REPORT ===\n');
