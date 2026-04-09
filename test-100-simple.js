// test-100-simple.js - Verify the infinite loop fix
const fs = require('fs');

// Mock Audio
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

function getAIAction(playerIndex) {
    const state = Game.getState();
    const player = state.players[playerIndex];
    const available = Game.getAvailableActions(playerIndex);

    if (!available || available.length === 0) return null;
    if (available.includes('check')) return 'check';
    if (available.includes('call')) return 'call';
    if (available.includes('fold')) return 'fold';
    return available[0];
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

console.log("Testing 100 games for infinite loop fix...\n");

for (let gameNum = 1; gameNum <= totalGames; gameNum++) {
    try {
        Game.init({
            playerNames: ['Alice', 'Bob', 'Charlie', 'Diana'],
            startingChips: 1000,
            blindPreset: 'turbo'
        });

        let handNum = 0;
        const maxHands = 50;

        while (handNum < maxHands) {
            handNum++;
            Game.startHand();

            let actionCount = 0;
            const maxActions = 500; // This will catch infinite loops

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
                        issues.push(`Game ${gameNum}, Hand ${handNum}: Stuck action (couldn't fold)`);
                        break;
                    }
                }

                actionCount++;
            }

            // This is the KEY test: did we hit the action limit (infinite loop)?
            if (actionCount >= maxActions) {
                issues.push(`Game ${gameNum}, Hand ${handNum}: INFINITE LOOP DETECTED (500+ actions)`);
                break;
            }

            Game.finishHand();
        }

        completedGames++;
        process.stdout.write(gameNum % 10 === 0 ? `${gameNum} ` : '.');

    } catch (error) {
        completedGames++;
        issues.push(`Game ${gameNum}: CRASH - ${error.message}`);
        process.stdout.write('X');
    }
}

// Report
console.log(`\n\n=== POKER GAME TEST RESULTS (100 GAMES) ===\n`);
console.log(`Games completed: ${completedGames}/${totalGames}`);
console.log(`Critical issues found: ${issues.length}\n`);

if (issues.length > 0) {
    console.log('ISSUES:');
    issues.forEach(issue => console.log(`  ✗ ${issue}`));
} else {
    console.log('✅ SUCCESS - No infinite loops or crashes detected!');
    console.log('   The fix allows all games to progress past showdown.');
}

console.log('\n=== END REPORT ===\n');
