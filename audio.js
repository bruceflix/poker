// audio.js — Casino sound effects (Kenney CC0, kenney.nl) + speech synthesis

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
    function play(key, vol = 0.8, delay = 0) {
        if (muted) return;
        const src = cache[key];
        if (!src) return;
        const go = () => {
            const a = src.cloneNode();
            a.volume = Math.min(1, Math.max(0, vol));
            a.play().catch(() => {});
        };
        delay ? setTimeout(go, delay) : go();
    }

    // Pick a random key from a list
    function rnd(...keys) { return keys[Math.floor(Math.random() * keys.length)]; }

    // --- Speech synthesis ---
    let voices = [];
    function loadVoices() {
        voices = window.speechSynthesis?.getVoices() || [];
    }
    if (window.speechSynthesis) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    function speak(text, opts = {}) {
        if (muted || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.pitch  = opts.pitch  ?? 0.75;
        utt.rate   = opts.rate   ?? 0.88;
        utt.volume = opts.volume ?? 1.0;
        // Prefer a deep male voice
        const male = voices.find(v =>
            /david|mark|james|daniel|google uk english male|microsoft david|fred|alex/i.test(v.name)
        ) || voices.find(v => v.lang.startsWith('en') && !v.name.toLowerCase().includes('female'));
        if (male) utt.voice = male;
        window.speechSynthesis.speak(utt);
    }

    // --- Load all sounds ---
    // Cards
    load('deal',     'card-shuffle.ogg');
    load('slide1',   'card-slide-1.ogg');
    load('slide2',   'card-slide-3.ogg');
    load('slide3',   'card-slide-5.ogg');
    load('slide4',   'card-slide-7.ogg');
    load('place1',   'card-place-1.ogg');
    load('place2',   'card-place-2.ogg');
    load('shove1',   'card-shove-1.ogg');
    load('shove2',   'card-shove-2.ogg');
    // Chip lays (single chip)
    load('chipLay1', 'chip-lay-1.ogg');
    load('chipLay2', 'chip-lay-2.ogg');
    load('chipLay3', 'chip-lay-3.ogg');
    // Chip handle (counting/sliding chips)
    load('handle1',  'chips-handle-1.ogg');
    load('handle2',  'chips-handle-2.ogg');
    load('handle3',  'chips-handle-3.ogg');
    load('handle4',  'chips-handle-4.ogg');
    load('handle5',  'chips-handle-5.ogg');
    load('handle6',  'chips-handle-6.ogg');
    // Chip stacks landing
    load('stack1',   'chips-stack-1.ogg');
    load('stack2',   'chips-stack-2.ogg');
    load('stack3',   'chips-stack-3.ogg');
    load('stack4',   'chips-stack-4.ogg');
    load('stack5',   'chips-stack-5.ogg');
    load('stack6',   'chips-stack-6.ogg');
    // Collides
    load('collide1', 'chips-collide-1.ogg');
    load('collide2', 'chips-collide-2.ogg');
    load('collide3', 'chips-collide-3.ogg');
    load('collide4', 'chips-collide-4.ogg');
    // Notifications
    load('bong',     'bong_001.ogg');
    load('confirm1', 'confirmation_001.ogg');
    load('confirm2', 'confirmation_002.ogg');
    load('confirm3', 'confirmation_003.ogg');
    load('error1',   'error_001.ogg');
    load('error2',   'error_002.ogg');
    // Jingles
    load('winJingle',      'jingles-hit_00.ogg');
    load('winJingle2',     'jingles-hit_01.ogg');
    load('gameOverJingle', 'jingles-hit_14.ogg');

    // Warm up audio on first keypress (browser autoplay policy)
    document.addEventListener('keydown', () => {
        Object.values(cache).forEach(a => a.load());
        loadVoices();
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

        // Rapid chip counting sounds → stack landing: sounds like a real bet
        chipBet() {
            const count = 2 + Math.floor(Math.random() * 3); // 2–4 chips counted out
            for (let i = 0; i < count; i++) {
                play(rnd('handle1','handle2','handle3','handle4','handle5','handle6'), 0.55, i * 75);
            }
            // Stack lands at the end
            play(rnd('stack1','stack2','stack3','stack4'), 0.8, count * 75 + 20);
        },

        chipAdjust() {
            play(rnd('handle1','handle2','handle3'), 0.3);
        },

        chipPush() {
            play(rnd('collide1','collide2','collide3'), 0.55);
            play(rnd('stack1','stack2'), 0.4, 120);
        },

        fold() {
            play(rnd('shove1','shove2'), 0.7);
        },

        check() {
            play(rnd('place1','place2'), 0.6);
        },

        allIn() {
            // Slam of chips + second crash wave
            play(rnd('collide3','collide4'), 0.95);
            play(rnd('collide1','collide2'), 0.7, 140);
            play(rnd('stack5','stack6'), 0.6, 280);
            // Voice callout
            speak('All in!', { pitch: 0.7, rate: 0.82, volume: 1.0 });
        },

        win() {
            play(rnd('stack1','stack2','stack3'), 0.75);
            play(rnd('collide1','collide2'), 0.5, 220);
            setTimeout(() => play(rnd('winJingle','winJingle2'), 0.6), 400);
        },

        blindsWarning() {
            play('bong', 0.55);
            setTimeout(() => play('bong', 0.45), 280);
        },

        blindsUp() {
            play(rnd('confirm1','confirm2','confirm3'), 0.65);
        },

        playerBust() {
            play(rnd('error1','error2'), 0.6);
        },

        gameOver() {
            play('gameOverJingle', 0.7);
        },
    };
})();
