// audio.js — Real casino sound effects (Kenney CC0, kenney.nl)

const Audio = (() => {
    let muted = localStorage.getItem('poker_muted') === '1';

    // --- Preloader ---
    const cache = {};

    function load(key, file) {
        const el = new window.Audio(`sounds/${file}`);
        el.preload = 'auto';
        cache[key] = el;
    }

    // Play a named sound (cloneNode so overlapping calls work)
    function play(key, vol = 0.8) {
        if (muted) return;
        const src = cache[key];
        if (!src) return;
        const a = src.cloneNode();
        a.volume = Math.min(1, Math.max(0, vol));
        a.play().catch(() => {});
    }

    // Pick a random key from a list
    function rnd(...keys) { return keys[Math.floor(Math.random() * keys.length)]; }

    // --- Load all sounds ---
    // Card actions
    load('deal',     'card-shuffle.ogg');
    load('slide1',   'card-slide-1.ogg');
    load('slide2',   'card-slide-3.ogg');
    load('slide3',   'card-slide-5.ogg');
    load('slide4',   'card-slide-7.ogg');
    load('place1',   'card-place-1.ogg');
    load('place2',   'card-place-2.ogg');
    load('shove1',   'card-shove-1.ogg');
    load('shove2',   'card-shove-2.ogg');
    // Chip actions
    load('chipLay1', 'chip-lay-1.ogg');
    load('chipLay2', 'chip-lay-2.ogg');
    load('chipLay3', 'chip-lay-3.ogg');
    load('collide',  'chips-collide-3.ogg');
    load('stack1',   'chips-stack-1.ogg');
    load('stack2',   'chips-stack-3.ogg');
    // Notifications
    load('bong',     'bong_001.ogg');
    load('confirm1', 'confirmation_001.ogg');
    load('confirm2', 'confirmation_002.ogg');
    load('error1',   'error_001.ogg');
    load('error2',   'error_002.ogg');
    // Jingles
    load('winJingle',      'jingles-hit_00.ogg');
    load('gameOverJingle', 'jingles-hit_14.ogg');

    // Warm up audio on first keypress (browser autoplay policy)
    document.addEventListener('keydown', () => {
        Object.values(cache).forEach(a => a.load());
    }, { once: true });

    // --- Public API ---
    function toggleMute() {
        muted = !muted;
        localStorage.setItem('poker_muted', muted ? '1' : '0');
        return muted;
    }

    function isMuted() { return muted; }

    return {
        toggleMute,
        isMuted,

        cardDeal() {
            play('deal', 0.7);
        },

        cardFlip() {
            play(rnd('slide1','slide2','slide3','slide4'), 0.65);
        },

        chipBet() {
            play(rnd('chipLay1','chipLay2','chipLay3'), 0.75);
        },

        fold() {
            play(rnd('shove1','shove2'), 0.7);
        },

        check() {
            play(rnd('place1','place2'), 0.6);
        },

        allIn() {
            play('collide', 0.85);
        },

        win() {
            play(rnd('stack1','stack2'), 0.7);
            setTimeout(() => play('winJingle', 0.55), 350);
        },

        blindsWarning() {
            play('bong', 0.55);
            setTimeout(() => play('bong', 0.45), 280);
        },

        blindsUp() {
            play('confirm1', 0.65);
        },

        playerBust() {
            play(rnd('error1','error2'), 0.6);
        },

        gameOver() {
            play('gameOverJingle', 0.7);
        },
    };
})();
