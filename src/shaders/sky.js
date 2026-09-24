/**
 * 天空着色器
 * 巨大内表面球体，由进度驱动的「顶色 / 地平线色 / 底部色」三段渐变，
 * 并叠加一层缓慢流动的极光状噪波，让天空有生命感。
 */

export const skyVertex = /* glsl */ `
varying vec3 vDir;
varying vec3 vWorldPos;
void main() {
  vWorldPos = position;
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const skyFragment = /* glsl */ `
uniform vec3  uTopColor;
uniform vec3  uHorizonColor;
uniform vec3  uBottomColor;
uniform vec3  uGlowColor;
uniform float uGlow;         // 地平线处的粉金辉光（随进度增强）
uniform float uTime;
uniform float uAurora;       // 极光强度

varying vec3 vDir;
varying vec3 vWorldPos;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);

  // y: 1 顶部 / 0 地平线 / -1 底部
  float hy = d.y;
  float t = clamp(hy, 0.0, 1.0);
  float b = clamp(-hy, 0.0, 1.0);

  vec3 col = mix(uHorizonColor, uTopColor, pow(t, 0.72));
  col = mix(col, uBottomColor, pow(b, 0.55));

  // 地平线辉光带
  float band = exp(-abs(hy) * 7.5);
  col += uGlowColor * band * uGlow;

  // 极光噪波（只在地平线以上）
  if (uAurora > 0.001 && hy > -0.05) {
    vec2 ap = vec2(atan(d.z, d.x) * 2.2, d.y * 3.4 - uTime * 0.05);
    float n = fbm(ap * 1.6 + uTime * 0.03);
    float mask = smoothstep(0.45, 0.95, n) * smoothstep(-0.05, 0.55, hy) * (1.0 - smoothstep(0.55, 1.0, hy));
    col += uGlowColor * mask * uAurora * 0.85;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

/** 星点（独立于天空球，便于逐颗点亮 + 独立闪烁） */
export const starVertex = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aBright;
uniform float uTime;
uniform float uPixelRatio;
uniform float uProgress;
varying float vAlpha;
varying vec3 vColor;
attribute vec3 aColor;

void main() {
  // 逐颗点亮：进度越高，越多星星亮起
  float lit = smoothstep(0.0, 1.0, (uProgress - aBright * 0.92) * 4.5 + 0.15);
  float tw = 0.55 + 0.45 * sin(uTime * (1.4 + aPhase * 2.6) + aPhase * 30.0);

  vAlpha = lit * tw * (0.55 + aBright * 0.65);
  vColor = aColor;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * (60.0 + lit * 90.0) / max(-mv.z, 0.001);
  gl_PointSize = clamp(gl_PointSize, 0.8, 26.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const starFragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.02, d) * vAlpha;
  if (a < 0.006) discard;
  gl_FragColor = vec4(vColor * (1.0 + (1.0 - d * 2.0) * 0.8), a);
}
`;
