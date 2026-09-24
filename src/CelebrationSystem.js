import * as THREE from 'three';
import { createToonMaterial } from './ToonMaterial.js';
import { PROGRESS_WEIGHTS } from './StateManager.js';
import { createRandom, TAU, clamp } from './utils/math.js';

const CONFETTI_COUNT = { high: 420, medium: 260, low: 140 };
const BALLOON_COUNT = { high: 48, medium: 32, low: 20 };

/**
 * 庆典系统
 * 大厅中央的庆典按钮 → 烟花 / 彩带 / 气球 / 音乐切换 / 环绕镜头 / 天空字样
 */
export class CelebrationSystem {
  constructor({
    scene, state, ui, audio, particles, interaction, castle, sky, cameraCtl,
    palette, preset, quality = 'high',
  }) {
    this.scene = scene;
    this.state = state;
    this.ui = ui;
    this.audio = audio;
    this.particles = particles;
    this.interaction = interaction;
    this.castle = castle;
    this.sky = sky;
    this.cameraCtl = cameraCtl;
    this.palette = palette;
    this.quality = quality;
    this.random = createRandom(9090);

    this.started = false;
    this.unlocked = false;
    this.fireworkQueue = [];
    this.timer = 0;
    this.balloonTimer = 0;
    this.duration = 26;      // 烟花狂欢持续时长
  }

  /* ================================================================ */
  build() {
    /* --- 彩带（InstancedMesh） --- */
    const cCount = CONFETTI_COUNT[this.quality] || CONFETTI_COUNT.high;
    const cGeo = new THREE.PlaneGeometry(0.22, 0.44);
    const cMat = createToonMaterial({
      color: '#FFFFFF',
      toonSteps: 1.4,
      side: THREE.DoubleSide,
      rimIntensity: 0,
      emissive: '#FFFFFF',
      emissiveIntensity: 0.12,
    });
    this.confetti = new THREE.InstancedMesh(cGeo, cMat, cCount);
    this.confetti.frustumCulled = false;
    this.confetti.visible = false;
    this.confetti.raycast = () => {};
    const colors = ['#FF9EC4', '#FFD700', '#FFFFFF', '#B8D4E8', '#C9A6FF', '#A8E6CF', '#FF69B4', '#FFE4A0'];
    const col = new THREE.Color();
    this.confettiData = [];
    for (let i = 0; i < cCount; i++) {
      col.set(this.random.pick(colors));
      this.confetti.setColorAt(i, col);
      this.confettiData.push({
        x: 0, y: -100, z: 0,
        vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0,
        rvx: 0, rvy: 0, rvz: 0,
        phase: 0,
        active: false,
      });
    }
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
    this.scene.add(this.confetti);

    /* --- 庆典气球（InstancedMesh） --- */
    const bCount = BALLOON_COUNT[this.quality] || BALLOON_COUNT.high;
    const bGeo = new THREE.SphereGeometry(0.5, 12, 10);
    const bMat = createToonMaterial({
      color: '#FFFFFF', toonSteps: 1.8, rimColor: '#FFFFFF', rimIntensity: 0.4, softness: 0.6,
      emissive: '#FFFFFF', emissiveIntensity: 0.14,
    });
    this.celebBalloons = new THREE.InstancedMesh(bGeo, bMat, bCount);
    this.celebBalloons.frustumCulled = false;
    this.celebBalloons.visible = false;
    this.celebBalloons.raycast = () => {};
    this.balloonRise = [];
    const bColors = ['#FF9EC4', '#FFD700', '#B8D4E8', '#FFD1DC', '#C9A6FF', '#FF69B4'];
    for (let i = 0; i < bCount; i++) {
      col.set(this.random.pick(bColors));
      this.celebBalloons.setColorAt(i, col);
      this.balloonRise.push({
        x: 0, y: -100, z: 0,
        scale: 1, speed: 1, sway: 1, phase: 0, active: false,
      });
    }
    if (this.celebBalloons.instanceColor) this.celebBalloons.instanceColor.needsUpdate = true;
    this.scene.add(this.celebBalloons);

    /* --- 交互注册：庆典按钮 --- */
    this.interaction.register({
      id: 'celebration-button',
      kind: 'celebrate',
      position: new THREE.Vector3(0, 1.1, -8),
      radius: 4.6,
      maxDy: 4,
      priority: 2,
      hint: () => this.ui.t('hintCelebrate'),
      enabled: () => this.unlocked && !this.started && !this.ui.anyOverlayOpen,
      objects: [this.castle.celebrationButton.mesh, this.castle.celebrationButton.mark],
      onHighlight: (on) => { this._btnHl = on; },
      onInteract: () => this.start(),
    });
  }

  /* ================================================================ */
  /** 是否满足启动条件（至少 3 颗祝福 + 许过愿） */
  checkUnlocked() {
    const s = this.state.state;
    const ok = s.collectedBlessings.length >= 3 && !!s.userWish;
    const changed = ok !== this.unlocked;
    this.unlocked = ok;
    this.castle.setCelebrationEnabled(ok && !this.started);
    if (changed && ok && !this.started) {
      this.audio.playSFX('unlock');
      this.ui.toast({
        label: '🎉',
        text: this.ui.lang === 'en'
          ? 'The celebration button is now lit — press it in the great hall!'
          : '大厅中央的庆典按钮亮起来了，去按下它！',
        gold: true,
        duration: 4200,
      });
      this.sky.showText(this.ui.lang === 'en' ? 'READY' : '庆典就绪', {
        size: 18,
        position: new THREE.Vector3(0, 22, -48),
        color: '#E24A86',
        secondaryColor: '#FFC46B',
        hold: 4.5,
        maxPoints: 2200,
        font: 'bold 170px "PingFang SC", "Microsoft YaHei", sans-serif',
        blending: THREE.NormalBlending,
        sizeScale: 1.1,
      });
    }
    return ok;
  }

  /* ================================================================ */
  start() {
    if (this.started || !this.unlocked) return false;
    this.started = true;
    this.state.state.celebrationStarted = true;

    this.castle.pressCelebrationButton();
    this.castle.setWindowOverride(true);       // 全部窗户亮起
    this.castle.setWindowLitCount(this.castle.windows.length);

    /* --- 音效与音乐切换 --- */
    this.audio.playSFX('unlock');
    setTimeout(() => this.audio.playSFX('cheer'), 300);
    this.audio.setCelebration(true);

    /* --- 点燃烟花狂欢 --- */
    this.timer = 0;
    this._queueFireworks();

    /* --- 彩带与气球 --- */
    this._launchConfetti();
    this.celebBalloons.visible = true;
    this._spawnBalloons(0);

    /* --- 环绕镜头 --- */
    this.cameraCtl.startOrbit(null, { duration: 10.5, radius: 42, height: 19 });

    /* --- 天空字样 --- */
    this.sky.showText(this.ui.lang === 'en' ? 'HAPPY BIRTHDAY' : '生日快乐', {
      size: 30,
      position: new THREE.Vector3(0, 21, -46),
      color: '#E24A86',
      secondaryColor: '#FFB347',
      delay: 1.4,
      maxPoints: 3400,
      font: 'bold 150px "PingFang SC", "Microsoft YaHei", sans-serif',
      blending: THREE.NormalBlending,
      sizeScale: 1.2,
    });

    /* --- 进度 --- */
    this.state.addProgress(PROGRESS_WEIGHTS.celebration, 'celebration');

    this.ui.toast({
      label: '🎉',
      text: this.ui.lang === 'en' ? 'The celebration begins!' : '庆典开始啦！',
      gold: true,
      duration: 4000,
    });

    return true;
  }

  _queueFireworks() {
    // 26 秒内错落发射 34 枚烟花
    this.fireworkQueue = [];
    let t = 0;
    for (let i = 0; i < 34; i++) {
      t += this.random.range(0.35, 1.15);
      if (t > this.duration) break;
      const a = this.random.range(0, TAU);
      const rad = this.random.range(16, 52);
      this.fireworkQueue.push({
        time: t,
        from: new THREE.Vector3(
          Math.cos(a) * rad * 0.55,
          this.random.range(-4, 2),
          Math.sin(a) * rad * 0.55
        ),
        to: new THREE.Vector3(
          Math.cos(a) * rad,
          this.random.range(20, 44),
          Math.sin(a) * rad
        ),
        colors: this.random.pick([
          ['#FF9EC4', '#FFFFFF', '#FFD700'],
          ['#FFD700', '#FFE4A0', '#FFF8F0'],
          ['#C9A6FF', '#FF69B4', '#FFFFFF'],
          ['#A8E6CF', '#FFFFFF', '#FFE4A0'],
          ['#FFFFFF', '#FFD1DC', '#FF69B4'],
        ]),
        count: this.random.int(110, 190),
      });
    }
  }

  _launchConfetti() {
    this.confetti.visible = true;
    for (const c of this.confettiData) {
      c.active = true;
      this._resetConfetti(c, true);
    }
    this.confetti.instanceMatrix.needsUpdate = true;
  }

  _resetConfetti(c, spreadY = false) {
    const r = this.random;
    c.x = r.range(-26, 26);
    c.z = r.range(-30, 22);
    c.y = spreadY ? r.range(2, 34) : r.range(24, 38);
    c.vx = r.range(-0.6, 0.6);
    c.vy = -r.range(1.2, 3.2);
    c.vz = r.range(-0.6, 0.6);
    c.rx = r.range(0, TAU);
    c.ry = r.range(0, TAU);
    c.rz = r.range(0, TAU);
    c.rvx = r.range(-3, 3);
    c.rvy = r.range(-3, 3);
    c.rvz = r.range(-3, 3);
    c.phase = r.range(0, 10);
  }

  _spawnBalloons(offset = 0) {
    const r = this.random;
    for (const b of this.balloonRise) {
      if (b.active) continue;
      const a = r.range(0, TAU);
      const rad = r.range(24, 30);
      b.x = Math.cos(a) * rad;
      b.z = Math.sin(a) * rad;
      b.y = r.range(-2, 4) + offset;
      b.scale = r.range(0.6, 1.4);
      b.speed = r.range(1.5, 3.4);
      b.sway = r.range(0.6, 2.0);
      b.phase = r.range(0, 10);
      b.active = true;
    }
  }

  /* ================================================================ */
  update(dt, elapsed) {
    // 解锁状态每帧检查（祝福数量与许愿状态会变化）
    if (!this.started) {
      this.checkUnlocked();
    }

    /* --- 按钮高亮 --- */
    const btn = this.castle.celebrationButton;
    if (this._btnHl && !this.started) {
      btn.group.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.03 + 0.04);
    } else {
      btn.group.scale.setScalar(1);
    }

    if (!this.started) return;

    this.timer += dt;

    /* --- 排队发射烟花 --- */
    while (this.fireworkQueue.length && this.fireworkQueue[0].time <= this.timer) {
      const fw = this.fireworkQueue.shift();
      this.particles.firework(fw.from, fw.to, {
        count: fw.count,
        colors: fw.colors,
        duration: 1.0 + Math.random() * 0.5,
      });
      if (Math.random() < 0.55) this.audio.playSFX('firework');
    }

    /* --- 定期补充气球 --- */
    this.balloonTimer += dt;
    if (this.balloonTimer > 1.1 && this.timer < this.duration) {
      this.balloonTimer = 0;
      this._spawnBalloons(-3);
    }

    /* --- 彩带下落 --- */
    if (this.confetti.visible) {
      const dummy = this._dummy || (this._dummy = new THREE.Object3D());
      let alive = 0;
      for (let i = 0; i < this.confettiData.length; i++) {
        const c = this.confettiData[i];
        if (!c.active) {
          dummy.scale.setScalar(0.0001);
          dummy.position.set(0, -200, 0);
          dummy.updateMatrix();
          this.confetti.setMatrixAt(i, dummy.matrix);
          continue;
        }
        alive++;
        // 空气阻力 + 左右飘摆
        c.vy = Math.max(-3.4, c.vy - 0.9 * dt);
        c.x += (c.vx + Math.sin(elapsed * 1.6 + c.phase) * 0.55) * dt;
        c.y += c.vy * dt;
        c.z += (c.vz + Math.cos(elapsed * 1.3 + c.phase) * 0.4) * dt;
        c.rx += c.rvx * dt;
        c.ry += c.rvy * dt;
        c.rz += c.rvz * dt;

        if (c.y < 1.0) {
          if (this.timer < this.duration) this._resetConfetti(c, false);
          else { c.active = false; alive--; }
        }

        dummy.position.set(c.x, c.y, c.z);
        dummy.rotation.set(c.rx, c.ry, c.rz);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        this.confetti.setMatrixAt(i, dummy.matrix);
      }
      this.confetti.instanceMatrix.needsUpdate = true;
      if (alive === 0) this.confetti.visible = false;
    }

    /* --- 气球上升 --- */
    if (this.celebBalloons.visible) {
      const dummy = this._dummy || (this._dummy = new THREE.Object3D());
      for (let i = 0; i < this.balloonRise.length; i++) {
        const b = this.balloonRise[i];
        if (!b.active) {
          dummy.scale.setScalar(0.0001);
          dummy.position.set(0, -200, 0);
          dummy.updateMatrix();
          this.celebBalloons.setMatrixAt(i, dummy.matrix);
          continue;
        }
        b.y += b.speed * dt;
        const sway = Math.sin(elapsed * 0.9 + b.phase) * b.sway;
        dummy.position.set(b.x + sway, b.y, b.z + Math.cos(elapsed * 0.7 + b.phase) * b.sway * 0.7);
        dummy.rotation.set(
          Math.sin(elapsed * 0.6 + b.phase) * 0.16,
          elapsed * 0.4 + b.phase,
          Math.cos(elapsed * 0.5 + b.phase) * 0.16
        );
        dummy.scale.set(b.scale, b.scale * 1.18, b.scale);
        dummy.updateMatrix();
        this.celebBalloons.setMatrixAt(i, dummy.matrix);

        // 飘太高就回收
        if (b.y > 62) b.active = false;
      }
      this.celebBalloons.instanceMatrix.needsUpdate = true;
    }

    /* --- 狂欢结束 --- */
    if (this.timer > this.duration + 4 && !this.finished) {
      this.finished = true;
      this.audio.setCelebration(false);
    }
  }

  /* ================================================================ */
  restore() {
    if (this.state.state.celebrationStarted) {
      this.started = true;
      this.unlocked = true;
      this.castle.setWindowOverride(true);
      this.castle.setWindowLitCount(this.castle.windows.length);
      this.audio.setCelebration(true);
      this.finished = true;
    }
  }

  reset() {
    this.started = false;
    this.finished = false;
    this.unlocked = false;
    this.confetti.visible = false;
    this.celebBalloons.visible = false;
    this.fireworkQueue = [];
    this.state.state.celebrationStarted = false;
    this.castle.setWindowOverride(false);
    this.castle.setCelebrationEnabled(false);
  }
}
