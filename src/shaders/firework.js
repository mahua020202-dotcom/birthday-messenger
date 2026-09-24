/**
 * 通用粒子着色器（烟花 / 祝福爆裂 / 彩带光点 / 流星 / 粒子文字）
 * 使用单个 Points 对象 + 属性缓冲，CPU 更新位置，GPU 负责发光与淡出。
 */

export const particleVertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3  aColor;
attribute float aSeed;

uniform float uPixelRatio;
uniform float uSizeScale;
uniform float uTime;

varying float vAlpha;
varying vec3  vColor;
varying float vSeed;

void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vSeed = aSeed;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);

  // 轻微闪烁，让粒子有呼吸感
  float twinkle = 0.82 + 0.18 * sin(uTime * (3.0 + aSeed * 4.0) + aSeed * 20.0);

  gl_PointSize = aSize * uSizeScale * uPixelRatio * twinkle * (300.0 / max(-mv.z, 0.001));
  gl_PointSize = clamp(gl_PointSize, 0.6, 220.0);

  gl_Position = projectionMatrix * mv;
}
`;

export const particleFragment = /* glsl */ `
varying float vAlpha;
varying vec3  vColor;
varying float vSeed;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);

  // 柔和圆形光点 + 中心高光
  float core = smoothstep(0.5, 0.04, d);
  float halo = smoothstep(0.5, 0.28, d) * 0.45;

  float a = (core + halo) * vAlpha;
  if (a < 0.005) discard;

  vec3 color = vColor * (1.0 + core * 0.65);
  gl_FragColor = vec4(color, a);
}
`;

/** 流星拖尾（用粒子同款但更细长） */
export const meteorVertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3  aColor;
attribute vec3  aTail;
uniform float uPixelRatio;
uniform float uSizeScale;
varying float vAlpha;
varying vec3 vColor;

void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uSizeScale * uPixelRatio * (320.0 / max(-mv.z, 0.001));
  gl_PointSize = clamp(gl_PointSize, 0.8, 260.0);
  gl_Position = projectionMatrix * mv;
}
`;
