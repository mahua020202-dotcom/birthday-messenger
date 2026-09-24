/**
 * 许愿池水面着色器
 * 同心涟漪 + 流动噪声 + 菲涅尔边缘，许愿时注入一次脉冲涟漪。
 */

export const waterVertex = /* glsl */ `
uniform float uTime;
uniform float uWaveHeight;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vec3 p = position;

  // 水面微波（local z = 世界 Y）
  float r = length(p.xy);
  p.z += sin(r * 3.5 - uTime * 2.2) * uWaveHeight * 0.6;
  p.z += sin(p.x * 2.4 + uTime * 1.6) * cos(p.y * 2.1 - uTime * 1.3) * uWaveHeight;

  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const waterFragment = /* glsl */ `
uniform float uTime;
uniform vec3  uColorShallow;
uniform vec3  uColorDeep;
uniform vec3  uRippleColor;
uniform float uPulse;        // 许愿脉冲 0→1→0
uniform float uGlow;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;

  // 持续的小涟漪
  float ring = sin(r * 26.0 - uTime * 3.4) * 0.5 + 0.5;
  ring *= smoothstep(1.0, 0.15, r);

  // 许愿脉冲：一圈明显的扩散波
  float pulseR = (1.0 - uPulse) * 1.0;
  float pulse = exp(-abs(r - pulseR) * 26.0) * uPulse;

  // 流动高光
  float sheen = sin((vUv.x + vUv.y) * 14.0 + uTime * 1.8) * 0.5 + 0.5;

  vec3 color = mix(uColorDeep, uColorShallow, smoothstep(1.0, 0.1, r));
  color += uRippleColor * (ring * 0.28 + pulse * 0.9);
  color += vec3(1.0) * sheen * 0.06;

  // 边缘亮环（池壁画出的水面轮廓）
  float edge = smoothstep(0.86, 0.99, r) * (1.0 - smoothstep(0.99, 1.0, r));
  color += uRippleColor * edge * 0.55;

  color += uColorShallow * uGlow;

  gl_FragColor = vec4(color, uOpacity);
}
`;
