// hand-evaluator.js — Texas Hold'em hand evaluation
// Card: { rank: 2-14 (2=2..14=Ace), suit: 0-3 }

const HandEvaluator = (() => {

    const HAND_NAMES = [
        'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
        'Straight', 'Flush', 'Full House', 'Four of a Kind',
        'Straight Flush', 'Royal Flush'
    ];

    // Return a score array [handType, ...tiebreakers] for a 5-card hand
    function score5(cards) {
        const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
        const suits = cards.map(c => c.suit);
        const isFlush = suits.every(s => s === suits[0]);

        // Deduplicate ranks before straight detection so that any duplicate
        // ranks (e.g. from edge-case inputs) never produce a false positive
        // or mask a real straight.
        const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);

        // Standard straight: need 5 consecutive unique ranks.
        // Sliding-window over uniqueRanks handles duplicates naturally —
        // a hand with a pair can never produce 5 consecutive unique values.
        let isStraight = false;
        let straightHigh = 0;

        if (uniqueRanks.length >= 5) {
            for (let i = 0; i <= uniqueRanks.length - 5; i++) {
                if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
                    isStraight = true;
                    straightHigh = uniqueRanks[i];
                    break;
                }
            }
        }

        // Wheel straight: A-2-3-4-5 (Ace plays low).
        // Uses .includes() so it works regardless of how many Aces are present.
        if (!isStraight && uniqueRanks.includes(14) && [2, 3, 4, 5].every(r => uniqueRanks.includes(r))) {
            isStraight = true;
            straightHigh = 5; // 5-high straight
        }

        // Count ranks (use original ranks array for group counting)
        const counts = {};
        for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
        const groups = Object.entries(counts)
            .map(([r, c]) => ({ rank: parseInt(r), count: c }))
            .sort((a, b) => b.count - a.count || b.rank - a.rank);

        const pattern = groups.map(g => g.count).join('');

        if (isStraight && isFlush) {
            const type = straightHigh === 14 ? 9 : 8; // Royal vs Straight Flush
            return [type, straightHigh];
        }
        if (pattern === '41') {
            return [7, groups[0].rank, groups[1].rank]; // Four of a Kind
        }
        if (pattern === '32') {
            return [6, groups[0].rank, groups[1].rank]; // Full House
        }
        if (isFlush) {
            return [5, ...ranks]; // Flush
        }
        if (isStraight) {
            return [4, straightHigh]; // Straight
        }
        if (pattern === '311') {
            return [3, groups[0].rank, groups[1].rank, groups[2].rank]; // Three of a Kind
        }
        if (pattern === '221') {
            return [2, groups[0].rank, groups[1].rank, groups[2].rank]; // Two Pair
        }
        if (pattern === '2111') {
            return [1, groups[0].rank, groups[1].rank, groups[2].rank, groups[3].rank]; // One Pair
        }
        return [0, ...ranks]; // High Card
    }

    // Compare two score arrays. Returns >0 if a wins, <0 if b wins, 0 if tie
    function compareScores(a, b) {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const diff = (a[i] || 0) - (b[i] || 0);
            if (diff !== 0) return diff;
        }
        return 0;
    }

    // Generate all C(n,5) combinations
    function combinations(arr, k) {
        if (k === 0) return [[]];
        if (arr.length < k) return [];
        const [first, ...rest] = arr;
        const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
        const without = combinations(rest, k);
        return [...withFirst, ...without];
    }

    // Evaluate best 5-card hand from 7 cards
    function evaluate(sevenCards) {
        if (!Array.isArray(sevenCards) || sevenCards.length < 5) {
            throw new Error('evaluate: need at least 5 cards, got ' + (Array.isArray(sevenCards) ? sevenCards.length : typeof sevenCards));
        }
        const combos = combinations(sevenCards, 5);
        let bestScore = null;
        let bestCards = null;
        for (const combo of combos) {
            const s = score5(combo);
            if (!bestScore || compareScores(s, bestScore) > 0) {
                bestScore = s;
                bestCards = combo;
            }
        }
        return {
            score: bestScore,
            cards: bestCards,
            handType: bestScore[0],
            handName: HAND_NAMES[bestScore[0]],
            description: describeHand(bestScore, bestCards)
        };
    }

    // Human-readable hand description
    function describeHand(score, cards) {
        const rankNames = {
            2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',
            11:'Jack',12:'Queen',13:'King',14:'Ace'
        };
        const pluralRank = {
            2:'Twos',3:'Threes',4:'Fours',5:'Fives',6:'Sixes',7:'Sevens',
            8:'Eights',9:'Nines',10:'Tens',11:'Jacks',12:'Queens',13:'Kings',14:'Aces'
        };
        const type = score[0];
        switch (type) {
            case 9: return 'Royal Flush';
            case 8: return `Straight Flush, ${rankNames[score[1]]}-high`;
            case 7: return `Four of a Kind, ${pluralRank[score[1]]}`;
            case 6: return `Full House, ${pluralRank[score[1]]} over ${pluralRank[score[2]]}`;
            case 5: return `Flush, ${rankNames[score[1]]}-high`;
            case 4: return `Straight, ${rankNames[score[1]]}-high`;
            case 3: return `Three of a Kind, ${pluralRank[score[1]]}`;
            case 2: return `Two Pair, ${pluralRank[score[1]]} and ${pluralRank[score[2]]}`;
            case 1: return `Pair of ${pluralRank[score[1]]}`;
            case 0: return `${rankNames[score[1]]}-high`;
            default: return 'Unknown';
        }
    }

    // Compare two 7-card hands. Returns >0 if a wins, <0 if b wins, 0 if tie
    function compare(cardsA, cardsB) {
        const a = evaluate(cardsA);
        const b = evaluate(cardsB);
        return compareScores(a.score, b.score);
    }

    return { evaluate, compare, compareScores, HAND_NAMES };
})();
