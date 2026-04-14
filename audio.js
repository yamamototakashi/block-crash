// Lightweight sound effects via Web Audio API.
// Synthesized on demand; no assets to load.

(function (global) {
  class Sound {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
    }

    // Must be triggered from a user gesture on iOS Safari.
    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
      } catch (_) {
        this.ctx = null;
      }
    }

    setEnabled(on) { this.enabled = !!on; }

    _tone(type, freq, dur, startGain, freqEnd, delay) {
      if (!this.enabled || !this.ctx) return;
      try {
        startGain = startGain == null ? 0.08 : startGain;
        delay = delay || 0;
        const now = this.ctx.currentTime + delay;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, now);
        if (freqEnd != null) {
          o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + dur);
        }
        g.gain.setValueAtTime(startGain, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        o.connect(g);
        g.connect(this.master);
        o.start(now);
        o.stop(now + dur + 0.02);
      } catch (_) { /* ignore audio errors */ }
    }

    play(type) {
      if (!this.enabled) return;
      if (!this.ctx) this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        try { this.ctx.resume(); } catch (_) {}
      }

      switch (type) {
        case 'hit':     this._tone('square', 520, 0.08, 0.07, 880); break;
        case 'tough':   this._tone('square', 280, 0.08, 0.07, 220); break;
        case 'paddle':  this._tone('triangle', 300, 0.07, 0.07, 420); break;
        case 'wall':    this._tone('triangle', 220, 0.05, 0.04, 180); break;
        case 'item':
          this._tone('sine', 660, 0.16, 0.09, 1320);
          this._tone('sine', 990, 0.14, 0.06, 1600, 0.03);
          break;
        case 'bomb':
          this._tone('sawtooth', 140, 0.28, 0.14, 40);
          this._tone('square', 80, 0.28, 0.08, 30, 0.02);
          break;
        case 'laser':   this._tone('square', 1200, 0.08, 0.05, 300); break;
        case 'clear':
          [523, 659, 784, 1046].forEach((f, i) => this._tone('square', f, 0.18, 0.07, f, i * 0.08));
          break;
        case 'over':
          [440, 330, 220, 140].forEach((f, i) => this._tone('sawtooth', f, 0.22, 0.08, Math.max(40, f * 0.6), i * 0.09));
          break;
        case 'life':
          this._tone('sine', 440, 0.1, 0.08, 660);
          this._tone('sine', 660, 0.14, 0.07, 880, 0.08);
          break;
        case 'chain':   this._tone('square', 880, 0.06, 0.05, 1320); break;
        case 'launch':  this._tone('triangle', 200, 0.08, 0.05, 500); break;
      }
    }
  }

  global.Sound = Sound;
})(window);
