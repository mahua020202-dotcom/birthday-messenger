/**
 * AudioManager —— 全程序化音频（Web Audio API 合成，不加载任何外部音乐/音效文件）
 *
 * 背景音乐由 5 个声部实时合成：
 *   pad（铺底和弦）/ bells（铃铛琶音）/ bass（低音）/ drums（鼓组）/ lead（庆典主旋律）
 * 各声部的音量由「生日世界点亮进度」驱动，从一架孤零零的钢琴 pad
 * 逐渐长成一支欢快的庆典乐队。
 *
 * 所有音频都必须在用户首次交互后才能启动（浏览器自动播放策略）。
 */
export class AudioManager {
  constructor({ musicVolume = 0.7, sfxVolume = 0.8 } = {}) {
    this.ctx = null;
    this.ready = false;
    this.playing = false;
    this.progress = 0;
    this.celebration = false;
    this.musicVolume = musicVolume;
    this.sfxVolume = sfxVolume;
    this.reduceMotion = false;

    this._schedulerId = null;
    this._step = 0;
    this._nextTime = 0;
    this._tempo = 76;
  }

  /* ================================================================ */
  /** 用户首次交互时调用 */
  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch { /* ignore */ }
      }
      return;
    }

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });

      /* ---- 总线 ---- */
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 22;
      this.compressor.ratio.value = 3.5;
      this.compressor.attack.value = 0.006;
      this.compressor.release.value = 0.24;

      this.master.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume * 0.5;
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);

      /* ---- 音乐声部 ---- */
      this.padGain = this.ctx.createGain();
      this.bellGain = this.ctx.createGain();
      this.bassGain = this.ctx.createGain();
      this.drumGain = this.ctx.createGain();
      this.leadGain = this.ctx.createGain();

      // 铺底加一个低通，让声音更柔
      this.padFilter = this.ctx.createBiquadFilter();
      this.padFilter.type = 'lowpass';
      this.padFilter.frequency.value = 1600;

      this.padGain.connect(this.padFilter);
      this.padFilter.connect(this.musicGain);
      this.bellGain.connect(this.musicGain);
      this.bassGain.connect(this.musicGain);
      this.drumGain.connect(this.musicGain);
      this.leadGain.connect(this.musicGain);

      this.padGain.gain.value = 0;
      this.bellGain.gain.value = 0;
      this.bassGain.gain.value = 0;
      this.drumGain.gain.value = 0;
      this.leadGain.gain.value = 0;

      /* ---- 噪声缓冲（音效与鼓组复用） ---- */
      this.noiseBuffer = this._createNoiseBuffer(1.6);

      this.ready = true;
      if (this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch { /* ignore */ }
      }
    } catch (e) {
      console.warn('[AudioManager] 初始化失败，将静音运行', e);
      this.ready = false;
    }
  }

  _createNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ================================================================ */
  /*                              背景音乐                            */
  /* ================================================================ */

  startBGM() {
    if (!this.ready || this.playing) return;
    this.playing = true;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.12;
    this._applyMix();
    this._schedulerId = setInterval(() => this._scheduler(), 25);
  }

  stopBGM() {
    this.playing = false;
    if (this._schedulerId) {
      clearInterval(this._schedulerId);
      this._schedulerId = null;
    }
  }

  /** 进度驱动：声部逐层进入 + 速度加快 */
  setProgress(t) {
    this.progress = Math.max(0, Math.min(1, t));
    this._tempo = 76 + this.progress * 22 + (this.celebration ? 22 : 0);
    this._applyMix();
  }

  setCelebration(on) {
    this.celebration = !!on;
    this._tempo = 76 + this.progress * 22 + (this.celebration ? 24 : 0);
    this._applyMix();
  }

  _applyMix() {
    if (!this.ready) return;
    const p = this.progress;
    const now = this.ctx.currentTime;
    const ramp = (param, value, time = 1.6) => {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + time);
    };

    ramp(this.padGain.gain, 0.16 + p * 0.1);
    ramp(this.bellGain.gain, 0.03 + p * 0.22);
    ramp(this.bassGain.gain, 0.06 + p * 0.16);
    ramp(this.drumGain.gain, Math.max(0, (p - 0.4) / 0.6) * 0.32);
    ramp(this.leadGain.gain, this.celebration ? 0.2 : 0);
  }

  /* ---------------- 音序器 ---------------- */
  _scheduler() {
    if (!this.playing || !this.ready) return;
    const lookahead = 0.2;
    const stepDur = 60 / this._tempo / 4;   // 16 分音符

    while (this._nextTime < this.ctx.currentTime + lookahead) {
      this._scheduleStep(this._step, this._nextTime);
      this._step++;
      this._nextTime += stepDur;
    }
  }

  _scheduleStep(step, time) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;

    // C 大调上的经典进行：Cmaj7 → Am7 → Fmaj7 → G7
    const CHORDS = [
      [261.63, 329.63, 392.0, 493.88],
      [220.0, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 349.23],
      [196.0, 246.94, 293.66, 349.23],
    ];
    const BASS = [130.81, 110.0, 87.31, 98.0];
    // 五声音阶，用于铃铛琶音
    const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

    /* ---- 铺底和弦（每小节一次） ---- */
    if (s === 0) {
      const chord = CHORDS[bar];
      chord.forEach((f, i) => {
        this._pad(f, time, 3.4, 0.055 - i * 0.008);
      });
    }

    /* ---- 低音 ---- */
    if (s === 0 || s === 8) {
      this._bass(BASS[bar], time, s === 0 ? 1.1 : 0.7);
    }

    /* ---- 铃铛琶音 ---- */
    if (s % 2 === 0 && Math.random() < 0.42 + this.progress * 0.35) {
      const f = PENTA[Math.floor(Math.random() * PENTA.length)];
      this._bell(f, time, 0.95);
    }

    /* ---- 鼓组（进度过半后进入） ---- */
    if (this.drumGain.gain.value > 0.01) {
      if (s === 0 || s === 6 || s === 10) this._kick(time);
      if (s === 4 || s === 12) this._snare(time);
      if (s % 2 === 1) this._hat(time);
    }

    /* ---- 庆典主旋律 ----
       《生日快乐歌》旋律自 2016 年起已进入公有领域，此处为纯合成演绎       */
    if (this.celebration && this.leadGain.gain.value > 0.01) {
      const MELODY = [
        // [半音偏移（相对 C5）, 时值（16 分音符数）]
        [0, 1], [0, 1], [2, 2], [0, 2], [5, 2], [4, 4],
        [0, 1], [0, 1], [2, 2], [0, 2], [7, 2], [5, 4],
        [0, 1], [0, 1], [12, 2], [9, 2], [5, 2], [7, 2], [5, 4],
        [10, 1], [10, 1], [9, 2], [5, 2], [7, 2], [5, 4],
      ];
      // 把旋律铺成 64 个 16 分音符的循环
      const total = MELODY.reduce((a, m) => a + m[1], 0);
      const loopStep = step % total;
      let acc = 0;
      for (const [semi, dur] of MELODY) {
        if (acc === loopStep) {
          const freq = 523.25 * Math.pow(2, semi / 12);
          this._lead(freq, time, dur * (60 / this._tempo / 4) * 0.92);
          break;
        }
        acc += dur;
      }
    }
  }

  /* ---------------- 单个音色 ---------------- */

  _pad(freq, time, dur, gain) {
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o1.type = 'triangle';
    o2.type = 'sine';
    o1.frequency.value = freq;
    o2.frequency.value = freq * 1.004;
    o2.detune.value = 6;

    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.5);
    g.gain.linearRampToValueAtTime(0, time + dur);

    o1.connect(g);
    o2.connect(g);
    g.connect(this.padGain);

    o1.start(time);
    o2.start(time);
    o1.stop(time + dur + 0.05);
    o2.stop(time + dur + 0.05);
  }

  _bell(freq, time, dur) {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o2.type = 'sine';
    o.frequency.value = freq;
    o2.frequency.value = freq * 2.01;

    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.14, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    const g2 = this.ctx.createGain();
    g2.gain.value = 0.35;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.bellGain);

    o.start(time);
    o2.start(time);
    o.stop(time + dur + 0.05);
    o2.stop(time + dur + 0.05);
  }

  _bass(freq, time, dur) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;

    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.2, time + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    o.connect(g);
    g.connect(this.bassGain);
    o.start(time);
    o.stop(time + dur + 0.05);
  }

  _lead(freq, time, dur) {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;

    o.type = 'triangle';
    o2.type = 'sine';
    o.frequency.value = freq;
    o2.frequency.value = freq * 2;

    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.3, time + 0.04);
    g.gain.setValueAtTime(0.28, time + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.leadGain);

    o.start(time);
    o2.start(time);
    o.stop(time + dur + 0.05);
    o2.stop(time + dur + 0.05);
  }

  _kick(time) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, time);
    o.frequency.exponentialRampToValueAtTime(46, time + 0.14);
    g.gain.setValueAtTime(0.5, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    o.connect(g);
    g.connect(this.drumGain);
    o.start(time);
    o.stop(time + 0.3);
  }

  _snare(time) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    src.connect(f);
    f.connect(g);
    g.connect(this.drumGain);
    src.start(time);
    src.stop(time + 0.2);
  }

  _hat(time) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.09, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.drumGain);
    src.start(time);
    src.stop(time + 0.07);
  }

  /* ================================================================ */
  /*                                音效                              */
  /* ================================================================ */

  playSFX(name, opts = {}) {
    if (!this.ready || this.sfxVolume <= 0.001) return;
    const t = this.ctx.currentTime + 0.01;

    try {
      switch (name) {
        case 'click': this._sfxClick(t); break;
        case 'step': this._sfxStep(t, opts); break;
        case 'jump': this._sfxJump(t); break;
        case 'land': this._sfxLand(t); break;
        case 'collect': this._sfxCollect(t, opts.index || 0); break;
        case 'wish': this._sfxWish(t); break;
        case 'gift': this._sfxGift(t); break;
        case 'firework': this._sfxFirework(t); break;
        case 'cheer': this._sfxCheer(t); break;
        case 'blow': this._sfxBlow(t); break;
        case 'door': this._sfxDoor(t); break;
        case 'unlock': this._sfxUnlock(t); break;
        case 'finale': this._sfxFinale(t); break;
        default: this._sfxClick(t);
      }
    } catch (e) {
      // 音频失败绝不影响体验
    }
  }

  _note(freq, time, dur, gain, type = 'sine', dest = null) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(dest || this.sfxGain);
    o.start(time);
    o.stop(time + dur + 0.03);
    return o;
  }

  _noise(time, dur, { type = 'bandpass', freq = 1200, q = 1, gain = 0.2, sweepTo = null } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, time);
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, time + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(time);
    src.stop(time + dur + 0.02);
  }

  _sfxClick(t) {
    this._note(880, t, 0.09, 0.16, 'sine');
    this._note(1320, t + 0.01, 0.07, 0.08, 'sine');
  }

  _sfxStep(t, opts) {
    const base = 780 + Math.random() * 260;
    this._noise(t, 0.07, { type: 'bandpass', freq: base, q: 1.4, gain: 0.06 * (opts.volume ?? 1) });
  }

  _sfxJump(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.14);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.24);
  }

  _sfxLand(t) {
    this._noise(t, 0.12, { type: 'lowpass', freq: 500, gain: 0.14 });
  }

  /** 收集祝福：清脆铃铛，逐颗升高音高 */
  _sfxCollect(t, index = 0) {
    const scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637];
    const f = scale[index % scale.length];
    this._note(f, t, 0.7, 0.22, 'sine');
    this._note(f * 1.5, t + 0.03, 0.5, 0.1, 'sine');
    this._note(f * 2, t + 0.06, 0.4, 0.06, 'triangle');
    // 一声轻微的"叮"
    this._noise(t, 0.16, { type: 'highpass', freq: 5000, gain: 0.05 });
  }

  /** 许愿：流星划过的嗖声 + 上行琶音 */
  _sfxWish(t) {
    this._noise(t, 0.75, { type: 'bandpass', freq: 450, q: 2.6, gain: 0.16, sweepTo: 5200 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._note(f, t + 0.05 + i * 0.09, 0.8, 0.12, 'sine');
    });
  }

  /** 打开礼物：彩带喷射 + 小欢呼 + 上行短句 */
  _sfxGift(t) {
    this._noise(t, 0.4, { type: 'highpass', freq: 1800, gain: 0.22, sweepTo: 6000 });
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
      this._note(f, t + 0.02 + i * 0.075, 0.5, 0.16, 'triangle');
    });
    setTimeout(() => this._sfxCheer(this.ctx?.currentTime + 0.01), 220);
  }

  /** 烟花：低频爆响 + 噼啪 */
  _sfxFirework(t) {
    this._noise(t, 0.3, { type: 'lowpass', freq: 900, gain: 0.3, sweepTo: 120 });
    for (let i = 0; i < 12; i++) {
      this._noise(t + 0.06 + Math.random() * 0.5, 0.05, {
        type: 'highpass', freq: 4200, gain: 0.05,
      });
    }
  }

  /** 欢呼：带调制的噪声，模拟人群 */
  _sfxCheer(t) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 0.65;
    const g = this.ctx.createGain();

    const dur = 1.6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.18);
    g.gain.linearRampToValueAtTime(0.1, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    // 用 LFO 调制音量，产生"此起彼伏"的人群感
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 5.5;
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);

    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    lfo.start(t);
    src.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);

    [523.25, 783.99, 1046.5].forEach((fr, i) => {
      this._note(fr, t + i * 0.02, 0.9, 0.07, 'triangle');
    });
  }

  /** 吹灭蜡烛：一口气 */
  _sfxBlow(t) {
    this._noise(t, 0.55, { type: 'bandpass', freq: 700, q: 0.9, gain: 0.2, sweepTo: 240 });
    this._note(196, t + 0.45, 0.5, 0.1, 'sine');
  }

  /** 大门开启：低沉的木质摩擦 */
  _sfxDoor(t) {
    this._noise(t, 1.1, { type: 'lowpass', freq: 420, gain: 0.16, sweepTo: 180 });
    this._note(98, t + 0.1, 1.0, 0.1, 'triangle');
    this._note(147, t + 0.35, 0.8, 0.06, 'sine');
  }

  /** 庆典按钮解锁 */
  _sfxUnlock(t) {
    [392, 523.25, 659.25, 880].forEach((f, i) => {
      this._note(f, t + i * 0.1, 0.7, 0.16, 'triangle');
    });
  }

  /** 最终点亮：完整的和弦洪流 */
  _sfxFinale(t) {
    const chord = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f, i) => {
      this._note(f, t + i * 0.055, 3.2, 0.14, 'triangle');
      this._note(f * 2, t + i * 0.055 + 0.02, 2.4, 0.05, 'sine');
    });
    this._noise(t, 1.2, { type: 'highpass', freq: 2600, gain: 0.12, sweepTo: 8000 });
  }

  /* ================================================================ */
  setVolumes({ music, sfx } = {}) {
    if (music !== undefined) {
      this.musicVolume = music;
      if (this.musicGain) {
        const now = this.ctx.currentTime;
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.linearRampToValueAtTime(music * 0.5, now + 0.25);
      }
    }
    if (sfx !== undefined) {
      this.sfxVolume = sfx;
      if (this.sfxGain) this.sfxGain.gain.value = sfx;
    }
  }

  get isReady() {
    return this.ready;
  }
}
