/**
 * 后期处理着色器：颜色分级 + 暗角
 * 均在 linear 空间工作，最后由 OutputPass 统一做色调映射与色彩空间转换。
 */

export const colorGradeShader = {
  name: 'ColorGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uWarmth: { value: 0.0 },      // 0 冷 → 1 暖
    uSaturation: { value: 1.06 },
    uLift: { value: 0.012 },
    uContrast: { value: 1.04 },
    uLiftColor: { value: [0.06, 0.03, 0.05] },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uWarmth;
    uniform float uSaturation;
    uniform float uLift;
    uniform float uContrast;
    uniform vec3  uLiftColor;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;

      // 亮度
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));

      // 饱和度
      c = mix(vec3(l), c, uSaturation);

      // 对比度（围绕 0.5 灰点）
      c = (c - 0.5) * uContrast + 0.5;

      // 暖化：高光偏金 / 阴影偏玫瑰
      vec3 warm = vec3(0.10, 0.045, -0.03) * uWarmth;
      vec3 shadowTint = uLiftColor * uWarmth * (1.0 - l);
      c += warm * smoothstep(0.35, 1.0, l);
      c += shadowTint * 0.5;

      // 轻微提亮阴影，避免死黑
      c += uLift * (1.0 - l);

      gl_FragColor = vec4(max(c, 0.0), tex.a);
    }
  `,
};

export const vignetteShader = {
  name: 'VignetteShader',
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.42 },
    uSmoothness: { value: 0.62 },
    uColor: { value: [0.22, 0.10, 0.16] },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uSmoothness;
    uniform vec3  uColor;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float dist = length(d * vec2(1.0, 1.06)) * 1.42;
      float v = smoothstep(uSmoothness, 1.0, dist) * uIntensity;
      vec3 c = mix(tex.rgb, uColor, v);
      gl_FragColor = vec4(c, tex.a);
    }
  `,
};
