import * as THREE from 'three';
import { RAPIER } from '../physics/RapierLoader';
import {
  applyOrientationPDTorque,
  applyWorldPositionSpring,
} from '../physics/JointControllers';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { BodyPartId, HandSide } from '../core/types';
import type { WeaponInstance } from '../weapons/WeaponInstance';

export interface ArmControlInput {
  aimYaw: number;
  aimPitch: number;
  /** Accumulated swing cursor offset (-1..1 horizontal, -1..1 vertical) */
  swingX: number;
  swingY: number;
  attackHeld: boolean;
  defendHeld: boolean;
  thrustActive: boolean;
  leftPunchActive: boolean;
}

export interface ArmSegments {
  chest: RAPIER.RigidBody;
  upperArmL: RAPIER.RigidBody;
  forearmL: RAPIER.RigidBody;
  handL: RAPIER.RigidBody;
  upperArmR: RAPIER.RigidBody;
  forearmR: RAPIER.RigidBody;
  handR: RAPIER.RigidBody;
  fingersL?: THREE.Group;
  fingersR?: THREE.Group;
}

const _chestPos = new THREE.Vector3();
const _chestQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _targetPos = new THREE.Vector3();
const _upperTargetQuat = new THREE.Quaternion();
const _foreTargetQuat = new THREE.Quaternion();
const _handTargetQuat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _wpPos = new THREE.Vector3();
const _handPos = new THREE.Vector3();

export class ArmHandController {
  public leftWeapon: WeaponInstance | null = null;
  public rightWeapon: WeaponInstance | null = null;
  public leftGripStrength = 100;
  public rightGripStrength = 100;

  private fingerCurlL = 0;
  private fingerCurlR = 0;
  private swingPhase = 0;
  private autoSwingTimer = 0;
  private autoSwingDir = 1;

  constructor(
    public readonly fighterId: string,
    public readonly fighterCollisionBit: number,
    private readonly segments: ArmSegments,
  ) {}

  public triggerAutoSwing(direction = 1, duration = 0.36): void {
    this.autoSwingTimer = duration;
    this.autoSwingDir = direction;
  }

  public grabWeapon(physics: PhysicsWorld, weapon: WeaponInstance, side: HandSide): boolean {
    if (weapon.ownerId !== null) return false;
    const existing = side === 'left' ? this.leftWeapon : this.rightWeapon;
    if (existing) return false;

    const handBody = side === 'left' ? this.segments.handL : this.segments.handR;
    const hp = handBody.translation();
    const hr = handBody.rotation();

    // Align weapon handle directly into the hand palm with blade extending forward/up
    const handQuat = new THREE.Quaternion(hr.x, hr.y, hr.z, hr.w);
    const localRot = new THREE.Quaternion();
    if (weapon.spec.isShield) {
      // Shield faces outward (-X/+Z depending on hand guard)
      localRot.setFromEuler(new THREE.Euler(0, side === 'left' ? -Math.PI * 0.5 : Math.PI * 0.5, 0));
    } else {
      // Weapon +Y points forward (-Z) & slightly up from hand palm
      localRot.setFromEuler(new THREE.Euler(-Math.PI * 0.48, 0, 0));
    }
    const weaponWorldQuat = handQuat.clone().multiply(localRot);

    weapon.body.setTranslation({ x: hp.x, y: hp.y, z: hp.z }, true);
    weapon.body.setRotation(
      { x: weaponWorldQuat.x, y: weaponWorldQuat.y, z: weaponWorldQuat.z, w: weaponWorldQuat.w },
      true,
    );
    weapon.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    weapon.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    physics.snapInterpolation(weapon.body);

    const jointData = RAPIER.JointData.fixed(
      { x: 0, y: -0.02, z: 0 },
      { x: localRot.x, y: localRot.y, z: localRot.z, w: localRot.w },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
    );
    const joint = physics.world.createImpulseJoint(jointData, handBody, weapon.body, true);
    joint.setContactsEnabled(false);

    weapon.setHeldBy(physics, this.fighterId, this.fighterCollisionBit, side, joint);
    if (side === 'left') {
      this.leftWeapon = weapon;
      this.leftGripStrength = 100;
    } else {
      this.rightWeapon = weapon;
      this.rightGripStrength = 100;
    }
    return true;
  }

  public releaseWeapon(
    physics: PhysicsWorld,
    side: HandSide,
    throwImpulse?: THREE.Vector3,
  ): WeaponInstance | null {
    const weapon = side === 'left' ? this.leftWeapon : this.rightWeapon;
    if (!weapon) return null;

    weapon.release(physics, throwImpulse);
    if (side === 'left') {
      this.leftWeapon = null;
      this.leftGripStrength = 0;
    } else {
      this.rightWeapon = null;
      this.rightGripStrength = 0;
    }
    return weapon;
  }

  public applyGripImpact(physics: PhysicsWorld, side: HandSide, impactForce: number): boolean {
    const weapon = side === 'left' ? this.leftWeapon : this.rightWeapon;
    if (!weapon) return false;

    const drain = (impactForce / weapon.spec.gripBreakThreshold) * 55;
    if (side === 'left') {
      this.leftGripStrength = Math.max(0, this.leftGripStrength - drain);
      if (this.leftGripStrength <= 5) {
        this.releaseWeapon(physics, 'left', new THREE.Vector3((Math.random() - 0.5) * 2, 2.2, (Math.random() - 0.5) * 2));
        return true;
      }
    } else {
      this.rightGripStrength = Math.max(0, this.rightGripStrength - drain);
      if (this.rightGripStrength <= 5) {
        this.releaseWeapon(physics, 'right', new THREE.Vector3((Math.random() - 0.5) * 2, 2.2, (Math.random() - 0.5) * 2));
        return true;
      }
    }
    return false;
  }

  public findNearestGrabbableWeapon(
    weapons: WeaponInstance[],
    side: HandSide,
    maxDist = 1.65,
  ): WeaponInstance | null {
    const handBody = side === 'left' ? this.segments.handL : this.segments.handR;
    const hp = handBody.translation();
    _handPos.set(hp.x, hp.y, hp.z);

    let best: WeaponInstance | null = null;
    let bestDistSq = maxDist * maxDist;

    for (const w of weapons) {
      if (w.ownerId !== null) continue;
      const wp = w.body.translation();
      _wpPos.set(wp.x, wp.y, wp.z);
      const dSq = _wpPos.distanceToSquared(_handPos);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = w;
      }
    }
    return best;
  }

  public update(
    dt: number,
    input: ArmControlInput,
    muscleScale: number,
    staminaRatio: number,
  ): void {
    // Recover grip strength smoothly when holding weapons
    if (this.leftWeapon) {
      this.leftGripStrength = Math.min(100, this.leftGripStrength + dt * 28 * (0.4 + 0.6 * staminaRatio));
    }
    if (this.rightWeapon) {
      this.rightGripStrength = Math.min(100, this.rightGripStrength + dt * 28 * (0.4 + 0.6 * staminaRatio));
    }

    // Update finger curl visual representation
    const targetCurlL = this.leftWeapon ? 1.15 : 0.15;
    const targetCurlR = this.rightWeapon ? 1.15 : 0.15;
    this.fingerCurlL = THREE.MathUtils.lerp(this.fingerCurlL, targetCurlL, Math.min(1, dt * 14));
    this.fingerCurlR = THREE.MathUtils.lerp(this.fingerCurlR, targetCurlR, Math.min(1, dt * 14));
    if (this.segments.fingersL) this.segments.fingersL.rotation.x = this.fingerCurlL;
    if (this.segments.fingersR) this.segments.fingersR.rotation.x = this.fingerCurlR;

    if (muscleScale <= 0.05) return;

    const cp = this.segments.chest.translation();
    const cr = this.segments.chest.rotation();
    _chestPos.set(cp.x, cp.y, cp.z);
    _chestQuat.set(cr.x, cr.y, cr.z, cr.w);

    _yawQuat.setFromAxisAngle(_up, input.aimYaw);
    _forward.set(0, 0, -1).applyQuaternion(_yawQuat);
    _right.set(1, 0, 0).applyQuaternion(_yawQuat);

    if (this.autoSwingTimer > 0) {
      this.autoSwingTimer = Math.max(0, this.autoSwingTimer - dt);
      this.swingPhase += dt * 11;
    }

    const strength = muscleScale * (0.5 + 0.5 * staminaRatio);

    // === RIGHT ARM & WRIST CONTROL ===
    this.updateRightArm(input, strength);

    // === LEFT ARM & WRIST CONTROL ===
    this.updateLeftArm(input, strength);
  }

  private updateRightArm(input: ArmControlInput, strength: number): void {
    const hasWeapon = this.rightWeapon !== null;
    const wMass = this.rightWeapon ? this.rightWeapon.spec.mass : 0.6;
    const forceScale = strength * (0.85 + Math.min(0.65, wMass * 0.25));

    let sx = THREE.MathUtils.clamp(input.swingX, -1, 1);
    let sy = THREE.MathUtils.clamp(input.swingY, -1, 1);

    if (this.autoSwingTimer > 0) {
      const p = 1 - this.autoSwingTimer / 0.36;
      sx = Math.sin(p * Math.PI * 1.15 - 0.55) * this.autoSwingDir * 0.95;
      sy = Math.cos(p * Math.PI) * 0.35;
    }

    if (input.thrustActive) {
      // Thrust forward along aim vector
      _targetPos
        .copy(_chestPos)
        .addScaledVector(_forward, 0.72)
        .addScaledVector(_right, 0.16)
        .addScaledVector(_up, 0.04 + input.aimPitch * 0.35);

      applyWorldPositionSpring(this.segments.handR, _targetPos, 95 * forceScale, 8.5, 42 * forceScale);

      _euler.set(0.08 + input.aimPitch * 0.6, input.aimYaw, -0.15);
      _handTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.handR, _handTargetQuat, 36, 3.2, 24, forceScale);

      _euler.set(1.1 + input.aimPitch * 0.5, input.aimYaw, -0.2);
      _upperTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.upperArmR, _upperTargetQuat, 44, 4.2, 32, forceScale);
      return;
    }

    if (input.defendHeld && !this.leftWeapon?.spec.isShield) {
      // Sword high parry guard across chest/head
      _targetPos
        .copy(_chestPos)
        .addScaledVector(_forward, 0.42)
        .addScaledVector(_right, 0.06)
        .addScaledVector(_up, 0.2);

      applyWorldPositionSpring(this.segments.handR, _targetPos, 85 * forceScale, 8.0, 36 * forceScale);

      _euler.set(0.32, input.aimYaw + 0.55, 1.05);
      _handTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.handR, _handTargetQuat, 34, 3.2, 22, forceScale);

      _euler.set(0.85, input.aimYaw + 0.25, 0.45);
      _upperTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.upperArmR, _upperTargetQuat, 40, 4.0, 28, forceScale);
      return;
    }

    if (input.attackHeld || this.autoSwingTimer > 0) {
      // Dynamic physical swing arc steered by sx/sy
      const reach = hasWeapon ? 0.58 : 0.54;
      _targetPos
        .copy(_chestPos)
        .addScaledVector(_forward, reach - Math.abs(sx) * 0.14)
        .addScaledVector(_right, 0.22 + sx * 0.44)
        .addScaledVector(_up, 0.05 + sy * 0.36 + input.aimPitch * 0.22);

      applyWorldPositionSpring(this.segments.handR, _targetPos, 78 * forceScale, 9.2, 30 * forceScale);

      // Wrist & forearm edge alignment follows swing vector
      _euler.set(-0.35 + sy * 0.85 + input.aimPitch * 0.5, input.aimYaw - sx * 0.95, -sx * 1.15);
      _handTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.handR, _handTargetQuat, 38, 3.0, 24, forceScale);

      _euler.set(0.75 + sy * 0.65, input.aimYaw - sx * 0.55, -0.35 - sx * 0.55);
      _upperTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.upperArmR, _upperTargetQuat, 46, 4.0, 32, forceScale);

      _euler.set(0.9 + sy * 0.5, input.aimYaw - sx * 0.7, -sx * 0.65);
      _foreTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.forearmR, _foreTargetQuat, 34, 3.2, 24, forceScale);
    } else {
      // Relaxed ready combat stance
      _targetPos
        .copy(_chestPos)
        .addScaledVector(_forward, 0.4)
        .addScaledVector(_right, 0.28)
        .addScaledVector(_up, -0.04);

      applyWorldPositionSpring(this.segments.handR, _targetPos, 56 * forceScale, 6.8, 24 * forceScale);

      _euler.set(0.32 + input.aimPitch * 0.3, input.aimYaw + 0.12, -0.22);
      _handTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.handR, _handTargetQuat, 24, 2.5, 16, forceScale);

      _euler.set(0.45, input.aimYaw, -0.25);
      _upperTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.upperArmR, _upperTargetQuat, 32, 3.5, 22, forceScale);
    }
  }

  private updateLeftArm(input: ArmControlInput, strength: number): void {
    const hasShield = this.leftWeapon?.spec.isShield ?? false;
    const hasOffhandWeapon = this.leftWeapon !== null && !hasShield;
    const forceScale = strength * (hasShield ? 1.25 : 0.9);

    if (input.leftPunchActive) {
      _targetPos
        .copy(_chestPos)
        .addScaledVector(_forward, 0.68)
        .addScaledVector(_right, -0.15)
        .addScaledVector(_up, 0.08);
      applyWorldPositionSpring(this.segments.handL, _targetPos, 95 * forceScale, 7.5, 38 * forceScale);
      _euler.set(0.95, input.aimYaw, 0.15);
      _upperTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.upperArmL, _upperTargetQuat, 38, 3.5, 28, forceScale);
      return;
    }

    if (input.defendHeld) {
      // Raise shield or left guard across upper torso/head
      _targetPos
        .copy(_chestPos)
        .addScaledVector(_forward, hasShield ? 0.46 : 0.4)
        .addScaledVector(_right, hasShield ? -0.05 : -0.12)
        .addScaledVector(_up, hasShield ? 0.08 : 0.14);

      applyWorldPositionSpring(this.segments.handL, _targetPos, 96 * forceScale, 8.2, 40 * forceScale);

      if (hasShield) {
        // Shield face turned directly toward incoming attacks (-Z local -> aimYaw)
        _euler.set(0.05, input.aimYaw + Math.PI * 0.5, 0);
      } else {
        _euler.set(0.35, input.aimYaw - 0.5, -0.95);
      }
      _handTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.handL, _handTargetQuat, 36, 3.4, 24, forceScale);

      _euler.set(0.85, input.aimYaw - 0.35, 0.45);
      _upperTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.upperArmL, _upperTargetQuat, 38, 3.8, 28, forceScale);
    } else {
      // Natural off-hand guard stance
      _targetPos
        .copy(_chestPos)
        .addScaledVector(_forward, hasShield ? 0.38 : 0.28)
        .addScaledVector(_right, hasShield ? -0.26 : -0.28)
        .addScaledVector(_up, hasShield ? -0.02 : -0.12);

      applyWorldPositionSpring(this.segments.handL, _targetPos, 54 * forceScale, 6.5, 24 * forceScale);

      if (hasShield) {
        _euler.set(0.1, input.aimYaw + Math.PI * 0.35, 0);
      } else if (hasOffhandWeapon) {
        _euler.set(0.28, input.aimYaw - 0.15, 0.2);
      } else {
        _euler.set(0.25, input.aimYaw, 0.15);
      }
      _handTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.handL, _handTargetQuat, 22, 2.4, 15, forceScale);

      _euler.set(0.35, input.aimYaw, 0.25);
      _upperTargetQuat.setFromEuler(_euler);
      applyOrientationPDTorque(this.segments.upperArmL, _upperTargetQuat, 28, 3.2, 20, forceScale);
    }
  }

  public dispose(physics: PhysicsWorld): void {
    this.releaseWeapon(physics, 'left');
    this.releaseWeapon(physics, 'right');
  }
}

export function extractArmSegments(
  bodies: Record<BodyPartId, RAPIER.RigidBody>,
  fingersL?: THREE.Group,
  fingersR?: THREE.Group,
): ArmSegments {
  return {
    chest: bodies.chest,
    upperArmL: bodies.upperArmL,
    forearmL: bodies.forearmL,
    handL: bodies.handL,
    upperArmR: bodies.upperArmR,
    forearmR: bodies.forearmR,
    handR: bodies.handR,
    fingersL,
    fingersR,
  };
}
