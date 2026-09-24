/**
 * 数学 / 随机 / 颜色工具
 */

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const mapRange = (v, inMin, inMax, outMin, outMax) =>
  lerp(outMin, outMax, clamp(invLerp(inMin, inMax, v), 0, 1));

export const TAU = Math.PI * 2;
export const deg = (d) => (d * Math.PI) / 180;

/** 确定性伪随机（同一 seed 永远同一结果，保证存档后场景一致） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 生成一个带辅助方法的随机源 */
export function createRandom(seed = 20260923) {
  const r = mulberry32(seed);
  return {
    next: r,
    range: (min, max) => min + r() * (max - min),
    int: (min, max) => Math.floor(min + r() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    sign: () => (r() < 0.5 ? -1 : 1),
  };
}

/** 在圆环上取点（用于岛屿上的物体排布） */
export function ringPoint(radius, angle) {
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

/**
 * 颜色工具：基于十六进制色做线性插值（在 linear-sRGB 空间下工作，
 * 与 Three.js ColorManagement 保持一致）
 */
export function lerpHex(a, b, t, THREEColor, target) {
  const ca = new THREEColor(a);
  const cb = new THREEColor(b);
  target.copy(ca).lerp(cb, clamp(t, 0, 1));
  return target;
}

/** 把 canvas 文字栅格化成粒子坐标点集（用于「生日快乐」粒子文字） */
export function textToPoints(text, {
  font = 'bold 160px "PingFang SC", "Microsoft YaHei", sans-serif',
  sampleStep = 4,
  threshold = 128,
  maxPoints = 2600,
} = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + 80;
  const h = 240;
  canvas.width = w;
  canvas.height = h;

  const c2 = canvas.getContext('2d');
  c2.fillStyle = '#000';
  c2.fillRect(0, 0, w, h);
  c2.font = font;
  c2.fillStyle = '#fff';
  c2.textAlign = 'center';
  c2.textBaseline = 'middle';
  c2.fillText(text, w / 2, h / 2);

  const data = c2.getImageData(0, 0, w, h).data;
  const pts = [];
  for (let y = 0; y < h; y += sampleStep) {
    for (let x = 0; x < w; x += sampleStep) {
      if (data[(y * w + x) * 4] > threshold) {
        // 归一化到 [-1,1]，保持宽高比
        pts.push({
          x: (x / w - 0.5) * (w / h),
          y: -(y / h - 0.5),
        });
      }
    }
  }
  // 超量时随机下采样，保持形状均匀
  if (pts.length > maxPoints) {
    const step = pts.length / maxPoints;
    const out = [];
    for (let i = 0; i < maxPoints; i++) out.push(pts[Math.floor(i * step)]);
    return { points: out, aspect: w / h };
  }
  return { points: pts, aspect: w / h };
}

/** 简单正弦噪声（CPU 端，用于呼吸/闪烁相位） */
export function snoise1(x) {
  return Math.sin(x) * 0.5 + Math.sin(x * 2.3 + 1.7) * 0.3 + Math.sin(x * 4.1 + 0.4) * 0.2;
}
