import * as THREE from 'three';
import {
  toonVertex,
  toonFragment,
  outlineVertex,
  outlineFragment,
} from './shaders/toon.js';

/* ============================================================
   全局光照环境（所有 Toon 材质共享同一批 uniform 对象，
   因此修改一次即可作用于整个场景，零额外开销）
   ============================================================ */

export const envUniforms = {
  uAmbientColor: { value: new THREE.Color('#9CC3E0') },
  uAmbient: { value: 0.3 },
  uLightDir: { value: new THREE.Vector3(0.55, 1.0, 0.42).normalize() },
  uLightColor: { value: new THREE.Color('#B8D4E8') },
  uLightIntensity: { value: 0.88 },
  uFillColor: { value: new THREE.Color('#FFD1DC') },
  uFill: { value: 0.2 },
  uFogColor: { value: new THREE.Color('#8A9AB0') },
  uFogNear: { value: 60 },
  uFogFar: { value: 230 },
  uFogStrength: { value: 0.45 },
  uLightGain: { value: 0.62 },
};

/** 预设：初始的「冷调月夜」 */
const PRESET_COLD = {
  ambientColor: '#7FA3C8',
  ambient: 0.3,
  lightColor: '#9FC0DC',
  lightIntensity: 0.95,
  fillColor: '#8E7C92',
  fill: 0.14,
};

/** 预设：点亮世界后的「粉金庆典」 */
const PRESET_WARM = {
  ambientColor: '#FFE4A0',
  ambient: 0.72,
  lightColor: '#FFD1DC',
  lightIntensity: 0.92,
  fillColor: '#FFE4A0',
  fill: 0.24,
};

const _cA = new THREE.Color();
const _cB = new THREE.Color();

/**
 * 按进度插值全局光照（0 = 冷调月夜，1 = 粉金庆典）
 * @param {number} t 0..1
 */
export function setEnvironmentProgress(t) {
  const k = Math.min(1, Math.max(0, t));

  _cA.set(PRESET_COLD.ambientColor);
  _cB.set(PRESET_WARM.ambientColor);
  envUniforms.uAmbientColor.value.copy(_cA).lerp(_cB, k);

  _cA.set(PRESET_COLD.lightColor);
  _cB.set(PRESET_WARM.lightColor);
  envUniforms.uLightColor.value.copy(_cA).lerp(_cB, k);

  _cA.set(PRESET_COLD.fillColor);
  _cB.set(PRESET_WARM.fillColor);
  envUniforms.uFillColor.value.copy(_cA).lerp(_cB, k);

  envUniforms.uAmbient.value =
    PRESET_COLD.ambient + (PRESET_WARM.ambient - PRESET_COLD.ambient) * k;
  envUniforms.uLightIntensity.value =
    PRESET_COLD.lightIntensity +
    (PRESET_WARM.lightIntensity - PRESET_COLD.lightIntensity) * k;
  envUniforms.uFill.value =
    PRESET_COLD.fill + (PRESET_WARM.fill - PRESET_COLD.fill) * k;
}

/** 方向光角度（可按时间缓慢旋转，制造光影流动） */
export function setLightDirection(x, y, z) {
  envUniforms.uLightDir.value.set(x, y, z).normalize();
}

/**
 * 大气雾随进度推进而变化：从冷灰蓝 → 暖粉金，
 * 让远景在「点亮世界」后也带上金光。
 */
export function setFogProgress(t, coolHex = '#A9B8C9', warmHex = '#FFD9C0') {
  const k = Math.min(1, Math.max(0, t));
  _cA.set(coolHex);
  _cB.set(warmHex);
  envUniforms.uFogColor.value.copy(_cA).lerp(_cB, k);
}

/* ============================================================
   Toon 材质工厂
   ============================================================ */

/**
 * 创建赛璐璐材质
 * @param {object} opts
 * @param {string|number} opts.color      基础色
 * @param {number} [opts.toonSteps=3.5]   色阶数（越大越柔和）
 * @param {string} [opts.emissive]        自发光色
 * @param {number} [opts.emissiveIntensity=0]
 * @param {number} [opts.opacity=1]
 * @param {boolean}[opts.transparent=false]
 * @param {string} [opts.rimColor]        边缘光色
 * @param {number} [opts.rimIntensity=0]
 * @param {number} [opts.rimPower=2.6]
 * @param {number} [opts.glow=0]          进度辉光（由 ProgressSystem 驱动）
 * @param {number} [opts.softness=0.62]   0=纯赛璐璐，1=完全平滑
 * @param {string|THREE.Side} [opts.side]
 */
export function createToonMaterial(opts = {}) {
  const {
    color = '#FFB6C1',
    toonSteps = 3.5,
    emissive = '#000000',
    emissiveIntensity = 0,
    opacity = 1,
    transparent = opacity < 1,
    rimColor = '#FFFFFF',
    rimIntensity = 0.08,
    rimPower = 2.8,
    glow = 0,
    softness = 0.62,
    side = THREE.FrontSide,
    depthWrite,
  } = opts;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      // —— 共享的环境 uniform（引用同一对象） ——
      uAmbientColor: envUniforms.uAmbientColor,
      uAmbient: envUniforms.uAmbient,
      uLightDir: envUniforms.uLightDir,
      uLightColor: envUniforms.uLightColor,
      uLightIntensity: envUniforms.uLightIntensity,
      uFillColor: envUniforms.uFillColor,
      uFill: envUniforms.uFill,
      uFogColor: envUniforms.uFogColor,
      uFogNear: envUniforms.uFogNear,
      uFogFar: envUniforms.uFogFar,
      uFogStrength: envUniforms.uFogStrength,
      uLightGain: envUniforms.uLightGain,
      // —— 每材质独立 ——
      uBaseColor: { value: new THREE.Color(color) },
      uToonSteps: { value: toonSteps },
      uToonSoftness: { value: softness },
      uEmissive: { value: new THREE.Color(emissive) },
      uEmissiveIntensity: { value: emissiveIntensity },
      uOpacity: { value: opacity },
      uRimColor: { value: new THREE.Color(rimColor) },
      uRimIntensity: { value: rimIntensity },
      uRimPower: { value: rimPower },
      uGlow: { value: glow },
    },
    vertexShader: toonVertex,
    fragmentShader: toonFragment,
    transparent,
    side,
    depthWrite: depthWrite !== undefined ? depthWrite : !transparent,
  });

  mat.userData.isToon = true;
  mat.userData.baseOpacity = opacity;
  return mat;
}

/** 修改已有 Toon 材质的基色（带平滑过渡需自行 lerp） */
export function setToonColor(material, color) {
  if (material?.uniforms?.uBaseColor) {
    material.uniforms.uBaseColor.value.set(color);
  }
}

/** 设置自发光强度 */
export function setToonEmissive(material, intensity) {
  if (material?.uniforms?.uEmissiveIntensity) {
    material.uniforms.uEmissiveIntensity.value = intensity;
  }
}

/* ============================================================
   描边（反向外壳法）
   ============================================================ */

const OUTLINE_COLOR = new THREE.Color('#4A2130');

/**
 * 描边材质缓存。
 * 描边材质的 uniform 不需要逐物体变化，因此同参数共享同一份材质，
 * 既能显著减少材质/程序切换，也让静态几何体合并时能真正并成一次 draw call。
 */
const outlineCache = new Map();

export function createOutlineMaterial({
  width = 0.0016,
  color = OUTLINE_COLOR,
  opacity = 1,
} = {}) {
  const key = `${width}|${color}|${opacity}`;
  const cached = outlineCache.get(key);
  if (cached) return cached;
  const mat = _buildOutlineMaterial({ width, color, opacity });
  outlineCache.set(key, mat);
  return mat;
}

function _buildOutlineMaterial({
  width = 0.0016,
  color = OUTLINE_COLOR,
  opacity = 1,
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uWidth: { value: width },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uMinDist: { value: 2.0 },
      uMaxDist: { value: 55.0 },
    },
    vertexShader: outlineVertex,
    fragmentShader: outlineFragment,
    side: THREE.BackSide,
    transparent: opacity < 1,
  });
}

/**
 * 给网格添加描边外壳。
 * 外壳作为子对象加入，自动继承变换；宽度可按屏幕恒定。
 * @param {THREE.Mesh} mesh
 * @param {object} opts  { width, color, opacity }
 * @returns {THREE.Mesh} 外壳网格
 */
export function addOutline(mesh, opts = {}) {
  const mat = createOutlineMaterial(opts);
  const shell = new THREE.Mesh(mesh.geometry, mat);
  shell.name = '__outline';
  shell.raycast = () => {};        // 不参与拾取
  shell.castShadow = false;
  shell.receiveShadow = false;
  mesh.add(shell);
  return shell;
}

/* ============================================================
   程序化贴图（无任何外部素材）
   ============================================================ */

const textureCache = new Map();

/** 径向渐变圆点（软阴影 / 光晕 / 粒子贴图） */
export function radialTexture(color = 'rgba(90,40,60,0.55)', size = 128) {
  const key = `radial-${color}-${size}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color.replace(/[\d.]+\)$/, '0.28)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/**
 * 软接触阴影（假阴影）
 * 本项目未开启实时阴影贴图，使用带径向渐变的贴地圆片代替，
 * 在移动端性能更友好，视觉上也更贴合「童话绘本」的风格。
 */
export function createBlobShadow(radius = 0.6, opacity = 0.42) {
  const geo = new THREE.CircleGeometry(radius, 32);
  const mat = new THREE.MeshBasicMaterial({
    map: radialTexture(`rgba(74,33,48,${opacity})`),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  mesh.userData.isBlobShadow = true;
  mesh.raycast = () => {};
  return mesh;
}

/** 加法混合的光晕贴片（庆典按钮光环 / 蜡烛光晕 / 星星光晕） */
export function createGlowSprite({
  color = '#FFD700',
  size = 1.2,
  opacity = 0.85,
  alpha = '0.85',
} = {}) {
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({
    map: radialTexture(`rgba(255,215,0,${alpha})`),
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Mesh(geo, mat);
  sprite.raycast = () => {};
  sprite.renderOrder = 5;
  return sprite;
}

/** 所有已创建的描边材质（合并静态几何体时需要把它们一起合并） */
export function getOutlineMaterials() {
  return [...outlineCache.values()];
}

export { OUTLINE_COLOR };
