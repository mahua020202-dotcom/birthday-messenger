import * as THREE from 'three';
import { cloudVertex, cloudFragment } from './shaders/cloud.js';
import { particleVertex, particleFragment } from './shaders/firework.js';
import { createRandom, clamp } from './utils/math.js';

const LAYER_COUNT_MAX = 5;

/**
 * 云海：3–5 层半透明 FBM 平面叠加 + 漂浮光点
 * 颜色随进度从「灰蓝」过渡到「粉金」，是「点亮世界」的视觉主角。
 */
export class CloudSea {
  constructor(scene, { palette, preset, reduceMotion = false } = {}) {
    this.scene = scene;
    this.palette = palette;
    this.preset = preset;
    this.reduceMotion = reduceMotion;
    this.random = createRandom(31415);
    this.progress = 0;

    this.group = new THREE.Group();
    this.group.name = 'CloudSea';
    scene.add(this.group);

    /* 冷却 / 温暖 两套配色，运行期按进度插值 */
    this.coolSet = {
      a: new THREE.Color('#8FA2B8'),
      b: new THREE.Color(palette.cloudCool),
      c: new THREE.Color('#E8EFF6'),
    };
    this.warmSet = {
      a: new THREE.Color(palette.cloudWarmA),
      b: new THREE.Color(palette.cloudWarmB),
      c: new THREE.Color('#FFF8F0'),
    };
    this._current = {
      a: this.coolSet.a.clone(),
      b: this.coolSet.b.clone(),
      c: this.coolSet.c.clone(),
    };

    this.layers = [];
    this._buildLayers();
    this._buildMotes();
    this._buildAbyss();
    this.updateColors(0);
  }

  /* ------------------------------------------------------------------ */
  _buildLayers() {
    const count = clamp(this.preset.cloudLayers, 3, LAYER_COUNT_MAX);
    const r = this.random;

    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);       // 0 = 最上层
      const y = -4.5 - t * 22;                     // 从上往下铺开
      const size = 320 + t * 190;                  // 越深越大，越铺越远
      const opacity = 0.88 - t * 0.3;

      const geo = new THREE.PlaneGeometry(size, size, 64, 64);
      const uniforms = {
        uTime: { value: 0 },
        uOpacity: { value: opacity },
        uThreshold: { value: 0.44 + t * 0.1 },
        uSpeed: { value: 1.0 - t * 0.42 },
        uScale: { value: 3.1 + t * 0.9 },
        uSeed: { value: r.range(0, 40) },
        uWave: { value: 0.9 + t * 1.5 },
        uColorA: { value: this._current.a.clone() },
        uColorB: { value: this._current.b.clone() },
        uColorC: { value: this._current.c.clone() },
      };

      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: cloudVertex,
        fragmentShader: cloudFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.renderOrder = -5 + i;
      mesh.frustumCulled = false;
      this.group.add(mesh);

      this.layers.push({ mesh, uniforms, baseY: y, phase: r.range(0, 10), index: i });
    }
  }

  /** 云海下方的一层「深渊」，避免俯视时看穿世界 */
  _buildAbyss() {
    const geo = new THREE.CircleGeometry(520, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#46566C'),
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: true,
    });
    this.abyss = new THREE.Mesh(geo, mat);
    this.abyss.rotation.x = -Math.PI / 2;
    this.abyss.position.y = -46;
    this.abyss.renderOrder = -7;
    this.abyss.frustumCulled = false;
    this.group.add(this.abyss);
  }

  /* ------------------------------------------------------------------ */
  _buildMotes() {
    const count = Math.round(this.preset.maxParticles * 0.045);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const alpha = new Float32Array(count);
    const seed = new Float32Array(count);
    const r = this.random;
    const tint = new THREE.Color();

    this.moteData = [];
    for (let i = 0; i < count; i++) {
      const a = r.range(0, Math.PI * 2);
      const rad = r.range(4, 62);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const y = r.range(-14, 26);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      tint.set(r.pick(['#FFF8F0', '#FFE4A0', '#FFD1DC', '#FFFFFF']));
      col[i * 3] = tint.r;
      col[i * 3 + 1] = tint.g;
      col[i * 3 + 2] = tint.b;

      size[i] = r.range(0.7, 2.1);
      alpha[i] = r.range(0.16, 0.5);
      seed[i] = r.next();

      this.moteData.push({
        y0: y,
        speed: r.range(0.16, 0.5),
        amp: r.range(0.2, 0.9),
        phase: r.range(0, 20),
        baseAlpha: alpha[i],
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uSizeScale: { value: 1.5 },
        uTime: { value: 0 },
      },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = -4;
    this.group.add(this.motes);
  }

  /* ------------------------------------------------------------------ */
  /** 进度驱动配色插值 */
  updateColors(k) {
    this._current.a.copy(this.coolSet.a).lerp(this.warmSet.a, k);
    this._current.b.copy(this.coolSet.b).lerp(this.warmSet.b, k);
    this._current.c.copy(this.coolSet.c).lerp(this.warmSet.c, k);

    for (const layer of this.layers) {
      layer.uniforms.uColorA.value.copy(this._current.a);
      layer.uniforms.uColorB.value.copy(this._current.b);
      layer.uniforms.uColorC.value.copy(this._current.c);
    }

    if (this.abyss) {
      this.abyss.material.color
        .set('#46566C')
        .lerp(new THREE.Color('#C08FA6'), k);
    }
  }

  setProgress(t) {
    this.progress = clamp(t, 0, 1);
    this.updateColors(this.progress);
  }

  /* ------------------------------------------------------------------ */
  update(dt, elapsed) {
    const motionScale = this.reduceMotion ? 0.25 : 1;

    for (const layer of this.layers) {
      layer.uniforms.uTime.value = elapsed * motionScale;
      // 缓慢的垂直起伏，让云海像真的在呼吸
      layer.mesh.position.y =
        layer.baseY + Math.sin(elapsed * 0.16 + layer.phase) * 1.1 * motionScale;
      layer.mesh.rotation.z = Math.sin(elapsed * 0.05 + layer.phase) * 0.012 * motionScale;
    }

    // 漂浮光点
    this.motes.material.uniforms.uTime.value = elapsed;
    const posAttr = this.motes.geometry.attributes.position;
    const alphaAttr = this.motes.geometry.attributes.aAlpha;
    const arr = posAttr.array;
    const alpha = alphaAttr.array;
    const span = 40;

    for (let i = 0; i < this.moteData.length; i++) {
      const d = this.moteData[i];
      d.y0 += d.speed * dt * motionScale;
      if (d.y0 > 28) d.y0 = -16;
      arr[i * 3 + 1] = d.y0 + Math.sin(elapsed * 0.6 + d.phase) * d.amp;
      arr[i * 3] += Math.sin(elapsed * 0.24 + d.phase) * dt * 0.6 * motionScale;
      alpha[i] = d.baseAlpha * (0.6 + 0.4 * (Math.sin(elapsed * 1.1 + d.phase) * 0.5 + 0.5));
    }
    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  setReduceMotion(v) {
    this.reduceMotion = v;
  }
}
