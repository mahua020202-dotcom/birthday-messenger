/**
 * 赛璐璐（Toon）着色器
 * 顶点着色器传入世界法线 / 世界坐标 / UV，片元着色器把 NdotL 离散化成 3–4 级。
 */

export const toonVertex = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vTint;          // 逐实例颜色 / 顶点色

void main() {
  vUv = uv;

  // InstancedMesh 的 instanceColor（Three.js 已在顶点前缀中声明该 attribute）
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vTint *= instanceColor;
  #endif
  #ifdef USE_COLOR
    attribute vec3 color;
    vTint *= color;
  #endif

  // 支持 InstancedMesh（Three.js 在渲染实例网格时自动声明 instanceMatrix）
  #ifdef USE_INSTANCING
    mat4 modelM = modelMatrix * instanceMatrix;
  #else
    mat4 modelM = modelMatrix;
  #endif

  vec4 worldPos = modelM * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;

  // 使用 model 矩阵的旋转/缩放部分变换法线
  vNormalW = normalize(mat3(modelM) * normal);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const toonFragment = /* glsl */ `
uniform vec3  uBaseColor;
uniform vec3  uAmbientColor;
uniform float uAmbient;
uniform vec3  uLightDir;
uniform vec3  uLightColor;
uniform float uLightIntensity;
uniform float uToonSteps;
uniform float uToonSoftness;
uniform vec3  uEmissive;
uniform float uEmissiveIntensity;
uniform float uOpacity;
uniform vec3  uRimColor;
uniform float uRimIntensity;
uniform float uRimPower;
uniform vec3  uFillColor;
uniform float uFill;
uniform float uGlow;            // 随进度增加的自我发光（点亮世界）
uniform float uLightGain;       // 统一光照能量缩放（防止亮部过曝）

// 大气雾（与云海同色，制造纵深感）
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogStrength;

varying vec3 vNormalW;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vTint;

void main() {
  vec3 N = normalize(vNormalW);
  vec3 base = uBaseColor * vTint;
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uLightDir);

  // 半兰伯特：让暗部不会全黑，更适合可爱风
  float NdotL = dot(N, L) * 0.5 + 0.5;

  // —— 核心：NdotL 离散化为 uToonSteps 个层级 ——
  float toonLevel = floor(NdotL * uToonSteps + 0.5) / uToonSteps;
  // 与原始半兰伯特混合，uToonSoftness=1 时为纯粹赛璐璐
  float level = mix(NdotL, toonLevel, uToonSoftness);

  vec3 lit = base * (uAmbientColor * uAmbient + uLightColor * uLightIntensity * level) * uLightGain;

  // 自下而上的补光，制造柔和的糖果质感
  float upness = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  lit += base * uFillColor * uFill * (1.0 - upness);

  // 边缘光（Rim）
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uRimPower) * uRimIntensity;
  lit += uRimColor * rim;

  // 自发光 + 进度辉光
  lit += uEmissive * uEmissiveIntensity + base * uGlow;

  // 大气雾：越远越融入云海
  float depth = length(cameraPosition - vWorldPos);
  float fog = smoothstep(uFogNear, uFogFar, depth) * uFogStrength;
  lit = mix(lit, uFogColor, fog);

  gl_FragColor = vec4(lit, uOpacity);
}
`;

/** 描边外壳（反向外壳法） */
export const outlineVertex = /* glsl */ `
uniform float uWidth;
uniform float uMinDist;
uniform float uMaxDist;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec3 worldNormal = normalize(mat3(modelMatrix) * normal);

  vec4 mvPos = viewMatrix * worldPos;
  float dist = clamp(-mvPos.z, uMinDist, uMaxDist);

  // 视图空间法线：沿屏幕方向外扩，保证描边粗细在屏幕上近似恒定
  vec3 viewNormal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
  mvPos.xyz += viewNormal * uWidth * dist;

  gl_Position = projectionMatrix * mvPos;
}
`;

export const outlineFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor, uOpacity);
}
`;
