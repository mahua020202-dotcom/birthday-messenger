import * as THREE from 'three';
import { createToonMaterial, addOutline, createBlobShadow } from './ToonMaterial.js';
import { createRandom, TAU } from './utils/math.js';

export const ISLAND_RADIUS = 30;

/**
 * 漂浮岛屿：粉色草地 + 白色大理石小径 + 云朵护栏 + 倒锥形底座
 */
export class Island {
  constructor(scene, world, { palette } = {}) {
    this.scene = scene;
    this.world = world;
    this.palette = palette;
    this.random = createRandom(5150);

    this.group = new THREE.Group();
    this.group.name = 'Island';
    scene.add(this.group);

    this.glowMaterials = [];

    this._buildBody();
    this._buildFloor();
    this._buildRailings();
    this._buildScatter();
    this._buildSatelliteIslands();

    /** 主角出生点（城堡大门前） */
    this.spawnPoint = new THREE.Vector3(0, 0, 3.2);
  }

  /* ------------------------------------------------------------------ */
  _buildBody() {
    const p = this.palette;

    // 顶面（草地）—— 也是地面射线的检测目标
    const topGeo = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS - 0.9, 1.8, 72, 1);
    const topMat = createToonMaterial({
      color: p.islandTop,
      toonSteps: 3.0,
      rimColor: '#FFF8F0',
      rimIntensity: 0.12,
      softness: 0.55,
    });
    this.top = new THREE.Mesh(topGeo, topMat);
    this.top.position.y = -0.9;
    this.top.name = 'island-ground';
    this.group.add(this.top);
    addOutline(this.top, { width: 0.0011, color: '#7A3B52' });
    this.world.ground.push(this.top);
    this.groundMaterial = topMat;

    // 草地与岩体的分界线（奶白色石沿）
    const rimGeo = new THREE.TorusGeometry(ISLAND_RADIUS - 0.15, 0.55, 12, 96);
    const rimMat = createToonMaterial({ color: p.castleTrim, rimIntensity: 0.18 });
    this.rim = new THREE.Mesh(rimGeo, rimMat);
    this.rim.rotation.x = Math.PI / 2;
    this.rim.position.y = 0.1;
    this.group.add(this.rim);

    // 倒锥形岩体
    const rockMat = createToonMaterial({
      color: '#6E5560',
      toonSteps: 2.6,
      rimIntensity: 0.05,
      softness: 0.45,
    });
    const rockGeo = new THREE.CylinderGeometry(
      ISLAND_RADIUS - 0.8, 2.6, 24, 40, 3
    );
    // 让岩壁有手绘般的凹凸
    const rockPos = rockGeo.attributes.position;
    const r = this.random;
    for (let i = 0; i < rockPos.count; i++) {
      const y = rockPos.getY(i);
      const k = (y + 12) / 24;               // 0 顶 → 1 底
      const amp = 1.1 * (1 - Math.abs(k - 0.35) * 1.4);
      const nx = rockPos.getX(i);
      const nz = rockPos.getZ(i);
      const len = Math.hypot(nx, nz) || 1;
      const off = (r.next() - 0.5) * amp;
      rockPos.setX(i, nx + (nx / len) * off);
      rockPos.setZ(i, nz + (nz / len) * off);
    }
    rockGeo.computeVertexNormals();
    this.rock = new THREE.Mesh(rockGeo, rockMat);
    this.rock.position.y = -13.6;
    this.group.add(this.rock);
    addOutline(this.rock, { width: 0.0011, color: '#5A3444' });

    // 底部尖端
    const tipGeo = new THREE.ConeGeometry(2.6, 10, 24);
    const tip = new THREE.Mesh(tipGeo, rockMat);
    tip.position.y = -30.6;
    tip.rotation.x = Math.PI;
    this.group.add(tip);

    // 局部接触阴影，让岛体与云海分离
    const shadow = createBlobShadow(ISLAND_RADIUS * 1.15, 0.3);
    shadow.position.y = -2.2;
    this.group.add(shadow);
  }

  /* ------------------------------------------------------------------ */
  _buildFloor() {
    const p = this.palette;
    const marble = createToonMaterial({
      color: p.castleTrim,
      toonSteps: 2.0,
      rimIntensity: 0.1,
      softness: 0.5,
    });
    const marbleEdge = createToonMaterial({
      color: p.gold,
      toonSteps: 2.5,
      emissive: p.gold,
      emissiveIntensity: 0.08,
    });

    // 中央广场
    const plazaGeo = new THREE.CircleGeometry(10.6, 56);
    const plaza = new THREE.Mesh(plazaGeo, marble);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.03;
    this.group.add(plaza);
    this.world.ground.push(plaza);

    const plazaRing = new THREE.Mesh(
      new THREE.RingGeometry(10.5, 11.1, 64),
      marbleEdge
    );
    plazaRing.rotation.x = -Math.PI / 2;
    plazaRing.position.y = 0.05;
    this.group.add(plazaRing);

    // 环形小径
    const ringPath = new THREE.Mesh(
      new THREE.RingGeometry(17.4, 20.4, 72),
      marble
    );
    ringPath.rotation.x = -Math.PI / 2;
    ringPath.position.y = 0.03;
    this.group.add(ringPath);
    this.world.ground.push(ringPath);

    const ringPathEdge = new THREE.Mesh(
      new THREE.RingGeometry(17.3, 17.6, 72),
      marbleEdge
    );
    ringPathEdge.rotation.x = -Math.PI / 2;
    ringPathEdge.position.y = 0.05;
    this.group.add(ringPathEdge);

    // 四条放射状小路
    const armGeo = new THREE.PlaneGeometry(3.2, 24);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(armGeo, marble);
      const a = (i / 4) * TAU + Math.PI / 4;
      arm.rotation.x = -Math.PI / 2;
      arm.rotation.z = -a;
      arm.position.set(Math.cos(a) * 15.5, 0.028, Math.sin(a) * 15.5);
      this.group.add(arm);
      this.world.ground.push(arm);
    }

    // 广场中央的粉色花纹
    const motif = new THREE.Mesh(
      new THREE.RingGeometry(3.6, 4.2, 8, 1),
      createToonMaterial({ color: p.islandGrass, emissive: p.accent, emissiveIntensity: 0.05 })
    );
    motif.rotation.x = -Math.PI / 2;
    motif.position.y = 0.06;
    this.group.add(motif);
  }

  /* ------------------------------------------------------------------ */
  /** 岛缘的云朵护栏（防止角色掉落，同时是重要的视觉符号） */
  _buildRailings() {
    const count = 52;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = createToonMaterial({
      color: '#FFF8F0',
      toonSteps: 2.4,
      rimIntensity: 0.22,
      rimColor: '#FFE4A0',
      softness: 0.7,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count * 2);
    const dummy = new THREE.Object3D();
    const r = this.random;

    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const rad = ISLAND_RADIUS - 1.2 + r.range(-0.5, 0.5);

      // 主云球
      dummy.position.set(Math.cos(a) * rad, r.range(0.9, 1.3), Math.sin(a) * rad);
      dummy.scale.set(r.range(1.8, 2.6), r.range(1.05, 1.5), r.range(1.8, 2.6));
      dummy.rotation.set(r.range(0, 1), r.range(0, TAU), r.range(0, 1));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // 副云球
      dummy.position.set(
        Math.cos(a + 0.06) * (rad - 0.5),
        r.range(0.4, 0.8),
        Math.sin(a + 0.06) * (rad - 0.5)
      );
      dummy.scale.set(r.range(1.2, 1.9), r.range(0.7, 1.0), r.range(1.2, 1.9));
      dummy.rotation.set(r.range(0, 1), r.range(0, TAU), r.range(0, 1));
      dummy.updateMatrix();
      mesh.setMatrixAt(count + i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.railings = mesh;

    // 护栏的接触阴影
    const railShadow = new THREE.Mesh(
      new THREE.RingGeometry(ISLAND_RADIUS - 2.6, ISLAND_RADIUS - 0.4, 72),
      new THREE.MeshBasicMaterial({
        color: '#7A3B52',
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      })
    );
    railShadow.rotation.x = -Math.PI / 2;
    railShadow.position.y = 0.02;
    this.group.add(railShadow);
  }

  /* ------------------------------------------------------------------ */
  /** 灌木、花丛、草丛（全部用 InstancedMesh） */
  _buildScatter() {
    const p = this.palette;
    const r = this.random;

    const blocked = (x, z) => {
      // 城堡区域
      if (Math.abs(x) < 11.5 && z < 6 && z > -24) return true;
      // 广场与小径
      const rad = Math.hypot(x, z);
      if (rad < 11.6) return true;
      if (rad > 16.9 && rad < 20.9) return true;
      const a = Math.atan2(z, x);
      const nearArm = Math.abs(((a - Math.PI / 4) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2) - 0);
      if (rad > 10 && rad < 28 && nearArm < 0.075) return true;
      // 许愿池 / 礼物房 / 蛋糕
      if (Math.hypot(x - 13, z + 2) < 6) return true;
      if (Math.abs(x - 14) < 6.5 && Math.abs(z + 14) < 6.5) return true;
      if (Math.hypot(x, z - 12) < 5.5) return true;
      return false;
    };

    /* --- 灌木 --- */
    const bushCount = 88;
    const bushGeo = new THREE.IcosahedronGeometry(0.85, 1);
    const bushMat = createToonMaterial({
      color: p.islandGrass,
      toonSteps: 2.4,
      rimIntensity: 0.14,
      rimPower: 2.2,
    });
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushCount);
    const dummy = new THREE.Object3D();
    let placed = 0;
    let guard = 0;
    while (placed < bushCount && guard < bushCount * 40) {
      guard++;
      const a = r.range(0, TAU);
      const rad = r.range(12, ISLAND_RADIUS - 3.5);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (blocked(x, z)) continue;
      const s = r.range(0.55, 1.25);
      dummy.position.set(x, s * 0.6, z);
      dummy.scale.set(s * r.range(0.85, 1.2), s * r.range(0.8, 1.15), s * r.range(0.85, 1.2));
      dummy.rotation.set(r.range(-0.15, 0.15), r.range(0, TAU), r.range(-0.15, 0.15));
      dummy.updateMatrix();
      bushes.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    bushes.count = placed;
    bushes.instanceMatrix.needsUpdate = true;
    bushes.frustumCulled = false;
    this.group.add(bushes);

    /* --- 小花 --- */
    const flowerCount = 140;
    const flowerGeo = new THREE.IcosahedronGeometry(0.17, 0);
    const flowerMat = createToonMaterial({
      color: '#FFFFFF',
      toonSteps: 1.6,
      emissive: '#FFF0C9',
      emissiveIntensity: 0.12,
      rimIntensity: 0.2,
    });
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
    const flowerColors = ['#FFFFFF', '#FFE4A0', '#FFD1DC', '#FF9EC4'];
    const c = new THREE.Color();
    placed = 0;
    guard = 0;
    while (placed < flowerCount && guard < flowerCount * 40) {
      guard++;
      const a = r.range(0, TAU);
      const rad = r.range(11.8, ISLAND_RADIUS - 2.6);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (blocked(x, z)) continue;
      const s = r.range(0.7, 1.5);
      dummy.position.set(x, 0.16 * s, z);
      dummy.scale.setScalar(s);
      dummy.rotation.set(0, r.range(0, TAU), 0);
      dummy.updateMatrix();
      flowers.setMatrixAt(placed, dummy.matrix);
      c.set(r.pick(flowerColors));
      flowers.setColorAt(placed, c);
      placed++;
    }
    flowers.count = placed;
    flowers.instanceMatrix.needsUpdate = true;
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
    flowers.frustumCulled = false;
    this.group.add(flowers);

    /* --- 草丛（细长的薄片，增加手绘质感） --- */
    const bladeCount = 220;
    const bladeGeo = new THREE.PlaneGeometry(0.18, 0.7);
    bladeGeo.translate(0, 0.35, 0);
    const bladeMat = createToonMaterial({
      color: p.islandTop,
      toonSteps: 2.0,
      side: THREE.DoubleSide,
      rimIntensity: 0.06,
    });
    const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, bladeCount);
    placed = 0;
    guard = 0;
    while (placed < bladeCount && guard < bladeCount * 40) {
      guard++;
      const a = r.range(0, TAU);
      const rad = r.range(12, ISLAND_RADIUS - 2.5);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (blocked(x, z)) continue;
      dummy.position.set(x, 0.02, z);
      dummy.scale.set(1, r.range(0.7, 1.5), 1);
      dummy.rotation.set(0, r.range(0, TAU), r.range(-0.18, 0.18));
      dummy.updateMatrix();
      blades.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    blades.count = placed;
    blades.instanceMatrix.needsUpdate = true;
    blades.frustumCulled = false;
    this.group.add(blades);
  }

  /* ------------------------------------------------------------------ */
  /** 远处漂浮的小岛点缀，强化「云海」的空间感 */
  _buildSatelliteIslands() {
    const r = this.random;
    const p = this.palette;

    const grassMat = createToonMaterial({ color: p.islandTop, toonSteps: 2.4 });
    const rockMat = createToonMaterial({ color: '#93707F', toonSteps: 2.2, softness: 0.4 });
    const leafMat = createToonMaterial({
      color: p.accent,
      toonSteps: 2.2,
      rimColor: '#FFF8F0',
      rimIntensity: 0.2,
    });
    const trunkMat = createToonMaterial({ color: '#B87A5A', toonSteps: 2.2 });

    this.satellites = [];
    const spots = [
      { a: 0.6, rad: 78, y: 4, s: 4.4, tree: true },
      { a: 2.6, rad: 92, y: -3, s: 5.6, tree: false },
      { a: 4.3, rad: 70, y: 9, s: 3.4, tree: true },
      { a: 5.6, rad: 104, y: 1, s: 6.4, tree: false },
    ];

    for (const spot of spots) {
      const g = new THREE.Group();
      g.userData.noMerge = true;     // 卫星岛会漂浮，不能烘焙进静态网格
      g.position.set(Math.cos(spot.a) * spot.rad, spot.y, Math.sin(spot.a) * spot.rad);

      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(spot.s, spot.s * 0.94, spot.s * 0.34, 18),
        grassMat
      );
      top.position.y = -spot.s * 0.17;
      g.add(top);

      const under = new THREE.Mesh(
        new THREE.ConeGeometry(spot.s * 0.94, spot.s * 1.5, 16),
        rockMat
      );
      under.position.y = -spot.s * 1.05;
      under.rotation.x = Math.PI;
      g.add(under);

      if (spot.tree) {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.24, spot.s * 0.9, 8),
          trunkMat
        );
        trunk.position.y = spot.s * 0.45;
        g.add(trunk);

        for (let i = 0; i < 3; i++) {
          const leaf = new THREE.Mesh(
            new THREE.IcosahedronGeometry(spot.s * (0.44 - i * 0.07), 1),
            leafMat
          );
          leaf.position.y = spot.s * (0.95 + i * 0.3);
          g.add(leaf);
        }
      }

      const sh = createBlobShadow(spot.s * 1.2, 0.22);
      sh.position.y = -spot.s * 2.0;
      g.add(sh);

      this.group.add(g);
      this.satellites.push({
        group: g,
        baseY: spot.y,
        phase: r.range(0, 10),
        speed: r.range(0.06, 0.14),
      });
    }
  }

  /* ------------------------------------------------------------------ */
  update(dt, elapsed) {
    for (const s of this.satellites) {
      s.group.position.y = s.baseY + Math.sin(elapsed * s.speed + s.phase) * 1.8;
      s.group.rotation.y += dt * s.speed * 0.25;
    }
    // 护栏云朵的轻微漂浮感由整体缩放体现，保持 draw call 不变
    if (this.railings) {
      this.railings.position.y = Math.sin(elapsed * 0.5) * 0.06;
    }
  }

  setProgress(t) {
    // 草地随「点亮世界」更暖更亮
    if (this.groundMaterial?.uniforms?.uBaseColor) {
      const warm = new THREE.Color(this.palette.islandTop);
      const cold = new THREE.Color('#C3B0C2');
      this.groundMaterial.uniforms.uBaseColor.value.copy(cold).lerp(warm, 0.25 + t * 0.75);
    }
  }
}
