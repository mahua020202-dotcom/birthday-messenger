import * as THREE from 'three';

/**
 * 画质档位。
 * 本项目**不使用实时阴影贴图**（自定义 Toon Shader 配合假接触阴影，
 * 在移动端能稳定 60/30fps），因此这里主要控制分辨率、云层数、粒子上限与后期。
 */
export const QUALITY_PRESETS = {
  high: {
    pixelRatio: 2,
    antialias: true,
    bloom: true,
    fxaa: true,
    maxParticles: 5000,
    cloudLayers: 5,
    skyStars: 900,
    glowSprites: true,
  },
  medium: {
    pixelRatio: 1.5,
    antialias: true,
    bloom: true,
    fxaa: false,
    maxParticles: 2800,
    cloudLayers: 4,
    skyStars: 560,
    glowSprites: true,
  },
  low: {
    pixelRatio: 1,
    antialias: false,
    bloom: false,
    fxaa: false,
    maxParticles: 1400,
    cloudLayers: 3,
    skyStars: 320,
    glowSprites: false,
  },
};

/**
 * 场景管理器：渲染器 / 场景 / 相机 / 更新循环注册表
 */
export class SceneManager {
  constructor({ canvas, quality = 'high' }) {
    this.canvas = canvas;
    this.preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.high;

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.preset.antialias,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.setClearColor(0x1b2540, 1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.info.autoReset = true;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      48,
      window.innerWidth / window.innerHeight,
      0.1,
      900
    );
    this.camera.position.set(0, 14, 46);

    this.isMobile = isMobile;
    this.updateables = new Set();
    this.elapsed = 0;
    this._deltaClamp = 0.1;

    this.applyQuality(quality);
    this._bindResize();
  }

  /* ------------------------------------------------------------------ */
  /** 像素比 */
  get pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio);
  }

  applyQuality(quality) {
    this.preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.high;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;

    // 竖屏（手机）时用一个更宽的视场角，保证角色和城堡都进画，
    // 否则窄画幅下镜头会显得贴脸
    const baseFov = 48;
    this.camera.fov = aspect >= 1
      ? baseFov
      : Math.min(72, baseFov * (1 + (1 - aspect) * 0.58));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.onResize) this.onResize(w, h);
  }

  _bindResize() {
    let raf = 0;
    this._resizeHandler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.resize());
    };
    window.addEventListener('resize', this._resizeHandler);
    window.addEventListener('orientationchange', this._resizeHandler);
  }

  /* ------------------------------------------------------------------ */
  /** 注册每帧更新的对象：需实现 update(dt, elapsed) */
  add(obj) {
    if (obj && typeof obj.update === 'function') this.updateables.add(obj);
    return obj;
  }

  remove(obj) {
    this.updateables.delete(obj);
  }

  /** 把 world 中所有带 update 的对象批量注册（便于模块自包含） */
  addAll(...objs) {
    objs.flat().forEach((o) => this.add(o));
    return objs;
  }

  /* ------------------------------------------------------------------ */
  update(dt, elapsed) {
    // DeltaTime 上限 0.1s，防止切后台回来时物理穿透
    const d = Math.min(dt, this._deltaClamp);
    this.elapsed = elapsed;

    for (const obj of this.updateables) {
      try {
        obj.update(d, elapsed);
      } catch (e) {
        console.error('[SceneManager] update error in', obj.constructor?.name || obj, e);
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._resizeHandler);
    window.removeEventListener('orientationchange', this._resizeHandler);
    this.renderer.dispose();
  }
}
