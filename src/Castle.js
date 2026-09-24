import * as THREE from 'three';
import {
  createToonMaterial,
  addOutline,
  createBlobShadow,
  createGlowSprite,
} from './ToonMaterial.js';
import { waterVertex, waterFragment } from './shaders/water.js';
import { createRandom, TAU, clamp } from './utils/math.js';

/* ============================================================
   小工具：快速造网格
   ============================================================ */
function add(parent, geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], scale = null, name = '', outline = null, ground = null } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  if (name) m.name = name;
  parent.add(m);
  if (outline) addOutline(m, outline);
  if (ground) ground.push(m);
  return m;
}

/** 生成一张带文字的贴图（生日横幅用，纯程序化，无外部素材） */
function makeBannerTexture(cnText = '生日快乐', enText = 'HAPPY BIRTHDAY', bg = '#E75480', fg = '#FFE4A0') {
  const w = 1024;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, bg);
  g.addColorStop(0.5, bg);
  g.addColorStop(1, '#C93E68');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 金色描边
  ctx.strokeStyle = fg;
  ctx.lineWidth = 9;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  // 小星星装饰
  ctx.fillStyle = fg;
  for (let i = 0; i < 20; i++) {
    const x = 56 + (i % 10) * 100;
    const y = i < 10 ? 44 : h - 44;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 自动缩放字号，保证文字完整落在画布内 */
  const fitFont = (str, maxWidth, startSize, family) => {
    let size = startSize;
    for (let i = 0; i < 40; i++) {
      ctx.font = `bold ${size}px ${family}`;
      if (ctx.measureText(str).width <= maxWidth) break;
      size -= 4;
    }
    return size;
  };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cnSize = fitFont(cnText, w - 150, 104, '"PingFang SC", "Microsoft YaHei", sans-serif');
  ctx.font = `bold ${cnSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = fg;
  ctx.fillText(cnText, w / 2, h * 0.38);

  const enSize = fitFont(enText, w - 190, 46, '"Helvetica Neue", Arial, sans-serif');
  ctx.font = `bold ${enSize}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = '#FFF8F0';
  ctx.fillText(enText, w / 2, h * 0.7);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* 礼物盒同色共享材质（静态合并白名单用） */
const giftMatCache = new Map();

/* ============================================================
   城堡
   ============================================================ */
export class Castle {
  constructor(scene, world, { palette, preset, playerName = '亲爱的寿星' } = {}) {
    this.scene = scene;
    this.world = world;
    this.palette = palette;
    this.preset = preset;
    this.playerName = playerName;
    this.random = createRandom(20260923);

    this.group = new THREE.Group();
    this.group.name = 'Castle';
    scene.add(this.group);

    this.windows = [];
    this.glowMaterials = [];
    this.candleFlames = [];
    this.animated = [];
    this._tmpColor = new THREE.Color();

    this._buildMaterials();
    this._buildHall();
    this._buildTowers();
    this._buildTerraceAndStairs();
    this._buildWindows();
    this._buildGate();
    this._buildBlessingCorridor();
    this._buildWishPool();
    this._buildGiftRoom();
    this._buildCakeTower();
    this._buildDecorations();

    /* --------- 可供各系统使用的锚点 --------- */
    this.anchors = {
      gate: new THREE.Vector3(0, 0, -1.4),
      celebrationButton: new THREE.Vector3(0, 0, -8),
      wishPool: new THREE.Vector3(15, 0, 6),
      giftBox: new THREE.Vector3(14.5, 0, -14),
      cake: new THREE.Vector3(0, 0, 13),
      terrace: new THREE.Vector3(7.5, 0, -8),
      blessing: [
        new THREE.Vector3(-13, 1.7, -5),
        new THREE.Vector3(-13, 1.7, 0),
        new THREE.Vector3(-13, 1.7, 5),
        new THREE.Vector3(6.5, 1.5, 7.5),
        new THREE.Vector3(11.5, 1.6, 2.5),
        new THREE.Vector3(17.6, 1.7, -16.6),
        new THREE.Vector3(7.5, 8.8, -8),
        new THREE.Vector3(0, 2.0, -21.5),
      ],
    };
    this.anchors.celebrationButtonY = 0.95;

    this._registerColliders();
  }

  /** 允许被静态合并的材质集合（共享材质 + 描边材质由调用方补充） */
  collectMergeMaterials() {
    const out = Object.values(this.mat);
    if (this._candleBodyMat) out.push(this._candleBodyMat);
    out.push(...giftMatCache.values());
    return out;
  }

  /* ================================================================
     碰撞体登记（供角色控制器使用）
     只登记真正需要挡路的实体，避免性能浪费
     ================================================================ */
  _registerColliders() {
    const w = this.world;
    const box = (x, z, hx, hz, minY = 0, maxY = 6) =>
      w.colliders.push({ type: 'box', x, z, hx, hz, minY, maxY });
    const cyl = (x, z, r, minY = 0, maxY = 99) =>
      w.colliders.push({ type: 'cyl', x, z, r, minY, maxY });

    /* --- 大厅四周墙体 --- */
    box(-5.65, -8, 0.4, 5, 0, 6);      // 左墙
    box(5.65, -8, 0.4, 5, 0, 6);       // 右墙
    box(0, -12.65, 6, 0.4, 0, 6);      // 后墙
    box(-4.15, -3.35, 2.8, 0.4, 0, 6); // 前墙左段
    box(4.15, -3.35, 2.8, 0.4, 0, 6);  // 前墙右段
    box(0, -3.35, 2.3, 0.4, 4.6, 6);   // 门楣（离地 4.6 以上才挡）

    /* --- 大厅立柱 --- */
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) cyl(sx * 4.6, -8 + sz * 3.6, 0.46, 0, 6);
    }

    /* --- 庆典按钮基座 --- */
    cyl(0, -8, 1.72, 0, 1.2);

    /* --- 塔楼 --- */
    cyl(0, -16.5, 3.35, 0, 13.5);
    cyl(-6.5, -17, 2.25, 0, 9);
    cyl(6.5, -17, 2.25, 0, 9);
    box(0, -13.4, 2.4, 2.2, 0, 6.5);   // 连廊

    /* --- 露台支撑柱 --- */
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) cyl(7.5 + sx * 2.8, -8 + sz * 3.8, 0.42, 0, 6.4);
    }

    /* --- 祝福长廊立柱 --- */
    for (const z of [-7, -3, 1, 5, 9]) cyl(-13.5, z, 0.56, 0, 5.2);

    /* --- 许愿池 --- */
    cyl(15, 6, 3.5, 0, 1.15);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.5;
      cyl(15 + Math.cos(a) * 4.9, 6 + Math.sin(a) * 4.9, 0.44, 0, 5.1);
    }

    /* --- 礼物房墙体（用一串小圆柱逼近多边形墙） --- */
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const wx = 14.5 + Math.cos(a) * 4.75;
      const wz = -14 + Math.sin(a) * 4.75;
      for (let k = -2; k <= 2; k++) {
        const ax = Math.cos(a + Math.PI / 2) * k * 0.85;
        const az = Math.sin(a + Math.PI / 2) * k * 0.85;
        cyl(wx + ax, wz + az, 0.5, 0, 2.3);
      }
    }
    // 惊喜礼盒
    cyl(14.5, -13.4, 1.5, 0, 2.6);

    /* --- 蛋糕桌 --- */
    cyl(0, 13, 4.35, 0, 3.5);
  }

  /* ================================================================
     材质
     ================================================================ */
  _buildMaterials() {
    const p = this.palette;
    this.mat = {
      wall: createToonMaterial({
        color: p.castleWall, toonSteps: 3.0, rimColor: '#FFF8F0', rimIntensity: 0.14, softness: 0.5,
      }),
      wallDark: createToonMaterial({
        color: '#E39BB4', toonSteps: 2.6, rimIntensity: 0.08, softness: 0.45,
      }),
      trim: createToonMaterial({
        color: p.castleTrim, toonSteps: 2.0, rimIntensity: 0.16, softness: 0.55,
      }),
      roof: createToonMaterial({
        color: p.roof, toonSteps: 3.0, rimColor: '#FFD700', rimIntensity: 0.18, softness: 0.5,
      }),
      roofLight: createToonMaterial({
        color: '#FF9EC4', toonSteps: 2.6, rimIntensity: 0.14,
      }),
      gold: createToonMaterial({
        color: p.gold, toonSteps: 2.0, emissive: p.gold, emissiveIntensity: 0.14,
        rimIntensity: 0.3, rimColor: '#FFF8F0',
      }),
      wood: createToonMaterial({ color: '#C08552', toonSteps: 2.4, softness: 0.5 }),
      woodDark: createToonMaterial({ color: '#8F5A33', toonSteps: 2.2 }),
      stone: createToonMaterial({ color: '#E8E0EA', toonSteps: 2.2, softness: 0.5 }),
      glassDark: createToonMaterial({
        color: '#3B3350', toonSteps: 1.6, opacity: 0.42, transparent: true,
        emissive: '#000000', emissiveIntensity: 0, rimIntensity: 0.35, rimColor: '#FFE4A0',
        depthWrite: false,
      }),
    };

    // 窗户可以逐个点亮，这里为每扇窗创建独立材质
    this.mat.windowLitBase = { color: '#FFE9A0', emissive: '#FFD700' };
  }

  /* ================================================================
     大厅（含中央庆典按钮位置、拱形大门开口、屋顶平台）
     ================================================================ */
  _buildHall() {
    const G = this.group;
    const W = 12;      // x
    const H = 6;       // y
    const D = 10;      // z
    const cx = 0;
    const cz = -8;
    const t = 0.7;     // 墙厚

    const wallGeoX = new THREE.BoxGeometry(t, H, D);
    const wallGeoZ = new THREE.BoxGeometry(W, H, t);
    const ow = { width: 0.0012, color: '#7A3B52' };
    const ground = this.world.ground;

    /** 需要参与相机避让的实体墙 */
    this.hallWalls = [];
    const wall = (geo, pos) => {
      const m = add(G, geo, this.mat.wall, { pos, outline: ow });
      this.hallWalls.push(m);
      this.world.occluders.push(m);
      return m;
    };

    // 左 / 右墙
    wall(wallGeoX, [-W / 2 + t / 2, H / 2, cz]);
    wall(wallGeoX, [W / 2 - t / 2, H / 2, cz]);

    // 后墙
    wall(wallGeoZ, [cx, H / 2, cz - D / 2 + t / 2]);

    // 前墙（中间留 4.4 宽的拱门开口，两侧各一段）
    const openingW = 4.4;
    const sideW = (W - openingW) / 2;
    wall(new THREE.BoxGeometry(sideW, H, t), [-(openingW / 2 + sideW / 2), H / 2, cz + D / 2 - t / 2]);
    wall(new THREE.BoxGeometry(sideW, H, t), [openingW / 2 + sideW / 2, H / 2, cz + D / 2 - t / 2]);
    // 拱门上方
    const lintel = wall(
      new THREE.BoxGeometry(openingW, H - 4.6, t),
      [0, 4.6 + (H - 4.6) / 2, cz + D / 2 - t / 2]
    );
    // 相机从拱门穿过即可，门楣不参与避让
    this.world.occluders = this.world.occluders.filter((m) => m !== lintel);
    this.hallWalls = this.hallWalls.filter((m) => m !== lintel);

    // 拱门装饰
    const archGeo = new THREE.TorusGeometry(openingW / 2, 0.22, 10, 28, Math.PI);
    add(G, archGeo, this.mat.trim, { pos: [0, 4.6, cz + D / 2 - t / 2 + 0.05] });

    // 地面（大理石）
    const floorGeo = new THREE.BoxGeometry(W - t, 0.3, D - t);
    add(G, floorGeo, this.mat.trim, { pos: [cx, 0.15, cz], ground, name: 'hall-floor' });

    // 大厅中央的地毯/花纹
    const carpet = add(G, new THREE.RingGeometry(1.6, 3.0, 44), this.mat.roofLight, {
      pos: [0, 0.32, cz], rot: [-Math.PI / 2, 0, 0],
    });
    carpet.renderOrder = 1;

    // 屋顶（同时是顶层露台的承重板，可站立）
    const roofGeo = new THREE.BoxGeometry(W + 2.4, 0.9, D + 2.4);
    this.hallRoof = add(G, roofGeo, this.mat.roof, {
      pos: [cx, H + 0.45, cz], outline: { width: 0.0012, color: '#7A3B52' },
    });
    this.world.ground.push(this.hallRoof);

    // 屋顶的金边
    add(G, new THREE.BoxGeometry(W + 2.8, 0.24, D + 2.8), this.mat.gold, {
      pos: [cx, H + 0.05, cz],
    });

    // 屋顶四角的装饰球
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(G, new THREE.SphereGeometry(0.42, 12, 10), this.mat.gold, {
          pos: [cx + sx * (W / 2 + 1.0), H + 1.1, cz + sz * (D / 2 + 1.0)],
        });
      }
    }

    // 大厅内的立柱
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(G, new THREE.CylinderGeometry(0.34, 0.4, H, 12), this.mat.trim, {
          pos: [sx * 4.6, H / 2, cz + sz * 3.6], outline: ow,
        });
        add(G, new THREE.CylinderGeometry(0.5, 0.5, 0.25, 12), this.mat.gold, {
          pos: [sx * 4.6, H - 0.3, cz + sz * 3.6],
        });
      }
    }

    // 吊灯
    const chandelier = new THREE.Group();
    chandelier.position.set(cx, H - 1.0, cz);
    G.add(chandelier);
    add(chandelier, new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), this.mat.gold, { pos: [0, 1.5, 0] });
    add(chandelier, new THREE.TorusGeometry(1.5, 0.1, 8, 32), this.mat.gold, { rot: [Math.PI / 2, 0, 0] });
    add(chandelier, new THREE.TorusGeometry(0.9, 0.08, 8, 24), this.mat.gold, { rot: [Math.PI / 2, 0, 0], pos: [0, 0.7, 0] });
    this.chandelierBulbs = [];
    const bulbMatShared = createToonMaterial({
      color: '#FFF6D8', emissive: '#FFD700', emissiveIntensity: 0.2, rimIntensity: 0,
    });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const bulbMat = bulbMatShared;
      const bulb = add(chandelier, new THREE.SphereGeometry(0.14, 10, 8), bulbMat, {
        pos: [Math.cos(a) * 1.5, i % 2 === 0 ? 0.16 : 0.86, Math.sin(a) * 1.5],
      });
      const glow = createGlowSprite({ color: '#FFE9A0', size: 0.9, opacity: 0.5, alpha: '0.9' });
      glow.position.copy(bulb.position);
      chandelier.add(glow);
      this.chandelierBulbs.push({ mat: bulbMat, glow });
    }
    this.chandelier = chandelier;

    // 大厅内的长桌与礼物堆（装饰）
    add(G, new THREE.BoxGeometry(3.2, 0.16, 1.3), this.mat.wood, { pos: [-3.4, 1.0, cz - 3.2] });
    for (const lx of [-4.0, -2.8]) {
      add(G, new THREE.BoxGeometry(0.2, 1.0, 0.2), this.mat.woodDark, { pos: [lx, 0.5, cz - 3.2] });
    }

    this.hallBounds = {
      minX: cx - W / 2, maxX: cx + W / 2,
      minZ: cz - D / 2, maxZ: cz + D / 2,
      height: H,
    };

    // 大厅屋顶与后墙在相机进入室内时隐藏（经典的"开顶"处理）
    this.hallOccluders = [this.hallRoof];
  }

  /* ================================================================
     塔楼
     ================================================================ */
  _buildTowers() {
    const G = this.group;
    const ow = { width: 0.0012, color: '#7A3B52' };

    /** 造一座塔：塔身 + 锥顶 + 旗帜 */
    const makeTower = (x, z, radius, height, roofH, flag = false) => {
      const tower = new THREE.Group();
      tower.position.set(x, 0, z);
      G.add(tower);

      const body = add(tower, new THREE.CylinderGeometry(radius, radius * 1.08, height, 24, 1), this.mat.wall, {
        pos: [0, height / 2, 0], outline: ow,
      });
      this.world.occluders.push(body);

      // 塔身装饰环
      add(tower, new THREE.TorusGeometry(radius * 1.02, 0.14, 8, 28), this.mat.trim, {
        pos: [0, height * 0.62, 0], rot: [Math.PI / 2, 0, 0],
      });
      add(tower, new THREE.TorusGeometry(radius * 1.05, 0.16, 8, 28), this.mat.gold, {
        pos: [0, height - 0.2, 0], rot: [Math.PI / 2, 0, 0],
      });

      // 锥形屋顶
      const roof = add(tower, new THREE.ConeGeometry(radius * 1.24, roofH, 24, 1), this.mat.roof, {
        pos: [0, height + roofH / 2, 0], outline: ow,
      });

      // 塔尖金球
      add(tower, new THREE.SphereGeometry(radius * 0.14, 10, 8), this.mat.gold, {
        pos: [0, height + roofH + radius * 0.1, 0],
      });

      let flagMesh = null;
      if (flag) {
        const poleH = roofH * 0.85;
        add(tower, new THREE.CylinderGeometry(0.06, 0.06, poleH, 6), this.mat.gold, {
          pos: [0, height + roofH + poleH / 2, 0],
        });
        const flagGeo = new THREE.PlaneGeometry(1.9, 1.1, 12, 6);
        const flagMat = createToonMaterial({
          color: this.palette.accent, toonSteps: 1.8, side: THREE.DoubleSide, rimIntensity: 0.25,
        });
        flagMesh = add(tower, flagGeo, flagMat, {
          pos: [0.98, height + roofH + poleH * 0.72, 0],
        });
        flagMesh.userData.basePos = flagMesh.geometry.attributes.position.array.slice();
        this.animated.push({ type: 'flag', mesh: flagMesh });
      }

      return { tower, roof, flagMesh };
    };

    this.mainTower = makeTower(0, -16.5, 3.2, 13, 5.0, true);
    this.sideTowers = [
      makeTower(-6.5, -17, 2.1, 8.5, 3.6, true),
      makeTower(6.5, -17, 2.1, 8.5, 3.6, true),
    ];

    // 连接大厅与塔楼的连廊
    add(G, new THREE.BoxGeometry(4.6, 2.6, 4.2), this.mat.wallDark, {
      pos: [0, 5.2, -13.4], outline: ow,
    });
    add(G, new THREE.BoxGeometry(4.4, 0.9, 4.4), this.mat.roof, { pos: [0, 6.9, -13.4] });
  }

  /* ================================================================
     顶层露台 + 大台阶
     ================================================================ */
  _buildTerraceAndStairs() {
    const G = this.group;
    const ground = this.world.ground;
    const ow = { width: 0.0012, color: '#7A3B52' };

    /* ---- 露台平台（大厅右后方） ---- */
    const platW = 7;
    const platD = 9;
    const platX = 7.5;
    const platZ = -8;
    const platTop = 7.0;

    const platform = add(G, new THREE.BoxGeometry(platW, 0.8, platD), this.mat.trim, {
      pos: [platX, platTop - 0.4, platZ], outline: ow, name: 'terrace-floor',
    });
    ground.push(platform);
    this.terraceFloor = platform;

    // 平台支撑柱
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(G, new THREE.CylinderGeometry(0.32, 0.38, platTop - 0.8, 12), this.mat.wall, {
          pos: [platX + sx * (platW / 2 - 0.7), (platTop - 0.8) / 2, platZ + sz * (platD / 2 - 0.7)],
        });
      }
    }

    // 露台栏杆（云朵 + 金柱）
    const railMat = createToonMaterial({ color: '#FFF8F0', toonSteps: 2.0, rimIntensity: 0.2 });
    const postCount = 26;
    const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.0, 8);
    const posts = new THREE.InstancedMesh(postGeo, railMat, postCount);
    const dummy = new THREE.Object3D();
    let pi = 0;
    for (let i = 0; i < 10; i++) {
      dummy.position.set(platX - platW / 2 + 0.35 + i * ((platW - 0.7) / 9), platTop + 0.5, platZ - platD / 2 + 0.3);
      dummy.updateMatrix(); posts.setMatrixAt(pi++, dummy.matrix);
      dummy.position.set(platX - platW / 2 + 0.35 + i * ((platW - 0.7) / 9), platTop + 0.5, platZ + platD / 2 - 0.3);
      dummy.updateMatrix(); posts.setMatrixAt(pi++, dummy.matrix);
    }
    for (let i = 0; i < 3; i++) {
      dummy.position.set(platX - platW / 2 + 0.3, platTop + 0.5, platZ - platD / 2 + 1.6 + i * 2.8);
      dummy.updateMatrix(); posts.setMatrixAt(pi++, dummy.matrix);
    }
    posts.count = pi;
    posts.instanceMatrix.needsUpdate = true;
    G.add(posts);

    // 金色扶手
    add(G, new THREE.BoxGeometry(platW - 0.4, 0.12, 0.12), this.mat.gold, {
      pos: [platX, platTop + 1.0, platZ - platD / 2 + 0.3],
    });
    add(G, new THREE.BoxGeometry(platW - 0.4, 0.12, 0.12), this.mat.gold, {
      pos: [platX, platTop + 1.0, platZ + platD / 2 - 0.3],
    });
    add(G, new THREE.BoxGeometry(0.12, 0.12, platD - 0.4), this.mat.gold, {
      pos: [platX - platW / 2 + 0.3, platTop + 1.0, platZ],
    });

    /* ---- 大台阶：从广场右前侧登顶 ---- */
    const steps = 15;
    const rise = platTop / steps;                 // 0.467
    const depth = 0.86;
    const stairX = 8.6;
    const stairW = 3.0;
    const startZ = 9.2;

    for (let i = 0; i < steps; i++) {
      const topY = rise * (i + 1);
      const z = startZ - depth * i - depth / 2;
      const step = add(G, new THREE.BoxGeometry(stairW, topY, depth + 0.02), this.mat.trim, {
        pos: [stairX, topY / 2, z],
      });
      ground.push(step);

      // 台阶下方的粉色踢脚，让结构更立体
      add(G, new THREE.BoxGeometry(stairW + 0.26, 0.14, 0.1), this.mat.gold, {
        pos: [stairX, topY - 0.06, z + depth / 2 - 0.05],
      });
    }
    // 台阶下的整块基座（防止穿模看到空隙）
    add(G, new THREE.BoxGeometry(stairW + 0.5, 1.0, depth * steps), this.mat.wallDark, {
      pos: [stairX, 0.5, startZ - (depth * steps) / 2],
    });

    // 台阶两侧的金色扶手
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const y = rise * (1 + t * (steps - 1));
        const z = startZ - depth * (t * (steps - 1)) - depth / 2;
        add(G, new THREE.CylinderGeometry(0.08, 0.09, 1.1, 8), this.mat.gold, {
          pos: [stairX + sx * (stairW / 2 - 0.1), y + 0.55, z],
        });
      }
    }

    // 顶端与露台的连接小平台
    const bridge = add(G, new THREE.BoxGeometry(stairW + 0.6, 0.5, 1.6), this.mat.trim, {
      pos: [stairX, platTop - 0.25, -3.0], outline: ow,
    });
    ground.push(bridge);

    this.terraceTrigger = {
      position: new THREE.Vector3(platX, platTop + 0.2, platZ),
      radius: 3.4,
    };
  }

  /* ================================================================
     窗户（随进度逐个点亮）
     ================================================================ */
  _buildWindows() {
    const G = this.group;
    const p = this.palette;

    const addWindow = (parent, x, y, z, w, h, rotY = 0) => {
      const mat = createToonMaterial({
        color: '#4A4260',
        toonSteps: 2.0,
        emissive: '#FFD700',
        emissiveIntensity: 0.0,
        transparent: true,
        opacity: 0.86,
        rimIntensity: 0.3,
        rimColor: '#FFE4A0',
      });

      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      parent.add(g);

      // 拱形窗 = 矩形 + 半圆
      const body = add(g, new THREE.PlaneGeometry(w, h), mat, { pos: [0, 0, 0.06] });
      const top = add(g, new THREE.CircleGeometry(w / 2, 16, 0, Math.PI), mat, { pos: [0, h / 2, 0.06] });

      // 窗框
      add(g, new THREE.BoxGeometry(w + 0.28, 0.14, 0.16), this.mat.trim, { pos: [0, -h / 2 - 0.06, 0.04] });
      add(g, new THREE.BoxGeometry(0.14, h + w / 2 + 0.2, 0.16), this.mat.trim, { pos: [-w / 2 - 0.07, 0.1, 0.04] });
      add(g, new THREE.BoxGeometry(0.14, h + w / 2 + 0.2, 0.16), this.mat.trim, { pos: [w / 2 + 0.07, 0.1, 0.04] });
      add(g, new THREE.TorusGeometry(w / 2 + 0.12, 0.08, 8, 18, Math.PI), this.mat.trim, {
        pos: [0, h / 2, 0.04],
      });

      const glow = createGlowSprite({ color: '#FFE9A0', size: w * 3.4, opacity: 0, alpha: '0.9' });
      glow.position.set(0, 0.2, 0.22);
      g.add(glow);

      const entry = { group: g, mat, glow, lit: false, intensity: 0 };
      this.windows.push(entry);
      body.userData.window = entry;
      top.userData.window = entry;
      return entry;
    };

    // 大厅前墙两扇
    addWindow(G, -3.4, 3.4, -2.93, 1.5, 2.2);
    addWindow(G, 3.4, 3.4, -2.93, 1.5, 2.2);
    // 大厅侧墙（左右各两扇）
    addWindow(G, -5.96, 3.4, -6.4, 1.4, 2.1, Math.PI / 2);
    addWindow(G, -5.96, 3.4, -9.6, 1.4, 2.1, Math.PI / 2);
    addWindow(G, 5.96, 3.4, -6.4, 1.4, 2.1, -Math.PI / 2);
    addWindow(G, 5.96, 3.4, -9.6, 1.4, 2.1, -Math.PI / 2);

    // 主塔
    for (let i = 0; i < 3; i++) {
      const a = -0.5 + i * 0.5;
      const r = 3.28;
      addWindow(G, Math.sin(a) * r, 4.2 + i * 2.6, -16.5 + Math.cos(a) * r, 0.9, 1.5, Math.PI + a);
    }
    // 副塔
    for (const sx of [-1, 1]) {
      addWindow(G, sx * 6.5 + Math.sin(-sx * 0.4) * 2.15, 4.0, -17 + Math.cos(-sx * 0.4) * 2.15, 0.8, 1.3, Math.PI - sx * 0.4);
      addWindow(G, sx * 6.5, 6.4, -17 + 2.15, 0.8, 1.2, Math.PI);
    }
  }

  /* ================================================================
     大门（双开，可交互）
     ================================================================ */
  _buildGate() {
    const G = this.group;
    const z = -3.0;
    const doorW = 2.1;
    const doorH = 4.4;

    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, z);
    G.add(gateGroup);

    // 门框
    add(gateGroup, new THREE.BoxGeometry(4.9, 0.3, 0.42), this.mat.trim, { pos: [0, doorH + 0.18, 0] });
    add(gateGroup, new THREE.BoxGeometry(0.3, doorH, 0.42), this.mat.trim, { pos: [-2.3, doorH / 2, 0] });
    add(gateGroup, new THREE.BoxGeometry(0.3, doorH, 0.42), this.mat.trim, { pos: [2.3, doorH / 2, 0] });

    const doorGeo = new THREE.BoxGeometry(doorW, doorH, 0.24);
    const doorMat = createToonMaterial({
      color: '#A9663F', toonSteps: 2.4, rimColor: '#FFE4A0', rimIntensity: 0.22, softness: 0.45,
    });
    const ow = { width: 0.0011, color: '#5A2E3E' };

    const leftPivot = new THREE.Group();
    leftPivot.position.set(-doorW / 2, 0, 0);
    gateGroup.add(leftPivot);
    const leftDoor = add(leftPivot, doorGeo, doorMat, { pos: [doorW / 2, doorH / 2, 0], outline: ow });
    // 门上金饰
    add(leftPivot, new THREE.TorusGeometry(0.42, 0.07, 8, 20), this.mat.gold, { pos: [doorW - 0.42, doorH / 2, 0.15] });
    add(leftPivot, new THREE.BoxGeometry(0.16, 0.28, 0.12), this.mat.gold, { pos: [doorW - 0.5, doorH / 2, 0.2] });

    const rightPivot = new THREE.Group();
    rightPivot.position.set(doorW / 2, 0, 0);
    gateGroup.add(rightPivot);
    const rightDoor = add(rightPivot, doorGeo, doorMat, { pos: [-doorW / 2, doorH / 2, 0], outline: ow });
    add(rightPivot, new THREE.TorusGeometry(0.42, 0.07, 8, 20), this.mat.gold, { pos: [-doorW + 0.42, doorH / 2, 0.15] });
    add(rightPivot, new THREE.BoxGeometry(0.16, 0.28, 0.12), this.mat.gold, { pos: [-doorW + 0.5, doorH / 2, 0.2] });

    this.gate = {
      group: gateGroup,
      leftPivot,
      rightPivot,
      leftDoor,
      rightDoor,
      openAmount: 0,
      target: 0,
      trigger: new THREE.Vector3(0, 0, -1.4),
      pickup: [leftDoor, rightDoor],
    };

    // 门口的欢迎地毯
    add(G, new THREE.PlaneGeometry(5.2, 2.6), this.mat.roofLight, {
      pos: [0, 0.07, -0.6], rot: [-Math.PI / 2, 0, 0],
    });
  }

  /* ================================================================
     祝福长廊（西侧柱廊）
     ================================================================ */
  _buildBlessingCorridor() {
    const G = this.group;
    const ow = { width: 0.0012, color: '#7A3B52' };
    const x = -13.5;
    const zs = [-7, -3, 1, 5, 9];

    for (const z of zs) {
      // 柱
      add(G, new THREE.CylinderGeometry(0.42, 0.5, 5.2, 14), this.mat.trim, {
        pos: [x, 2.6, z], outline: ow,
      });
      // 柱头 / 柱基
      add(G, new THREE.BoxGeometry(1.5, 0.34, 1.5), this.mat.gold, { pos: [x, 5.3, z] });
      add(G, new THREE.BoxGeometry(1.6, 0.28, 1.6), this.mat.trim, { pos: [x, 0.28, z] });
    }

    // 顶部横梁
    add(G, new THREE.BoxGeometry(1.3, 0.6, 18.6), this.mat.wall, {
      pos: [x, 5.75, 1], outline: ow,
    });
    add(G, new THREE.BoxGeometry(1.5, 0.24, 19.0), this.mat.gold, { pos: [x, 6.12, 1] });

    // 梁上垂挂的花环（星点串）
    const dotGeo = new THREE.SphereGeometry(0.13, 8, 6);
    const dotMat = createToonMaterial({
      color: '#FFFFFF', emissive: '#FFD700', emissiveIntensity: 0.35, rimIntensity: 0.2,
    });
    const count = 60;
    const garland = new THREE.InstancedMesh(dotGeo, dotMat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const z = -7 + t * 16;
      const sag = Math.sin(t * Math.PI * 3) * 0.55;
      dummy.position.set(x + 0.55, 5.5 - Math.abs(Math.sin(t * Math.PI * 3)) * 0.5 + sag * 0.2, z);
      dummy.scale.setScalar(0.8 + (i % 3) * 0.16);
      dummy.updateMatrix();
      garland.setMatrixAt(i, dummy.matrix);
    }
    garland.instanceMatrix.needsUpdate = true;
    garland.frustumCulled = false;
    G.add(garland);

    // 长廊尽头的花拱门
    for (const z of [-8.4, 10.4]) {
      add(G, new THREE.TorusGeometry(1.9, 0.22, 10, 24, Math.PI), this.mat.roofLight, {
        pos: [x, 3.4, z], rot: [0, Math.PI / 2, 0],
      });
    }
  }

  /* ================================================================
     许愿池（东侧凉亭）
     ================================================================ */
  _buildWishPool() {
    const G = this.group;
    const center = new THREE.Vector3(15, 0, 6);
    const R = 3.1;
    const ow = { width: 0.0012, color: '#7A3B52' };
    const ground = this.world.ground;

    const g = new THREE.Group();
    g.position.copy(center);
    G.add(g);

    // 石台
    const base = add(g, new THREE.CylinderGeometry(6.2, 6.2, 0.36, 40), this.mat.stone, {
      pos: [0, 0.18, 0], outline: ow,
    });
    ground.push(base);

    // 池壁
    add(g, new THREE.CylinderGeometry(R + 0.34, R + 0.42, 0.95, 40, 1), this.mat.trim, {
      pos: [0, 0.62, 0], outline: ow,
    });
    add(g, new THREE.TorusGeometry(R + 0.4, 0.16, 8, 40), this.mat.gold, {
      pos: [0, 1.08, 0], rot: [Math.PI / 2, 0, 0],
    });

    // 池底
    add(g, new THREE.CircleGeometry(R + 0.3, 40), this.mat.wallDark, {
      pos: [0, 0.2, 0], rot: [-Math.PI / 2, 0, 0],
    });

    // 水面（自定义着色器）
    this.waterUniforms = {
      uTime: { value: 0 },
      uWaveHeight: { value: 0.06 },
      uColorShallow: { value: new THREE.Color('#BEE3F0') },
      uColorDeep: { value: new THREE.Color('#6FA8C9') },
      uRippleColor: { value: new THREE.Color('#FFE4A0') },
      uPulse: { value: 0 },
      uGlow: { value: 0 },
      uOpacity: { value: 0.92 },
    };
    const waterMat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.water = new THREE.Mesh(new THREE.CircleGeometry(R + 0.2, 56), waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0.86;
    this.water.renderOrder = 3;
    g.add(this.water);

    // 池中的浮星
    this.poolStars = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const starMat = createToonMaterial({
        color: '#FFFFFF', emissive: '#FFE4A0', emissiveIntensity: 0.6, rimIntensity: 0,
      });
      const s = add(g, new THREE.OctahedronGeometry(0.16, 0), starMat, {
        pos: [Math.cos(a) * (R * 0.62), 0.9, Math.sin(a) * (R * 0.62)],
      });
      this.poolStars.push({ mesh: s, phase: i * 0.9, mat: starMat });
    }

    // 六根柱子 + 穹顶
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.5;
      const px = Math.cos(a) * 4.9;
      const pz = Math.sin(a) * 4.9;
      add(g, new THREE.CylinderGeometry(0.32, 0.4, 4.6, 12), this.mat.trim, {
        pos: [px, 2.66, pz], outline: ow,
      });
      add(g, new THREE.BoxGeometry(1.0, 0.28, 1.0), this.mat.gold, { pos: [px, 5.05, pz] });
    }

    const dome = add(g, new THREE.SphereGeometry(5.0, 28, 14, 0, TAU, 0, Math.PI / 2), this.mat.roofLight, {
      pos: [0, 5.1, 0], outline: ow,
    });
    dome.material = this.mat.roofLight;
    add(g, new THREE.SphereGeometry(0.5, 14, 10), this.mat.gold, { pos: [0, 10.3, 0] });

    // 池边蜡烛
    this.poolCandles = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.9;
      const cx = Math.cos(a) * (R + 1.05);
      const cz = Math.sin(a) * (R + 1.05);
      this.poolCandles.push(this._makeCandle(g, cx, 0.36, cz, 0.72));
    }

    // 花瓣
    const petalGeo = new THREE.CircleGeometry(0.16, 6);
    const petalMat = createToonMaterial({ color: '#FF9EC4', toonSteps: 1.6, side: THREE.DoubleSide });
    const petals = new THREE.InstancedMesh(petalGeo, petalMat, 36);
    const dummy = new THREE.Object3D();
    const r = this.random;
    for (let i = 0; i < 36; i++) {
      dummy.position.set(r.range(-R, R), 0.88 + r.range(0, 0.02), r.range(-R, R));
      dummy.rotation.set(-Math.PI / 2, 0, r.range(0, TAU));
      dummy.scale.setScalar(r.range(0.7, 1.5));
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
    g.add(petals);

    this.wishPoolGroup = g;
  }

  /** 一支蜡烛：蜡身 + 火焰 + 光晕 */
  _makeCandle(parent, x, y, z, height = 0.8) {
    if (!this._candleBodyMat) {
      this._candleBodyMat = createToonMaterial({ color: '#FFF8F0', toonSteps: 1.8, rimIntensity: 0.2 });
    }
    const body = add(
      parent,
      new THREE.CylinderGeometry(0.09, 0.1, height, 10),
      this._candleBodyMat,
      { pos: [x, y + height / 2, z] }
    );
    const flameMat = createToonMaterial({
      color: '#FFE9A0', emissive: '#FFB347', emissiveIntensity: 1.0, rimIntensity: 0,
      transparent: true, opacity: 0.95, depthWrite: false,
    });
    const flame = add(parent, new THREE.ConeGeometry(0.075, 0.24, 8), flameMat, {
      pos: [x, y + height + 0.12, z],
    });
    const glow = createGlowSprite({ color: '#FFC65C', size: 1.1, opacity: 0.7, alpha: '0.75' });
    glow.position.set(x, y + height + 0.14, z);
    parent.add(glow);

    const entry = { body, flame, flameMat, glow, lit: true, phase: this.random.range(0, 10), blown: false };
    this.candleFlames.push(entry);
    return entry;
  }

  /* ================================================================
     礼物房（东北侧，低墙凉亭）
     ================================================================ */
  _buildGiftRoom() {
    const G = this.group;
    const cx = 14.5;
    const cz = -14;
    const W = 9.5;
    const D = 9.5;
    const H = 4.6;
    const ow = { width: 0.0012, color: '#7A3B52' };
    const ground = this.world.ground;

    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    G.add(g);

    // 地台
    const floor = add(g, new THREE.CylinderGeometry(W / 2 + 0.8, W / 2 + 0.8, 0.34, 8), this.mat.stone, {
      pos: [0, 0.17, 0], outline: ow,
    });
    ground.push(floor);
    add(g, new THREE.RingGeometry(W / 2 + 0.55, W / 2 + 0.78, 8), this.mat.gold, {
      pos: [0, 0.35, 0], rot: [-Math.PI / 2, 0, 0],
    }).renderOrder = 1;

    // 低墙（六边形，留一个入口）
    const cx2 = new THREE.Group();
    g.add(cx2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      if (i === 0) continue; // 留出入口
      const px = Math.cos(a) * (W / 2);
      const pz = Math.sin(a) * (W / 2);
      add(g, new THREE.BoxGeometry(1.0, 2.0, 4.6), this.mat.wall, {
        pos: [px, 1.0, pz], rot: [0, -a + Math.PI / 2, 0], outline: ow,
      });
    }

    // 角柱 + 顶棚
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      add(g, new THREE.CylinderGeometry(0.26, 0.3, H, 10), this.mat.trim, {
        pos: [Math.cos(a) * (W / 2 + 0.1), H / 2 + 0.3, Math.sin(a) * (W / 2 + 0.1)],
      });
    }
    add(g, new THREE.ConeGeometry(W / 2 + 1.5, 4.2, 6), this.mat.roof, {
      pos: [0, H + 2.4, 0], rot: [0, Math.PI / 6, 0], outline: ow,
    });
    add(g, new THREE.SphereGeometry(0.4, 12, 10), this.mat.gold, { pos: [0, H + 4.7, 0] });

    // 普通礼物盒
    const boxColors = ['#FF9EC4', '#FFD1DC', '#FFE4A0', '#B8D4E8', '#E3D5FF', '#A8E6CF'];
    const r = this.random;
    for (let i = 0; i < 10; i++) {
      const a = r.range(0, TAU);
      const rad = r.range(1.6, W / 2 - 1.0);
      const bx = Math.cos(a) * rad;
      const bz = Math.sin(a) * rad;
      const s = r.range(0.5, 1.0);
      const col = r.pick(boxColors);
      this._makeGiftBox(g, bx, 0.34 + s / 2, bz, s, col, r.range(0, TAU), false);
    }

    // 金色惊喜礼盒
    this.bigGift = this._makeGiftBox(g, 0, 0.34 + 1.15, 0.6, 2.3, '#FFD700', 0.4, true);
    this.bigGift.group.position.set(0, 0.34, 0.6);
    ground.push(
      add(g, new THREE.BoxGeometry(2.6, 0.34, 2.6), this.mat.trim, { pos: [0, 0.17, 0.6] })
    );

    this.giftRoomGroup = g;
  }

  /**
   * 礼物盒
   * @returns {{group, lid, glow, mat}}
   */
  _makeGiftBox(parent, x, y, z, size, color, rotY, isBig) {
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.rotation.y = rotY;
    parent.add(grp);

    // 同色礼物盒共用一个材质，好让静态合并把 11 个盒子并成 2 次 draw call
    const cached = (key, factory) => {
      if (isBig) return factory();
      let m = giftMatCache.get(key);
      if (!m) { m = factory(); giftMatCache.set(key, m); }
      return m;
    };

    const bodyMat = cached(`box-${color}`, () => createToonMaterial({
      color, toonSteps: 2.4, rimColor: '#FFF8F0', rimIntensity: isBig ? 0.35 : 0.18,
      emissive: isBig ? '#FFD700' : '#000000', emissiveIntensity: isBig ? 0.22 : 0,
    }));
    const ribbonMat = cached('box-ribbon', () => createToonMaterial({
      color: '#FFF8F0', toonSteps: 2.0,
      emissive: isBig ? '#FFF8F0' : '#000000', emissiveIntensity: isBig ? 0.12 : 0,
    }));

    const h = size;
    add(grp, new THREE.BoxGeometry(size, h, size), bodyMat, {
      pos: [0, 0, 0], outline: { width: 0.0011, color: '#7A3B52' },
    });

    // 缎带
    add(grp, new THREE.BoxGeometry(size * 0.18, h * 1.02, size * 1.02), ribbonMat, { pos: [0, 0, 0] });
    add(grp, new THREE.BoxGeometry(size * 1.02, h * 1.02, size * 0.18), ribbonMat, { pos: [0, 0, 0] });

    // 盖子
    const lid = new THREE.Group();
    lid.userData.noMerge = true;
    lid.position.set(0, h / 2, 0);
    grp.add(lid);
    add(lid, new THREE.BoxGeometry(size * 1.1, size * 0.26, size * 1.1), bodyMat, {
      pos: [0, size * 0.13, 0], outline: { width: 0.0011, color: '#7A3B52' },
    });
    add(lid, new THREE.BoxGeometry(size * 0.2, size * 0.3, size * 1.12), ribbonMat, { pos: [0, size * 0.13, 0] });
    add(lid, new THREE.BoxGeometry(size * 1.12, size * 0.3, size * 0.2), ribbonMat, { pos: [0, size * 0.13, 0] });
    add(lid, new THREE.TorusKnotGeometry(size * 0.16, size * 0.055, 48, 8), ribbonMat, {
      pos: [0, size * 0.36, 0],
    });

    let glow = null;
    if (isBig) {
      glow = createGlowSprite({ color: '#FFD700', size: size * 5.5, opacity: 0.5, alpha: '0.8' });
      glow.position.y = size * 0.2;
      grp.add(glow);
    }

    return { group: grp, lid, glow, bodyMat, ribbonMat, size, baseY: y };
  }

  /* ================================================================
     蛋糕塔（南侧）
     ================================================================ */
  _buildCakeTower() {
    const G = this.group;
    const center = new THREE.Vector3(0, 0, 13);
    const ow = { width: 0.0011, color: '#7A3B52' };
    const ground = this.world.ground;

    const g = new THREE.Group();
    g.position.copy(center);
    G.add(g);

    // 圆桌
    const tableTop = add(g, new THREE.CylinderGeometry(4.2, 4.4, 0.4, 40), this.mat.trim, {
      pos: [0, 3.0, 0], outline: ow,
    });
    ground.push(tableTop);
    add(g, new THREE.CylinderGeometry(0.7, 1.2, 3.0, 16), this.mat.wallDark, { pos: [0, 1.5, 0] });
    add(g, new THREE.TorusGeometry(4.2, 0.14, 8, 40), this.mat.gold, {
      pos: [0, 3.22, 0], rot: [Math.PI / 2, 0, 0],
    });

    // 四层蛋糕
    const tiers = [
      { r: 3.0, h: 1.0, color: '#FFF8F0' },
      { r: 2.3, h: 0.9, color: '#FFD1DC' },
      { r: 1.6, h: 0.8, color: '#FFF8F0' },
      { r: 1.0, h: 0.7, color: '#FF9EC4' },
    ];
    let y = 3.2;
    this.cakeTiers = [];
    for (const t of tiers) {
      const mat = createToonMaterial({
        color: t.color, toonSteps: 2.2, rimColor: '#FFF8F0', rimIntensity: 0.22,
      });
      const tier = add(g, new THREE.CylinderGeometry(t.r, t.r * 1.02, t.h, 36), mat, {
        pos: [0, y + t.h / 2, 0], outline: ow,
      });
      this.cakeTiers.push(tier);

      // 奶油挤花边
      const butterMat = createToonMaterial({ color: '#FF9EC4', toonSteps: 1.8, emissive: '#FF69B4', emissiveIntensity: 0.06 });
      const knobs = 22;
      const knobGeo = new THREE.SphereGeometry(t.r * 0.075, 8, 6);
      const knobMesh = new THREE.InstancedMesh(knobGeo, butterMat, knobs);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < knobs; i++) {
        const a = (i / knobs) * TAU;
        dummy.position.set(Math.cos(a) * t.r * 0.98, y + t.h + 0.02, Math.sin(a) * t.r * 0.98);
        dummy.updateMatrix();
        knobMesh.setMatrixAt(i, dummy.matrix);
      }
      knobMesh.instanceMatrix.needsUpdate = true;
      g.add(knobMesh);

      // 草莓
      const berryCount = 8;
      const berryGeo = new THREE.ConeGeometry(t.r * 0.1, t.r * 0.2, 8);
      const berryMat = createToonMaterial({ color: '#E75480', toonSteps: 1.6, rimIntensity: 0.3 });
      const berries = new THREE.InstancedMesh(berryGeo, berryMat, berryCount);
      for (let i = 0; i < berryCount; i++) {
        const a = (i / berryCount) * TAU + 0.3;
        dummy.position.set(Math.cos(a) * t.r * 0.86, y + t.h * 0.62, Math.sin(a) * t.r * 0.86);
        dummy.updateMatrix();
        berries.setMatrixAt(i, dummy.matrix);
      }
      berries.instanceMatrix.needsUpdate = true;
      g.add(berries);

      y += t.h;
    }

    // 蜡烛
    this.cakeCandles = [];
    const candleCount = 5;
    for (let i = 0; i < candleCount; i++) {
      const a = (i / candleCount) * TAU;
      const rad = i === 0 ? 0 : 0.55;
      this.cakeCandles.push(
        this._makeCandle(g, Math.cos(a) * rad, y, Math.sin(a) * rad, 0.62)
      );
    }
    this._buildDecorations_cakeTop = y;

    // 盘子上的花瓣装饰
    const r = this.random;
    const petalMat = createToonMaterial({ color: '#FFD1DC', toonSteps: 1.6, side: THREE.DoubleSide });
    const petals = new THREE.InstancedMesh(new THREE.CircleGeometry(0.2, 6), petalMat, 28);
    const dummy2 = new THREE.Object3D();
    for (let i = 0; i < 28; i++) {
      const a = r.range(0, TAU);
      const rad = r.range(3.4, 4.1);
      dummy2.position.set(Math.cos(a) * rad, 3.21, Math.sin(a) * rad);
      dummy2.rotation.set(-Math.PI / 2, 0, r.range(0, TAU));
      dummy2.scale.setScalar(r.range(0.6, 1.3));
      dummy2.updateMatrix();
      petals.setMatrixAt(i, dummy2.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
    g.add(petals);

    this.cakeGroup = g;
  }

  /* ================================================================
     装饰：横幅、气球、彩带、花环、星星挂饰
     ================================================================ */
  _buildDecorations() {
    const G = this.group;
    const p = this.palette;
    const r = this.random;

    /* --- 生日横幅（程序化 canvas 贴图） --- */
    const bannerTex = makeBannerTexture('生日快乐', 'HAPPY BIRTHDAY', p.roof, p.gold);
    const bannerMat = new THREE.MeshBasicMaterial({
      map: bannerTex, transparent: true, side: THREE.DoubleSide, toneMapped: true,
    });
    const banner = add(G, new THREE.PlaneGeometry(10.4, 2.6, 24, 4), bannerMat, {
      pos: [0, 8.8, -1.9],
    });
    // 让横幅有布料的弯曲
    const bp = banner.geometry.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i);
      bp.setZ(i, Math.sin(x * 0.5) * 0.28 + Math.cos(x * 1.3) * 0.08);
    }
    banner.geometry.computeVertexNormals();
    this.animated.push({ type: 'banner', mesh: banner });

    // 横幅两端系绳
    for (const sx of [-1, 1]) {
      add(G, new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), this.mat.gold, {
        pos: [sx * 5.2, 9.3, -1.9], rot: [0, 0, sx * 0.4],
      });
    }

    /* --- 静态气球（InstancedMesh） --- */
    const balloonColors = ['#FF9EC4', '#FFD700', '#B8D4E8', '#FFD1DC', '#E3D5FF', '#FF69B4'];
    const balloonCount = 22;
    const bGeo = new THREE.SphereGeometry(0.42, 14, 12);
    const bMat = createToonMaterial({
      color: '#FFFFFF', toonSteps: 2.0, rimColor: '#FFFFFF', rimIntensity: 0.35, softness: 0.6,
    });
    const balloons = new THREE.InstancedMesh(bGeo, bMat, balloonCount);
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    this.balloonData = [];
    for (let i = 0; i < balloonCount; i++) {
      const a = r.range(0, TAU);
      const rad = r.range(12, 26);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const y = r.range(4, 11);
      const s = r.range(0.75, 1.35);
      dummy.position.set(x, y, z);
      dummy.scale.set(s, s * 1.18, s);
      dummy.rotation.set(r.range(-0.3, 0.3), r.range(0, TAU), r.range(-0.3, 0.3));
      dummy.updateMatrix();
      balloons.setMatrixAt(i, dummy.matrix);
      c.set(r.pick(balloonColors));
      balloons.setColorAt(i, c);
      this.balloonData.push({ x, y, z, s, phase: r.range(0, 10), speed: r.range(0.2, 0.6) });
    }
    balloons.instanceMatrix.needsUpdate = true;
    if (balloons.instanceColor) balloons.instanceColor.needsUpdate = true;
    balloons.frustumCulled = false;
    this.balloons = balloons;
    G.add(balloons);

    /* --- 星星挂饰（挂在塔楼与长廊上） --- */
    const starGeo = new THREE.OctahedronGeometry(0.22, 0);
    const starMat = createToonMaterial({
      color: '#FFE4A0', emissive: '#FFD700', emissiveIntensity: 0.5, rimIntensity: 0.2,
    });
    const starCount = 40;
    const stars = new THREE.InstancedMesh(starGeo, starMat, starCount);
    this.starDecoData = [];
    for (let i = 0; i < starCount; i++) {
      const a = r.range(0, TAU);
      const rad = r.range(14, 24);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const y = r.range(2.4, 7.5);
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(r.range(0.7, 1.5));
      dummy.rotation.set(r.range(0, TAU), r.range(0, TAU), r.range(0, TAU));
      dummy.updateMatrix();
      stars.setMatrixAt(i, dummy.matrix);
      this.starDecoData.push({ x, y, z, phase: r.range(0, 10), speed: r.range(0.4, 1.2) });
    }
    stars.instanceMatrix.needsUpdate = true;
    stars.frustumCulled = false;
    this.starDeco = stars;
    G.add(stars);

    /* --- 中央庆典按钮 --- */
    this._buildCelebrationButton();
  }

  _buildCelebrationButton() {
    const G = this.group;
    const g = new THREE.Group();
    g.userData.noMerge = true;      // 按钮会随高亮缩放，需保持独立
    g.position.set(0, 0, -8);
    G.add(g);

    const baseMat = createToonMaterial({ color: '#E8E0EA', toonSteps: 2.2, rimIntensity: 0.2 });
    const ow = { width: 0.0011, color: '#7A3B52' };

    add(g, new THREE.CylinderGeometry(1.5, 1.8, 0.55, 32), baseMat, { pos: [0, 0.28, 0], outline: ow });
    add(g, new THREE.CylinderGeometry(1.35, 1.35, 0.18, 32), this.mat.gold, { pos: [0, 0.6, 0] });

    // 按钮本体（自发光，可用时变亮）
    this.buttonMat = createToonMaterial({
      color: this.palette.accent,
      toonSteps: 1.8,
      emissive: this.palette.gold,
      emissiveIntensity: 0.12,
      rimColor: '#FFF8F0',
      rimIntensity: 0.4,
    });
    const top = add(g, new THREE.CylinderGeometry(1.16, 1.16, 0.3, 32), this.buttonMat, {
      pos: [0, 0.84, 0], outline: ow,
    });
    add(g, new THREE.TorusGeometry(1.2, 0.11, 10, 36), this.mat.gold, {
      pos: [0, 0.86, 0], rot: [Math.PI / 2, 0, 0],
    });

    // 顶部的星形标记
    const markMat = createToonMaterial({
      color: '#FFF8F0', emissive: '#FFF8F0', emissiveIntensity: 0.3, rimIntensity: 0,
    });
    const mark = add(g, new THREE.OctahedronGeometry(0.38, 0), markMat, { pos: [0, 1.12, 0] });

    this.buttonGlow = createGlowSprite({ color: this.palette.gold, size: 5.0, opacity: 0.16, alpha: '0.85' });
    this.buttonGlow.position.y = 1.0;
    g.add(this.buttonGlow);

    // 光柱（可用时升起）
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.palette.gold),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.buttonBeam = add(g, new THREE.CylinderGeometry(1.1, 1.5, 9, 24, 1, true), beamMat, {
      pos: [0, 5.2, 0],
    });

    this.celebrationButton = {
      group: g,
      mesh: top,
      mark,
      mat: this.buttonMat,
      glow: this.buttonGlow,
      beam: this.buttonBeam,
      enabled: false,
      pressAmount: 0,
      position: new THREE.Vector3(0, 1.0, -8),
      radius: 2.0,
    };
  }

  /* ================================================================
     对外接口
     ================================================================ */

  /** 大门开合（0 关闭 / 1 完全打开） */
  setGateOpen(amount) {
    this.gate.target = clamp(amount, 0, 1);
  }

  /** 立即设置门的状态（用于读档恢复） */
  setGateOpenImmediate(amount) {
    this.gate.openAmount = amount;
    this.gate.target = amount;
    this._applyGate();
  }

  _applyGate() {
    const a = this.gate.openAmount;
    // 双开门向外旋转 105°
    this.gate.leftPivot.rotation.y = a * 1.83;
    this.gate.rightPivot.rotation.y = -a * 1.83;
  }

  /** 点亮前 n 扇窗 */
  setWindowLitCount(n) {
    if (this._windowOverride) n = this.windows.length;
    this.windows.forEach((w, i) => {
      w.lit = i < n;
    });
  }

  /** 庆典期间强制全部窗户亮起 */
  setWindowOverride(v) {
    this._windowOverride = !!v;
    if (v) this.setWindowLitCount(this.windows.length);
  }

  /** 庆典按钮是否可用 */
  setCelebrationEnabled(v) {
    this.celebrationButton.enabled = v;
  }

  /** 按下庆典按钮的动效 */
  pressCelebrationButton() {
    this.celebrationButton.pressAmount = 1;
  }

  /** 打开惊喜礼盒 */
  openGiftBox() {
    if (this._giftOpened) return;
    this._giftOpened = true;
    this.giftOpenProgress = 0;
  }

  /** 吹灭所有蛋糕蜡烛 */
  blowCakeCandles() {
    for (const c of this.cakeCandles) c.blown = true;
  }

  /** 水面涟漪脉冲（许愿成功时调用） */
  pulseWater() {
    this.waterPulse = 1.0;
  }

  /** 重新开始：把城堡恢复到初始状态 */
  resetState() {
    this.setGateOpenImmediate(0);
    this._giftOpened = false;
    this.giftOpenProgress = 0;
    if (this.bigGift) {
      this.bigGift.lid.position.y = this.bigGift.size / 2;
      this.bigGift.lid.rotation.z = 0;
      this.bigGift.lid.rotation.y = 0;
    }
    for (const c of this.candleFlames) {
      c.blown = false;
      c.flameIntensity = 1;
    }
    this.setWindowOverride(false);
    this.setWindowLitCount(0);
    this.setCelebrationEnabled(false);
    this.waterPulse = 0;
    this.waterUniforms.uPulse.value = 0;
  }

  /* ================================================================
     每帧更新
     ================================================================ */
  update(dt, elapsed) {
    /* --- 大门 --- */
    if (Math.abs(this.gate.target - this.gate.openAmount) > 0.001) {
      this.gate.openAmount += (this.gate.target - this.gate.openAmount) * Math.min(1, dt * 2.4);
      this._applyGate();
    }

    /* --- 旗帜飘动 --- */
    for (const item of this.animated) {
      if (item.type === 'flag') {
        const pos = item.mesh.geometry.attributes.position;
        const base = item.mesh.userData.basePos;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3];
          const y = base[i * 3 + 1];
          const wave = Math.sin(elapsed * 3.2 + x * 2.4) * 0.16 * (0.5 + (x + 0.95) * 0.55);
          pos.setZ(i, wave);
          pos.setY(i, y + Math.sin(elapsed * 2.4 + x * 1.6) * 0.03);
        }
        pos.needsUpdate = true;
      } else if (item.type === 'banner') {
        item.mesh.rotation.z = Math.sin(elapsed * 0.7) * 0.014;
      }
    }

    /* --- 窗户点亮动画 --- */
    for (const w of this.windows) {
      const target = w.lit ? 0.9 : 0.0;
      w.intensity += (target - w.intensity) * Math.min(1, dt * 1.6);
      w.mat.uniforms.uEmissiveIntensity.value = w.intensity;
      w.mat.uniforms.uBaseColor.value.lerp(
        this._tmpColor.set(w.lit ? '#FFE9A0' : '#4A4260'),
        Math.min(1, dt * 1.2)
      );
      if (w.glow) w.glow.material.opacity = w.intensity * 0.55;
    }

    /* --- 吊灯呼吸 --- */
    const chandelierLit = this.windows.filter((w) => w.lit).length / Math.max(1, this.windows.length);
    for (const b of this.chandelierBulbs) {
      b.mat.uniforms.uEmissiveIntensity.value = 0.15 + chandelierLit * 1.1;
      b.glow.material.opacity = 0.12 + chandelierLit * 0.55;
    }

    /* --- 水流 --- */
    this.waterUniforms.uTime.value = elapsed;
    if (this.waterPulse > 0) {
      this.waterPulse = Math.max(0, this.waterPulse - dt * 0.55);
      this.waterUniforms.uPulse.value = Math.sin((1 - this.waterPulse) * Math.PI);
    } else {
      this.waterUniforms.uPulse.value = 0;
    }

    /* --- 池中浮星 --- */
    for (const s of this.poolStars) {
      s.mesh.position.y = 0.92 + Math.sin(elapsed * 1.4 + s.phase) * 0.09;
      s.mesh.rotation.y += dt * 0.8;
      s.mesh.rotation.x += dt * 0.5;
    }

    /* --- 蜡烛火焰 --- */
    for (const c of this.candleFlames) {
      const target = c.blown ? 0 : 1;
      c.flameIntensity = (c.flameIntensity ?? 1) + (target - (c.flameIntensity ?? 1)) * Math.min(1, dt * 2.6);
      const k = c.flameIntensity;
      const flick = 0.85 + Math.sin(elapsed * 12 + c.phase) * 0.12 + Math.sin(elapsed * 27 + c.phase * 2) * 0.06;
      c.flame.visible = k > 0.02;
      c.flame.scale.set(k, k * flick, k);
      c.flameMat.uniforms.uEmissiveIntensity.value = k * flick * 1.15;
      c.glow.visible = c.flame.visible;
      c.glow.material.opacity = k * 0.62 * flick;
      c.glow.scale.setScalar(0.85 + flick * 0.25);
    }

    /* --- 惊喜礼盒开盖 --- */
    if (this._giftOpened) {
      this.giftOpenProgress = Math.min(1, (this.giftOpenProgress || 0) + dt * 0.9);
      const p = this.giftOpenProgress;
      const e = 1 - Math.pow(1 - p, 3);
      if (this.bigGift) {
        this.bigGift.lid.position.y = this.bigGift.size / 2 + e * 2.6;
        this.bigGift.lid.rotation.z = e * 0.7;
        this.bigGift.lid.rotation.y = e * 0.35;
        if (this.bigGift.glow) {
          this.bigGift.glow.material.opacity = 0.35 + Math.sin(elapsed * 3) * 0.12 + e * 0.4;
        }
      }
    } else if (this.bigGift?.glow) {
      // 未被打开时呼吸发光，吸引注意
      this.bigGift.glow.material.opacity = 0.28 + Math.sin(elapsed * 2.1) * 0.14;
      this.bigGift.bodyMat.uniforms.uEmissiveIntensity.value =
        0.16 + Math.sin(elapsed * 2.1) * 0.1;
    }

    /* --- 庆典按钮 --- */
    const btn = this.celebrationButton;
    const pulse = btn.enabled ? 0.55 + Math.sin(elapsed * 3.4) * 0.22 : 0.1;
    btn.mat.uniforms.uEmissiveIntensity.value = pulse;
    btn.glow.material.opacity = btn.enabled ? 0.22 + Math.sin(elapsed * 3.4) * 0.1 : 0.07;
    btn.beam.material.opacity = btn.enabled ? 0.05 + Math.sin(elapsed * 2.2) * 0.025 : 0;
    btn.mark.rotation.y += dt * (btn.enabled ? 1.6 : 0.4);
    if (btn.pressAmount > 0) {
      btn.pressAmount = Math.max(0, btn.pressAmount - dt * 1.6);
      const sink = Math.sin(btn.pressAmount * Math.PI) * 0.18;
      btn.mesh.position.y = 0.84 - sink;
      btn.mark.position.y = 1.12 - sink;
    }

    /* --- 气球与星星挂饰漂浮 --- */
    const dummy = new THREE.Object3D();
    if (this.balloons) {
      const c = new THREE.Color();
      for (let i = 0; i < this.balloonData.length; i++) {
        const d = this.balloonData[i];
        dummy.position.set(
          d.x + Math.sin(elapsed * d.speed * 0.3 + d.phase) * 0.9,
          d.y + Math.sin(elapsed * d.speed + d.phase) * 0.5,
          d.z + Math.cos(elapsed * d.speed * 0.26 + d.phase) * 0.9
        );
        dummy.scale.set(d.s, d.s * 1.18, d.s);
        dummy.rotation.set(
          Math.sin(elapsed * 0.4 + d.phase) * 0.14,
          Math.sin(elapsed * 0.2 + d.phase) * 0.3,
          Math.sin(elapsed * 0.34 + d.phase) * 0.12
        );
        dummy.updateMatrix();
        this.balloons.setMatrixAt(i, dummy.matrix);
      }
      this.balloons.instanceMatrix.needsUpdate = true;
    }
    if (this.starDeco) {
      for (let i = 0; i < this.starDecoData.length; i++) {
        const d = this.starDecoData[i];
        dummy.position.set(
          d.x,
          d.y + Math.sin(elapsed * d.speed + d.phase) * 0.35,
          d.z + Math.cos(elapsed * d.speed * 0.7 + d.phase) * 0.3
        );
        dummy.scale.setScalar(0.8 + Math.sin(elapsed * d.speed * 1.4 + d.phase) * 0.25);
        dummy.rotation.set(elapsed * d.speed * 0.4, elapsed * d.speed * 0.6, 0);
        dummy.updateMatrix();
        this.starDeco.setMatrixAt(i, dummy.matrix);
      }
      this.starDeco.instanceMatrix.needsUpdate = true;
    }
  }

  /* ================================================================
     进度驱动
     ================================================================ */
  setProgress(t) {
    const k = clamp(t, 0, 1);

    // 窗户按比例点亮
    const litCount = Math.round(this.windows.length * Math.min(1, k * 1.15));
    this.setWindowLitCount(litCount);

    // 塔顶与装饰发光增强
    this.mat.gold.uniforms.uEmissiveIntensity.value = 0.1 + k * 0.28;
    this.mat.roof.uniforms.uRimIntensity.value = 0.18 + k * 0.35;

    // 墙面随进度提亮
    const cold = new THREE.Color('#B7A2B4');
    const warm = new THREE.Color(this.palette.castleWall);
    this.mat.wall.uniforms.uBaseColor.value.copy(cold).lerp(warm, 0.2 + k * 0.8);

    // 水面反光
    this.waterUniforms.uGlow.value = k * 0.28;
    this.waterUniforms.uColorShallow.value
      .set('#BEE3F0')
      .lerp(new THREE.Color('#FFE4A0'), k);
  }

  /**
   * 大厅遮挡处理：相机进入大厅内部时隐藏屋顶
   * （自定义项目未使用实时阴影，这一步能避免"隔墙看人"的问题）
   */
  updateOccluders(cameraPosition, playerPosition) {
    const insideHall =
      playerPosition.x > this.hallBounds.minX &&
      playerPosition.x < this.hallBounds.maxX &&
      playerPosition.z > this.hallBounds.minZ &&
      playerPosition.z < this.hallBounds.maxZ &&
      playerPosition.y < this.hallBounds.height;

    const visible = !insideHall;
    if (this.hallRoof.visible !== visible) {
      this.hallRoof.visible = visible;
      // 屋顶隐藏时也要同步移出地面检测，否则角色会站到"隐形屋顶"上
      const i = this.world.ground.indexOf(this.hallRoof);
      if (!visible && i >= 0) {
        this.world.groundSavedIndex = i;
        this.world.ground.splice(i, 1);
      } else if (visible && this.world.groundSavedIndex !== undefined) {
        this.world.ground.splice(this.world.groundSavedIndex, 0, this.hallRoof);
        this.world.groundSavedIndex = undefined;
      }
    }
  }
}
