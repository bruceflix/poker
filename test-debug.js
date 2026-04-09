// test-debug.js - Debug the infinite loop issue
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

// Initialize game
Game.init({
    playerNames: ['Alice', 'Bob', 'Charlie', 'Diana'],
    startingChips: 1000,
    blindPreset: 'turbo'
});

console.log("Game initialized. Starting first hand...\n");

Game.startHand();
let state = Game.getState();
console.log(`Hand 1 started`);
console.log(`  Phase: ${state.phase}`);
console.log(`  Active player: ${state.activePlayerIndex} (${state.players[state.activePlayerIndex].name})`);
console.log(`  Available actions:`, Game.getAvailableActions(state.activePlayerIndex));
console.log();

// Simulate a few actions with detailed logging
for (let i = 0; i < 50; i++) {
    state = Game.getState();

    if (state.phase === 'gameOver' || state.phase === 'handOver') {
        console.log(`\nHand ended with phase: ${state.phase}`);
        break;
    }

    const activeIdx = state.activePlayerIndex;
    if (activeIdx === -1) {
        console.log(`\nNo active player! activePlayerIndex = -1`);
        break;
    }

    const player = state.players[activeIdx];
    const available = Game.getAvailableActions(activeIdx);

    console.log(`\nAction ${i + 1}:`);
    console.log(`  Active: Player ${activeIdx} (${player.name})`);
    console.log(`  Chips: ${player.chips}, Bet: ${player.bet}, All-in: ${player.allIn}, Folded: ${player.folded}`);
    console.log(`  Available: ${available.join(', ')}`);
    console.log(`  Current bet: ${state.currentBet}`);

    // Simple action: just check or fold if we have to
    let action = null;
    if (available.includes('check')) {
        action = 'check';
        console.log(`  → Checking`);
        Game.check(activeIdx);
    } else if (available.includes('call')) {
        action = 'call';
        console.log(`  → Calling ${state.currentBet - player.bet}`);
        Game.call(activeIdx);
    } else if (available.includes('fold')) {
        action = 'fold';
        console.log(`  → Folding`);
        Game.fold(activeIdx);
    } else {
        console.log(`  ERROR: No valid action available!`);
        break;
    }

    const newState = Game.getState();
    const newActiveIdx = newState.activePlayerIndex;

    if (newActiveIdx === activeIdx) {
        console.log(`  ⚠️  WARNING: Active player didn't change! Still ${activeIdx}`);
        console.log(`     Phase: ${newState.phase}, Players in hand: ${Game.playersInHand().length}`);
    } else if (newActiveIdx === -1) {
        console.log(`  Phase advanced or hand ended`);
    } else {
        console.log(`  Next active: Player ${newActiveIdx} (${newState.players[newActiveIdx].name})`);
    }
}

console.log(`\n\nFinal state:`);
state = Game.getState();
console.log(`  Phase: ${state.phase}`);
console.log(`  Active player: ${state.activePlayerIndex}`);
console.log(`  Players in hand: ${Game.playersInHand().map(p => p.name).join(', ')}`);
console.log(`  Players still betting: ${Game.playersStillBetting().map(p => p.name).join(', ')}`);
