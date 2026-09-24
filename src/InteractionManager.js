import * as THREE from 'three';

/**
 * 交互管理器
 * 维护所有「可交互物体」的注册表，每帧挑出离角色最近且在触发半径内的一个作为当前目标，
 * 驱动高亮与屏幕提示；支持按键（E）与点击/触摸两种触发方式。
 */
export class InteractionManager {
  constructor({ character, camera, input, ui, world }) {
    this.character = character;
    this.camera = camera;
    this.input = input;
    this.ui = ui;
    this.world = world;

    this.items = [];
    this.current = null;
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._tmp = new THREE.Vector3();
    this._pointer = new THREE.Vector2();
    this._hasPointer = false;
  }

  /* ================================================================ */
  /**
   * 注册一个可交互物体
   * @param {object} item
   *   id          唯一标识
   *   kind        类型（blessing / wish / gift / celebrate / candle / terrace / door）
   *   position    THREE.Vector3 或返回 Vector3 的函数
   *   radius      触发半径（水平距离）
   *   hint        提示文案（函数或字符串）
   *   enabled     () => boolean，是否当前可用
   *   onInteract  () => void
   *   objects     参与点击拾取的网格数组
   *   onHighlight (bool) => void，自定义高亮
   *   priority    同距离下优先（默认 0）
   */
  register(item) {
    const entry = {
      enabled: () => true,
      hint: '',
      objects: [],
      priority: 0,
      highlight: 1.0,
      _hl: 0,
      ...item,
    };
    this.items.push(entry);
    return entry;
  }

  unregister(id) {
    const i = this.items.findIndex((it) => it.id === id);
    if (i >= 0) this.items.splice(i, 1);
    if (this.current?.id === id) this.current = null;
  }

  get(id) {
    return this.items.find((it) => it.id === id) || null;
  }

  /* ================================================================ */
  _positionOf(item, out = this._tmp) {
    if (typeof item.position === 'function') return out.copy(item.position());
    return out.copy(item.position);
  }

  update(dt, elapsed) {
    const pos = this.character.position;
    let best = null;
    let bestScore = Infinity;

    for (const item of this.items) {
      item._hl += ((item === this.current ? 1 : 0) - item._hl) * Math.min(1, dt * 8);

      if (!item.enabled()) continue;

      const p = this._positionOf(item);
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const d = Math.hypot(dx, dz);
      const dy = Math.abs(p.y - pos.y);

      if (d > item.radius || dy > (item.maxDy ?? 4.2)) continue;

      // 距离越近越优先；也可以按优先级加权
      const score = d - (item.priority || 0) * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }

    if (best !== this.current) {
      // 取消旧目标高亮
      if (this.current) this.current.onHighlight?.(false);
      this.current = best;
      if (best) {
        best.onHighlight?.(true);
        this.ui.showInteractHint(this._hintOf(best));
      } else {
        this.ui.hideInteractHint();
      }
    } else if (best) {
      // 文案可能因状态变化而改变
      const hint = this._hintOf(best);
      if (this.ui.el.interactText?.textContent !== hint) this.ui.showInteractHint(hint);
    }

    // 平滑高亮系数（供物体做缩放/发光）
    for (const item of this.items) {
      item.highlightValue = item._hl;
    }
  }

  _hintOf(item) {
    const h = typeof item.hint === 'function' ? item.hint() : item.hint;
    return h || '';
  }

  /* ================================================================ */
  /** 按键触发 */
  tryInteract() {
    if (!this.current) return false;
    const item = this.current;
    item.onInteract?.();
    return true;
  }

  /** 直接触发某个 id */
  trigger(id) {
    const item = this.get(id);
    if (!item || !item.enabled()) return false;
    item.onInteract?.();
    return true;
  }

  /* ================================================================ */
  /** 点击/触摸拾取（从相机穿过指针发射射线） */
  handleTap(x, y) {
    const rect = this.camera.userData?.viewport || {
      width: window.innerWidth, height: window.innerHeight,
    };
    this._ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);

    // 收集所有可交互网格
    const targets = [];
    for (const item of this.items) {
      if (!item.enabled()) continue;
      for (const o of item.objects) targets.push({ object: o, item });
    }
    if (!targets.length) return false;

    const meshes = targets.map((t) => t.object);
    const hits = this._ray.intersectObjects(meshes, true);
    if (!hits.length) return false;

    // 找到被击中网格所属的交互项（考虑子对象）
    let hitItem = null;
    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        const found = targets.find((t) => t.object === node);
        if (found) { hitItem = found.item; break; }
        node = node.parent;
      }
      if (hitItem) {
        // 距离检查：太远不允许
        const p = this._positionOf(hitItem);
        const d = Math.hypot(p.x - this.character.position.x, p.z - this.character.position.z);
        if (d > hitItem.radius * 1.7) hitItem = null;
        break;
      }
    }

    if (!hitItem) return false;
    hitItem.onInteract?.();
    return true;
  }

  /** 清空（重新开始时） */
  clear() {
    if (this.current) this.current.onHighlight?.(false);
    this.items = [];
    this.current = null;
    this.ui.hideInteractHint();
  }
}
