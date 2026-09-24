import { clamp } from './utils/math.js';

const SAVE_KEY = 'birthday_castle_save_v1';
const SETTINGS_KEY = 'birthday_castle_settings_v1';
const WISH_KEY = 'birthday_castle_wish_v1';

/** 各互动的进度权重（总计恰好 100） */
export const PROGRESS_WEIGHTS = {
  blessing: 5,      // × 8 颗 = 40
  wish: 15,
  surprise: 20,
  celebration: 15,
  terrace: 10,
};

export const STAGES = {
  INTRO: 'intro',
  FLYING: 'flying',
  PLAY: 'play',
  CELEBRATION: 'celebration',
  FINALE: 'finale',
};

/**
 * 全局状态与存档
 */
export class StateManager {
  constructor() {
    this.listeners = new Map();

    this.state = {
      playerName: '亲爱的寿星',
      wishes: [],                 // [{ id, text, from }]
      collectedBlessings: [],     // [id]
      userWish: '',
      userWishAt: 0,
      surpriseOpened: false,
      candlesBlown: false,
      celebrationStarted: false,
      terraceVisited: false,
      progress: 0,
      stage: STAGES.INTRO,
      settings: {
        music: 0.7,
        sfx: 0.8,
        quality: 'high',
        reduceMotion: false,
        lang: 'zh',
      },
      startedAt: Date.now(),
      finishedAt: 0,
      version: 1,
    };

    this.loadSettings();
  }

  /* ---------------- 事件 ---------------- */
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload, this.state); } catch (e) { console.error('[StateManager] listener error', e); }
    }
  }

  /* ---------------- 进度 ---------------- */
  addProgress(amount, reason = '') {
    const before = this.state.progress;
    this.state.progress = clamp(before + amount, 0, 100);
    this.emit('progress', { progress: this.state.progress, delta: this.state.progress - before, reason });
    if (before < 100 && this.state.progress >= 100) this.emit('complete', this.state);
    this.save();
    return this.state.progress - before;
  }

  get progress01() {
    return this.state.progress / 100;
  }

  /* ---------------- 阶段 ---------------- */
  setStage(stage) {
    if (this.state.stage === stage) return;
    this.state.stage = stage;
    this.emit('stage', stage);
  }

  /* ---------------- 设置 ---------------- */
  updateSettings(patch) {
    Object.assign(this.state.settings, patch);
    this.saveSettings();
    this.emit('settings', this.state.settings);
  }

  /* ---------------- 存档 ---------------- */
  hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      // 只有真正开始过才提示「继续」
      return !!(data && (data.progress > 0 || (data.collectedBlessings || []).length > 0));
    } catch {
      return false;
    }
  }

  save() {
    try {
      const { settings, ...rest } = this.state;
      localStorage.setItem(SAVE_KEY, JSON.stringify(rest));
    } catch (e) {
      console.warn('[StateManager] 存档失败（可能是隐私模式）', e);
    }
  }

  /**
   * 读取存档并合并进当前状态
   * @returns {boolean} 是否成功恢复
   */
  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      const s = this.state;
      s.collectedBlessings = data.collectedBlessings || [];
      s.userWish = data.userWish || '';
      s.userWishAt = data.userWishAt || 0;
      s.surpriseOpened = !!data.surpriseOpened;
      s.candlesBlown = !!data.candlesBlown;
      s.celebrationStarted = !!data.celebrationStarted;
      s.terraceVisited = !!data.terraceVisited;
      s.progress = clamp(data.progress || 0, 0, 100);
      s.startedAt = data.startedAt || Date.now();
      s.finishedAt = data.finishedAt || 0;
      this.emit('restored', s);
      return true;
    } catch (e) {
      console.warn('[StateManager] 读档失败', e);
      return false;
    }
  }

  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.state.settings)); } catch { /* ignore */ }
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.state.settings, JSON.parse(raw));
    } catch { /* ignore */ }
    // 移动端默认降一档画质
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (isMobile && !localStorage.getItem(SETTINGS_KEY)) {
      this.state.settings.quality = 'medium';
    }
  }

  /* ---------------- 愿望（独立存档，避免被清档误删） ---------------- */
  persistWish(text) {
    try { localStorage.setItem(WISH_KEY, text); } catch { /* ignore */ }
  }

  readPersistedWish() {
    try { return localStorage.getItem(WISH_KEY) || ''; } catch { return ''; }
  }

  /* ---------------- 汇总信息 ---------------- */
  summary() {
    const s = this.state;
    return {
      name: s.playerName,
      blessings: s.collectedBlessings.length,
      totalBlessings: s.wishes.length,
      wish: s.userWish,
      surprise: s.surpriseOpened,
      celebration: s.celebrationStarted,
      progress: s.progress,
      durationSec: Math.max(0, Math.round(((s.finishedAt || Date.now()) - s.startedAt) / 1000)),
    };
  }
}
