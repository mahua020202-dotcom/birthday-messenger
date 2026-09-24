import * as THREE from 'three';
import { createToonMaterial, addOutline, createBlobShadow } from './ToonMaterial.js';
import { ISLAND_RADIUS } from './Island.js';
import { dampAngle } from './utils/easing.js';
import { TAU, clamp } from './utils/math.js';

/** 角色物理参数 */
export const CHAR = {
  SPEED: 4.0,
  SPRINT_SPEED: 7.0,
  JUMP_VELOCITY: 5.0,
  GRAVITY: 12.0,
  RADIUS: 0.34,         // 碰撞半径
  STEP_HEIGHT: 0.52,    // 可自动跨上的高度（决定能否走台阶）
  MODEL_SCALE: 1.72,    // 让约 1m 的模型变成约 1.7m 的"人"
  TURN_LAMBDA: 11,
};

/**
 * 寿星角色：低多边形小人 + 皇冠 + 披风
 * 同时内置第三人称角色控制器（移动 / 跳跃 / 冲刺 / 台阶 / 碰撞 / 边缘保护）
 */
export class Character {
  constructor(scene, world, { palette } = {}) {
    this.scene = scene;
    this.world = world;
    this.palette = palette;

    this.group = new THREE.Group();
    this.group.name = 'BirthdayKid';
    scene.add(this.group);

    /* ---------------- 物理状态 ---------------- */
    this.position = this.group.position;      // 直接复用（脚底位置）
    this.velocityY = 0;
    this.grounded = true;
    this.speed = 0;
    this.facing = Math.PI;                    // 面朝 -Z（城堡方向）
    this.group.rotation.y = this.facing;
    this.walkPhase = 0;
    this.airTime = 0;
    this.sprinting = false;
    this.enabled = false;

    this._build();
    this._raf = null;
  }

  /* ================================================================ */
  _build() {
    const P = this.palette;
    const skin = createToonMaterial({
      color: '#F5D0A9', toonSteps: 2.6, rimColor: '#FFF8F0', rimIntensity: 0.18,
    });
    const top = createToonMaterial({
      color: P.accent, toonSteps: 2.6, rimColor: '#FFF8F0', rimIntensity: 0.24, emissive: P.accent, emissiveIntensity: 0.05,
    });
    const bottom = createToonMaterial({ color: '#FF9EC4', toonSteps: 2.4, rimIntensity: 0.16 });
    const hair = createToonMaterial({
      color: '#6E4553', toonSteps: 2.4, rimColor: '#FFD1DC', rimIntensity: 0.34, softness: 0.7,
    });
    const gold = createToonMaterial({
      color: P.gold, toonSteps: 1.8, emissive: P.gold, emissiveIntensity: 0.45, rimIntensity: 0.4,
    });

    const ow = { width: 0.0022, color: '#5A2E3E' };
    const G = this.group;

    /* --- 身体（上半身） --- */
    this.body = new THREE.Group();
    this.body.position.y = 0.62;
    G.add(this.body);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.35, 14), top);
    torso.position.y = 0.05;
    this.body.add(torso);
    addOutline(torso, ow);
    this.torso = torso;

    // 衣领
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.035, 8, 16), gold);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.21;
    this.body.add(collar);

    /* --- 头 --- */
    this.head = new THREE.Group();
    this.head.position.y = 0.34;
    this.body.add(this.head);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin);
    this.head.add(headMesh);
    addOutline(headMesh, ow);
    this.headMesh = headMesh;

    // 头发（半圆帽）
    const hairMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.208, 20, 12, 0, TAU, 0, Math.PI * 0.62),
      hair
    );
    hairMesh.rotation.x = -0.28;
    hairMesh.position.y = 0.045;
    this.head.add(hairMesh);
    addOutline(hairMesh, ow);

    // 眼睛
    const eyeMat = createToonMaterial({ color: '#2B1D24', toonSteps: 1.2, rimIntensity: 0 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), eyeMat);
      eye.position.set(sx * 0.075, 0.015, 0.185);
      eye.scale.set(1, 1.25, 0.7);
      this.head.add(eye);
    }
    // 腮红
    const blushMat = createToonMaterial({
      color: '#FF9EC4', toonSteps: 1.2, opacity: 0.62, transparent: true, rimIntensity: 0,
    });
    for (const sx of [-1, 1]) {
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.042, 12), blushMat);
      blush.position.set(sx * 0.135, -0.04, 0.16);
      blush.rotation.y = sx * 0.5;
      this.head.add(blush);
    }

    /* --- 皇冠 --- */
    this.crown = new THREE.Group();
    this.crown.position.y = 0.19;
    this.head.add(this.crown);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.075, 14, 1, true), gold);
    this.crown.add(band);
    const bandInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.128, 0.138, 0.07, 14, 1, true),
      createToonMaterial({ color: '#FFE4A0', toonSteps: 1.4, emissive: '#FFD700', emissiveIntensity: 0.6, side: THREE.BackSide })
    );
    this.crown.add(bandInner);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 6), gold);
      spike.position.set(Math.cos(a) * 0.13, 0.075, Math.sin(a) * 0.13);
      this.crown.add(spike);
    }
    // 皇冠宝石
    const gemMat = createToonMaterial({
      color: '#FF69B4', emissive: '#FF69B4', emissiveIntensity: 0.8, rimIntensity: 0.4,
    });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), gemMat);
    gem.position.set(0, 0.05, 0.14);
    this.crown.add(gem);
    this.crownGem = gemMat;

    /* --- 手臂 --- */
    this.arms = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.17, 0.16, 0);
      this.body.add(pivot);

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.26, 10), top);
      arm.position.y = -0.13;
      pivot.add(arm);
      addOutline(arm, ow);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skin);
      hand.position.y = -0.27;
      pivot.add(hand);

      this.arms.push({ pivot, sx });
    }

    /* --- 腿 --- */
    this.legs = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.075, 0.42, 0);
      G.add(pivot);

      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.3, 10), bottom);
      leg.position.y = -0.15;
      pivot.add(leg);
      addOutline(leg, ow);

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), createToonMaterial({
        color: '#FFF8F0', toonSteps: 2.0, rimIntensity: 0.2,
      }));
      foot.position.set(0, -0.31, 0.02);
      foot.scale.set(1, 0.7, 1.25);
      pivot.add(foot);

      this.legs.push({ pivot, sx });
    }

    /* --- 披风 --- */
    const capeGeo = new THREE.PlaneGeometry(0.42, 0.5, 8, 8);
    capeGeo.translate(0, -0.25, 0);
    const capeMat = createToonMaterial({
      color: P.accent,
      toonSteps: 2.0,
      side: THREE.DoubleSide,
      opacity: 0.78,
      transparent: true,
      emissive: P.pink1 || '#FFD1DC',
      emissiveIntensity: 0.1,
      rimColor: '#FFF8F0',
      rimIntensity: 0.3,
      depthWrite: false,
    });
    this.cape = new THREE.Mesh(capeGeo, capeMat);
    this.cape.position.set(0, 0.8, -0.14);
    this.cape.rotation.x = -0.18;
    G.add(this.cape);
    this.capeMat = capeMat;
    this._capeBase = capeGeo.attributes.position.array.slice();

    /* --- 接触阴影 --- */
    this.shadow = createBlobShadow(0.42, 0.42);
    this.shadow.position.y = 0.02;
    G.add(this.shadow);

    /* --- 脚边的柔光（象征寿星的光环） --- */
    this.auraMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(P.gold),
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const aura = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.55, 28), this.auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.03;
    aura.raycast = () => {};
    G.add(aura);
    this.aura = aura;

    // 整体缩放
    G.scale.setScalar(CHAR.MODEL_SCALE);

    // 用于拾取的整体包围盒高度
    this.height = 1.0 * CHAR.MODEL_SCALE;
  }

  /* ================================================================
     控制器
     ================================================================ */

  /** 放置到指定位置 */
  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.velocityY = 0;
    this.grounded = true;
  }

  respawn() {
    const sp = this.world.spawnPoint || new THREE.Vector3(0, 0, 3.2);
    this.setPosition(sp.x, sp.y, sp.z);
    this.facing = Math.PI;
  }

  /** 地面高度查询（向下射线） */
  _groundHeightAt(x, z, fromY) {
    const ray = this._ray || (this._ray = new THREE.Raycaster());
    ray.set(new THREE.Vector3(x, fromY + 1.6, z), new THREE.Vector3(0, -1, 0));
    ray.far = fromY + 60;
    ray.near = 0;
    const hits = ray.intersectObjects(this.world.ground, true);
    for (const h of hits) {
      // 忽略角色自身的附件
      if (h.object.userData.isBlobShadow) continue;
      return h.point.y;
    }
    return -999;
  }

  /**
   * @param {number} dt
   * @param {number} elapsed
   * @param {{move: THREE.Vector3, jump: boolean, sprint: boolean, cameraYaw: number}} input
   */
  update(dt, elapsed, input) {
    const { move = { x: 0, z: 0 }, jump = false, sprint = false, cameraYaw = 0 } = input || {};

    /* ---------- 输入 → 世界方向（相机相对） ---------- */
    let dirX = 0;
    let dirZ = 0;
    const moveMag = Math.hypot(move.x, move.z);
    if (moveMag > 0.05 && this.enabled) {
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      // 相机（yaw=0 时位于角色 +Z 侧）→ 前方 f = (-sin, -cos)，右方 r = (cos, -sin)
      // move.x 为「右方」分量，move.z 为「前后」分量（-1 = 向前）
      dirX = move.x * cos + move.z * sin;
      dirZ = -move.x * sin + move.z * cos;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;
    }

    this.sprinting = sprint && moveMag > 0.05;
    const targetSpeed = (this.sprinting ? CHAR.SPRINT_SPEED : CHAR.SPEED) * Math.min(1, moveMag);
    const wantedVX = dirX * targetSpeed;
    const wantedVZ = dirZ * targetSpeed;

    // 速度平滑（加速/减速有重量感）
    const accel = this.grounded ? 14 : 6;
    this.vx = (this.vx || 0) + (wantedVX - (this.vx || 0)) * Math.min(1, dt * accel);
    this.vz = (this.vz || 0) + (wantedVZ - (this.vz || 0)) * Math.min(1, dt * accel);

    /* ---------- 水平移动 + 台阶判定 ---------- */
    const nextX = this.position.x + this.vx * dt;
    const nextZ = this.position.z + this.vz * dt;

    const curGround = this._groundHeightAt(this.position.x, this.position.z, this.position.y);
    const baseY = curGround > -500 ? curGround : this.position.y;

    const nextGround = this._groundHeightAt(nextX, nextZ, Math.max(baseY, this.position.y));

    let allowX = nextX;
    let allowZ = nextZ;
    if (nextGround > -500) {
      const climb = nextGround - baseY;
      if (climb > CHAR.STEP_HEIGHT && this.position.y <= nextGround + 0.02) {
        // 台阶太高 → 视为墙，尝试沿单轴滑动
        const gx = this._groundHeightAt(nextX, this.position.z, baseY);
        const gz = this._groundHeightAt(this.position.x, nextZ, baseY);
        const okX = gx > -500 && gx - baseY <= CHAR.STEP_HEIGHT;
        const okZ = gz > -500 && gz - baseY <= CHAR.STEP_HEIGHT;
        if (okX) { allowZ = this.position.z; }
        else if (okZ) { allowX = this.position.x; }
        else { allowX = this.position.x; allowZ = this.position.z; }
      }
    }

    this.position.x = allowX;
    this.position.z = allowZ;

    /* ---------- 碰撞体推挤 ---------- */
    this._resolveColliders();

    /* ---------- 岛屿边缘保护 ---------- */
    const rad = Math.hypot(this.position.x, this.position.z);
    const limit = ISLAND_RADIUS - 2.6;
    if (rad > limit) {
      const k = limit / rad;
      this.position.x *= k;
      this.position.z *= k;
    }

    /* ---------- 垂直运动 ---------- */
    if (this.grounded && jump && this.enabled) {
      this.velocityY = CHAR.JUMP_VELOCITY;
      this.grounded = false;
      this.jumpStarted = true;
    }

    this.velocityY -= CHAR.GRAVITY * dt;
    this.position.y += this.velocityY * dt;

    const groundY = this._groundHeightAt(this.position.x, this.position.z, this.position.y + 2.2);
    this._cachedGroundY = groundY;
    if (groundY > -500) {
      if (this.position.y <= groundY) {
        this.position.y = groundY;
        if (this.velocityY < 0) this.velocityY = 0;
        if (!this.grounded) this.landed = true;
        this.grounded = true;
        this.airTime = 0;
      } else if (this.position.y - groundY > 0.06) {
        this.grounded = false;
      }
    } else {
      this.grounded = false;
    }

    if (!this.grounded) this.airTime += dt;

    // 掉出世界 → 送回出生点
    if (this.position.y < -34) this.respawn();

    /* ---------- 朝向 ---------- */
    const horizSpeed = Math.hypot(this.vx, this.vz);
    this.speed = horizSpeed;
    if (horizSpeed > 0.35) {
      const targetFacing = Math.atan2(this.vx, this.vz);
      this.facing = dampAngle(this.facing, targetFacing, CHAR.TURN_LAMBDA, dt);
    }
    this.group.rotation.y = this.facing;

    /* ---------- 动画 ---------- */
    this._animate(dt, elapsed, horizSpeed);
  }

  /** 与城堡 / 家具的简单碰撞（胶囊体 vs AABB / 圆柱） */
  _resolveColliders() {
    const colliders = this.world.colliders;
    if (!colliders || !colliders.length) return;
    const r = CHAR.RADIUS;
    const py = this.position.y;

    for (const c of colliders) {
      // 高度范围之外不参与碰撞（例如站在屋顶上）
      if (c.minY !== undefined && py + 0.1 < c.minY) continue;
      if (c.maxY !== undefined && py > c.maxY) continue;

      if (c.type === 'cyl') {
        const dx = this.position.x - c.x;
        const dz = this.position.z - c.z;
        const d = Math.hypot(dx, dz);
        const minD = c.r + r;
        if (d < minD && d > 0.0001) {
          const push = (minD - d) / d;
          this.position.x += dx * push;
          this.position.z += dz * push;
        }
      } else {
        // AABB：取最近点
        const cx = clamp(this.position.x, c.x - c.hx, c.x + c.hx);
        const cz = clamp(this.position.z, c.z - c.hz, c.z + c.hz);
        let dx = this.position.x - cx;
        let dz = this.position.z - cz;
        let d = Math.hypot(dx, dz);
        if (d < r) {
          if (d < 0.0001) {
            // 已在盒内：沿最小穿透轴推出
            const penX = c.hx + r - Math.abs(this.position.x - c.x);
            const penZ = c.hz + r - Math.abs(this.position.z - c.z);
            if (penX < penZ) {
              this.position.x += Math.sign(this.position.x - c.x || 1) * penX;
            } else {
              this.position.z += Math.sign(this.position.z - c.z || 1) * penZ;
            }
          } else {
            const push = (r - d) / d;
            this.position.x += dx * push;
            this.position.z += dz * push;
          }
        }
      }
    }
  }

  /** 行走 / 待机 / 跳跃动画 */
  _animate(dt, elapsed, speed) {
    const moving = speed > 0.4;
    const cycle = this.sprinting ? 13 : 9;
    this.walkPhase += dt * cycle * clamp(speed / CHAR.SPEED, 0, 1.6);

    const swing = moving ? Math.sin(this.walkPhase) * (this.sprinting ? 0.85 : 0.6) : 0;
    const bob = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.035 * (this.sprinting ? 1.5 : 1) : 0;
    const breathe = Math.sin(elapsed * 1.7) * 0.012;

    // 腿
    for (const leg of this.legs) {
      leg.pivot.rotation.x = swing * leg.sx * -1;
    }
    // 手臂
    for (const arm of this.arms) {
      const target = swing * arm.sx * 0.85;
      arm.pivot.rotation.x = target;
      arm.pivot.rotation.z = arm.sx * (moving ? 0.16 : 0.1) + Math.sin(elapsed * 1.4 + arm.sx) * 0.02;
    }

    // 身体起伏 + 待机呼吸
    const jumpOffset = this.grounded ? 0 : clamp(this.velocityY * 0.03, -0.06, 0.08);
    this.body.position.y = 0.62 + bob + breathe + jumpOffset * 0.5;
    this.body.rotation.z = moving ? Math.sin(this.walkPhase) * 0.035 : 0;
    this.body.rotation.x = this.grounded ? 0 : clamp(-this.velocityY * 0.02, -0.12, 0.12);

    // 头部轻微摆动
    this.head.rotation.y = moving ? Math.sin(this.walkPhase * 0.5) * 0.08 : Math.sin(elapsed * 0.7) * 0.1;
    this.head.rotation.z = moving ? Math.sin(this.walkPhase) * 0.03 : 0;

    // 皇冠微光
    this.crownGem.uniforms.uEmissiveIntensity.value = 0.6 + Math.sin(elapsed * 2.6) * 0.35;
    this.crown.rotation.y += dt * 0.25;

    // 披风飘动
    const pos = this.cape.geometry.attributes.position;
    const base = this._capeBase;
    const flutter = moving ? clamp(speed / CHAR.SPRINT_SPEED, 0, 1) : 0;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const falloff = clamp(-by / 0.5, 0, 1);
      const wave =
        Math.sin(elapsed * 5.5 + by * 6 + bx * 4) * 0.05 * flutter +
        Math.sin(elapsed * 2.2 + bx * 3) * 0.02;
      pos.setZ(i, -falloff * (0.12 + flutter * 0.42) + wave);
      pos.setX(i, bx * (1 + falloff * flutter * 0.3));
    }
    pos.needsUpdate = true;

    // 阴影与光环贴地（复用本帧已算出的地面高度，避免多余射线）
    const gy = this._cachedGroundY;
    if (gy > -500) {
      const localY = (gy - this.position.y) / CHAR.MODEL_SCALE + 0.02;
      this.shadow.position.y = clamp(localY, -3, 0.02);
      const drop = clamp(this.position.y - gy, 0, 3);
      this.shadow.material.opacity = 0.42 * (1 - drop / 3);
      this.shadow.scale.setScalar(1 + drop * 0.16);
      this.aura.position.y = clamp(localY, -3, 0.03);
      this.aura.rotation.z += dt * 0.6;
    }

    // 脚边光环呼吸
    this.auraMat.opacity = 0.1 + Math.sin(elapsed * 1.8) * 0.05;
  }

  /* ================================================================ */
  /** 相机跟随的目标点（角色胸口高度） */
  getFollowTarget(out = new THREE.Vector3()) {
    return out.set(
      this.position.x,
      this.position.y + 1.15 * CHAR.MODEL_SCALE,
      this.position.z
    );
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.vx = 0;
      this.vz = 0;
    }
  }

  /** 让角色逐渐转向某个点（用于开场动画） */
  faceTo(x, z) {
    this.facing = Math.atan2(x - this.position.x, z - this.position.z);
    this.group.rotation.y = this.facing;
  }
}
