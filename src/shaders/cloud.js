/**
 * 云海着色器
 * 多层半透明平面叠加，FBM 噪声生成云朵，随时间缓慢流动，
 * 颜色与不透明度随「点亮进度」从灰蓝过渡到粉金。
 */

export const cloudVertex = /* glsl */ `
uniform float uTime;
uniform float uWave;
uniform float uSeed;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 p = position;

  // 顶点纵向起伏（local z 在平面旋转后即世界 Y）
  float w =
      sin(p.x * 0.055 + uTime * 0.32 + uSeed)
    * cos(p.y * 0.048 - uTime * 0.26 + uSeed * 1.7);
  float w2 = sin(p.x * 0.12 - uTime * 0.5 + uSeed * 2.3) * 0.35;

  p.z += (w + w2) * uWave;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const cloudFragment = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uThreshold;
uniform float uSpeed;
uniform float uScale;
uniform float uSeed;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uColorC;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + 17.31;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv * uScale + vec2(uTime * 0.013 * uSpeed, uTime * 0.006 * uSpeed) + uSeed;

  float n = fbm(uv);
  float n2 = fbm(uv * 2.6 + n * 0.65);
  n = mix(n, n2, 0.45);

  vec3 color = mix(uColorA, uColorB, smoothstep(0.22, 0.86, n));
  color = mix(color, uColorC, smoothstep(0.62, 1.0, n) * 0.72);

  float alpha = smoothstep(uThreshold, 1.0, n) * uOpacity;

  // 径向边缘淡出，避免看到平面矩形边界
  float rad = distance(vUv, vec2(0.5)) * 2.0;
  alpha *= 1.0 - smoothstep(0.42, 1.0, rad);

  if (alpha < 0.004) discard;

  gl_FragColor = vec4(color, alpha);
}
`;
