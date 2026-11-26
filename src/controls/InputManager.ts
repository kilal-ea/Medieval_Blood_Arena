import type { KeyBindings } from '../core/types';
import { CONTROL_TUNING } from './ControlTuning';

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
  swingSpeed: number;
  weaponRoll: number;
  weaponPitchOffset: number;
  weaponManipActive: boolean;
  guardX: number;
  guardY: number;
  attackHeld: boolean;
  defendHeld: boolean;
  thrustJustPressed: boolean;
  attackJustPressed: boolean;
  attackQuickTap: boolean;
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
  private middleHeldMouse = false;
  private weaponFocusToggled = false;

  private attackJustPressed = false;
  private attackQuickTap = false;
  private attackDownTimeMs = 0;
  private attackDragPx = 0;
  private weaponSettleHoldTimer = 0;
  private thrustJustPressed = false;
  private jumpJustPressed = false;
  private leftHandJustPressed = false;
  private rightHandJustPressed = false;
  private recoverJustPressed = false;

  private yawDelta = 0;
  private pitchDelta = 0;
  private swingX = 0;
  private swingY = 0;
  private guardX = 0;
  private guardY = 0;
  private weaponRoll = 0;
  private weaponPitchOffset = 0;
  private rawSweepAccum = 0;
  private lastAttackClickTime = 0;
  private pointerWarmupEvents = 0;

  // Mobile virtual controls state
  public mobileMoveX = 0;
  public mobileMoveY = 0;
  private mobileAttackHeld = false;
  private mobileDefendHeld = false;
  public mobileWeaponFocus = false;

  public enabled = false;
  public isPointerLocked = false;
  private canvas: HTMLCanvasElement | null = null;
  private onPauseCallback: (() => void) | null = null;
  private attached = false;

  constructor() {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onBlur = this.onBlur.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.onPointerLockChange = this.onPointerLockChange.bind(this);
  }

  public attach(canvas: HTMLCanvasElement, onPause: () => void): void {
    this.canvas = canvas;
    this.onPauseCallback = onPause;
    this.attached = true;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
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
      if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
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
    this.middleHeldMouse = false;
    this.weaponFocusToggled = false;
    this.mobileAttackHeld = false;
    this.mobileDefendHeld = false;
    this.mobileWeaponFocus = false;
    this.mobileMoveX = 0;
    this.mobileMoveY = 0;
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.rawSweepAccum = 0;
    this.attackDragPx = 0;
    this.attackQuickTap = false;
  }

  // Mobile button triggers
  public setMobileAttack(held: boolean): void {
    if (held && !this.mobileAttackHeld) {
      this.attackJustPressed = true;
      this.attackDownTimeMs = performance.now();
      this.attackDragPx = 0;
      const now = this.attackDownTimeMs;
      if (now - this.lastAttackClickTime < 280) {
        this.thrustJustPressed = true;
      }
      this.lastAttackClickTime = now;
    } else if (!held && this.mobileAttackHeld) {
      const heldMs = performance.now() - this.attackDownTimeMs;
      if (heldMs < 190 && this.attackDragPx < 14) {
        this.attackQuickTap = true;
      }
      this.weaponSettleHoldTimer = 0.24;
    }
    this.mobileAttackHeld = held;
  }

  public setMobileDefend(held: boolean): void {
    this.mobileDefendHeld = held;
  }

  public setMobileWeaponFocus(active: boolean): void {
    this.mobileWeaponFocus = active;
  }

  public addTouchCameraDelta(dx: number, dy: number): void {
    const inp = CONTROL_TUNING.input;
    if (this.mobileWeaponFocus) {
      this.addTouchWeaponDelta(dx, dy);
      return;
    }
    const scale = inp.mobileCameraSensitivity * this.sensitivity;
    this.yawDelta -= dx * scale;
    this.pitchDelta -= dy * scale;
  }

  public addTouchWeaponDelta(dx: number, dy: number): void {
    const sens = CONTROL_TUNING.input.mobileWeaponSensitivity * this.sensitivity;
    this.attackDragPx += Math.hypot(dx, dy);
    this.swingX = Math.max(-1, Math.min(1, this.swingX + dx * sens));
    this.swingY = Math.max(-1, Math.min(1, this.swingY - dy * sens));
    this.rawSweepAccum += Math.hypot(dx, dy) * sens;
  }

  public addTouchGuardDelta(dx: number, dy: number): void {
    const sens = CONTROL_TUNING.input.mobileWeaponSensitivity * 0.8 * this.sensitivity;
    this.guardX = Math.max(-1, Math.min(1, this.guardX + dx * sens));
    this.guardY = Math.max(-1, Math.min(1, this.guardY - dy * sens));
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

  public setMobileJoystick(x: number, y: number): void {
    const deadzone = CONTROL_TUNING.input.mobileJoystickDeadzone;
    const mag = Math.hypot(x, y);
    if (mag < deadzone) {
      this.mobileMoveX = 0;
      this.mobileMoveY = 0;
      return;
    }
    // Smooth analog remap from [deadzone..1] -> [0..1]
    const norm = Math.min(1, (mag - deadzone) / (1 - deadzone));
    this.mobileMoveX = (x / mag) * norm;
    this.mobileMoveY = (y / mag) * norm;
  }

  public consumeSnapshot(dt: number): InputSnapshot {
    const deadzone = CONTROL_TUNING.input.mobileJoystickDeadzone;
    const fwd = this.heldKeys.has(this.keyBindings.moveForward) ? 1 : 0;
    const back = this.heldKeys.has(this.keyBindings.moveBackward) ? 1 : 0;
    const left = this.heldKeys.has(this.keyBindings.moveLeft) ? 1 : 0;
    const right = this.heldKeys.has(this.keyBindings.moveRight) ? 1 : 0;

    const joyX = Math.abs(this.mobileMoveX) < deadzone * 0.25 ? 0 : this.mobileMoveX;
    const joyY = Math.abs(this.mobileMoveY) < deadzone * 0.25 ? 0 : this.mobileMoveY;

    let moveX = right - left + joyX;
    let moveY = fwd - back + joyY;
    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    } else if (mag < 1e-4) {
      moveX = 0;
      moveY = 0;
    }

    const attackHeld = this.attackHeldMouse || this.mobileAttackHeld;
    const defendHeld = this.defendHeldMouse || this.mobileDefendHeld;
    const altHeld = this.heldKeys.has('AltLeft') || this.heldKeys.has('AltRight');
    const weaponManipActive =
      altHeld || this.middleHeldMouse || this.weaponFocusToggled || this.mobileWeaponFocus;

    if (attackHeld || weaponManipActive) {
      this.weaponSettleHoldTimer = 0.24;
    } else if (this.weaponSettleHoldTimer > 0) {
      this.weaponSettleHoldTimer = Math.max(0, this.weaponSettleHoldTimer - dt);
    } else {
      // Soft natural guard settle after a brief pause (never violently snaps back between cuts)
      const decay = Math.exp(-1.85 * dt);
      this.swingX *= decay;
      this.swingY *= decay;
      this.weaponPitchOffset *= decay;
      this.weaponRoll *= Math.exp(-0.85 * dt);
    }

    if (!defendHeld) {
      const guardDecay = Math.exp(-6.5 * dt);
      this.guardX *= guardDecay;
      this.guardY *= guardDecay;
    }

    const swingSpeed = dt > 1e-4 ? Math.min(2.5, (this.rawSweepAccum / Math.max(dt, 1 / 120)) * 0.14) : 0;

    const snap: InputSnapshot = {
      moveX,
      moveY,
      yawDelta: this.yawDelta,
      pitchDelta: this.pitchDelta,
      swingX: this.swingX,
      swingY: this.swingY,
      swingSpeed,
      weaponRoll: this.weaponRoll,
      weaponPitchOffset: this.weaponPitchOffset,
      weaponManipActive,
      guardX: this.guardX,
      guardY: this.guardY,
      attackHeld,
      defendHeld,
      thrustJustPressed: this.thrustJustPressed,
      attackJustPressed: this.attackJustPressed,
      attackQuickTap: this.attackQuickTap,
      jumpJustPressed: this.jumpJustPressed,
      leftHandJustPressed: this.leftHandJustPressed,
      rightHandJustPressed: this.rightHandJustPressed,
      recoverJustPressed: this.recoverJustPressed,
    };

    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.rawSweepAccum = 0;
    this.thrustJustPressed = false;
    this.attackJustPressed = false;
    this.attackQuickTap = false;
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
    } else if (e.code === 'KeyV' && !e.repeat) {
      this.weaponFocusToggled = !this.weaponFocusToggled;
    } else if (e.code === 'AltLeft' || e.code === 'AltRight') {
      e.preventDefault();
    }

    this.heldKeys.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.heldKeys.delete(e.code);
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.enabled) return;

    if (!this.isPointerLocked && (e.button === 0 || e.button === 1 || e.button === 2)) {
      this.requestPointerLock();
    }

    if (e.button === 0) {
      this.attackHeldMouse = true;
      this.attackJustPressed = true;
      this.attackDownTimeMs = performance.now();
      this.attackDragPx = 0;
      const now = this.attackDownTimeMs;
      if (now - this.lastAttackClickTime < 260) {
        this.thrustJustPressed = true;
      }
      this.lastAttackClickTime = now;
    } else if (e.button === 1) {
      e.preventDefault();
      this.middleHeldMouse = true;
    } else if (e.button === 2) {
      this.defendHeldMouse = true;
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      if (this.attackHeldMouse) {
        const heldMs = performance.now() - this.attackDownTimeMs;
        if (heldMs < 190 && this.attackDragPx < 14) {
          this.attackQuickTap = true;
        }
        this.weaponSettleHoldTimer = 0.24;
      }
      this.attackHeldMouse = false;
    }
    if (e.button === 1) this.middleHeldMouse = false;
    if (e.button === 2) this.defendHeldMouse = false;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.enabled) return;
    const altHeld = this.heldKeys.has('AltLeft') || this.heldKeys.has('AltRight');
    if (
      !this.isPointerLocked &&
      !this.attackHeldMouse &&
      !this.defendHeldMouse &&
      !this.middleHeldMouse &&
      !altHeld &&
      !this.weaponFocusToggled
    ) {
      return;
    }

    const inp = CONTROL_TUNING.input;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;

    // Discard OS pointer-lock transition warp spikes
    if (this.pointerWarmupEvents > 0) {
      this.pointerWarmupEvents--;
      return;
    }
    if (
      Math.abs(dx) > inp.pointerLockSpikeThresholdPx ||
      Math.abs(dy) > inp.pointerLockSpikeThresholdPx
    ) {
      return;
    }

    const camSens = inp.cameraMouseSensitivity * this.sensitivity;
    const wpnSens = inp.weaponMouseSensitivity * this.sensitivity;
    const rotSens = inp.weaponRotMouseSensitivity * this.sensitivity;

    if (this.middleHeldMouse) {
      // Direct wrist rotation (roll & pitch) with camera locked
      this.weaponRoll = Math.max(-Math.PI * 0.9, Math.min(Math.PI * 0.9, this.weaponRoll + dx * rotSens));
      this.weaponPitchOffset = Math.max(-0.85, Math.min(0.85, this.weaponPitchOffset - dy * rotSens));
    } else if (this.attackHeldMouse) {
      // Pure direct weapon swing & positioning with camera locked (zero camera fight)
      this.attackDragPx += Math.hypot(dx, dy);
      this.swingX = Math.max(-1, Math.min(1, this.swingX + dx * wpnSens));
      this.swingY = Math.max(-1, Math.min(1, this.swingY - dy * wpnSens));
      this.rawSweepAccum += Math.hypot(dx, dy) * wpnSens;
    } else if (altHeld || this.weaponFocusToggled) {
      // Free weapon manipulation mode: move hand & weapon smoothly without camera movement
      this.swingX = Math.max(-1, Math.min(1, this.swingX + dx * wpnSens));
      this.swingY = Math.max(-1, Math.min(1, this.swingY - dy * wpnSens));
      this.rawSweepAccum += Math.hypot(dx, dy) * wpnSens;
    } else if (this.defendHeldMouse) {
      // Angle shield / guard with subtle camera tracking
      this.guardX = Math.max(-1, Math.min(1, this.guardX + dx * wpnSens * 0.75));
      this.guardY = Math.max(-1, Math.min(1, this.guardY - dy * wpnSens * 0.75));
      this.yawDelta -= dx * camSens * inp.guardCameraFollowFactor;
      this.pitchDelta -= dy * camSens * inp.guardCameraFollowFactor;
    } else {
      // Pure camera look
      this.yawDelta -= dx * camSens;
      this.pitchDelta -= dy * camSens;
    }
  }

  private onWheel(e: WheelEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    if (dir !== 0) {
      this.weaponRoll = Math.max(
        -Math.PI * 0.9,
        Math.min(
          Math.PI * 0.9,
          this.weaponRoll + dir * CONTROL_TUNING.input.weaponRollWheelSensitivity,
        ),
      );
    }
  }

  private onContextMenu(e: MouseEvent): void {
    if (this.enabled) e.preventDefault();
  }

  private onPointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
    this.pointerWarmupEvents = 2;
    this.yawDelta = 0;
    this.pitchDelta = 0;
  }

  private onBlur(): void {
    this.clearHeld();
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      this.clearHeld();
    }
  }

  public dispose(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.onMouseDown);
      this.canvas.removeEventListener('wheel', this.onWheel);
      this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    }
  }
}
