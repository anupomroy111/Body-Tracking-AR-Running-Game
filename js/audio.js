// ROY SPEED — synthesized audio (engine wind, coins, gestures, music)
class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.sfx = null; this.music = null;
    this.muted = false; this.musicTimer = null; this.nextNote = 0; this.step = 0;
    this.wind = null; this.windGain = null; this.jet = null; this.jetGain = null;
    this.coinStreak = 0; this.coinResetT = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.85; this.sfx.connect(this.master);
    this.music = this.ctx.createGain(); this.music.gain.value = 0.15; this.music.connect(this.master);
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }
  _env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  _osc(type, f0, f1, t, dur, peak, dest) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this._env(g, t, 0.005, peak, dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _noise(t, dur, peak, type, f0, f1) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = this.ctx.createGain(); this._env(g, t, 0.004, peak, dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t); src.stop(t + dur + 0.05);
  }
  coin() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.coinResetT > 1.1) this.coinStreak = 0;
    this.coinResetT = now;
    const f = 880 * Math.pow(1.06, Math.min(12, this.coinStreak++));
    this._osc('triangle', f, f * 1.5, now, 0.09, 0.16);
    this._osc('sine', f * 2, f * 2, now, 0.06, 0.06);
  }
  jump() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('square', 300, 720, t, 0.16, 0.12); this._noise(t, 0.1, 0.06, 'highpass', 1800, 4000); }
  slide() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(t, 0.28, 0.16, 'bandpass', 900, 300); }
  lane() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(t, 0.12, 0.1, 'highpass', 2600, 900); this._osc('sine', 500, 340, t, 0.08, 0.06); }
  land() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('sine', 150, 60, t, 0.1, 0.16); }
  crash() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(t, 0.8, 0.5, 'lowpass', 3200, 70);
    this._osc('sine', 130, 26, t, 0.7, 0.5);
    this._osc('sawtooth', 220, 40, t, 0.4, 0.2);
  }
  save() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('triangle', 620, 940, t, 0.14, 0.18); this._noise(t, 0.2, 0.2, 'highpass', 3000, 800); }
  power() { if (!this.ctx) return; const t = this.ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => this._osc('triangle', f, f, t + i * 0.055, 0.16, 0.14)); }
  board() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('sawtooth', 180, 520, t, 0.3, 0.14); this._osc('sine', 360, 1040, t, 0.3, 0.1); }
  nearMiss() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('sine', 1200, 1800, t, 0.08, 0.08); }
  count(final) { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('square', final ? 880 : 440, final ? 880 : 440, t, final ? 0.4 : 0.12, 0.14); }
  milestone() { if (!this.ctx) return; const t = this.ctx.currentTime; [392, 523, 659, 784].forEach((f, i) => this._osc('sawtooth', f, f, t + i * 0.07, 0.18, 0.09)); }
  zone() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._osc('sawtooth', 240, 960, t, 0.35, 0.1);
    this._osc('sine', 480, 1920, t, 0.35, 0.07);
    this._noise(t, 0.3, 0.08, 'highpass', 1200, 5000);
  }
  unlock() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this._osc('triangle', f, f, t + i * 0.07, 0.22, 0.13));
    this._noise(t + 0.4, 0.4, 0.1, 'highpass', 3000, 8000);
  }
  ui() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('triangle', 880, 1320, t, 0.07, 0.1); }

  startWind() {
    this.ensure(); if (!this.ctx || this.wind) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.wind = this.ctx.createBufferSource(); this.wind.buffer = buf; this.wind.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
    this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0;
    this.wind.connect(f); f.connect(this.windGain); this.windGain.connect(this.master);
    this.wind.start();
  }
  setWind(speed01) { if (this.windGain) this.windGain.gain.setTargetAtTime(speed01 * 0.11, this.ctx.currentTime, 0.2); }
  stopWind() { if (this.wind) { try { this.wind.stop(); } catch {} this.wind = null; this.windGain = null; } }
  setJet(on) {
    this.ensure(); if (!this.ctx) return;
    if (on && !this.jet) {
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.jet = this.ctx.createBufferSource(); this.jet.buffer = buf; this.jet.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      this.jetGain = this.ctx.createGain(); this.jetGain.gain.value = 0.12;
      this.jet.connect(f); f.connect(this.jetGain); this.jetGain.connect(this.master);
      this.jet.start();
    } else if (!on && this.jet) { try { this.jet.stop(); } catch {} this.jet = null; this.jetGain = null; }
  }

  startMusic() {
    this.ensure(); if (!this.ctx || this.musicTimer) return;
    this.nextNote = this.ctx.currentTime + 0.1; this.step = 0;
    const bass = [55, 55, 73.4, 65.4];
    const arp = [440, 523.3, 659.3, 784, 659.3, 523.3];
    const spb = 0.21;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      while (this.nextNote < this.ctx.currentTime + 0.4) {
        const t = this.nextNote, s = this.step, bar = Math.floor(s / 8) % 4;
        if (s % 4 === 0) this._mBass(bass[bar], t, spb * 3.2);
        if (s % 2 === 0) this._mKick(t);
        if (s % 2 === 1) this._mHat(t);
        if (s % 8 < 6) this._mArp(arp[s % 6] * (bar === 3 ? 0.89 : 1), t);
        this.nextNote += spb; this.step++;
      }
    }, 110);
  }
  _mBass(f, t, dur) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), fl = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(420, t);
    fl.frequency.exponentialRampToValueAtTime(110, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.music);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _mKick(t) { this._osc('sine', 120, 40, t, 0.12, 0.5, this.music); }
  _mHat(t) {
    const len = Math.floor(this.ctx.sampleRate * 0.03);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = this.ctx.createGain(); g.gain.value = 0.1;
    src.connect(f); f.connect(g); g.connect(this.music); src.start(t);
  }
  _mArp(f, t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.2);
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
}
export const audio = new AudioEngine();