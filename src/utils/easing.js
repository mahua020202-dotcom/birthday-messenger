/**
 * 缓动函数集合
 * 全部为纯函数：输入 t∈[0,1] 返回缓动后的值
 */

export const linear = (t) => t;

export const easeInOutQuad = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

export const easeInQuad = (t) => t * t;

export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const easeInOutQuart = (t) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

/** 弹性出场（会轻微过冲，适合弹出 UI） */
export const easeOutBack = (t, s = 1.70158) =>
  1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

/** 指数渐近（适合相机落位） */
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** 平滑步进 */
export const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** 帧率无关的指数插值 —— 用于相机/数值平滑跟随 */
export const damp = (current, target, lambda, dt) =>
  target + (current - target) * Math.exp(-lambda * dt);

/** 角度阻尼（走最短路径） */
export const dampAngle = (current, target, lambda, dt) => {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
};

/** 弹簧阻尼（用于轻微晃动/呼吸） */
export const spring = (t, freq = 1, damp = 0.3) =>
  Math.sin(t * Math.PI * 2 * freq) * Math.exp(-t * damp);
