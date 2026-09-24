import * as THREE from 'three';
import { createToonMaterial, createGlowSprite } from './ToonMaterial.js';
import { PROGRESS_WEIGHTS } from './StateManager.js';
import { clamp } from './utils/math.js';

/** 生成一个五角星几何体（程序化，无外部模型） */
function createStarGeometry(outerR = 0.5, innerR = 0.21, depth = 0.16) {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.28,
    bevelSize: depth * 0.2,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geo.center();
  return geo;
}

/**
 * 祝福收集系统
 * 城堡各处漂浮着祝福星，靠近后可收集，每颗星包含一句来自亲友的祝福。
 */
export class BlessingSystem {
  constructor({ scene, state, ui, audio, particles, interaction, castle, palette, cameraCtl }) {
    this.scene = scene;
    this.state = state;
    this.ui = ui;
    this.audio = audio;
    this.particles = particles;
    this.interaction = interaction;
    this.castle = castle;
    this.palette = palette;
    this.cameraCtl = cameraCtl;

    this.group = new THREE.Group();
    this.group.name = 'Blessings';
    scene.add(this.group);

    this.stars = [];
    this.collecting = [];
    this._geo = createStarGeometry();
    this._glowGeo = new THREE.RingGeometry(0.42, 0.62, 24);
  }

  /* ================================================================ */
  /** 在城堡各处布置祝福星 */
  spawnBlessings() {
    this.clear();

    const wishes = this.state.state.wishes;
    const anchors = this.castle.anchors.blessing;
    const count = Math.min(wishes.length, anchors.length);

    for (let i = 0; i < count; i++) {
      const wish = wishes[i];
      const anchor = anchors[i];

      const mat = createToonMaterial({
        color: '#FFE9A0',
        toonSteps: 1.6,
        emissive: '#FFD700',
        emissiveIntensity: 0.85,
        rimColor: '#FFF8F0',
        rimIntensity: 0.5,
      });

      const star = new THREE.Mesh(this._geo, mat);
      star.scale.setScalar(0.62);

      const ring = new THREE.Mesh(
        this._glowGeo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color('#FFE4A0'),
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      );
      ring.raycast = () => {};

      const glow = createGlowSprite({ color: '#FFD700', size: 3.4, opacity: 0.55, alpha: '0.85' });

      const g = new THREE.Group();
      g.position.copy(anchor);
      g.add(star);
      g.add(ring);
      g.add(glow);
      this.group.add(g);

      const entry = {
        id: wish.id,
        wish,
        group: g,
        star,
        ring,
        glow,
        mat,
        phase: i * 1.7,
        baseY: anchor.y,
        collected: false,
        pop: 0,
        highlightValue: 0,
      };
      this.stars.push(entry);

      /* --- 注册交互 --- */
      this.interaction.register({
        id: `blessing-${wish.id}`,
        kind: 'blessing',
        position: anchor,
        radius: 3.3,
        maxDy: 5,
        priority: 1,
        hint: () => this.ui.t('hintBlessing'),
        enabled: () => !entry.collected,
        objects: [star],
        onHighlight: (on) => { entry.highlighted = on; },
        onInteract: () => this.collect(entry),
      });

      /* --- 读档：已收集的直接隐藏 --- */
      if (this.state.state.collectedBlessings.includes(wish.id)) {
        entry.collected = true;
        g.visible = false;
      }
    }

    this.total = count;
  }

  /* ================================================================ */
  collect(entry) {
    if (!entry || entry.collected) return false;
    entry.collected = true;
    entry.collectTime = 0;

    const s = this.state.state;
    if (!s.collectedBlessings.includes(entry.id)) {
      s.collectedBlessings.push(entry.id);
    }

    /* --- 粒子爆裂 --- */
    const p = entry.group.position;
    this.particles.burst(new THREE.Vector3(p.x, p.y, p.z), {
      count: 90,
      colors: ['#FFD700', '#FFF8F0', '#FFE4A0', '#FF9EC4'],
      speed: 4.6,
      gravity: 3.2,
      drag: 1.9,
      life: 1.5,
      size: 2.4,
      sizeEnd: 0.04,
      curl: 0.4,
    });

    /* --- 音效 --- */
    this.audio.playSFX('collect', { index: s.collectedBlessings.length - 1 });

    /* --- 祝福语弹出 --- */
    this.ui.toast({
      label: `${this.ui.t('blessGain')} · ${s.collectedBlessings.length}/${this.total}`,
      text: entry.wish.text,
      mini: entry.wish.from ? `—— ${entry.wish.from}` : '',
      gold: true,
      duration: 3600,
    });

    /* --- 镜头轻微呼应 --- */
    this.cameraCtl?.nudge(0.012, -0.008);

    /* --- 进度 --- */
    this.state.addProgress(PROGRESS_WEIGHTS.blessing, 'blessing');
    this.ui.setBookBadge(s.collectedBlessings.length, this.total);
    this.ui.renderBook();

    if (s.collectedBlessings.length >= this.total) {
      setTimeout(() => {
        this.ui.toast({
          label: '✦',
          text: this.ui.t('allCollected'),
          gold: true,
          duration: 4200,
        });
      }, 900);
    }

    return true;
  }

  getCollectedCount() {
    return this.state.state.collectedBlessings.length;
  }

  getTotal() {
    return this.total || this.state.state.wishes.length;
  }

  isAllCollected() {
    return this.getCollectedCount() >= this.getTotal() && this.getTotal() > 0;
  }

  /* ================================================================ */
  update(dt, elapsed) {
    for (const st of this.stars) {
      if (st.collected) {
        // 收集动画：快速缩小 + 上浮
        if (st.collectTime !== undefined && st.collectTime < 1) {
          st.collectTime += dt * 2.6;
          const t = clamp(st.collectTime, 0, 1);
          const s = 1 - t;
          st.group.scale.setScalar(Math.max(0.001, s));
          st.group.position.y = st.baseY + t * 1.6;
          st.group.rotation.y += dt * 12;
          if (t >= 1) st.group.visible = false;
        }
        continue;
      }

      const hl = st.highlightValue || 0;
      const bob = Math.sin(elapsed * 1.5 + st.phase) * 0.28;
      st.group.position.y = st.baseY + bob;
      st.group.rotation.y = elapsed * (0.7 + hl * 1.2) + st.phase;
      st.group.rotation.z = Math.sin(elapsed * 0.9 + st.phase) * 0.22;

      const scale = 0.62 * (1 + hl * 0.34) * (1 + Math.sin(elapsed * 2.4 + st.phase) * 0.045);
      st.star.scale.setScalar(scale);

      st.mat.uniforms.uEmissiveIntensity.value = 0.75 + hl * 0.85 + Math.sin(elapsed * 3 + st.phase) * 0.16;
      st.glow.material.opacity = 0.42 + hl * 0.45 + Math.sin(elapsed * 2.2 + st.phase) * 0.1;
      st.glow.scale.setScalar(1 + hl * 0.3);

      st.ring.rotation.z = -elapsed * 1.4 + st.phase;
      st.ring.scale.setScalar(1 + hl * 0.35 + Math.sin(elapsed * 1.8 + st.phase) * 0.08);
      st.ring.material.opacity = 0.32 + hl * 0.4;
    }
  }

  /* ================================================================ */
  clear() {
    for (const st of this.stars) {
      this.interaction.unregister(`blessing-${st.id}`);
      this.group.remove(st.group);
      st.mat.dispose();
    }
    this.stars = [];
    this.total = 0;
  }

  /** 重新开始：恢复所有未收集的星星 */
  reset() {
    this.clear();
    this.spawnBlessings();
  }

  setProgress() { /* 星星亮度不随进度变化，保持恒定吸引力 */ }
}
