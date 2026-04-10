// constants.js — Shared constants, loaded before all other scripts.
// All values live here so they have a single source of truth.

const CONSTANTS = {

    // ---- CARD SUITS & RANKS ----
    SUITS: ['hearts', 'diamonds', 'clubs', 'spades'],
    RANK_SYMBOLS: {
        2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 8:'8',
        9:'9', 10:'10', 11:'J', 12:'Q', 13:'K', 14:'A'
    },
    SUIT_SYMBOLS: { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' },

    // ---- CHIP DENOMINATIONS ----
    CHIP_DENOMS: [
        { v: 1000, bg: '#B71C1C', bd: '#FF5252', fg: '#fff', label: '1K'  },
        { v: 500,  bg: '#7D6608', bd: '#D4AC0D', fg: '#fff', label: '500' },
        { v: 100,  bg: '#1C1C1C', bd: '#757575', fg: '#fff', label: '100' },
        { v: 50,   bg: '#0D2F7E', bd: '#4472CA', fg: '#fff', label: '50'  },
        { v: 25,   bg: '#1B5E20', bd: '#4CAF50', fg: '#fff', label: '25'  },
    ],

    // ---- TABLE LAYOUT ----
    // Seat positions: symmetric around both axes, each rotated to face the
    // table centre. Exact pixel margin from edge handled by repositionPlayersToEdge().
    SEAT_POSITIONS: [
        { left: 25, top: 88, rot:   0 },  // P1: bottom-left
        { left:  8, top: 65, rot:  90 },  // P2: left-lower
        { left:  8, top: 35, rot:  90 },  // P3: left-upper
        { left: 25, top: 12, rot: 180 },  // P4: top-left
        { left: 75, top: 12, rot: 180 },  // P5: top-right
        { left: 92, top: 35, rot: 270 },  // P6: right-upper
        { left: 92, top: 65, rot: 270 },  // P7: right-lower
        { left: 75, top: 88, rot:   0 },  // P8: bottom-right
    ],
    // Minimum gap (px) between a player section and its nearest screen edge.
    EDGE_MARGIN: 10,

    // ---- KEY BINDINGS ----
    // Each player gets 5 keys: [peek, fold/history, check/call, bet/raise, all-in]
    KEY_MAP: [
        ['1', '2', '3', '4', '5'],   // Player 1
        ['6', '7', '8', '9', '0'],   // Player 2
        ['q', 'w', 'e', 'r', 't'],   // Player 3
        ['y', 'u', 'i', 'o', 'p'],   // Player 4
        ['a', 's', 'd', 'f', 'g'],   // Player 5
        ['h', 'j', 'k', 'l', ';'],   // Player 6
        ['z', 'x', 'c', 'v', 'b'],   // Player 7
        ['n', 'm', ',', '.', '/'],    // Player 8
    ],
    KEY_LABELS_DEFAULT: ['PEEK', 'FOLD',   'CHECK',  'BET',   'ALL-IN'],
    KEY_LABELS_CALL:    ['PEEK', 'FOLD',   'CALL',   'RAISE', 'ALL-IN'],
    KEY_LABELS_SIZING:  ['PEEK', '- BET',  'CANCEL', '+ BET', 'CONFIRM'],

    // ---- BLIND SCHEDULES ----
    BLIND_SCHEDULES: {
        turbo: {
            levels: [
                [25,50],[50,100],[100,200],[150,300],[200,400],
                [300,600],[500,1000],[1000,2000],[2000,4000],
            ],
            duration: 180,
        },
        standard: {
            levels: [
                [25,50],[50,100],[75,150],[100,200],[150,300],[200,400],
                [300,600],[500,1000],[1000,2000],[2000,4000],
            ],
            duration: 480,
        },
        deep: {
            levels: [
                [25,50],[50,100],[75,150],[100,200],[150,300],[200,400],
                [300,600],[400,800],[500,1000],[750,1500],[1000,2000],[2000,4000],
            ],
            duration: 900,
        },
    },

    // ---- TABLE BACKGROUND PRESETS ----
    BG_PRESETS: [
        { name: 'Classic Green', color: '#0d4b1e', grad: 'radial-gradient(ellipse at center, #1a6b2e 0%, #0d4b1e 50%, #092f14 100%)' },
        { name: 'Casino Blue',   color: '#0a2a4a', grad: 'radial-gradient(ellipse at center, #144a7a 0%, #0a2a4a 50%, #061a30 100%)' },
        { name: 'Royal Purple',  color: '#2a0a4a', grad: 'radial-gradient(ellipse at center, #4a1a7a 0%, #2a0a4a 50%, #1a0630 100%)' },
        { name: 'Dark Red',      color: '#3a0a0a', grad: 'radial-gradient(ellipse at center, #6a1a1a 0%, #3a0a0a 50%, #200606 100%)' },
        { name: 'Midnight',      color: '#0a0a1a', grad: 'radial-gradient(ellipse at center, #1a1a3a 0%, #0a0a1a 50%, #050510 100%)' },
        { name: 'Charcoal',      color: '#1a1a1a', grad: 'radial-gradient(ellipse at center, #2a2a2a 0%, #1a1a1a 50%, #0a0a0a 100%)' },
    ],
};
