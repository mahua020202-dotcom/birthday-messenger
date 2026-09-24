import * as THREE from 'three';
import { clamp, TAU } from './utils/math.js';
import { damp, easeInOutCubic, easeOutCubic } from './utils/easing.js';

/**
 * 相机控制器
 * - follow：第三人称跟随（鼠标/触摸旋转、滚轮/捏合缩放、避墙、避地）
 * - intro ：沿 CatmullRom 曲线从云海飞入城堡
 * - orbit ：庆典时环绕城堡飞行
 */
export class CameraController {
  constructor(camera, character, world, { reduceMotion = false } = {}) {
    this.camera = camera;
    this.character = character;
    this.world = world;
    this.reduceMotion = reduceMotion;

    this.mode = 'intro';

    /* 轨道参数 */
    this.yaw = 0;                // 0 = 相机位于角色南侧，镜头朝向 -Z（城堡方向）
    this.pitch = 0.30;
    // 竖屏（手机）默认拉远一点，横屏更贴近角色
    const portrait = window.innerWidth / window.innerHeight < 1;
    this.distance = portrait ? 7.6 : 6.4;
    this.minDistance = 3.2;
    this.maxDistance = 14;

    /* 平滑 */
    this.smoothTarget = new THREE.Vector3(0, 1.8, 4);
    this.currentDistance = this.distance;
    this._desired = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();

    this._ray = new THREE.Raycaster();

    /* 开场路径 */
    this.flyTime = 0;
    this.flyDuration = 7.2;
    this.flyCurve = null;
    this.flyOnDone = null;
    this.flyLookFrom = new THREE.Vector3(0, 12, -8);
    this.flyLookTo = new THREE.Vector3(0, 3.2, -3);
    this._flyLook = new THREE.Vector3();

    /* 环绕 */
    this.orbitTime = 0;
    this.orbitDuration = 11;
    this.orbitCenter = new THREE.Vector3(0, 10, -12);
    this.orbitRadius = 40;
    this.orbitHeight = 18;
    this.orbitOnDone = null;
    this._orbitStartYaw = 0;

    /* 过场（庆典结束回到角色）*/
    this.blendTime = 0;
    this.blendDuration = 0;
    this.blendFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.blendLock = 0;
  }

  /* ================================================================ */
  /** 开场飞入 */
  startIntroPath({ character }) {
    const gate = new THREE.Vector3(0, 1.2, -1.6);
    const points = [
      new THREE.Vector3(0, 34, 96),     // 云海之上，很远
      new THREE.Vector3(-26, 26, 74),
      new THREE.Vector3(22, 19, 48),
      new THREE.Vector3(-12, 13.5, 26),
      new THREE.Vector3(6, 8.4, 13),
      new THREE.Vector3(0, 3.4, 4.6),
      gate,
    ];
    this.flyCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
    this.flyTime = 0;
    this.mode = 'intro';
    this.camera.position.copy(points[0]);
    this._flyLook.set(0, 8, -14);
    this.camera.lookAt(this._flyLook);
    if (character) this.character.setEnabled(false);
  }

  setIntroDoneCallback(fn) {
    this.flyOnDone = fn;
  }

  /** 庆典环绕 */
  startOrbit(onDone, { duration = 11, radius = 40, height = 18 } = {}) {
    this.mode = 'orbit';
    this.orbitTime = 0;
    this.orbitDuration = duration;
    this.orbitRadius = radius;
    this.orbitHeight = height;
    this.orbitOnDone = onDone;
    this._orbitStartYaw = this.yaw;
    this.blendFrom.pos.copy(this.camera.position);
  }

  /** 从环绕平滑回到跟随 */
  endOrbit() {
    this.mode = 'follow';
  }

  /* ================================================================ */
  /** 输入接口 */
  rotate(dx, dy) {
    if (this.mode !== 'follow') return;
    this.yaw -= dx * 0.0032;
    this.pitch = clamp(this.pitch + dy * 0.0026, -0.22, 1.22);
  }

  zoom(delta) {
    if (this.mode !== 'follow') return;
    this.distance = clamp(this.distance + delta * 0.0045, this.minDistance, this.maxDistance);
  }

  setDistance(d) {
    this.distance = clamp(d, this.minDistance, this.maxDistance);
  }

  /** 环视一下（用于交互时给一点镜头反馈） */
  nudge(yawDelta, pitchDelta = 0) {
    this.yaw += yawDelta;
    this.pitch = clamp(this.pitch + pitchDelta, -0.22, 1.22);
  }

  /* ================================================================ */
  update(dt, elapsed) {
    switch (this.mode) {
      case 'intro': this._updateIntro(dt); break;
      case 'orbit': this._updateOrbit(dt); break;
      default: this._updateFollow(dt); break;
    }
  }

  _updateIntro(dt) {
    this.flyTime += dt;
    const p = clamp(this.flyTime / this.flyDuration, 0, 1);
    const e = easeInOutCubic(p);

    const pos = this.flyCurve.getPointAt(clamp(e, 0, 1));
    // 轻微的镜头浮动，避免过于机械
    pos.y += Math.sin(this.flyTime * 0.9) * 0.22;
    this.camera.position.copy(pos);

    // 视线：从城堡上空逐渐下移到大门
    const lookE = easeOutCubic(clamp((p - 0.15) / 0.85, 0, 1));
    this._flyLook.lerpVectors(this.flyLookFrom, this.flyLookTo, lookE);
    this._flyLook.y += Math.sin(this.flyTime * 0.6) * 0.15;
    this.camera.lookAt(this._flyLook);

    // 到达后交给跟随相机
    if (p >= 1 && this.flyOnDone) {
      const cb = this.flyOnDone;
      this.flyOnDone = null;

      // 关键：必须切回 follow，否则相机会停在门口不动
      this.mode = 'follow';

      // 让跟随相机从大门处平滑后拉到角色身后：
      // 先把距离压到很近，再靠阻尼缓缓拉开，形成一段「退后归位」的运镜
      this.smoothTarget.set(0, 1.75, 2.6);
      this.yaw = 0;
      this.pitch = 0.3;
      this.currentDistance = 1.6;
      this.blendLock = 1.8;      // 这段时间内用更柔的阻尼
      cb();
    }
  }

  _updateOrbit(dt) {
    this.orbitTime += dt;
    const p = clamp(this.orbitTime / this.orbitDuration, 0, 1);

    // 环绕两圈，带缓入缓出
    const eased = easeInOutCubic(p);
    const a = this._orbitStartYaw + eased * TAU * 1.75;

    const breathe = 1 + Math.sin(p * Math.PI * 3) * 0.06;
    const r = this.orbitRadius * breathe;
    const h = this.orbitHeight + Math.sin(eased * Math.PI * 2) * 2.6;

    this._desired.set(
      this.orbitCenter.x + Math.sin(a) * r,
      this.orbitCenter.y + h,
      this.orbitCenter.z + Math.cos(a) * r
    );
    this.camera.position.lerp(this._desired, Math.min(1, dt * 3.2));

    // 视线在城堡与天空之间缓慢游走
    this._lookAt.copy(this.orbitCenter);
    this._lookAt.y += 3.5 + Math.sin(p * Math.PI * 2.4) * 3.0;
    this._lookAt.x += Math.sin(p * Math.PI * 1.4) * 6;
    this.camera.lookAt(this._lookAt);

    if (p >= 1) {
      this.mode = 'follow';
      this.currentDistance = this.maxDistance;   // 从远处平滑收回来
      if (this.orbitOnDone) {
        const cb = this.orbitOnDone;
        this.orbitOnDone = null;
        cb();
      }
    }
  }

  _updateFollow(dt) {
    const target = this.character.getFollowTarget(this._tmp);
    const lambda = this.reduceMotion ? 26 : 9;
    this.smoothTarget.x = damp(this.smoothTarget.x, target.x, lambda, dt);
    this.smoothTarget.y = damp(this.smoothTarget.y, target.y, lambda * 0.75, dt);
    this.smoothTarget.z = damp(this.smoothTarget.z, target.z, lambda, dt);

    // 由 yaw / pitch 得到相机方向
    const cosP = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cosP, Math.sin(this.pitch), Math.cos(this.yaw) * cosP).normalize();

    let dist = this.distance;

    /* --- 避墙：从角色射向相机 --- */
    const occluders = this.world.occluders;
    if (occluders && occluders.length) {
      this._ray.set(this.smoothTarget, this._dir);
      this._ray.near = 0;
      this._ray.far = dist + 0.4;
      const hits = this._ray.intersectObjects(occluders, false);
      if (hits.length && hits[0].distance < dist) {
        dist = Math.max(1.1, hits[0].distance - 0.45);
      }
    }

    // 距离突变时立刻收缩、缓慢伸出（避免闪烁）
    if (dist < this.currentDistance) this.currentDistance = dist;
    else this.currentDistance = damp(this.currentDistance, dist, 3.2, dt);

    this._desired.copy(this.smoothTarget).addScaledVector(this._dir, this.currentDistance);

    /* --- 避地：不让相机钻到地面/岛屿下面 --- */
    const camGround = this._groundHeightAt(this._desired.x, this._desired.z, this._desired.y);
    if (camGround > -500 && this._desired.y < camGround + 0.9) {
      this._desired.y = camGround + 0.9;
    }

    let posLambda = 12;
    if (this.blendLock > 0) {
      this.blendLock -= dt;
      posLambda = 3.4;           // 开场归位：更柔、更有电影感
    }

    this.camera.position.x = damp(this.camera.position.x, this._desired.x, posLambda, dt);
    this.camera.position.y = damp(this.camera.position.y, this._desired.y, this.blendLock > 0 ? 3.0 : (this.reduceMotion ? 20 : 6), dt);
    this.camera.position.z = damp(this.camera.position.z, this._desired.z, posLambda, dt);

    this._lookAt.copy(this.smoothTarget);
    this._lookAt.y += 0.35;
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._lookAt);
  }

  _groundHeightAt(x, z, fromY) {
    this._ray.set(new THREE.Vector3(x, fromY + 3, z), new THREE.Vector3(0, -1, 0));
    this._ray.near = 0;
    this._ray.far = 60;
    const hits = this._ray.intersectObjects(this.world.ground, true);
    for (const h of hits) {
      if (h.object.userData.isBlobShadow) continue;
      return h.point.y;
    }
    return -999;
  }

  /** 当前相机的水平朝向角（供角色移动参考） */
  get yawAngle() {
    return this.mode === 'follow' ? this.yaw : Math.atan2(
      this.camera.position.x - this.smoothTarget.x,
      this.camera.position.z - this.smoothTarget.z
    );
  }

  /** 相机的世界方向（用于射线拾取） */
  getWorldDirection(out) {
    return this.camera.getWorldDirection(out);
  }

  setReduceMotion(v) {
    this.reduceMotion = v;
  }
}
