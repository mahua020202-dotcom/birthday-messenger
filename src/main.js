/**
 * ============================================================
 *  生日快乐 · 云端粉色城堡
 *  纯前端沉浸式生日互动体验 —— 入口与总导演
 * ============================================================
 *  启动流程：
 *   1. 解析 URL 参数（name / wishes / surprise / theme）
 *   2. 初始化渲染、后期、场景
 *   3. 创建天空 / 云海 / 漂浮岛屿 / 粉色城堡 / 寿星角色
 *   4. 显示开始屏幕
 *   5. 点击「进入城堡」→ 相机沿曲线飞入 → 大门打开 → 第三人称操作
 *   6. 收集祝福 / 许愿 / 打开惊喜 / 启动庆典 / 登上露台
 *   7. 进度 100 → 最终点亮
 * ============================================================
 */

import * as THREE from 'three';

import { SceneManager } from './SceneManager.js';
import { PostProcessing } from './PostProcessing.js';
import { Sky } from './Sky.js';
import { CloudSea } from './CloudSea.js';
import { Island } from './Island.js';
import { Castle } from './Castle.js';
import { Character } from './Character.js';
import { CameraController } from './CameraController.js';
import { InputManager } from './InputManager.js';
import { InteractionManager } from './InteractionManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { AudioManager } from './AudioManager.js';
import { UIManager } from './UIManager.js';
import { StateManager, STAGES } from './StateManager.js';
import { mergeStaticMeshes } from './utils/merge.js';
import { getOutlineMaterials } from './ToonMaterial.js';
import { BlessingSystem } from './BlessingSystem.js';
import { WishSystem } from './WishSystem.js';
import { SurpriseSystem } from './SurpriseSystem.js';
import { CelebrationSystem } from './CelebrationSystem.js';
import { ProgressSystem } from './ProgressSystem.js';

import {
  parseParams, buildWishList, applyThemeToCss, THEMES,
  DEFAULT_NAME, DEFAULT_SURPRISE,
} from './DataLoader.js';

/* ============================================================
   1. 解析参数
   ============================================================ */
const params = parseParams();
const themeName = params.theme;

const state = new StateManager();
state.state.playerName = params.name || DEFAULT_NAME;
state.state.wishes = buildWishList(params.wishes);
state.state.settings.lang = state.state.settings.lang || 'zh';

applyThemeToCss(themeName);
const palette = {
  ...THEMES[themeName],
  pink1: THEMES[themeName].islandTop,
  accent2: THEMES[themeName].accent,
};

const ui = new UIManager(state);
ui.setLang(state.state.settings.lang);
ui.setLoading('正在云端搭建城堡……');

/* ============================================================
   2. 渲染层
   ============================================================ */
const canvas = document.getElementById('gl');
const quality = state.state.settings.quality;

const sm = new SceneManager({ canvas, quality });
const preset = sm.preset;
const post = new PostProcessing(sm, quality);

/* 手动管理 info 重置，这样一帧内的全部 Pass 统计都能被读到（便于性能观测） */
sm.renderer.info.autoReset = false;
const perf = { fps: 0, frameMs: 0, calls: 0, triangles: 0, programs: 0 };
const samples = [];

/* 共享世界描述（各模块向其中登记可站立面 / 碰撞体 / 相机遮挡物） */
const world = {
  ground: [],
  colliders: [],
  occluders: [],
  spawnPoint: new THREE.Vector3(0, 0, 3.2),
};

/* ============================================================
   3. 场景内容
   ============================================================ */
const sky = new Sky(sm.scene, { palette, preset, reduceMotion: state.state.settings.reduceMotion });
const clouds = new CloudSea(sm.scene, { palette, preset, reduceMotion: state.state.settings.reduceMotion });
const island = new Island(sm.scene, world, { palette, preset });
const castle = new Castle(sm.scene, world, { palette, preset, playerName: state.state.playerName });

world.spawnPoint.copy(island.spawnPoint);

/* ------------------------------------------------------------
   静态几何体合并：把城堡里「建好就不动」的零件按材质烘焙成单个网格，
   描边外壳同理。这是本场景最大的一项 draw call 优化。
   ------------------------------------------------------------ */
const mergeStats = mergeStaticMeshes(castle.group, {
  materials: [...castle.collectMergeMaterials(), ...getOutlineMaterials()],
  skip: (mesh) => {
    if (world.ground.includes(mesh) || world.occluders.includes(mesh)) return true;
    if (mesh.userData.window || mesh.userData.noMerge) return true;
    // 祖先节点被标记为不可合并（会做动画的分组）
    let p = mesh.parent;
    while (p) {
      if (p.userData?.noMerge) return true;
      p = p.parent;
    }
    return false;
  },
  label: 'Castle',
});

const character = new Character(sm.scene, world, { palette });
character.setPosition(island.spawnPoint.x, island.spawnPoint.y, island.spawnPoint.z);
character.faceTo(0, -8);

const particles = new ParticleSystem(sm.scene, {
  maxParticles: preset.maxParticles,
  reduceMotion: state.state.settings.reduceMotion,
});

const cameraCtl = new CameraController(sm.camera, character, world, {
  reduceMotion: state.state.settings.reduceMotion,
});

const audio = new AudioManager({
  musicVolume: state.state.settings.music,
  sfxVolume: state.state.settings.sfx,
});
audio.setProgress(0);

const input = new InputManager(canvas, {
  onAction: (name, payload) => {
    if (name === 'rotate') cameraCtl.rotate(payload.dx, payload.dy);
    else if (name === 'zoom') cameraCtl.zoom(payload.delta);
    else if (name === 'book') toggleBook();
    else if (name === 'settings') toggleSettings();
    else if (name === 'pause') togglePause();
    else if (name === 'wish') openWishShortcut();
    else if (name === 'gift') focusHint('gift');
    else if (name === 'celebrate') focusHint('celebrate');
  },
});

const interaction = new InteractionManager({ character, camera: sm.camera, input, ui, world });
sm.camera.userData.viewport = { width: window.innerWidth, height: window.innerHeight };

/* ============================================================
   4. 玩法系统
   ============================================================ */
const blessing = new BlessingSystem({
  scene: sm.scene, state, ui, audio, particles, interaction, castle, palette, cameraCtl,
});
const wish = new WishSystem({
  scene: sm.scene, state, ui, audio, particles, interaction, castle, sky, cameraCtl,
});
const surprise = new SurpriseSystem({
  scene: sm.scene, state, ui, audio, particles, interaction, castle, palette, cameraCtl,
  data: { surprise: params.surprise || DEFAULT_SURPRISE },
});
const celebration = new CelebrationSystem({
  scene: sm.scene, state, ui, audio, particles, interaction, castle, sky, cameraCtl,
  palette, preset, quality,
});
const progress = new ProgressSystem({
  state, ui, sky, clouds, island, castle, post, audio, particles, celebration,
  character, cameraCtl, palette,
});

blessing.spawnBlessings();
wish.build();
surprise.build();
celebration.build();
progress.applyImmediate();

/* 大门也可以手动开关（额外的探索乐趣） */
interaction.register({
  id: 'castle-gate',
  kind: 'door',
  position: new THREE.Vector3(0, 1.2, -1.6),
  radius: 3.4,
  maxDy: 4,
  priority: 3,
  hint: () => (castle.gate.target > 0.5
    ? (ui.lang === 'en' ? 'Close the gate' : '关上大门')
    : ui.t('hintDoor')),
  enabled: () => state.state.stage !== STAGES.INTRO,
  objects: castle.gate.pickup,
  onInteract: () => {
    const willOpen = castle.gate.target < 0.5;
    castle.setGateOpen(willOpen ? 1 : 0);
    audio.playSFX('door');
  },
});

/* 场景更新注册 */
sm.addAll(sky, clouds, island, castle, particles, blessing, wish, surprise);

/* ============================================================
   5. UI 回调
   ============================================================ */
let lastStepTime = 0;

ui.bind({
  enter: () => beginJourney(false),
  resume: () => beginJourney(true),

  toggleBook,
  toggleSettings,
  pause: togglePause,
  resumeGame: () => togglePause(false),

  restart: () => restartEverything(),
  replay: () => restartEverything(),
  share: () => shareMoment(),

  overlay: () => syncInputEnabled(),

  settings: (patch) => applySettings(patch),

  wishConfirm: (text) => wish.confirmWish(text),

  sfx: (name) => audio.playSFX(name),

  interactButton: () => interaction.tryInteract(),
});

function toggleBook() {
  ui.toggleBook();
  audio.playSFX('click');
}

function toggleSettings() {
  if (ui.settingsOpen) ui.closeSettings();
  else ui.openSettings();
}

function togglePause(force = null) {
  if (state.state.stage !== STAGES.PLAY && state.state.stage !== STAGES.CELEBRATION) return;
  const open = force === null ? !ui.pauseOpen : force;
  if (open) {
    ui.openPause();
  } else {
    ui.closePause();
  }
  syncInputEnabled();
}

function openWishShortcut() {
  if (state.state.stage !== STAGES.PLAY) return;
  wish.openWishModal();
}

function focusHint(kind) {
  const item = interaction.items.find((i) => i.kind === kind);
  if (!item) return;
  ui.toast({
    label: '🧭',
    text: kind === 'gift'
      ? (ui.lang === 'en' ? 'Look for the golden gift box in the north-east pavilion.' : '金色惊喜礼盒在东北角的礼物房里。')
      : (ui.lang === 'en' ? 'The celebration button is in the centre of the great hall.' : '庆典按钮在大厅正中央。'),
    duration: 3600,
  });
}

function syncInputEnabled() {
  // 最终点亮是过场演出：锁定操作，让镜头完整地展示被点亮的世界
  const playable = state.state.stage === STAGES.PLAY ||
    state.state.stage === STAGES.CELEBRATION;
  input.setEnabled(playable && !ui.anyOverlayOpen);
}

function applySettings(patch) {
  state.updateSettings(patch);

  if (patch.music !== undefined || patch.sfx !== undefined) {
    audio.setVolumes({
      music: state.state.settings.music,
      sfx: state.state.settings.sfx,
    });
  }

  if (patch.quality !== undefined) {
    // 立即生效：分辨率 / 泛光 / FXAA；云层数与粒子上限在下次进入时按新档位重建
    sm.applyQuality(patch.quality);
    post.setQuality(patch.quality);
    sm.camera.userData.viewport = { width: window.innerWidth, height: window.innerHeight };
    ui.toast({
      label: ui.lang === 'en' ? 'Quality' : '画质',
      text: ui.lang === 'en'
        ? `Switched to ${patch.quality} (some effects apply after reload)`
        : `已切换为「${ui.t(patch.quality === 'high' ? 'qHigh' : patch.quality === 'medium' ? 'qMid' : 'qLow')}」，部分效果刷新后完全生效`,
      duration: 3200,
    });
  }

  if (patch.reduceMotion !== undefined) {
    sky.setReduceMotion(patch.reduceMotion);
    clouds.setReduceMotion(patch.reduceMotion);
    particles.setReduceMotion(patch.reduceMotion);
    cameraCtl.setReduceMotion(patch.reduceMotion);
    post.setMotionReduced(patch.reduceMotion);
  }

  if (patch.lang !== undefined) {
    ui.setLang(patch.lang);
    ui.renderBook();
  }
}

async function shareMoment() {
  const s = state.summary();
  const text = ui.lang === 'en'
    ? `I just lit up my birthday world in a pink castle in the clouds. ${s.blessings}/${s.totalBlessings} blessings collected.`
    : `我在云端的粉色城堡里点亮了属于自己的生日世界，收集了 ${s.blessings}/${s.totalBlessings} 条祝福。`;

  try {
    if (navigator.share) {
      await navigator.share({ title: '生日快乐 · 云端粉色城堡', text, url: window.location.href });
      return;
    }
  } catch { /* 用户取消，继续走复制 */ }

  try {
    await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
    ui.toast({ label: '🔗', text: ui.lang === 'en' ? 'Link copied' : '链接已复制，发给想一起庆祝的人吧', duration: 3200 });
  } catch {
    ui.toast({ label: '🔗', text: window.location.href, duration: 6000 });
  }
}

/* ============================================================
   6. 旅程控制
   ============================================================ */
function beginJourney(fromSave) {
  // 音频必须由用户手势解锁
  audio.unlock().then(() => {
    audio.startBGM();
    audio.setProgress(progress.visual);
  });

  if (fromSave) {
    const ok = state.loadSave();
    if (ok) {
      state.state.playerName = params.name || state.state.playerName;
      ui.setName(state.state.playerName);
      blessing.clear();
      blessing.spawnBlessings();
      wish.restore();
      surprise.restore();
      celebration.restore();
      progress.applyImmediate();
      ui.setBookBadge(state.state.collectedBlessings.length, blessing.getTotal());
      ui.renderBook();
      castle.setGateOpenImmediate(1);
    }
  } else {
    state.save();
  }

  ui.hideStart();
  ui.showHUD();
  ui.clearToasts();
  state.setStage(STAGES.FLYING);

  // 开场飞入
  cameraCtl.startIntroPath({ character });
  cameraCtl.setIntroDoneCallback(() => {
    state.setStage(STAGES.PLAY);
    character.setEnabled(true);
    syncInputEnabled();
    castle.setGateOpen(1);
    audio.playSFX('door');

    const isEn = ui.lang === 'en';
    ui.toast({
      label: '✦',
      text: isEn
        ? `Welcome to your birthday castle, ${state.state.playerName}.`
        : `欢迎来到你的生日城堡，${state.state.playerName}。`,
      mini: isEn
        ? 'WASD to move · Shift to sprint · Space to jump · E to interact · Drag to look around'
        : 'WASD 移动 · Shift 冲刺 · 空格跳跃 · E 交互 · 拖动转视角',
      gold: true,
      duration: 7000,
    });

    setTimeout(() => {
      ui.toast({
        label: '📖',
        text: isEn
          ? 'Eight blessing stars are hidden around the castle. Collect them all.'
          : '城堡各处藏着 8 颗祝福星，把它们全部找出来吧。',
        duration: 5200,
      });
    }, 2200);
  });
}

function restartEverything() {
  ui.closePause();
  ui.hideFinale();
  ui.clearToasts();
  state.clearSave();

  /* --- 状态复位（保留设置） --- */
  const settings = state.state.settings;
  Object.assign(state.state, {
    collectedBlessings: [],
    userWish: '',
    userWishAt: 0,
    wishCount: 0,
    surpriseOpened: false,
    candlesBlown: false,
    celebrationStarted: false,
    terraceVisited: false,
    progress: 0,
    stage: STAGES.INTRO,
    startedAt: Date.now(),
    finishedAt: 0,
    settings,
  });

  /* --- 系统复位 --- */
  blessing.reset();
  wish.reset();
  surprise.reset();
  celebration.reset();
  progress.reset();
  castle.resetState();
  particles.clear();
  sky.clearText();
  audio.setCelebration(false);
  audio.setProgress(0);

  character.setPosition(island.spawnPoint.x, island.spawnPoint.y, island.spawnPoint.z);
  character.faceTo(0, -8);
  character.setEnabled(false);

  ui.setProgress(0);
  ui.setBookBadge(0, blessing.getTotal());
  ui.renderBook();
  ui.hideInteractHint();
  ui.hideHUD();
  ui.showStart({ hasSave: false });
  syncInputEnabled();
}

/* ============================================================
   7. 状态事件
   ============================================================ */
state.on('progress', ({ progress: p }) => {
  ui.setProgress(p);
});

state.on('complete', () => {
  progress.playFinale();
});

state.on('settings', (s) => {
  // 语言切换后刷新动态文案
  ui.setName(state.state.playerName);
});

/* ============================================================
   8. 主循环
   ============================================================ */
let last = performance.now();
let elapsed = 0;
let raf = 0;
let running = true;

const _move = { x: 0, z: 0 };

function loop(now) {
  raf = requestAnimationFrame(loop);

  // 页面不可见时暂停渲染，节省性能
  if (document.hidden) {
    last = now;
    return;
  }

  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;      // 防止切后台回来后的物理穿透
  elapsed += dt;

  sm.renderer.info.reset();

  /* --- 各模块更新 --- */
  sm.update(dt, elapsed);
  celebration.update(dt, elapsed);
  progress.update(dt, elapsed);

  /* --- 角色 --- */
  input.getMoveVector(_move);
  const jump = input.consumeJump();
  character.update(dt, elapsed, {
    move: _move,
    jump,
    sprint: input.isSprinting(),
    cameraYaw: cameraCtl.yawAngle,
  });

  /* --- 脚步声 --- */
  if (character.enabled && character.grounded && character.speed > 0.6) {
    const interval = character.sprinting ? 0.27 : 0.4;
    if (elapsed - lastStepTime > interval) {
      lastStepTime = elapsed;
      audio.playSFX('step', { volume: 0.55 + Math.min(1, character.speed / 7) * 0.6 });
    }
  }
  if (character.jumpStarted) {
    character.jumpStarted = false;
    audio.playSFX('jump');
  }
  if (character.landed) {
    character.landed = false;
    audio.playSFX('land');
  }

  /* --- 相机 --- */
  cameraCtl.update(dt, elapsed);

  /* --- 交互（最终点亮过场中冻结） --- */
  if (state.state.stage === STAGES.PLAY || state.state.stage === STAGES.CELEBRATION) {
    interaction.update(dt, elapsed);
  }
  if (input.consumeInteract()) {
    if (!interaction.tryInteract()) {
      // 没有目标时按 E 给一个轻微反馈
      ui.hideInteractHint();
    }
  }
  const tap = input.consumeTap();
  if (tap) interaction.handleTap(tap.x, tap.y);

  /* --- 大厅遮挡（相机进入室内时隐藏屋顶） --- */
  castle.updateOccluders(sm.camera.position, character.position);

  /* --- 渲染 --- */
  post.render();

  /* --- 性能采样（供调试面板 / 控制台查看） --- */
  const info = sm.renderer.info;
  perf.calls = info.render.calls;
  perf.triangles = info.render.triangles;
  perf.programs = info.programs?.length || 0;
  perf.frameMs = dt * 1000;
  samples.push(dt);
  if (samples.length > 45) samples.shift();
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  perf.fps = avg > 0 ? Math.round(10 / avg) / 10 : 0;
}

/* ============================================================
   9. 启动
   ============================================================ */
function boot() {
  // 先渲染一帧，让开始屏幕背后就是云海与城堡
  cameraCtl.startIntroPath({ character });
  sm.camera.position.set(0, 34, 96);
  sm.camera.lookAt(0, 8, -14);
  sky.setProgress(0);
  clouds.setProgress(0);
  castle.setProgress(0);

  post.render();
  setTimeout(() => post.render(), 60);

  ui.hideLoading();
  ui.showStart({ hasSave: state.hasSave() });
  ui.setBookBadge(0, blessing.getTotal());
  ui.renderBook();

  raf = requestAnimationFrame(loop);
}

/* 视口尺寸同步 */
sm.onResize = (w, h) => {
  post.resize(w, h);
  sm.camera.userData.viewport = { width: w, height: h };
};

window.addEventListener('beforeunload', () => {
  state.save();
  cancelAnimationFrame(raf);
});

/* 便于在控制台调试 */
window.__BIRTHDAY__ = {
  state, sm, sky, clouds, island, castle, character, cameraCtl, mergeStats,
  particles, audio, blessing, wish, surprise, celebration, progress, interaction,
  perf,
  addProgress: (n) => state.addProgress(n, 'debug'),
  complete: () => state.addProgress(100 - state.state.progress, 'debug'),
};

boot();
