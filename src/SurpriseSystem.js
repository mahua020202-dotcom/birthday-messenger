import * as THREE from 'three';
import { createToonMaterial, createGlowSprite, addOutline } from './ToonMaterial.js';
import { PROGRESS_WEIGHTS } from './StateManager.js';
import { createRandom } from './utils/math.js';
import { clamp } from './utils/math.js';

/**
 * 惊喜系统
 * 金色惊喜礼盒 → 开盖弹出蛋糕与彩带 → 展开贺卡 → 蛋糕出现，蜡烛可吹灭
 */
export class SurpriseSystem {
  constructor({ scene, state, ui, audio, particles, interaction, castle, palette, cameraCtl, data }) {
    this.scene = scene;
    this.state = state;
    this.ui = ui;
    this.audio = audio;
    this.particles = particles;
    this.interaction = interaction;
    this.castle = castle;
    this.palette = palette;
    this.cameraCtl = cameraCtl;
    this.data = data || {};
    this.random = createRandom(606);

    this.boxPos = castle.anchors.giftBox.clone();
    this.popup = null;
    this.popupT = 0;
    this.opened = false;
    this.roomGlows = [];
  }

  /* ================================================================ */
  build() {
    /* --- 礼盒上的光柱标记 --- */
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.palette.gold),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.marker = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 32), ringMat);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.set(this.boxPos.x, 0.4, this.boxPos.z);
    this.marker.raycast = () => {};
    this.scene.add(this.marker);

    /* --- 弹出的小蛋糕（默认隐藏） --- */
    this._buildPopupCake();

    /* --- 礼物房的暖金氛围光（惊喜后亮起） --- */
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const glow = createGlowSprite({ color: '#FFD700', size: 7, opacity: 0, alpha: '0.7' });
      glow.position.set(
        this.boxPos.x + Math.cos(a) * 3.4,
        2.6 + Math.sin(i) * 0.4,
        this.boxPos.z + Math.sin(a) * 3.4
      );
      this.scene.add(glow);
      this.roomGlows.push(glow);
    }

    /* --- 交互：惊喜礼盒 --- */
    this.interaction.register({
      id: 'surprise-gift',
      kind: 'gift',
      position: new THREE.Vector3(this.boxPos.x, this.boxPos.y + 1.2, this.boxPos.z),
      radius: 3.6,
      maxDy: 4,
      priority: 1.5,
      hint: () => this.ui.t('hintGift'),
      enabled: () => !this.opened && !this.ui.anyOverlayOpen,
      objects: this.castle.bigGift ? [this.castle.bigGift.group] : [],
      onHighlight: (on) => { this._giftHl = on; },
      onInteract: () => this.openGift(),
    });

    /* --- 交互：吹蜡烛 --- */
    const cakeAnchor = this.castle.anchors.cake;
    this.interaction.register({
      id: 'cake-candles',
      kind: 'candle',
      position: new THREE.Vector3(cakeAnchor.x, 4.6, cakeAnchor.z),
      radius: 7.2,
      maxDy: 7.5,
      priority: 0.6,
      hint: () => this.ui.t('hintCandle'),
      enabled: () => !this.state.state.candlesBlown,
      objects: this.castle.cakeCandles.flatMap((c) => [c.body, c.flame]),
      onHighlight: (on) => { this._candleHl = on; },
      onInteract: () => this.blowCandles(),
    });
  }

  _buildPopupCake() {
    const g = new THREE.Group();
    g.position.set(this.boxPos.x, this.boxPos.y + 1.3, this.boxPos.z);
    g.visible = false;
    this.scene.add(g);

    const tiers = [
      { r: 0.85, h: 0.4, c: '#FFF8F0' },
      { r: 0.62, h: 0.34, c: '#FFD1DC' },
      { r: 0.4, h: 0.3, c: '#FF9EC4' },
    ];
    let y = 0;
    for (const t of tiers) {
      const mat = createToonMaterial({ color: t.c, toonSteps: 2.2, rimIntensity: 0.25 });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r * 1.02, t.h, 24), mat);
      mesh.position.y = y + t.h / 2;
      g.add(mesh);
      addOutline(mesh, { width: 0.0035, color: '#7A3B52' });
      y += t.h;
    }

    // 蜡烛
    const candleMat = createToonMaterial({ color: '#FFFFFF', toonSteps: 1.8 });
    const flameMat = createToonMaterial({
      color: '#FFE9A0', emissive: '#FFB347', emissiveIntensity: 1.2, rimIntensity: 0,
      transparent: true, opacity: 0.95, depthWrite: false,
    });
    this.popupFlameMat = flameMat;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.28, 8), candleMat);
      c.position.set(Math.cos(a) * 0.18, y + 0.14, Math.sin(a) * 0.18);
      g.add(c);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), flameMat);
      f.position.set(Math.cos(a) * 0.18, y + 0.36, Math.sin(a) * 0.18);
      g.add(f);
    }

    const glow = createGlowSprite({ color: '#FFE4A0', size: 5.5, opacity: 0.6, alpha: '0.85' });
    glow.position.y = y * 0.5;
    g.add(glow);

    this.popup = g;
    this.popupBaseY = this.boxPos.y + 1.3;
    this.popupGlow = glow;
  }

  /* ================================================================ */
  openGift() {
    if (this.opened) return false;
    this.opened = true;
    this.state.state.surpriseOpened = true;

    /* --- 开盖 --- */
    this.castle.openGiftBox();
    this.audio.playSFX('gift');

    /* --- 弹出蛋糕 --- */
    this.popupT = 0;
    this.popup.visible = true;
    this.popup.scale.setScalar(0.01);
    this.popup.position.y = this.popupBaseY - 0.6;

    /* --- 彩带爆裂 --- */
    const p = new THREE.Vector3(this.boxPos.x, this.boxPos.y + 2.6, this.boxPos.z);
    this.particles.burst(p, {
      count: 200,
      colors: ['#FF9EC4', '#FFD700', '#FFFFFF', '#B8D4E8', '#C9A6FF', '#A8E6CF'],
      speed: 8.5,
      gravity: 7.5,
      drag: 1.1,
      life: 2.6,
      lifeVariance: 0.5,
      size: 2.6,
      sizeEnd: 0.03,
      curl: 0.5,
    });
    // 向上的礼花
    this.particles.burst(p, {
      count: 90,
      colors: ['#FFD700', '#FFF8F0'],
      speed: 11,
      spread: 0.35,
      gravity: 8,
      drag: 0.9,
      life: 2.4,
      size: 3.0,
      sizeEnd: 0.05,
    });

    /* --- 房间氛围变暖 --- */
    for (const g of this.roomGlows) {
      g.userData.fade = 1;
    }

    /* --- 贺卡 --- */
    const s = this.state.state;
    setTimeout(() => {
      this.ui.showCard({
        title: this.ui.t('cardTitle', { name: s.playerName }),
        msg: this.data.surprise || '愿你的每一天都像今天一样闪闪发光。',
      });
      this.audio.playSFX('cheer');
    }, 620);

    /* --- 进度 --- */
    this.state.addProgress(PROGRESS_WEIGHTS.surprise, 'surprise');

    this.cameraCtl?.nudge(0.03, 0.02);
    return true;
  }

  /* ================================================================ */
  blowCandles() {
    if (this.state.state.candlesBlown) return false;
    this.state.state.candlesBlown = true;
    this.castle.blowCakeCandles();
    this.audio.playSFX('blow');

    const cake = this.castle.anchors.cake;
    // 一缕青烟 + 一簇小烟花
    this.particles.burst(new THREE.Vector3(cake.x, 5.6, cake.z), {
      count: 40,
      colors: ['#FFFFFF', '#E8E0EA'],
      speed: 1.4,
      upwardBias: 1.2,
      gravity: -0.8,
      drag: 1.4,
      life: 2.2,
      size: 1.6,
      sizeEnd: 0.02,
    });

    setTimeout(() => {
      // 少量烟花庆祝
      for (let i = 0; i < 3; i++) {
        const from = new THREE.Vector3(cake.x + this.random.range(-8, 8), 2, cake.z + this.random.range(2, 12));
        const to = new THREE.Vector3(from.x + this.random.range(-4, 4), this.random.range(22, 34), from.z + this.random.range(-4, 4));
        this.particles.firework(from, to, {
          count: 90,
          duration: 0.9,
          colors: ['#FFD700', '#FF9EC4', '#FFFFFF'],
        });
      }
      this.audio.playSFX('firework');
    }, 320);

    this.ui.toast({
      label: '🕯',
      text: this.ui.lang === 'en' ? 'Wish granted — the candles are out.' : '愿望已被听见，蜡烛熄灭啦。',
      gold: true,
      duration: 3400,
    });

    this.state.save();
    return true;
  }

  /* ================================================================ */
  restore() {
    if (this.state.state.surpriseOpened) {
      this.opened = true;
      this.castle.openGiftBox();
      this.castle.giftOpenProgress = 1;
      this.popup.visible = true;
      this.popup.scale.setScalar(1);
      this.popup.position.y = this.popupBaseY;
      this.popupT = 1;
      this.marker.visible = false;
      for (const g of this.roomGlows) g.userData.fade = 1;
    }
    if (this.state.state.candlesBlown) {
      this.castle.blowCakeCandles();
    }
  }

  /* ================================================================ */
  update(dt, elapsed) {
    /* --- 标记环 --- */
    if (this.marker) {
      const on = !this.opened;
      this.marker.visible = on;
      if (on) {
        const hl = this._giftHl ? 1 : 0;
        const pulse = 1 + Math.sin(elapsed * 2.4) * 0.1 + hl * 0.14;
        this.marker.scale.setScalar(pulse);
        this.marker.material.opacity = 0.28 + Math.sin(elapsed * 2.4) * 0.12 + hl * 0.35;
        this.marker.rotation.z = elapsed * 0.4;
      }
    }

    /* --- 弹出蛋糕升起 --- */
    if (this.popup && this.popup.visible && this.popupT < 1) {
      this.popupT = clamp(this.popupT + dt * 0.85, 0, 1);
      const e = 1 - Math.pow(1 - this.popupT, 3);
      this.popup.scale.setScalar(0.01 + e * 0.99);
      this.popup.position.y = this.popupBaseY - 0.6 + e * 0.6 + Math.sin(elapsed * 1.6) * 0.06;
    } else if (this.popup && this.popup.visible) {
      this.popup.position.y = this.popupBaseY + Math.sin(elapsed * 1.5) * 0.09;
      this.popup.rotation.y = Math.sin(elapsed * 0.5) * 0.25;
      if (this.popupFlameMat) {
        this.popupFlameMat.uniforms.uEmissiveIntensity.value =
          1.0 + Math.sin(elapsed * 14) * 0.22;
      }
      if (this.popupGlow) {
        this.popupGlow.material.opacity = 0.45 + Math.sin(elapsed * 2.4) * 0.14;
      }
    }

    /* --- 房间氛围光渐亮 --- */
    for (const g of this.roomGlows) {
      const target = g.userData.fade || 0;
      const cur = g.userData.cur ?? 0;
      const next = cur + (target - cur) * Math.min(1, dt * 1.1);
      g.userData.cur = next;
      g.material.opacity = next * (0.32 + Math.sin(elapsed * 1.8) * 0.08);
    }

    /* --- 未开箱时的呼吸光 --- */
    if (!this.opened && this.castle.bigGift?.glow) {
      const hl = this._giftHl ? 1 : 0;
      this.castle.bigGift.glow.material.opacity = 0.3 + Math.sin(elapsed * 2.1) * 0.14 + hl * 0.3;
    }
  }

  reset() {
    this.opened = false;
    this.state.state.surpriseOpened = false;
    this.state.state.candlesBlown = false;
    if (this.popup) {
      this.popup.visible = false;
      this.popupT = 0;
    }
    for (const g of this.roomGlows) g.userData.fade = 0;
  }
}
