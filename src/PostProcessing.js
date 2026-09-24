import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { colorGradeShader, vignetteShader } from './shaders/post.js';

/**
 * 后期处理管线
 *   RenderPass → UnrealBloomPass → 颜色分级 → 暗角 → FXAA → OutputPass
 * OutputPass 负责最终的色调映射与 sRGB 转换，因此前面的 Pass 全部在 linear 空间工作。
 * 移动端 / 低画质下会关闭 Bloom 与 FXAA，仅保留基础渲染 + 分级。
 */
export class PostProcessing {
  constructor(sceneManager, quality = 'high') {
    this.sm = sceneManager;
    this.scene = sceneManager.scene;
    this.camera = sceneManager.camera;
    this.renderer = sceneManager.renderer;

    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);

    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(
      size.x, size.y,
      {
        type: THREE.HalfFloatType,
        samples: quality === 'high' ? 4 : 0,
      }
    ));
    this.composer.setPixelRatio(sceneManager.pixelRatio);

    /* 1) 基础渲染 */
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    /* 2) 泛光 */
    this.bloomPass = new UnrealBloomPass(size, 0.42, 0.62, 0.85);
    this.composer.addPass(this.bloomPass);

    /* 3) 颜色分级 */
    this.gradePass = new ShaderPass(colorGradeShader);
    this.composer.addPass(this.gradePass);

    /* 4) 暗角 */
    this.vignettePass = new ShaderPass(vignetteShader);
    this.composer.addPass(this.vignettePass);

    /* 5) FXAA */
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaaPass);

    /* 6) 输出（色调映射 + 色彩空间） */
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.bloomBase = 0.42;
    this.bloomBoost = 0;
    this._quality = quality;

    this.setQuality(quality);
    this.setProgress(0);
  }

  /* ------------------------------------------------------------------ */
  setQuality(quality) {
    this._quality = quality;
    const high = quality === 'high';
    const mid = quality === 'medium';

    this.bloomPass.enabled = high || mid;
    this.fxaaPass.enabled = high;

    if (this.composer.renderTarget1) this.composer.renderTarget1.samples = high ? 4 : 0;
    if (this.composer.renderTarget2) this.composer.renderTarget2.samples = high ? 4 : 0;

    this.bloomPass.strength = this.bloomBase * (high ? 1 : 0.72);
    this.composer.setPixelRatio(this.sm.pixelRatio);
    this.resize(window.innerWidth, window.innerHeight);
  }

  /** 进度驱动：暖化、泛光增强、饱和提升 */
  setProgress(t) {
    const k = Math.min(1, Math.max(0, t));

    this.gradePass.uniforms.uWarmth.value = 0.12 + k * 0.88;
    this.gradePass.uniforms.uSaturation.value = 1.04 + k * 0.14;
    this.gradePass.uniforms.uContrast.value = 1.05 + k * 0.05;

    const boost = 1 + k * 0.85;
    this.bloomPass.strength = this.bloomBase * boost * (this._quality === 'high' ? 1 : 0.72);
    this.bloomPass.threshold = 0.85 - k * 0.1;

    // 暗角在庆典时略强，聚焦感更强
    this.vignettePass.uniforms.uIntensity.value = 0.36 + k * 0.14;
  }

  /** 庆典 / 最终点亮时的额外泛光脉冲 */
  setBloomBoost(v) {
    this.bloomBoost = v;
    const base = this.bloomBase + v;
    this.bloomPass.strength = base * (this._quality === 'high' ? 1 : 0.72);
  }

  /** 降低动态效果：关闭泛光与暗角脉动 */
  setMotionReduced(reduced) {
    this.bloomPass.enabled = !reduced && this._quality !== 'low';
    this.vignettePass.uniforms.uIntensity.value = reduced ? 0.18 : 0.42;
  }

  resize(w, h) {
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms.resolution.value.set(
      1 / (w * pr),
      1 / (h * pr)
    );
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.composer.dispose?.();
  }
}
