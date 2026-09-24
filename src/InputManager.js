import { clamp } from './utils/math.js';

/**
 * 统一输入管理
 * 键盘 / 鼠标 / 触摸 / 虚拟摇杆，全部收敛到同一套接口：
 *   getMoveVector() / consumeJump() / consumeInteract() / isSprinting()
 * 交互与跳跃都使用「边缘触发」——按下的那一瞬间只触发一次。
 */
export class InputManager {
  constructor(canvas, { onAction = () => {} } = {}) {
    this.canvas = canvas;
    this.onAction = onAction;

    this.enabled = true;
    this.move = { x: 0, z: 0 };

    /* 键盘状态 */
    this.keys = new Set();
    /* 边缘触发标记 */
    this._jumpPressed = false;
    this._interactPressed = false;

    /* 鼠标 / 触摸拖拽 */
    this.pointers = new Map();
    this.dragging = false;
    this.lastPinchDistance = 0;

    /* 摇杆 */
    this.joystick = { active: false, id: null, x: 0, y: 0, magnitude: 0 };

    this._bind();
  }

  /* ================================================================ */
  _bind() {
    /* ---------------- 键盘 ---------------- */
    this._onKeyDown = (e) => {
      const code = e.code;

      // 输入框聚焦时不拦截
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }

      if (!this.keys.has(code)) {
        // 边缘触发
        if (code === 'Space') this._jumpPressed = true;
        if (code === 'KeyE' || code === 'Enter') this._interactPressed = true;

        // 数字快捷键
        const num = code.match(/^Digit([1-5])$/);
        if (num) {
          const actions = ['book', 'wish', 'gift', 'celebrate', 'settings'];
          this.onAction(actions[Number(num[1]) - 1], 'key');
        }
        if (code === 'Escape') this.onAction('pause', 'key');
      }
      this.keys.add(code);
    };

    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };

    this._onBlur = () => {
      this.keys.clear();
      this.move.x = 0;
      this.move.z = 0;
      this.joystick.active = false;
      this.joystick.x = 0;
      this.joystick.y = 0;
      this.joystick.magnitude = 0;
      this._syncKnob();
    };

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    /* ---------------- 鼠标滚轮 ---------------- */
    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.onAction('zoom', { delta: e.deltaY });
    };
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });

    /* ---------------- 指针（鼠标 + 触摸统一） ---------------- */
    this._onPointerDown = (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (this.pointers.size === 1) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this._downX = e.clientX;
        this._downY = e.clientY;
        this._downTime = performance.now();
        this._movedDistance = 0;
      } else if (this.pointers.size === 2) {
        this.dragging = false;
        this.lastPinchDistance = this._pinchDistance();
      }
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    this._onPointerMove = (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (prev) {
        prev.x = e.clientX;
        prev.y = e.clientY;
      }

      if (this.pointers.size === 2) {
        const d = this._pinchDistance();
        if (this.lastPinchDistance > 0) {
          const delta = (this.lastPinchDistance - d) * 2.2;
          if (Math.abs(delta) > 0.5) this.onAction('zoom', { delta });
        }
        this.lastPinchDistance = d;
        return;
      }

      if (!this.dragging || !this.enabled) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this._movedDistance = (this._movedDistance || 0) + Math.abs(dx) + Math.abs(dy);
      if (Math.abs(dx) + Math.abs(dy) > 0.4) {
        this.onAction('rotate', { dx, dy });
      }
    };

    this._onPointerUp = (e) => {
      // 轻点（没有拖拽）→ 视为一次拾取
      if (
        this.pointers.has(e.pointerId) &&
        this.pointers.size === 1 &&
        (this._movedDistance || 0) < 7 &&
        performance.now() - (this._downTime || 0) < 420
      ) {
        this._tap = { x: e.clientX, y: e.clientY };
      }

      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.lastPinchDistance = 0;
      if (this.pointers.size === 0) this.dragging = false;
      try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);

    /* ---------------- 上下文菜单（长按不弹出） ---------------- */
    this._onContext = (e) => e.preventDefault();
    this.canvas.addEventListener('contextmenu', this._onContext);

    /* ---------------- 虚拟摇杆 ---------------- */
    this._bindJoystick();

    /* ---------------- 移动端按钮 ---------------- */
    const jumpBtn = document.getElementById('jumpBtn');
    if (jumpBtn) {
      this._onJumpBtn = (e) => { e.preventDefault(); this._jumpPressed = true; };
      jumpBtn.addEventListener('pointerdown', this._onJumpBtn);
    }
    const interactBtn = document.getElementById('interactBtn');
    if (interactBtn) {
      this._onInteractBtn = (e) => { e.preventDefault(); this._interactPressed = true; };
      interactBtn.addEventListener('pointerdown', this._onInteractBtn);
    }
  }

  _pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  _bindJoystick() {
    const root = document.getElementById('joystick');
    const base = root?.querySelector('.joy-base');
    const knob = document.getElementById('joyKnob');
    if (!base || !knob) return;
    this.knob = knob;
    this.joyBase = base;

    const MAX_R = 46;

    const updateFromEvent = (e) => {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > MAX_R) {
        dx = (dx / len) * MAX_R;
        dy = (dy / len) * MAX_R;
      }
      this.joystick.x = dx / MAX_R;
      this.joystick.y = dy / MAX_R;
      this.joystick.magnitude = Math.min(1, len / MAX_R);
      this._syncKnob();
    };

    this._joyDown = (e) => {
      e.preventDefault();
      this.joystick.active = true;
      this.joystick.id = e.pointerId;
      // 某些浏览器（或合成事件）会拒绝 setPointerCapture，忽略即可
      try { base.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
      updateFromEvent(e);
    };

    this._joyMove = (e) => {
      if (!this.joystick.active || e.pointerId !== this.joystick.id) return;
      e.preventDefault();
      updateFromEvent(e);
    };

    this._joyUp = (e) => {
      if (e.pointerId !== undefined && e.pointerId !== this.joystick.id) return;
      this.joystick.active = false;
      this.joystick.id = null;
      this.joystick.x = 0;
      this.joystick.y = 0;
      this.joystick.magnitude = 0;
      this._syncKnob();
    };

    base.addEventListener('pointerdown', this._joyDown, { passive: false });
    window.addEventListener('pointermove', this._joyMove, { passive: false });
    window.addEventListener('pointerup', this._joyUp);
    window.addEventListener('pointercancel', this._joyUp);
  }

  _syncKnob() {
    if (!this.knob) return;
    const k = this.joystick;
    this.knob.style.transform = `translate(${k.x * 33}px, ${k.y * 33}px)`;
    this.knob.style.opacity = k.active ? '1' : '0.9';
  }

  /* ================================================================ */
  /** 计算移动向量（键盘 + 摇杆合并），返回 {x, z}，长度 0..1 */
  getMoveVector(out = { x: 0, z: 0 }) {
    let x = 0;
    let z = 0;

    if (this.enabled) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;

      if (this.joystick.active) {
        // 摇杆的 -y 是屏幕上方 = 前进
        x += this.joystick.x;
        z += this.joystick.y;
      }
    }

    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    out.x = x;
    out.z = z;
    return out;
  }

  /** 是否按住冲刺（Shift 或 摇杆推到底） */
  isSprinting() {
    if (!this.enabled) return false;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) return true;
    return this.joystick.active && this.joystick.magnitude > 0.86;
  }

  /** 消费一次跳跃（边缘触发） */
  consumeJump() {
    if (!this.enabled) return false;
    if (this._jumpPressed) {
      this._jumpPressed = false;
      return true;
    }
    return false;
  }

  /** 消费一次交互（边缘触发） */
  consumeInteract() {
    if (!this.enabled) return false;
    if (this._interactPressed) {
      this._interactPressed = false;
      return true;
    }
    return false;
  }

  /** 消费一次"点击世界"（用于点击拾取交互） */
  consumeTap() {
    const t = this._tap;
    this._tap = null;
    return t;
  }

  /** 允许/禁用输入（弹窗打开时禁用） */
  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.move.x = 0;
      this.move.z = 0;
      this.keys.clear();
      this.joystick.active = false;
      this.joystick.x = 0;
      this.joystick.y = 0;
      this.joystick.magnitude = 0;
      this._syncKnob();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas.removeEventListener('contextmenu', this._onContext);
    this.canvas.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('pointermove', this._joyMove);
    window.removeEventListener('pointerup', this._joyUp);
    window.removeEventListener('pointercancel', this._joyUp);
  }
}
