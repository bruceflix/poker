// audio.js — Web Audio API sound effects for poker table

const Audio = (() => {
    let ctx = null;

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        return ctx;
    }

    function ensureResumed() {
        const c = getCtx();
        if (c.state === 'suspended') c.resume();
        return c;
    }

    // Unlock audio on first keypress (browser autoplay policy)
    document.addEventListener('keydown', () => {
        ensureResumed();
    }, { once: true });

    // Utility: play a tone
    function tone(freq, duration, type = 'sine', volume = 0.3, startTime = 0) {
        const c = ensureResumed();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.value = freq * (0.98 + Math.random() * 0.04);
        gain.gain.setValueAtTime(volume, c.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startTime + duration);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(c.currentTime + startTime);
        osc.stop(c.currentTime + startTime + duration);
    }

    // Noise burst helper
    function noise(duration, volume = 0.15, startTime = 0) {
        const c = ensureResumed();
        const bufferSize = c.sampleRate * duration;
        const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * volume;
        }
        const source = c.createBufferSource();
        source.buffer = buffer;
        const gain = c.createGain();
        gain.gain.setValueAtTime(volume, c.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startTime + duration);
        source.connect(gain);
        gain.connect(c.destination);
        source.start(c.currentTime + startTime);
    }

    return {
        cardDeal() {
            noise(0.08, 0.2);
            tone(800, 0.06, 'sine', 0.1);
        },

        cardFlip() {
            tone(1200, 0.05, 'sine', 0.15);
            tone(1800, 0.04, 'sine', 0.1, 0.03);
        },

        chipBet() {
            tone(2000, 0.04, 'sine', 0.12);
            tone(2500, 0.04, 'sine', 0.1, 0.04);
            tone(3000, 0.03, 'sine', 0.08, 0.07);
        },

        fold() {
            noise(0.12, 0.1);
            tone(300, 0.1, 'sine', 0.08);
        },

        check() {
            tone(600, 0.06, 'square', 0.1);
        },

        allIn() {
            tone(400, 0.15, 'sawtooth', 0.15);
            tone(600, 0.15, 'sawtooth', 0.12, 0.1);
            tone(800, 0.15, 'sawtooth', 0.12, 0.2);
            tone(1000, 0.2, 'sawtooth', 0.15, 0.3);
        },

        win() {
            tone(523, 0.15, 'square', 0.12);
            tone(659, 0.15, 'square', 0.12, 0.12);
            tone(784, 0.15, 'square', 0.12, 0.24);
            tone(1047, 0.3, 'square', 0.15, 0.36);
        },

        blindsWarning() {
            tone(880, 0.15, 'sine', 0.15);
            tone(880, 0.15, 'sine', 0.15, 0.25);
        },

        blindsUp() {
            tone(660, 0.12, 'square', 0.15);
            tone(880, 0.12, 'square', 0.15, 0.12);
            tone(1100, 0.2, 'square', 0.18, 0.24);
        },

        playerBust() {
            tone(400, 0.2, 'sawtooth', 0.15);
            tone(300, 0.2, 'sawtooth', 0.12, 0.15);
            tone(200, 0.3, 'sawtooth', 0.1, 0.3);
        },

        gameOver() {
            const notes = [523, 659, 784, 1047, 784, 1047, 1319];
            notes.forEach((n, i) => {
                tone(n, 0.2, 'square', 0.15, i * 0.15);
            });
        }
    };
})();
