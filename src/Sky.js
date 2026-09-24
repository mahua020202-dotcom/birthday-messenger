import * as THREE from 'three';
import { skyVertex, skyFragment, starVertex, starFragment } from './shaders/sky.js';
import { particleVertex, particleFragment } from './shaders/firework.js';
import { createRandom, textToPoints, clamp } from './utils/math.js';
import { easeOutCubic } from './utils/easing.js';

const SKY_RADIUS = 420;
const MAX_WISH_STARS = 24;

/**
 * 天空系统：内表面渐变球 + 可逐颗点亮的星点 + 许愿星 + 粒子文字
 */
export class Sky {
  constructor(scene, { palette, preset, reduceMotion = false } = {}) {
    this.scene = scene;
    this.palette = palette;
    this.preset = preset;
    this.reduceMotion = reduceMotion;
    this.progress = 0;
    this.random = createRandom(88112);

    /* ---------------- 1. 天空穹顶 ---------------- */
    const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 48, 32);
    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(palette.skyTopCool) },
      uHorizonColor: { value: new THREE.Color(palette.skyHorizonCool) },
      uBottomColor: { value: new THREE.Color('#0B111E') },
      uGlowColor: { value: new THREE.Color(palette.cloudWarmB) },
      uGlow: { value: 0.04 },
      uTime: { value: 0 },
      uAurora: { value: 0.0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: true,
    });
    this.dome = new THREE.Mesh(skyGeo, skyMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    /* ---------------- 2. 星空 ---------------- */
    this._buildStars();

    /* ---------------- 3. 许愿亮星（动态增长） ---------------- */
    this._buildWishStars();

    /* ---------------- 4. 粒子文字容器 ---------------- */
    this.textFeeders = [];
  }

  /* ================================================================ */
  _buildStars() {
    const count = this.preset.skyStars;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const bright = new Float32Array(count);
    const color = new Float32Array(count * 3);

    const r = this.random;
    const tint = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // 球面均匀采样，并抬高一点让地平线附近更稀疏
      const u = r.range(-1, 1);
      const theta = r.range(0, Math.PI * 2);
      const s = Math.sqrt(1 - u * u);
      const radius = SKY_RADIUS * 0.97;
      pos[i * 3] = radius * s * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.abs(u) * 0.92 + 6;
      pos[i * 3 + 2] = radius * s * Math.sin(theta);

      size[i] = r.range(0.9, 3.4);
      phase[i] = r.next();
      bright[i] = r.next();

      // 星色：白 → 淡金 → 淡粉
      const tone = r.next();
      if (tone < 0.6) tint.set('#FFFFFF');
      else if (tone < 0.85) tint.set('#FFE9B0');
      else tint.set('#FFD2E4');
      color[i * 3] = tint.r;
      color[i * 3 + 1] = tint.g;
      color[i * 3 + 2] = tint.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));

    this.starUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uProgress: { value: 0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: starVertex,
      fragmentShader: starFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);
  }

  _buildWishStars() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_WISH_STARS * 3);
    const size = new Float32Array(MAX_WISH_STARS);
    const phase = new Float32Array(MAX_WISH_STARS);
    const bright = new Float32Array(MAX_WISH_STARS);
    const color = new Float32Array(MAX_WISH_STARS * 3);

    for (let i = 0; i < MAX_WISH_STARS; i++) {
      size[i] = 7 + (i % 3);
      phase[i] = (i * 0.137) % 1;
      bright[i] = 0.85;
      color[i * 3] = 1.0;
      color[i * 3 + 1] = 0.95;
      color[i * 3 + 2] = 0.7;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uProgress: { value: 1 },      // 许愿星不受进度控制，永远亮着
      },
      vertexShader: starVertex,
      fragmentShader: starFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.wishStars = new THREE.Points(geo, mat);
    this.wishStars.frustumCulled = false;
    this.wishStars.renderOrder = -8;
    this.wishStarsCount = 0;
    this.scene.add(this.wishStars);
  }

  /* ================================================================ */
  /**
   * 新增一颗代表愿望的亮星
   * @param {number} angle 可选角度，让星星分布更自然
   */
  addWishStar(angle = null) {
    if (this.wishStarsCount >= MAX_WISH_STARS) return;
    const i = this.wishStarsCount++;
    const a = angle ?? this.random.range(0, Math.PI * 2);
    const elev = this.random.range(0.28, 0.72);
    const radius = SKY_RADIUS * 0.9;
    const arr = this.wishStars.geometry.attributes.position.array;
    arr[i * 3] = radius * Math.cos(elev) * Math.cos(a);
    arr[i * 3 + 1] = 40 + elev * 160;
    arr[i * 3 + 2] = radius * Math.cos(elev) * Math.sin(a) * 0.8 - 60;
    this.wishStars.geometry.attributes.position.needsUpdate = true;
    this.wishStars.geometry.setDrawRange(0, this.wishStarsCount);
  }

  /* ================================================================ */
  /**
   * 让天空浮现粒子文字
   * @param {string} text
   * @param {object} opts
   *   size       文字宽度（世界单位）
   *   position   THREE.Vector3
   *   color     粒子色
   *   delay     延迟出现（秒）
   *   hold      停留时长（秒），0 = 永久
   *   faceCamera 是否始终面向相机
   */
  showText(text, opts = {}) {
    const {
      size = 14,
      position = new THREE.Vector3(0, 30, -66),
      color = '#FFE9A0',
      secondaryColor = '#FFFFFF',
      delay = 0,
      hold = 0,
      faceCamera = false,
      maxPoints = 2400,
      font = 'bold 150px "PingFang SC", "Microsoft YaHei", sans-serif',
      blending = THREE.AdditiveBlending,
      sizeScale = 2.6,
    } = opts;

    const { points, aspect } = textToPoints(text, { maxPoints, font });
    if (!points.length) return null;

    const count = points.length;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const start = new Float32Array(count * 3);
    const target = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sizeAttr = new Float32Array(count);
    const alpha = new Float32Array(count);
    const seed = new Float32Array(count);

    const r = this.random;
    const cA = new THREE.Color(color);
    const cB = new THREE.Color(secondaryColor);
    const tmp = new THREE.Color();
    // 注意：textToPoints 已经把 x 归一化到 ±0.5*aspect、y 归一化到 ±0.5，
    // 因此 x / y 必须用同一个缩放系数，否则文字会被纵向拉伸 aspect 倍。
    const scale = size / (aspect || 1);
    const height = scale;

    for (let i = 0; i < count; i++) {
      const p = points[i];
      const tx = p.x * scale;
      const ty = p.y * height;
      const tz = r.range(-0.5, 0.5);

      target[i * 3] = tx;
      target[i * 3 + 1] = ty;
      target[i * 3 + 2] = tz;

      // 起点：从天空散落处汇聚而来
      start[i * 3] = tx * r.range(1.6, 3.4) + r.range(-26, 26);
      start[i * 3 + 1] = ty * r.range(0.2, 1.4) + r.range(-30, 26);
      start[i * 3 + 2] = r.range(-70, 40);
      pos[i * 3] = start[i * 3];
      pos[i * 3 + 1] = start[i * 3 + 1];
      pos[i * 3 + 2] = start[i * 3 + 2];

      tmp.copy(cA).lerp(cB, r.next());
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;

      sizeAttr[i] = r.range(1.1, 2.6);
      alpha[i] = 0;
      seed[i] = r.next();
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizeAttr, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uSizeScale: { value: sizeScale },
        uTime: { value: 0 },
      },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending,
    });

    const pointsObj = new THREE.Points(geo, mat);
    pointsObj.position.copy(position);
    pointsObj.frustumCulled = false;
    pointsObj.renderOrder = 20;
    this.scene.add(pointsObj);

    const feeder = {
      type: 'text',
      object: pointsObj,
      geo,
      mat,
      target,
      start,
      positions: geo.attributes.position,
      alphas: geo.attributes.aAlpha,
      count,
      delay,
      hold,
      t: 0,
      appeared: 0,
      appearDuration: 1.9,
      holdTimer: 0,
      fading: false,
      fade: 1,
      faceCamera,
      basePosition: position.clone(),
      update(dt, elapsed) {
        mat.uniforms.uTime.value = elapsed;

        if (this.delay > 0) {
          this.delay -= dt;
          if (this.delay > 0) return;
        }

        this.t += dt;
        const p = clamp(this.t / this.appearDuration, 0, 1);

        if (this.fading) {
          this.fade -= dt * 1.2;
          if (this.fade <= 0) {
            this.fade = 0;
            this.done = true;
          }
        }

        const eased = easeOutCubic(p);
        const posA = this.positions.array;
        const alphaA = this.alphas.array;
        const r = Math.sin(this.t * 3.2) * 0.5 + 0.5;

        for (let i = 0; i < this.count; i++) {
          const i3 = i * 3;
          // 带一点随机延迟的汇聚动画
          const d = clamp((eased - (i % 7) * 0.02) / 0.86, 0, 1);
          const e = easeOutCubic(d);
          posA[i3] = this.start[i3] + (this.target[i3] - this.start[i3]) * e;
          posA[i3 + 1] = this.start[i3 + 1] + (this.target[i3 + 1] - this.start[i3 + 1]) * e;
          posA[i3 + 2] = this.start[i3 + 2] + (this.target[i3 + 2] - this.start[i3 + 2]) * e;
          alphaA[i] = e * (0.72 + 0.28 * Math.sin(this.t * 2.4 + i * 0.7)) * this.fade;
        }
        this.positions.needsUpdate = true;
        this.alphas.needsUpdate = true;

        if (this.hold > 0) {
          this.holdTimer += dt;
          if (this.holdTimer > this.hold && !this.fading) this.fading = true;
        }
      },
      dispose() {
        this.geo.dispose();
        this.mat.dispose();
      },
    };

    this.textFeeders.push(feeder);
    return feeder;
  }

  /** 清除所有粒子文字 */
  clearText() {
    for (const f of this.textFeeders) {
      this.scene.remove(f.object);
      f.dispose?.();
    }
    this.textFeeders = [];
  }

  /** 移除已经结束的粒子文字 */
  _reapText() {
    if (!this.textFeeders.length) return;
    const keep = [];
    for (const f of this.textFeeders) {
      if (f.done) {
        this.scene.remove(f.object);
        f.dispose?.();
      } else keep.push(f);
    }
    this.textFeeders = keep;
  }

  /* ================================================================ */
  /** 进度驱动天空变化：深蓝 → 粉紫，星星逐颗点亮，地平线泛起金光 */
  setProgress(t) {
    const k = clamp(t, 0, 1);
    this.progress = k;

    const p = this.palette;
    this.skyUniforms.uTopColor.value.set(p.skyTopCool).lerp(new THREE.Color(p.skyTopWarm), k);
    this.skyUniforms.uHorizonColor.value
      .set(p.skyHorizonCool)
      .lerp(new THREE.Color(p.skyHorizonWarm), k);
    this.skyUniforms.uBottomColor.value
      .set('#0B111E')
      .lerp(new THREE.Color('#3A2440'), k);
    this.skyUniforms.uGlow.value = 0.04 + k * 0.24;
    this.skyUniforms.uAurora.value = k * 0.26;

    this.starUniforms.uProgress.value = k;
  }

  update(dt, elapsed) {
    this.skyUniforms.uTime.value = elapsed;
    this.starUniforms.uTime.value = elapsed;
    this.wishStars.material.uniforms.uTime.value = elapsed;

    for (const f of this.textFeeders) f.update(dt, elapsed);
    this._reapText();

    if (this.reduceMotion) {
      this.skyUniforms.uAurora.value *= 0.3;
    }
  }

  setReduceMotion(v) {
    this.reduceMotion = v;
  }
}
