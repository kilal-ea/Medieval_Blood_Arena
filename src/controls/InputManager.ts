import type { KeyBindings } from '../core/types';

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  leftHand: 'KeyQ',
  rightHand: 'KeyE',
  jump: 'Space',
  recover: 'KeyR',
  pause: 'Tab',
};

export interface InputSnapshot {
  moveX: number; // -1..1 (right positive)
  moveY: number; // -1..1 (forward positive)
  yawDelta: number;
  pitchDelta: number;
  swingX: number;
  swingY: number;
  attackHeld: boolean;
  defendHeld: boolean;
  thrustJustPressed: boolean;
  attackJustPressed: boolean;
  jumpJustPressed: boolean;
  leftHandJustPressed: boolean;
  rightHandJustPressed: boolean;
  recoverJustPressed: boolean;
}

export class InputManager {
  private heldKeys = new Set<string>();
  private keyBindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
  private sensitivity = 1.0;

  private attackHeldMouse = false;
  private defendHeldMouse = false;
  private attackJustPressed = false;
  private thrustJustPressed = false;
  private jumpJustPressed = false;
  private leftHandJustPressed = false;
  private rightHandJustPressed = false;
  private recoverJustPressed = false;

  private yawDelta = 0;
  private pitchDelta = 0;
  private swingX = 0;
  private swingY = 0;
  private lastAttackClickTime = 0;

  // Mobile virtual controls state
  public mobileMoveX = 0;
  public mobileMoveY = 0;
  private mobileAttackHeld = false;
  private mobileDefendHeld = false;

  public enabled = false;
  public isPointerLocked = false;
  private canvas: HTMLCanvasElement | null = null;
  private onPauseCallback: (() => void) | null = null;

  constructor() {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onBlur = this.onBlur.bind(this);
    this.onPointerLockChange = this.onPointerLockChange.bind(this);
  }

  public attach(canvas: HTMLCanvasElement, onPause: () => void): void {
    this.canvas = canvas;
    this.onPauseCallback = onPause;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  public setConfig(bindings: KeyBindings, sensitivity: number): void {
    this.keyBindings = { ...bindings };
    this.sensitivity = sensitivity;
  }

  public setEnabled(active: boolean): void {
    this.enabled = active;
    if (!active) {
      this.clearHeld();
      if (document.pointerLockElement === this.canvas) {
        document.exitPointerLock();
      }
    }
  }

  public requestPointerLock(): void {
    if (this.canvas && this.enabled && document.pointerLockElement !== this.canvas) {
      try {
        this.canvas.requestPointerLock();
      } catch {
        // Pointer lock may not be supported on mobile/embedded browsers
      }
    }
  }

  public clearHeld(): void {
    this.heldKeys.clear();
    this.attackHeldMouse = false;
    this.defendHeldMouse = false;
    this.mobileAttackHeld = false;
    this.mobileDefendHeld = false;
    this.mobileMoveX = 0;
    this.mobileMoveY = 0;
    this.yawDelta = 0;
    this.pitchDelta = 0;
  }

  // Mobile button triggers
  public setMobileAttack(held: boolean): void {
    if (held && !this.mobileAttackHeld) {
      this.attackJustPressed = true;
      const now = performance.now();
      if (now - this.lastAttackClickTime < 280) {
        this.thrustJustPressed = true;
      }
      this.lastAttackClickTime = now;
    }
    this.mobileAttackHeld = held;
  }

  public setMobileDefend(held: boolean): void {
    this.mobileDefendHeld = held;
  }

  public addTouchCameraDelta(dx: number, dy: number): void {
    const scale = 0.0045 * this.sensitivity;
    if (this.mobileAttackHeld) {
      this.swingX = Math.max(-1, Math.min(1, this.swingX + dx * 0.012));
      this.swingY = Math.max(-1, Math.min(1, this.swingY - dy * 0.012));
    } else {
      this.yawDelta -= dx * scale;
      this.pitchDelta -= dy * scale;
    }
  }

  public triggerMobileJump(): void {
    this.jumpJustPressed = true;
  }
  public triggerMobileLeftHand(): void {
    this.leftHandJustPressed = true;
  }
  public triggerMobileRightHand(): void {
    this.rightHandJustPressed = true;
  }
  public triggerMobileRecover(): void {
    this.recoverJustPressed = true;
  }
  public triggerMobileThrust(): void {
    this.thrustJustPressed = true;
  }

  public consumeSnapshot(dt: number): InputSnapshot {
    const fwd = this.heldKeys.has(this.keyBindings.moveForward) ? 1 : 0;
    const back = this.heldKeys.has(this.keyBindings.moveBackward) ? 1 : 0;
    const left = this.heldKeys.has(this.keyBindings.moveLeft) ? 1 : 0;
    const right = this.heldKeys.has(this.keyBindings.moveRight) ? 1 : 0;

    let moveX = right - left + this.mobileMoveX;
    let moveY = fwd - back + this.mobileMoveY;
    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    }

    const attackHeld = this.attackHeldMouse || this.mobileAttackHeld;
    const defendHeld = this.defendHeldMouse || this.mobileDefendHeld;

    // Gentle spring return on swing cursor when not actively attacking
    if (!attackHeld) {
      const decay = Math.exp(-8 * dt);
      this.swingX *= decay;
      this.swingY *= decay;
    }

    const snap: InputSnapshot = {
      moveX,
      moveY,
      yawDelta: this.yawDelta,
      pitchDelta: this.pitchDelta,
      swingX: this.swingX,
      swingY: this.swingY,
      attackHeld,
      defendHeld,
      thrustJustPressed: this.thrustJustPressed,
      attackJustPressed: this.attackJustPressed,
      jumpJustPressed: this.jumpJustPressed,
      leftHandJustPressed: this.leftHandJustPressed,
      rightHandJustPressed: this.rightHandJustPressed,
      recoverJustPressed: this.recoverJustPressed,
    };

    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.thrustJustPressed = false;
    this.attackJustPressed = false;
    this.jumpJustPressed = false;
    this.leftHandJustPressed = false;
    this.rightHandJustPressed = false;
    this.recoverJustPressed = false;

    return snap;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === this.keyBindings.pause || e.code === 'Escape') {
      if (this.enabled) {
        e.preventDefault();
        this.onPauseCallback?.();
      }
      return;
    }

    if (!this.enabled) return;

    if (e.code === this.keyBindings.jump) {
      e.preventDefault();
      if (!e.repeat) this.jumpJustPressed = true;
    } else if (e.code === this.keyBindings.leftHand && !e.repeat) {
      this.leftHandJustPressed = true;
    } else if (e.code === this.keyBindings.rightHand && !e.repeat) {
      this.rightHandJustPressed = true;
    } else if (e.code === this.keyBindings.recover && !e.repeat) {
      this.recoverJustPressed = true;
    } else if (e.code === 'KeyF' && !e.repeat) {
      this.thrustJustPressed = true;
    }

    this.heldKeys.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.heldKeys.delete(e.code);
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.enabled) return;

    // Request pointer lock on desktop canvas click
    if (!this.isPointerLocked && e.button === 0) {
      this.requestPointerLock();
    }

    if (e.button === 0) {
      this.attackHeldMouse = true;
      this.attackJustPressed = true;
      const now = performance.now();
      if (now - this.lastAttackClickTime < 260) {
        this.thrustJustPressed = true;
      }
      this.lastAttackClickTime = now;
    } else if (e.button === 2) {
      this.defendHeldMouse = true;
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.attackHeldMouse = false;
    if (e.button === 2) this.defendHeldMouse = false;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.enabled) return;
    if (!this.isPointerLocked && !this.attackHeldMouse && !this.defendHeldMouse) return;

    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    const sens = 0.0024 * this.sensitivity;

    if (this.attackHeldMouse) {
      // Steer physical sword arc directly with mouse movement!
      this.swingX = Math.max(-1, Math.min(1, this.swingX + dx * 0.0075 * this.sensitivity));
      this.swingY = Math.max(-1, Math.min(1, this.swingY - dy * 0.0075 * this.sensitivity));
      // Subtle camera follow while swinging
      this.yawDelta -= dx * sens * 0.35;
    } else {
      this.yawDelta -= dx * sens;
      this.pitchDelta -= dy * sens;
    }
  }

  private onContextMenu(e: MouseEvent): void {
    if (this.enabled) e.preventDefault();
  }

  private onPointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
  }

  private onBlur(): void {
    this.clearHeld();
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.onMouseDown);
      this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    }
  }
}
