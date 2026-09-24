import { I18N } from './DataLoader.js';
import { clamp } from './utils/math.js';

const RING_LENGTH = 2 * Math.PI * 27;   // r = 27

/**
 * UI 管理器：所有 DOM 操作都收敛在这里
 * 通过 bind() 注入回调，与游戏逻辑解耦。
 */
export class UIManager {
  constructor(state) {
    this.state = state;
    this.lang = state.state.settings.lang || 'zh';
    this.cbs = {};
    this.disabledStack = 0;
    this._toasts = [];

    this.el = {
      loading: document.getElementById('loadingScreen'),
      loadingText: document.getElementById('loadingText'),

      start: document.getElementById('startScreen'),
      startSub: document.getElementById('startSub'),
      startDesc: document.querySelector('.start-desc'),
      enterBtn: document.getElementById('enterBtn'),
      resumeBtn: document.getElementById('resumeBtn'),
      startHint: document.querySelector('.start-hint'),

      hud: document.getElementById('hud'),
      hudName: document.getElementById('hudName'),
      ringFg: document.getElementById('ringFg'),
      progressNum: document.getElementById('progressNum'),
      bookBtn: document.getElementById('bookBtn'),
      bookBadge: document.getElementById('bookBadge'),
      settingsBtn: document.getElementById('settingsBtn'),
      pauseBtn: document.getElementById('pauseBtn'),

      interactHint: document.getElementById('interactHint'),
      interactText: document.getElementById('interactText'),
      interactBtn: document.getElementById('interactBtn'),
      toastWrap: document.getElementById('toastWrap'),
      questText: document.getElementById('questText'),

      book: document.getElementById('bookPanel'),
      bookSub: document.getElementById('bookSub'),
      bookList: document.getElementById('bookList'),
      bookFoot: document.getElementById('bookFoot'),

      wish: document.getElementById('wishModal'),
      wishPrev: document.getElementById('wishPrev'),
      wishInput: document.getElementById('wishInput'),
      wishCount: document.getElementById('wishCount'),
      wishConfirm: document.getElementById('wishConfirm'),

      card: document.getElementById('surpriseCard'),
      cardTitle: document.getElementById('cardTitle'),
      cardMsg: document.getElementById('cardMsg'),
      cardClose: document.getElementById('cardClose'),

      settings: document.getElementById('settingsPanel'),
      setMusic: document.getElementById('setMusic'),
      setSfx: document.getElementById('setSfx'),
      setQuality: document.getElementById('setQuality'),
      setReduce: document.getElementById('setReduce'),
      setLang: document.getElementById('setLang'),
      resetBtn: document.getElementById('resetBtn'),

      pause: document.getElementById('pauseMenu'),
      pauseResume: document.getElementById('pauseResume'),
      pauseBook: document.getElementById('pauseBook'),
      pauseRestart: document.getElementById('pauseRestart'),

      finale: document.getElementById('finalePanel'),
      finaleSub: document.getElementById('finaleSub'),
      finaleStats: document.getElementById('finaleStats'),
      replayBtn: document.getElementById('replayBtn'),
      shareBtn: document.getElementById('shareBtn'),

      jumpBtn: document.getElementById('jumpBtn'),
      joyLabel: document.querySelector('.joy-label'),
    };

    this._bindCloseButtons();
  }

  /* ================================================================ */
  t(key, vars) {
    const dict = I18N[this.lang] || I18N.zh;
    let s = dict[key] ?? I18N.zh[key] ?? key;
    if (typeof s === 'string' && vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return s;
  }

  /** 注册回调 */
  bind(cbs) {
    this.cbs = { ...this.cbs, ...cbs };
    const E = this.el;

    E.enterBtn?.addEventListener('click', () => this._fire('enter'));
    E.resumeBtn?.addEventListener('click', () => this._fire('resume'));
    E.bookBtn?.addEventListener('click', () => { this._clickSound(); this._fire('toggleBook'); });
    E.settingsBtn?.addEventListener('click', () => { this._clickSound(); this._fire('toggleSettings'); });
    E.pauseBtn?.addEventListener('click', () => this._fire('pause'));
    E.cardClose?.addEventListener('click', () => { this._clickSound(); this.hideCard(); });
    E.pauseResume?.addEventListener('click', () => this._fire('resumeGame'));
    E.pauseBook?.addEventListener('click', () => { this.closePause(); this.openBook(); });
    E.pauseRestart?.addEventListener('click', () => this._fire('restart'));
    E.resetBtn?.addEventListener('click', () => this._fire('restart'));
    E.replayBtn?.addEventListener('click', () => this._fire('replay'));
    E.shareBtn?.addEventListener('click', () => this._fire('share'));
    E.interactBtn?.addEventListener('click', () => this._fire('interactButton'));

    /* 许愿输入 */
    E.wishConfirm?.addEventListener('click', () => {
      const text = (E.wishInput.value || '').trim();
      if (!text) {
        E.wishInput.focus();
        return;
      }
      this.hideWish();
      this._fire('wishConfirm', text);
    });
    E.wishInput?.addEventListener('input', () => {
      E.wishCount.textContent = String(E.wishInput.value.length);
    });
    E.wishInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        E.wishConfirm.click();
      }
    });

    /* 设置 */
    const applySettings = () => {
      this._fire('settings', {
        music: Number(E.setMusic.value),
        sfx: Number(E.setSfx.value),
        quality: E.setQuality.value,
        reduceMotion: E.setReduce.checked,
        lang: E.setLang.value,
      });
    };
    E.setMusic?.addEventListener('input', applySettings);
    E.setSfx?.addEventListener('input', applySettings);
    E.setQuality?.addEventListener('change', applySettings);
    E.setReduce?.addEventListener('change', applySettings);
    E.setLang?.addEventListener('change', () => {
      this.setLang(E.setLang.value);
      this._fire('settings', { lang: E.setLang.value });
    });
  }

  _fire(name, payload) {
    try {
      this.cbs[name]?.(payload);
    } catch (e) {
      console.error('[UIManager] callback error:', name, e);
    }
  }

  _clickSound() {
    this.cbs.sfx?.('click');
  }

  _bindCloseButtons() {
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-close');
        const el = document.getElementById(id);
        if (id === 'wishModal') this.hideWish();
        else if (id === 'bookPanel') this.closeBook();
        else if (id === 'settingsPanel') this.closeSettings();
        else el?.classList.add('hidden');
        this._clickSound();
      });
    });
  }

  /* ================================================================ */
  /*                              加载层                              */
  /* ================================================================ */
  setLoading(text) {
    if (this.el.loadingText && text) this.el.loadingText.textContent = text;
  }

  hideLoading() {
    this.el.loading?.classList.add('hidden');
  }

  /* ================================================================ */
  /*                             开始屏幕                             */
  /* ================================================================ */
  showStart({ hasSave = false } = {}) {
    const E = this.el;
    E.startSub.textContent = this.t('dedicate', { name: this.state.state.playerName });
    if (E.startDesc) E.startDesc.textContent = this.t('startDesc');
    if (E.enterBtn) E.enterBtn.querySelector('span').textContent = this.t('enter');
    E.resumeBtn.textContent = this.t('resume');
    if (E.startHint) E.startHint.innerHTML = this.t('startHint').replace(
      /(\?[^\s]*)/,
      '<code>$1</code>'
    );
    E.resumeBtn.classList.toggle('hidden', !hasSave);
    E.start.classList.remove('hidden');
  }

  hideStart() {
    this.el.start?.classList.add('hidden');
  }

  /* ================================================================ */
  /*                                HUD                               */
  /* ================================================================ */
  showHUD() {
    this.el.hud?.classList.remove('hidden');
  }

  hideHUD() {
    this.el.hud?.classList.add('hidden');
  }

  setName(name) {
    if (this.el.hudName) this.el.hudName.textContent = name;
  }

  setProgress(progress) {
    const p = clamp(progress / 100, 0, 1);
    if (this.el.ringFg) {
      this.el.ringFg.style.strokeDashoffset = String(RING_LENGTH * (1 - p));
      // 越接近满环越金
      this.el.ringFg.style.stroke = p >= 1 ? '#FFD700' : p > 0.6 ? '#FFB347' : '#FF69B4';
    }
    if (this.el.progressNum) this.el.progressNum.textContent = String(Math.round(progress));
  }

  setQuest(text) {
    if (this.el.questText) this.el.questText.textContent = text;
  }

  setBookBadge(collected, total) {
    if (this.el.bookBadge) this.el.bookBadge.textContent = `${collected}`;
    this.el.bookBtn?.setAttribute('title', `${this.t('book')} (${collected}/${total})`);
  }

  /* ================================================================ */
  /*                              交互提示                            */
  /* ================================================================ */
  showInteractHint(text) {
    if (!this.el.interactHint) return;
    if (this.el.interactText.textContent !== text) this.el.interactText.textContent = text;
    this.el.interactHint.classList.remove('hidden');
    this.el.interactBtn?.classList.remove('hidden');
  }

  hideInteractHint() {
    this.el.interactHint?.classList.add('hidden');
    this.el.interactBtn?.classList.add('hidden');
  }

  /* ================================================================ */
  /*                               Toast                              */
  /* ================================================================ */
  toast({ label = '', text = '', mini = '', gold = false, duration = 3200 } = {}) {
    const wrap = this.el.toastWrap;
    if (!wrap) return null;

    // 最多同时显示 3 条
    while (wrap.children.length >= 3) {
      wrap.removeChild(wrap.firstChild);
    }

    const div = document.createElement('div');
    div.className = `toast${gold ? ' gold' : ''}`;
    div.innerHTML = `
      ${label ? `<div class="t-label">${this._escape(label)}</div>` : ''}
      <div class="t-text">${this._escape(text)}</div>
      ${mini ? `<div class="t-mini">${this._escape(mini)}</div>` : ''}
    `;
    wrap.appendChild(div);

    const timer = setTimeout(() => {
      div.classList.add('out');
      setTimeout(() => div.remove(), 480);
    }, duration);

    this._toasts.push(timer);
    return div;
  }

  clearToasts() {
    for (const t of this._toasts) clearTimeout(t);
    this._toasts = [];
    if (this.el.toastWrap) this.el.toastWrap.innerHTML = '';
  }

  /* ================================================================ */
  /*                              祝福册                              */
  /* ================================================================ */
  openBook() {
    this.renderBook();
    this.el.book?.classList.remove('hidden');
    this._pushDisabled();
  }

  closeBook() {
    this.el.book?.classList.add('hidden');
    this._popDisabled();
  }

  toggleBook() {
    if (this.el.book?.classList.contains('hidden')) this.openBook();
    else this.closeBook();
  }

  get bookOpen() {
    return !this.el.book?.classList.contains('hidden');
  }

  renderBook() {
    const s = this.state.state;
    const wishes = s.wishes;
    const collected = new Set(s.collectedBlessings);

    this.el.bookSub.textContent = this.t('collected', {
      n: collected.size,
      total: wishes.length,
    });

    this.el.bookList.innerHTML = wishes
      .map((w) => {
        const got = collected.has(w.id);
        return `
        <div class="bw-card${got ? '' : ' locked'}">
          <div class="ic">${got ? '★' : '?'}</div>
          <div class="txt">
            ${got ? this._escape(w.text) : this.t('locked')}
            ${got && w.from ? `<span class="from">—— ${this._escape(w.from)}</span>` : ''}
          </div>
        </div>`;
      })
      .join('');

    const all = collected.size >= wishes.length && wishes.length > 0;
    this.el.bookFoot.textContent = all
      ? this.t('allCollected')
      : `${collected.size} / ${wishes.length}`;
    this.el.bookFoot.classList.toggle('gold', all);
  }

  _escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* ================================================================ */
  /*                              许愿框                              */
  /* ================================================================ */
  showWish(prefill = false) {
    const s = this.state.state;
    const prev = s.userWish || '';
    const E = this.el;

    E.wishPrev.textContent = prev
      ? this.t('wishPrev', { wish: prev })
      : '';
    E.wishInput.value = '';
    E.wishCount.textContent = '0';
    E.wishInput.placeholder = this.t('wishPlaceholder');
    document.querySelector('#wishModal .modal-card h2').textContent = this.t('wishTitle');
    document.querySelector('#wishModal .btn-ghost').textContent = this.t('wishCancel');
    E.wishConfirm.textContent = this.t('wishConfirm');

    E.wish.classList.remove('hidden');
    this._pushDisabled();
    setTimeout(() => E.wishInput?.focus(), 120);
  }

  hideWish() {
    this.el.wish?.classList.add('hidden');
    this._popDisabled();
  }

  get wishOpen() {
    return !this.el.wish?.classList.contains('hidden');
  }

  /* ================================================================ */
  /*                              贺卡                                */
  /* ================================================================ */
  showCard({ title, msg }) {
    this.el.cardTitle.textContent = title;
    this.el.cardMsg.textContent = msg;
    this.el.card.classList.remove('hidden');
    this._pushDisabled();
  }

  hideCard() {
    this.el.card?.classList.add('hidden');
    this._popDisabled();
  }

  /* ================================================================ */
  /*                              设置                                */
  /* ================================================================ */
  openSettings() {
    const s = this.state.state.settings;
    const E = this.el;
    E.setMusic.value = String(s.music);
    E.setSfx.value = String(s.sfx);
    E.setQuality.value = s.quality;
    E.setReduce.checked = !!s.reduceMotion;
    E.setLang.value = s.lang;

    // 文案本地化
    const rows = document.querySelectorAll('#settingsPanel .row span');
    const keys = ['music', 'sfx', 'quality', 'reduceMotion', 'lang'];
    rows.forEach((r, i) => { if (keys[i]) r.textContent = this.t(keys[i]); });
    E.setQuality.options[0].textContent = this.t('qHigh');
    E.setQuality.options[1].textContent = this.t('qMid');
    E.setQuality.options[2].textContent = this.t('qLow');
    E.resetBtn.textContent = this.t('reset');

    E.settings.classList.remove('hidden');
    this._pushDisabled();
  }

  closeSettings() {
    this.el.settings?.classList.add('hidden');
    this._popDisabled();
  }

  get settingsOpen() {
    return !this.el.settings?.classList.contains('hidden');
  }

  /* ================================================================ */
  /*                              暂停                                */
  /* ================================================================ */
  openPause() {
    const E = this.el;
    document.querySelector('#pauseMenu h2').textContent = this.t('pause');
    E.pauseResume.textContent = this.t('pauseResume');
    E.pauseBook.textContent = this.t('pauseBook');
    E.pauseRestart.textContent = this.t('pauseRestart');
    E.pause.classList.remove('hidden');
    this._pushDisabled();
  }

  closePause() {
    this.el.pause?.classList.add('hidden');
    this._popDisabled();
  }

  get pauseOpen() {
    return !this.el.pause?.classList.contains('hidden');
  }

  /** 是否有任何面板/弹窗打开（用于禁用角色输入） */
  get anyOverlayOpen() {
    return this.bookOpen || this.wishOpen || this.settingsOpen || this.pauseOpen ||
      !this.el.card?.classList.contains('hidden') ||
      !this.el.finale?.classList.contains('hidden');
  }

  _pushDisabled() {
    this.disabledStack++;
    this._fire('overlay', true);
  }

  _popDisabled() {
    this.disabledStack = Math.max(0, this.disabledStack - 1);
    if (this.disabledStack === 0) this._fire('overlay', false);
  }

  /* ================================================================ */
  /*                             最终点亮                             */
  /* ================================================================ */
  showFinale(stats) {
    const E = this.el;
    E.finaleSub.textContent = this.t('finaleSub', { name: this.state.state.playerName });
    document.querySelector('.finale-title').textContent = this.t('finaleTitle');
    E.replayBtn.textContent = this.t('replay');
    E.shareBtn.textContent = this.t('share');

    const mins = Math.max(1, Math.round(stats.durationSec / 60));
    E.finaleStats.innerHTML = `
      <div class="stat-chip"><b>${stats.blessings}/${stats.totalBlessings}</b><span>${this.t('statsBless')}</span></div>
      <div class="stat-chip"><b>${Math.round(stats.progress)}%</b><span>${this.t('statsProgress')}</span></div>
      <div class="stat-chip"><b>${mins} ${this.t('minute')}</b><span>${this.t('statsTime')}</span></div>
    `;
    E.finale.classList.remove('hidden');
    this._fire('overlay', true);
  }

  hideFinale() {
    this.el.finale?.classList.add('hidden');
    this._fire('overlay', false);
  }

  /* ================================================================ */
  /*                              语言                                */
  /* ================================================================ */
  setLang(lang) {
    this.lang = I18N[lang] ? lang : 'zh';
    document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
    this.setQuest(this.t('quests')[0]);
    if (this.el.joyLabel) this.el.joyLabel.textContent = this.t('sprint');
    if (this.el.jumpBtn) this.el.jumpBtn.textContent = this.t('jump');
    if (this.el.interactBtn) this.el.interactBtn.textContent = this.t('interactKey');
    const ring = document.querySelector('.progress-ring');
    if (ring) ring.title = this.t('progressLabel');
  }

  /* ================================================================ */
  /*                              杂项                                */
  /* ================================================================ */
  setLoadingProgress(p) {
    this.setLoading(`${this.t('loading')} ${Math.round(clamp(p, 0, 1) * 100)}%`);
  }
}
