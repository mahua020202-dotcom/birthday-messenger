import * as THREE from 'three';
import { setEnvironmentProgress, setFogProgress, setLightDirection } from './ToonMaterial.js';
import { clamp, lerp } from './utils/math.js';
import { damp } from './utils/easing.js';

/**
 * 点亮世界系统
 * 把 progress（0–100）翻译成整个世界的视觉与听觉变化：
 * 环境光色温、云海配色、天空配色、星星、窗户、泛光、音乐层次。
 * 并负责「顶层露台」的触发与最终点亮动画。
 */
export class ProgressSystem {
  constructor({
    state, ui, sky, clouds, island, castle, post, audio, particles, celebration,
    character, cameraCtl, palette,
  }) {
    this.state = state;
    this.ui = ui;
    this.sky = sky;
    this.clouds = clouds;
    this.island = island;
    this.castle = castle;
    this.post = post;
    this.audio = audio;
    this.particles = particles;
    this.celebration = celebration;
    this.character = character;
    this.cameraCtl = cameraCtl;
    this.palette = palette;

    this.visual = 0;            // 平滑后的视觉进度 0..1
    this.completed = false;
    this.terraceDone = false;
    this._lastQuest = '';
    this._fireworkCooldown = 0;

    this.questKeys = ['quests:0', 'quests:1', 'quests:2', 'quests:3', 'quests:4'];
  }

  /* ================================================================ */
  /** 立即应用（初始化 / 读档） */
  applyImmediate() {
    this.visual = this.state.state.progress / 100;
    this._applyAll(this.visual);
    this.ui.setProgress(this.state.state.progress);
    this._updateQuest(true);
  }

  _applyAll(p) {
    setEnvironmentProgress(p);
    setFogProgress(p, '#8A9AB0', '#FFCFB8');
    this.sky.setProgress(p);
    this.clouds.setProgress(p);
    this.island.setProgress(p);
    this.castle.setProgress(p);
    this.post.setProgress(p);
    this.audio.setProgress(p);
  }

  /* ================================================================ */
  update(dt, elapsed) {
    /* --- 视觉进度平滑追随 --- */
    const target = this.state.state.progress / 100;
    const before = this.visual;
    this.visual = damp(this.visual, target, 1.6, dt);
    if (Math.abs(this.visual - before) > 0.0005) {
      this._applyAll(this.visual);
    } else if (Math.abs(this.visual - target) < 0.0005) {
      this.visual = target;
    }

    /* --- 方向光缓慢移动，让光影有生命 --- */
    setLightDirection(
      0.55 + Math.sin(elapsed * 0.045) * 0.35,
      1.0,
      0.42 + Math.cos(elapsed * 0.055) * 0.35
    );

    /* --- 顶层的进度提示 --- */
    this._updateQuest(false);

    /* --- 顶层露台触发 --- */
    this._checkTerrace(elapsed);

    /* --- 庆典时的额外泛光脉冲 --- */
    const boost = this.celebration.started
      ? (this.celebration.finished ? 0 : 0.2 + Math.sin(elapsed * 2.2) * 0.1)
      : 0;
    this.post.setBloomBoost(boost);

    /* --- 全部完成后的余韵：偶尔的烟花 --- */
    if (this.completed) {
      this._fireworkCooldown -= dt;
      if (this._fireworkCooldown <= 0 && !this.celebration.finished) {
        this._fireworkCooldown = 5.5 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2;
        const rad = 34 + Math.random() * 26;
        this.particles.firework(
          new THREE.Vector3(Math.cos(a) * rad * 0.5, -2, Math.sin(a) * rad * 0.5),
          new THREE.Vector3(Math.cos(a) * rad, 26 + Math.random() * 20, Math.sin(a) * rad),
          { count: 130, duration: 1.2 }
        );
      }
    }
  }

  /* ================================================================ */
  _updateQuest(force) {
    const s = this.state.state;
    const key =
      s.collectedBlessings.length < 3 ? 0 :
      !s.userWish ? 1 :
      !s.surpriseOpened ? 2 :
      !s.celebrationStarted ? 3 :
      !s.terraceVisited ? 4 : -1;

    const text = key < 0 ? this.ui.t('questAll') : this.ui.t('quests')[key];
    if (force || text !== this._lastQuest) {
      this._lastQuest = text;
      this.ui.setQuest(text);
    }
  }

  /* ================================================================ */
  _checkTerrace(elapsed) {
    if (this.terraceDone || this.state.state.terraceVisited) {
      this.terraceDone = true;
      return;
    }
    const t = this.castle.terraceTrigger;
    const p = this.character.position;
    const d = Math.hypot(p.x - t.position.x, p.z - t.position.z);
    if (d > t.radius || p.y < t.position.y - 1.6) return;

    this.terraceDone = true;
    this.state.state.terraceVisited = true;

    /* --- 露台点亮反馈 --- */
    this.particles.burst(
      new THREE.Vector3(t.position.x, t.position.y + 1.2, t.position.z),
      {
        count: 70,
        colors: ['#FFE4A0', '#FFFFFF', '#FFD1DC'],
        speed: 3.6,
        gravity: 1.4,
        drag: 2.0,
        life: 2.0,
        size: 2.2,
        sizeEnd: 0.04,
      }
    );
    this.audio.playSFX('collect', { index: 3 });
    this.cameraCtl?.nudge(0.0, 0.06);

    this.ui.toast({
      label: '☁',
      text: this.ui.lang === 'en'
        ? 'From the terrace, the whole cloud sea is yours.'
        : '站在顶层露台，整片云海都属于你。',
      gold: true,
      duration: 3800,
    });

    this.state.addProgress(10, 'terrace');
  }

  /* ================================================================ */
  /** state 触发 complete 时调用 */
  async playFinale() {
    if (this.completed) return;
    this.completed = true;
    this.state.state.finishedAt = Date.now();
    this.state.setStage('finale');
    this.ui.hideInteractHint();

    const name = this.state.state.playerName;
    const isEn = this.ui.lang === 'en';

    /* --- 全部灯光亮起 --- */
    this.castle.setWindowOverride(true);
    this.celebration.audio.setCelebration(true);
    this.post.setBloomBoost(0.45);

    /* --- 天空出现巨大的粒子文字 --- */
    this.sky.showText(isEn ? `HAPPY BIRTHDAY, ${name}` : `生日快乐，${name}`, {
      size: 40,
      position: new THREE.Vector3(0, 20, -44),
      // 此刻天空已是明亮的粉金，用高饱和撞色 + 普通混合才读得出来
      color: '#D9326E',
      secondaryColor: '#FF9E2C',
      maxPoints: 4200,
      font: 'bold 130px "PingFang SC", "Microsoft YaHei", sans-serif',
      blending: THREE.NormalBlending,
      sizeScale: 1.25,
    });

    /* --- 音效 + 一圈烟花 --- */
    this.audio.playSFX('finale');
    setTimeout(() => this.audio.playSFX('cheer'), 500);

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rad = 34 + (i % 3) * 14;
      setTimeout(() => {
        this.particles.firework(
          new THREE.Vector3(Math.cos(a) * rad * 0.5, 0, Math.sin(a) * rad * 0.5),
          new THREE.Vector3(Math.cos(a) * rad, 24 + (i % 4) * 8, Math.sin(a) * rad),
          { count: 150, duration: 1.1 }
        );
        this.audio.playSFX('firework');
      }, i * 320);
    }

    /* --- 镜头缓缓拉远，展示被点亮的世界 --- */
    setTimeout(() => {
      this.cameraCtl.startOrbit(null, { duration: 13, radius: 44, height: 17 });
    }, 600);

    /* --- 结束时展示结算面板 --- */
    setTimeout(() => {
      const stats = this.state.summary();
      this.ui.showFinale(stats);
      this.ui.toast({
        label: '✦',
        text: this.ui.lang === 'en' ? 'Your birthday world is fully lit.' : '你的生日世界已点亮 ✦',
        gold: true,
        duration: 5000,
      });
    }, 4600);
  }

  /* ================================================================ */
  reset() {
    this.visual = 0;
    this.completed = false;
    this.terraceDone = false;
    this.state.state.terraceVisited = false;
    this._applyAll(0);
    this.ui.setProgress(0);
    this.ui.hideFinale();
  }

  setProgressNow(p) {
    this.state.state.progress = clamp(p, 0, 100);
    this.visual = this.state.state.progress / 100;
    this._applyAll(this.visual);
    this.ui.setProgress(this.state.state.progress);
  }
}
