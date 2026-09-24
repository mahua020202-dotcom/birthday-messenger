import * as THREE from 'three';
import { particleVertex, particleFragment } from './shaders/firework.js';
import { createRandom, clamp, TAU } from './utils/math.js';

/**
 * 统一粒子系统
 * 单个 Points 对象 + 定长缓冲池；CPU 更新位置，GPU 负责发光与淡出。
 * 支持：爆裂（祝福 / 烟花）、持续喷发（蜡烛火星）、流星轨迹、文字汇聚由 Sky 处理。
 */
export class ParticleSystem {
  constructor(scene, { maxParticles = 5000, reduceMotion = false } = {}) {
    this.scene = scene;
    this.capacity = Math.max(400, Math.floor(maxParticles));
    this.reduceMotion = reduceMotion;
    this.random = createRandom(777);

    /* ---------------- 缓冲 ---------------- */
    this.position = new Float32Array(this.capacity * 3);
    this.color = new Float32Array(this.capacity * 3);
    this.size = new Float32Array(this.capacity);
    this.alpha = new Float32Array(this.capacity);
    this.seed = new Float32Array(this.capacity);

    this.particles = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.particles[i] = {
        active: false, life: 0, maxLife: 1,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        gravity: 0, drag: 0.6, size0: 1, size1: 0,
        r: 1, g: 1, b: 1, fadeIn: 0.1, spin: 0, curl: 0, phase: 0,
      };
      this.alpha[i] = 0;
    }
    this._cursor = 0;
    this.activeCount = 0;

    /* ---------------- 几何体 ---------------- */
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.geometry = geo;

    this.uniforms = {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSizeScale: { value: 2.2 },
      uTime: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    scene.add(this.points);

    /* 流星/拖尾单独一层（更小的点、更亮的头） */
    this.trails = [];
  }

  /* ================================================================ */
  /** 取一个粒子槽位（环形复用） */
  _alloc() {
    for (let attempt = 0; attempt < this.capacity; attempt++) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % this.capacity;
      if (!this.particles[i].active) return i;
    }
    // 全部在用：抢占最老的
    const i = this._cursor;
    this._cursor = (this._cursor + 1) % this.capacity;
    return i;
  }

  /** 已使用比例（用于自动降低发射量） */
  get load() {
    return this.activeCount / this.capacity;
  }

  /* ================================================================ */
  /**
   * 爆裂：从一点向外炸开（祝福收集 / 烟花）
   * @param {THREE.Vector3} origin
   * @param {object} opts
   */
  burst(origin, opts = {}) {
    const {
      count = 60,
      colors = ['#FFD700', '#FFF8F0', '#FF9EC4'],
      speed = 5,
      speedVariance = 0.5,
      spread = 1,                 // 1 = 全球面，0 = 向上
      gravity = 6.5,
      drag = 1.4,
      life = 1.6,
      lifeVariance = 0.4,
      size = 1.6,
      sizeEnd = 0.1,
      upwardBias = 0,
      fadeIn = 0.06,
      curl = 0,
    } = opts;

    // 移动端 / 减少动态效果时缩减数量
    const n = Math.max(4, Math.round(count * (this.reduceMotion ? 0.35 : 1) * (1 - this.load * 0.45)));
    const r = this.random;
    const c = new THREE.Color();

    for (let k = 0; k < n; k++) {
      const i = this._alloc();
      const p = this.particles[i];

      // 球面均匀方向
      const u = r.range(-1, 1);
      const theta = r.range(0, TAU);
      const s = Math.sqrt(1 - u * u);
      let dx = s * Math.cos(theta);
      let dy = u;
      let dz = s * Math.sin(theta);

      // 向向上方向偏置
      dy = dy * spread + (1 - spread) + upwardBias;

      const sp = speed * (1 + r.range(-speedVariance, speedVariance));

      p.active = true;
      p.life = 0;
      p.maxLife = life * (1 + r.range(-lifeVariance, lifeVariance));
      p.x = origin.x + dx * 0.1;
      p.y = origin.y + dy * 0.1;
      p.z = origin.z + dz * 0.1;
      p.vx = dx * sp;
      p.vy = dy * sp;
      p.vz = dz * sp;
      p.gravity = gravity;
      p.drag = drag;
      p.size0 = size * r.range(0.7, 1.35);
      p.size1 = sizeEnd;
      p.fadeIn = fadeIn;
      p.curl = curl;
      p.phase = r.range(0, 10);

      c.set(r.pick(colors));
      p.r = c.r; p.g = c.g; p.b = c.b;

      this.color[i * 3] = c.r;
      this.color[i * 3 + 1] = c.g;
      this.color[i * 3 + 2] = c.b;
      this.seed[i] = r.next();
    }

    this._markDirty();
    return n;
  }

  /**
   * 持续喷发（蜡烛火星 / 许愿池光点）
   */
  fountain(origin, opts = {}) {
    const {
      count = 2,
      colors = ['#FFC65C', '#FFF8F0'],
      speed = 1.4,
      gravity = -1.2,
      drag = 1.6,
      life = 1.3,
      size = 1.0,
      sizeEnd = 0.05,
    } = opts;

    const n = Math.max(1, Math.round(count * (this.reduceMotion ? 0.4 : 1)));
    const r = this.random;
    const c = new THREE.Color();

    for (let k = 0; k < n; k++) {
      const i = this._alloc();
      const p = this.particles[i];
      const a = r.range(0, TAU);
      const rad = r.range(0, 0.06);

      p.active = true;
      p.life = 0;
      p.maxLife = life * r.range(0.7, 1.4);
      p.x = origin.x + Math.cos(a) * rad;
      p.y = origin.y;
      p.z = origin.z + Math.sin(a) * rad;
      p.vx = Math.cos(a) * 0.2;
      p.vy = speed * r.range(0.6, 1.5);
      p.vz = Math.sin(a) * 0.2;
      p.gravity = gravity;
      p.drag = drag;
      p.size0 = size * r.range(0.7, 1.4);
      p.size1 = sizeEnd;
      p.fadeIn = 0.05;
      p.curl = 0.6;
      p.phase = r.range(0, 10);

      c.set(r.pick(colors));
      p.r = c.r; p.g = c.g; p.b = c.b;
      this.color[i * 3] = c.r;
      this.color[i * 3 + 1] = c.g;
      this.color[i * 3 + 2] = c.b;
      this.seed[i] = r.next();
    }
    this._markDirty();
    return n;
  }

  /**
   * 流星：从 from 飞向 to，沿途留下拖尾
   * @returns {{done:boolean, update:Function}}
   */
  meteor(from, to, opts = {}) {
    const {
      duration = 1.5,
      color = '#FFF8F0',
      tailColor = '#FFE4A0',
      size = 3.2,
      onArrive = null,
    } = opts;

    const curve = new THREE.QuadraticBezierCurve3(
      from.clone(),
      from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, 18, 0)),
      to.clone()
    );

    const r = this.random;
    const meteor = {
      t: 0,
      duration,
      done: false,
      prev: from.clone(),
      _spawnAcc: 0,
      update: (dt) => {
        meteor.t += dt;
        const p = clamp(meteor.t / duration, 0, 1);
        const pos = curve.getPointAt(p);
        const c = new THREE.Color(color);

        // 拖尾
        meteor._spawnAcc += dt * 90;
        const n = Math.floor(meteor._spawnAcc);
        meteor._spawnAcc -= n;
        for (let k = 0; k < n; k++) {
          const i = this._alloc();
          const pt = this.particles[i];
          pt.active = true;
          pt.life = 0;
          pt.maxLife = 0.55 * r.range(0.6, 1.3);
          pt.x = pos.x + r.range(-0.2, 0.2);
          pt.y = pos.y + r.range(-0.2, 0.2);
          pt.z = pos.z + r.range(-0.2, 0.2);
          pt.vx = r.range(-0.9, 0.9);
          pt.vy = r.range(-0.9, 0.4);
          pt.vz = r.range(-0.9, 0.9);
          pt.gravity = -0.4;
          pt.drag = 2.2;
          pt.size0 = size * r.range(0.5, 1.0);
          pt.size1 = 0.05;
          pt.fadeIn = 0.02;
          pt.curl = 0;
          const cc = new THREE.Color(r.next() < 0.4 ? color : tailColor);
          pt.r = cc.r; pt.g = cc.g; pt.b = cc.b;
          this.color[i * 3] = cc.r;
          this.color[i * 3 + 1] = cc.g;
          this.color[i * 3 + 2] = cc.b;
          this.seed[i] = r.next();
        }
        this._markDirty();

        if (p >= 1) {
          meteor.done = true;
          if (onArrive) onArrive();
        }
      },
    };

    this.trails.push(meteor);
    return meteor;
  }

  /**
   * 向天空发射一枚烟花
   * @param {THREE.Vector3} from 发射点
   * @param {THREE.Vector3} to   爆炸点
   * @param {object} opts
   */
  firework(from, to, opts = {}) {
    const {
      colors = ['#FF9EC4', '#FFD700', '#FFFFFF', '#C9A6FF', '#FF69B4'],
      count = 160,
      duration = 1.1,
      onExplode = null,
    } = opts;

    return this.meteor(from, to, {
      duration,
      color: '#FFF8F0',
      tailColor: '#FFC65C',
      size: 2.2,
      onArrive: () => {
        this.burst(to, {
          count,
          colors,
          speed: 9,
          speedVariance: 0.45,
          gravity: 5.2,
          drag: 1.5,
          life: 2.2,
          lifeVariance: 0.5,
          size: 2.6,
          sizeEnd: 0.05,
          curl: 0.25,
        });
        // 中心闪光
        this.burst(to, {
          count: 22,
          colors: ['#FFFFFF', '#FFF3C4'],
          speed: 2.4,
          gravity: 1.4,
          drag: 3,
          life: 0.5,
          size: 5.5,
          sizeEnd: 0.2,
        });
        onExplode?.();
      },
    });
  }

  /* ================================================================ */
  _markDirty() {
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aSeed.needsUpdate = true;
  }

  update(dt, elapsed) {
    this.uniforms.uTime.value = elapsed;

    const parts = this.particles;
    const posA = this.position;
    const sizeA = this.size;
    const alphaA = this.alpha;
    let count = 0;

    for (let i = 0; i < this.capacity; i++) {
      const p = parts[i];
      if (!p.active) {
        alphaA[i] = 0;
        continue;
      }

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        alphaA[i] = 0;
        sizeA[i] = 0;
        continue;
      }

      const t = p.life / p.maxLife;

      /* 运动 */
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp - p.gravity * dt;

      // 轻微卷曲运动，让粒子更"活"
      if (p.curl) {
        const w = p.curl * dt * 3.2;
        const nx = p.vx - p.vz * w;
        const nz = p.vz + p.vx * w;
        p.vx = nx;
        p.vz = nz;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      posA[i * 3] = p.x;
      posA[i * 3 + 1] = p.y;
      posA[i * 3 + 2] = p.z;

      /* 尺寸与透明度 */
      sizeA[i] = p.size0 + (p.size1 - p.size0) * t;
      let a = 1;
      if (p.fadeIn > 0 && t < p.fadeIn) a = t / p.fadeIn;
      a *= 1 - Math.pow(t, 1.6);
      // 中心亮点淡出更慢，让余韵更长
      if (t > 0.75) a *= 1 - (t - 0.75) / 0.25 * 0.85;
      alphaA[i] = a;
      count++;
    }

    this.activeCount = count;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;

    /* 流星推进 */
    if (this.trails.length) {
      const keep = [];
      for (const m of this.trails) {
        m.update(dt);
        if (!m.done) keep.push(m);
      }
      this.trails = keep;
    }
  }

  setReduceMotion(v) {
    this.reduceMotion = v;
  }

  /** 清空所有粒子（重新开始时使用） */
  clear() {
    for (const p of this.particles) {
      p.active = false;
    }
    this.trails = [];
    this.alpha.fill(0);
    this._markDirty();
  }
}
