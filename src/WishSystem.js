import * as THREE from 'three';
import { createToonMaterial, createGlowSprite } from './ToonMaterial.js';
import { PROGRESS_WEIGHTS } from './StateManager.js';
import { createRandom } from './utils/math.js';

/**
 * 许愿系统
 * 许愿池 → 输入愿望 → 流星飞向夜空 → 夜空多一颗属于你的星
 */
export class WishSystem {
  constructor({ scene, state, ui, audio, particles, interaction, castle, sky, cameraCtl }) {
    this.scene = scene;
    this.state = state;
    this.ui = ui;
    this.audio = audio;
    this.particles = particles;
    this.interaction = interaction;
    this.castle = castle;
    this.sky = sky;
    this.cameraCtl = cameraCtl;
    this.random = createRandom(31337);

    this.poolCenter = castle.anchors.wishPool.clone();
    this.wishOrb = null;
    this.pendingMetor = null;
  }

  /* ================================================================ */
  build() {
    /* --- 池心的许愿光球 --- */
    const mat = createToonMaterial({
      color: '#FFFFFF',
      toonSteps: 1.4,
      emissive: '#FFE4A0',
      emissiveIntensity: 0.5,
      rimIntensity: 0.6,
      rimColor: '#FFFFFF',
    });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 2), mat);
    const glow = createGlowSprite({ color: '#FFE4A0', size: 4.6, opacity: 0.4, alpha: '0.85' });
    const g = new THREE.Group();
    g.add(orb);
    g.add(glow);
    g.position.set(this.poolCenter.x, 1.55, this.poolCenter.z);
    this.scene.add(g);

    this.wishOrb = { group: g, orb, glow, mat };

    /* --- 交互注册 --- */
    this.interaction.register({
      id: 'wish-pool',
      kind: 'wish',
      position: () => new THREE.Vector3(this.poolCenter.x, 1.2, this.poolCenter.z),
      radius: 5.8,
      maxDy: 4,
      priority: 1.2,
      hint: () => this.ui.t('hintWish'),
      enabled: () => !this.ui.wishOpen,
      objects: [this.castle.water, orb],
      onHighlight: (on) => { this._highlighted = on; },
      onInteract: () => this.openWishModal(),
    });
  }

  /* ================================================================ */
  openWishModal() {
    this.audio.playSFX('click');
    this.ui.showWish(!!this.state.state.userWish);
  }

  /** 确认愿望 */
  confirmWish(text) {
    const trimmed = (text || '').trim().slice(0, 50);
    if (!trimmed) return false;

    const s = this.state.state;
    const isFirst = !s.userWish;
    s.userWish = trimmed;
    s.userWishAt = Date.now();
    s.wishCount = (s.wishCount || 0) + 1;
    this.state.persistWish(trimmed);

    /* --- 音效与水面涟漪 --- */
    this.audio.playSFX('wish');
    this.castle.pulseWater();

    /* --- 从池心射出一颗流星 --- */
    const from = new THREE.Vector3(this.poolCenter.x, 1.2, this.poolCenter.z);
    const angle = s.wishCount * 1.9;
    const to = new THREE.Vector3(
      this.poolCenter.x + Math.cos(angle) * 34,
      96 + this.random.range(-6, 10),
      this.poolCenter.z + Math.sin(angle) * 34 - 14
    );

    this.particles.meteor(from, to, {
      duration: 2.3,
      color: '#FFF8F0',
      tailColor: '#FFE4A0',
      size: 4.2,
      onArrive: () => {
        // 抵达夜空 → 绽放成一颗星
        this.sky.addWishStar(angle);
        this.particles.burst(to, {
          count: 60,
          colors: ['#FFFFFF', '#FFE4A0', '#FFD1DC'],
          speed: 5.5,
          gravity: -0.6,
          drag: 1.1,
          life: 2.0,
          size: 3.0,
          sizeEnd: 0.05,
        });
      },
    });

    /* --- 许愿池的即时反馈 --- */
    this.particles.burst(from, {
      count: 70,
      colors: ['#BEE3F0', '#FFE4A0', '#FFFFFF'],
      speed: 3.2,
      upwardBias: 0.5,
      gravity: 5.0,
      drag: 1.4,
      life: 1.4,
      size: 1.9,
      sizeEnd: 0.04,
    });

    /* --- 提示与进度 --- */
    this.ui.toast({
      label: '✦',
      text: this.ui.t('wishDone'),
      mini: trimmed,
      gold: true,
      duration: 3800,
    });

    this.cameraCtl?.nudge(-0.02, 0.02);

    if (isFirst) {
      this.state.addProgress(PROGRESS_WEIGHTS.wish, 'wish');
    } else {
      this.state.save();
    }

    return true;
  }

  /* ================================================================ */
  restore() {
    // 靠 localStorage 里的愿望恢复夜空中的那颗星
    const s = this.state.state;
    const stored = this.state.readPersistedWish();
    if (stored && !s.userWish) s.userWish = stored;
    if (s.userWish) {
      const n = Math.min(s.wishCount || 1, 6);
      for (let i = 0; i < n; i++) this.sky.addWishStar(i * 1.9);
      s.wishCount = n;
    }
  }

  update(dt, elapsed) {
    if (!this.wishOrb) return;
    const hl = this._highlighted ? 1 : 0;
    const o = this.wishOrb;
    o.group.position.y = 1.55 + Math.sin(elapsed * 1.6) * 0.14;
    o.group.rotation.y += dt * 0.6;
    o.orb.rotation.x += dt * 0.35;
    o.mat.uniforms.uEmissiveIntensity.value = 0.45 + hl * 0.7 + Math.sin(elapsed * 2.6) * 0.14;
    o.glow.material.opacity = 0.3 + hl * 0.4 + Math.sin(elapsed * 1.9) * 0.08;
    o.glow.scale.setScalar(1 + hl * 0.25);

    // 池中偶尔冒出的光点
    if (Math.random() < dt * 2.4) {
      this.particles.fountain(
        new THREE.Vector3(
          this.poolCenter.x + this.random.range(-2.4, 2.4),
          1.0,
          this.poolCenter.z + this.random.range(-2.4, 2.4)
        ),
        {
          count: 1,
          colors: ['#BEE3F0', '#FFFFFF', '#FFE4A0'],
          speed: 1.0,
          gravity: -0.5,
          drag: 1.6,
          life: 1.5,
          size: 1.1,
        }
      );
    }
  }

  reset() {
    this.state.state.wishCount = 0;
  }
}
