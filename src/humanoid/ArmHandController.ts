import * as THREE from 'three';
import { RAPIER } from '../physics/RapierLoader';
import {
  applyInternalPositionSpring,
  applyOrientationPDTorque,
  softClampBodyAngularVelocity,
} from '../physics/JointControllers';
import { CONTROL_TUNING } from '../controls/ControlTuning';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { BodyPartId, HandSide } from '../core/types';
import type { WeaponInstance } from '../weapons/WeaponInstance';

export interface ArmControlInput {
  aimYaw: number;
  aimPitch: number;
  /** Desired weapon hand horizontal cursor (-1..1) */
  swingX: number;
  /** Desired weapon hand vertical cursor (-1..1) */
  swingY: number;
  attackHeld: boolean;
  defendHeld: boolean;
  thrustActive: boolean;
  leftPunchActive: boolean;
  /** Optional direct weapon blade roll offset (rad, -PI..PI) */
  weaponRoll?: number;
  /** Optional direct weapon tip pitch offset (rad, -1..1) */
  weaponPitchOffset?: number;
  /** True when player is actively positioning/rotating weapon without swinging */
  weaponManipActive?: boolean;
  /** Instantaneous normalized sweep speed (0..1+) for dynamic cut gain & edge-lead */
  swingSpeed?: number;
  /** Optional guard angle steer X (-1..1) */
  guardX?: number;
  /** Optional guard angle steer Y (-1..1) */
  guardY?: number;
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
const _rawLocalPos = new THREE.Vector3();
const _rawLocalDir = new THREE.Vector3();
const _rawTargetPos = new THREE.Vector3();
const _clampedTargetPos = new THREE.Vector3();
const _shoulderPos = new THREE.Vector3();
const _elbowPos = new THREE.Vector3();
const _poleVec = new THREE.Vector3();
const _dVec = new THREE.Vector3();
const _dHat = new THREE.Vector3();
const _bendOut = new THREE.Vector3();
const _uHat = new THREE.Vector3();
const _vHat = new THREE.Vector3();
const _hingeAxis = new THREE.Vector3();
const _basisX = new THREE.Vector3();
const _basisY = new THREE.Vector3();
const _basisZ = new THREE.Vector3();
const _basisMat = new THREE.Matrix4();

const _upperTargetQuat = new THREE.Quaternion();
const _foreTargetQuat = new THREE.Quaternion();
const _handTargetQuat = new THREE.Quaternion();
const _weaponWorldQuat = new THREE.Quaternion();
const _invLocalRot = new THREE.Quaternion();
const _weaponDir = new THREE.Vector3();
const _edgeBase = new THREE.Vector3();
const _upFlat = new THREE.Vector3();

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _wpPos = new THREE.Vector3();
const _handPos = new THREE.Vector3();
const _deltaTarget = new THREE.Vector3();

const DEFAULT_MELEE_LOCAL_ROT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.PI * 0.44, 0, 0),
);
const DEFAULT_SHIELD_LOCAL_ROT_L = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, -Math.PI * 0.5, 0),
);
const DEFAULT_SHIELD_LOCAL_ROT_R = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, Math.PI * 0.5, 0),
);

function getWeaponExtraInertia(weapon: WeaponInstance | null): number {
  if (!weapon) return 0;
  const L = weapon.spec.length;
  const com = weapon.spec.comLocalY;
  return weapon.spec.mass * (com * com + (L * L) / 12);
}

/**
 * Solves analytical 2-bone arm IK (shoulder -> elbow -> wrist) with anatomical reach clamping
 * and builds orthonormal upper-arm and forearm orientations aligned with the elbow revolute hinge (+X).
 */
function solveTwoBoneArmIK(
  shoulderWorld: THREE.Vector3,
  handWorld: THREE.Vector3,
  poleHintWorld: THREE.Vector3,
  fallbackHingeAxis: THREE.Vector3,
  outClampedHand: THREE.Vector3,
  outUpperQuat: THREE.Quaternion,
  outForeQuat: THREE.Quaternion,
): void {
  const { minArmReach, maxArmReach, upperArmLength: l1, forearmLength: l2 } = CONTROL_TUNING.weapon;

  _dVec.copy(handWorld).sub(shoulderWorld);
  let d = _dVec.length();
  if (d < 1e-4) {
    _dHat.set(0, -1, 0);
    d = minArmReach;
  } else {
    _dHat.copy(_dVec).divideScalar(d);
    d = THREE.MathUtils.clamp(d, minArmReach, maxArmReach);
  }
  outClampedHand.copy(shoulderWorld).addScaledVector(_dHat, d);

  // Project elbow pole hint orthogonal to shoulder->hand vector
  _bendOut.copy(poleHintWorld).addScaledVector(_dHat, -poleHintWorld.dot(_dHat));
  if (_bendOut.lengthSq() < 1e-4) {
    _bendOut.copy(fallbackHingeAxis).cross(_dHat);
  }
  if (_bendOut.lengthSq() < 1e-4) {
    _bendOut.set(0, -1, 0);
  } else {
    _bendOut.normalize();
  }

  // Law of cosines for elbow position (maxArmReach < l1+l2 ensures healthy sinAlpha)
  const cosAlpha = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -0.96, 0.96);
  const sinAlpha = Math.sqrt(Math.max(0.01, 1 - cosAlpha * cosAlpha));
  _elbowPos
    .copy(shoulderWorld)
    .addScaledVector(_dHat, l1 * cosAlpha)
    .addScaledVector(_bendOut, l1 * sinAlpha);

  _uHat.copy(_elbowPos).sub(shoulderWorld).normalize();
  _vHat.copy(outClampedHand).sub(_elbowPos).normalize();

  // Joint revolute axis is X = cross(uHat, vHat) so positive hinge angle flexes forearm toward wrist
  _hingeAxis.crossVectors(_uHat, _vHat);
  if (_hingeAxis.lengthSq() < 1e-5) {
    _hingeAxis.copy(fallbackHingeAxis);
  } else {
    _hingeAxis.normalize();
  }

  // Upper arm basis: local -Y = uHat => local +Y = -uHat, local +X = hingeAxis
  _basisX.copy(_hingeAxis);
  _basisY.copy(_uHat).negate();
  _basisZ.crossVectors(_basisX, _basisY).normalize();
  _basisX.crossVectors(_basisY, _basisZ).normalize();
  _basisMat.makeBasis(_basisX, _basisY, _basisZ);
  outUpperQuat.setFromRotationMatrix(_basisMat);

  // Forearm basis: local -Y = vHat => local +Y = -vHat, local +X = hingeAxis
  _basisX.copy(_hingeAxis);
  _basisY.copy(_vHat).negate();
  _basisZ.crossVectors(_basisX, _basisY).normalize();
  _basisX.crossVectors(_basisY, _basisZ).normalize();
  _basisMat.makeBasis(_basisX, _basisY, _basisZ);
  outForeQuat.setFromRotationMatrix(_basisMat);
}

/**
 * Builds exact desired hand orientation quaternion from world weapon pointing direction + blade roll
 * using handWorldQuat = weaponWorldQuat * inv(localRot).
 */
function buildHandTargetFromWeaponDir(
  weaponDir: THREE.Vector3,
  edgeRollRad: number,
  localRot: THREE.Quaternion,
  outHandQuat: THREE.Quaternion,
  outWeaponQuat?: THREE.Quaternion,
): void {
  _weaponDir.copy(weaponDir).normalize();
  _edgeBase.crossVectors(_weaponDir, _up);
  if (_edgeBase.lengthSq() < 1e-4) {
    _edgeBase.set(1, 0, 0);
  } else {
    _edgeBase.normalize();
  }
  _upFlat.crossVectors(_edgeBase, _weaponDir).normalize();

  const c = Math.cos(edgeRollRad);
  const s = Math.sin(edgeRollRad);
  // Weapon +X = rolled edge axis, Weapon +Y = blade tip axis, Weapon +Z = blade flat (X x Y)
  _basisX.copy(_edgeBase).multiplyScalar(c).addScaledVector(_upFlat, s).normalize();
  _basisY.copy(_weaponDir);
  _basisZ.crossVectors(_basisX, _basisY).normalize();
  _basisMat.makeBasis(_basisX, _basisY, _basisZ);
  _weaponWorldQuat.setFromRotationMatrix(_basisMat);
  if (outWeaponQuat) {
    outWeaponQuat.copy(_weaponWorldQuat);
  }

  _invLocalRot.copy(localRot).invert();
  outHandQuat.copy(_weaponWorldQuat).multiply(_invLocalRot);
}

export class ArmHandController {
  public leftWeapon: WeaponInstance | null = null;
  public rightWeapon: WeaponInstance | null = null;
  public leftGripStrength = 100;
  public rightGripStrength = 100;

  private leftLocalRot = new THREE.Quaternion().copy(DEFAULT_SHIELD_LOCAL_ROT_L);
  private rightLocalRot = new THREE.Quaternion().copy(DEFAULT_MELEE_LOCAL_ROT);

  private fingerCurlL = 0;
  private fingerCurlR = 0;
  private autoSwingTimer = 0;
  private autoSwingDir = 1;

  // Chest-local frame-rate-independent filtered arm target state
  // (x = right offset, y = up offset, z = forward offset from chest)
  private hasFilterR = false;
  private hasFilterL = false;
  private filteredLocalPosR = new THREE.Vector3();
  private filteredLocalPosL = new THREE.Vector3();
  private filteredLocalDirR = new THREE.Vector3(0, 0.35, 1);
  private filteredLocalDirL = new THREE.Vector3(0, 0.25, 1);
  private filteredEdgeRollR = 0;
  private filteredEdgeRollL = 0;

  private prevRawSwingX = 0;
  private prevRawSwingY = 0;
  private filteredSwingVelX = 0;
  private filteredSwingVelY = 0;

  constructor(
    public readonly fighterId: string,
    public readonly fighterCollisionBit: number,
    private readonly segments: ArmSegments,
  ) {}

  public triggerAutoSwing(direction = 1, duration = 0.24): void {
    this.autoSwingTimer = duration;
    this.autoSwingDir = direction;
  }

  public cancelAutoSwing(): void {
    this.autoSwingTimer = 0;
  }

  public grabWeapon(physics: PhysicsWorld, weapon: WeaponInstance, side: HandSide): boolean {
    if (weapon.ownerId !== null) return false;
    const existing = side === 'left' ? this.leftWeapon : this.rightWeapon;
    if (existing) return false;

    const handBody = side === 'left' ? this.segments.handL : this.segments.handR;
    const hp = handBody.translation();
    const hr = handBody.rotation();

    const handQuat = new THREE.Quaternion(hr.x, hr.y, hr.z, hr.w);
    const localRot = new THREE.Quaternion();
    if (weapon.spec.isShield) {
      localRot.copy(side === 'left' ? DEFAULT_SHIELD_LOCAL_ROT_L : DEFAULT_SHIELD_LOCAL_ROT_R);
    } else {
      localRot.copy(DEFAULT_MELEE_LOCAL_ROT);
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
      this.leftLocalRot.copy(localRot);
    } else {
      this.rightWeapon = weapon;
      this.rightGripStrength = 100;
      this.rightLocalRot.copy(localRot);
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
        this.releaseWeapon(
          physics,
          'left',
          new THREE.Vector3((Math.random() - 0.5) * 2, 2.2, (Math.random() - 0.5) * 2),
        );
        return true;
      }
    } else {
      this.rightGripStrength = Math.max(0, this.rightGripStrength - drain);
      if (this.rightGripStrength <= 5) {
        this.releaseWeapon(
          physics,
          'right',
          new THREE.Vector3((Math.random() - 0.5) * 2, 2.2, (Math.random() - 0.5) * 2),
        );
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
    if (this.leftWeapon) {
      this.leftGripStrength = Math.min(
        100,
        this.leftGripStrength + dt * 28 * (0.4 + 0.6 * staminaRatio),
      );
    }
    if (this.rightWeapon) {
      this.rightGripStrength = Math.min(
        100,
        this.rightGripStrength + dt * 28 * (0.4 + 0.6 * staminaRatio),
      );
    }

    const targetCurlL = this.leftWeapon ? 1.15 : 0.15;
    const targetCurlR = this.rightWeapon ? 1.15 : 0.15;
    this.fingerCurlL = THREE.MathUtils.lerp(this.fingerCurlL, targetCurlL, Math.min(1, dt * 14));
    this.fingerCurlR = THREE.MathUtils.lerp(this.fingerCurlR, targetCurlR, Math.min(1, dt * 14));
    if (this.segments.fingersL) this.segments.fingersL.rotation.x = this.fingerCurlL;
    if (this.segments.fingersR) this.segments.fingersR.rotation.x = this.fingerCurlR;

    if (muscleScale <= 0.05) {
      this.hasFilterR = false;
      this.hasFilterL = false;
      return;
    }

    const cp = this.segments.chest.translation();
    const cr = this.segments.chest.rotation();
    _chestPos.set(cp.x, cp.y, cp.z);
    _chestQuat.set(cr.x, cr.y, cr.z, cr.w);

    _yawQuat.setFromAxisAngle(_up, input.aimYaw);
    _forward.set(0, 0, -1).applyQuaternion(_yawQuat);
    _right.set(1, 0, 0).applyQuaternion(_yawQuat);

    if (this.autoSwingTimer > 0) {
      this.autoSwingTimer = Math.max(0, this.autoSwingTimer - dt);
    }

    const strength = muscleScale * (0.58 + 0.42 * staminaRatio);
    this.updateRightArm(dt, input, strength);
    this.updateLeftArm(dt, input, strength);
  }

  private updateRightArm(dt: number, input: ArmControlInput, strength: number): void {
    const wp = CONTROL_TUNING.weapon;
    const weaponMass = this.rightWeapon ? this.rightWeapon.spec.mass : 0;
    const extraInertia = getWeaponExtraInertia(this.rightWeapon);
    const forceScale = strength * (0.92 + Math.min(0.65, weaponMass * 0.24));

    let sx = THREE.MathUtils.clamp(input.swingX, -1, 1);
    let sy = THREE.MathUtils.clamp(input.swingY, -1, 1);

    // Smooth cursor sweep velocity estimation
    const rawVx = dt > 1e-4 ? (sx - this.prevRawSwingX) / dt : 0;
    const rawVy = dt > 1e-4 ? (sy - this.prevRawSwingY) / dt : 0;
    this.prevRawSwingX = sx;
    this.prevRawSwingY = sy;

    const velAlpha = 1 - Math.exp(-15 * dt);
    this.filteredSwingVelX = THREE.MathUtils.lerp(this.filteredSwingVelX, rawVx, velAlpha);
    this.filteredSwingVelY = THREE.MathUtils.lerp(this.filteredSwingVelY, rawVy, velAlpha);

    // Auto-swing only triggers on quick click taps and yields immediately on manual pointer motion
    if (this.autoSwingTimer > 0 && Math.abs(rawVx) + Math.abs(rawVy) < 0.45) {
      const p = 1 - this.autoSwingTimer / 0.24;
      sx = Math.sin(p * Math.PI * 1.15 - 0.55) * this.autoSwingDir * 0.88;
      sy = Math.cos(p * Math.PI) * 0.26;
    } else if (Math.abs(rawVx) + Math.abs(rawVy) >= 0.45) {
      this.autoSwingTimer = 0;
    }

    const sweepSpeed =
      input.swingSpeed ?? Math.min(2.0, Math.hypot(this.filteredSwingVelX, this.filteredSwingVelY) * 0.34);
    const isAttacking = input.attackHeld || this.autoSwingTimer > 0;
    const attackIntensity = input.thrustActive
      ? 1.0
      : isAttacking
        ? THREE.MathUtils.clamp(0.42 + sweepSpeed * 0.58, 0.42, 1.0)
        : 0;

    const pitchOffset = input.weaponPitchOffset ?? 0;
    const manualRoll = input.weaponRoll ?? 0;
    const hasCustomPose =
      Math.abs(sx) > 0.02 ||
      Math.abs(sy) > 0.02 ||
      Math.abs(manualRoll) > 0.02 ||
      Math.abs(pitchOffset) > 0.02 ||
      Boolean(input.weaponManipActive);

    // 1. Compute desired hand target & weapon pointing direction in CHEST-LOCAL space:
    // _rawLocalPos = (rightOffset, upOffset, forwardOffset)
    // _rawLocalDir = (rightDir, upDir, forwardDir)
    let edgeRoll = manualRoll;
    if (input.thrustActive) {
      _rawLocalPos.set(
        0.16 + sx * 0.12,
        0.06 + (input.aimPitch + pitchOffset) * 0.26,
        0.48,
      );
      _rawLocalDir.set(sx * 0.25, 0.05 + input.aimPitch * 0.65 + pitchOffset * 0.5, 1);
      edgeRoll = manualRoll * 0.5;
    } else if (input.defendHeld && !this.leftWeapon?.spec.isShield) {
      const gx = input.guardX ?? sx * 0.5;
      const gy = input.guardY ?? sy * 0.5;
      _rawLocalPos.set(0.05 + gx * 0.22, 0.14 + gy * 0.18, 0.36);
      _rawLocalDir.set(-0.45 + gx * 0.3, 0.85 + gy * 0.2, 0.35);
      edgeRoll = 0.95 + manualRoll * 0.4;
    } else if (isAttacking || hasCustomPose) {
      const reach = this.rightWeapon ? (isAttacking ? 0.47 : 0.42) : 0.43;
      const reachCurve = reach - Math.abs(sx) * 0.065;
      _rawLocalPos.set(
        0.14 + sx * 0.34,
        0.04 + sy * 0.32 + (input.aimPitch + pitchOffset) * 0.22,
        reachCurve,
      );

      // Blade naturally aims forward + fans smoothly with sx/sy + fine pitch
      _rawLocalDir.set(
        sx * 0.68,
        0.22 + sy * 0.72 + input.aimPitch * 0.55 + pitchOffset * 0.8,
        1,
      );

      // Dynamic edge-lead alignment during brisk cuts (kept quiet during slow precision aim)
      if (isAttacking && sweepSpeed > 0.32) {
        const autoLeadRoll = Math.atan2(-this.filteredSwingVelY, this.filteredSwingVelX);
        const blend = THREE.MathUtils.clamp((sweepSpeed - 0.25) * wp.swingEdgeLeadBlend, 0, 0.78);
        edgeRoll = THREE.MathUtils.lerp(manualRoll - sx * 0.25, autoLeadRoll * 0.65 - sx * 0.35, blend);
      } else {
        edgeRoll = manualRoll - sx * 0.32;
      }
    } else {
      // Weapon-specific aggressive combat-ready guard
      const hasShield = Boolean(this.leftWeapon?.spec.isShield);
      const weaponType = this.rightWeapon?.type;
      const stance =
        weaponType === 'longsword'
          ? wp.combatStances.longsword
          : weaponType === 'arming_sword'
            ? hasShield
              ? wp.combatStances.armingSwordWithShield
              : wp.combatStances.armingSwordSolo
            : weaponType === 'battle_axe'
              ? wp.combatStances.battleAxe
              : weaponType === 'mace'
                ? wp.combatStances.mace
                : wp.combatStances.unarmedRight;

      _rawLocalPos.set(stance.pos[0], stance.pos[1] + input.aimPitch * 0.16, stance.pos[2]);
      _rawLocalDir.set(
        stance.dir[0],
        Math.max(0.25, stance.dir[1] + input.aimPitch * 0.42),
        stance.dir[2],
      );
      edgeRoll = stance.roll + manualRoll;
    }

    // 2. Smooth in CHEST-LOCAL space (eliminates locomotion lag completely!)
    const maxTargetSpeed = THREE.MathUtils.lerp(
      wp.maxHandSpeedNormal,
      wp.maxHandSpeedAttack,
      attackIntensity,
    );
    const posAlpha = 1 - Math.exp(-wp.handPosFilterHz * dt);
    const rotAlpha = 1 - Math.exp(-wp.handRotFilterHz * dt);

    if (!this.hasFilterR) {
      this.filteredLocalPosR.copy(_rawLocalPos);
      this.filteredLocalDirR.copy(_rawLocalDir).normalize();
      this.filteredEdgeRollR = edgeRoll;
      this.hasFilterR = true;
    } else {
      _deltaTarget.copy(_rawLocalPos).sub(this.filteredLocalPosR).multiplyScalar(posAlpha);
      const maxStep = maxTargetSpeed * dt;
      const stepLen = _deltaTarget.length();
      if (stepLen > maxStep && stepLen > 1e-6) {
        _deltaTarget.multiplyScalar(maxStep / stepLen);
      }
      this.filteredLocalPosR.add(_deltaTarget);
      this.filteredLocalDirR.lerp(_rawLocalDir, rotAlpha).normalize();
      this.filteredEdgeRollR = THREE.MathUtils.lerp(this.filteredEdgeRollR, edgeRoll, rotAlpha);
    }

    // 3. Transform filtered chest-local target into world space & solve 2-bone IK
    _shoulderPos.set(0.21, 0.11, 0).applyQuaternion(_chestQuat).add(_chestPos);

    _rawTargetPos
      .copy(_chestPos)
      .addScaledVector(_right, this.filteredLocalPosR.x)
      .addScaledVector(_up, this.filteredLocalPosR.y)
      .addScaledVector(_forward, this.filteredLocalPosR.z);

    _poleVec
      .copy(_right)
      .multiplyScalar(0.76 + Math.max(0, sx) * 0.22)
      .addScaledVector(_up, -0.48 + THREE.MathUtils.clamp(sy * 0.24, -0.18, 0.24))
      .addScaledVector(_forward, -0.46);

    solveTwoBoneArmIK(
      _shoulderPos,
      _rawTargetPos,
      _poleVec,
      _right,
      _clampedTargetPos,
      _upperTargetQuat,
      _foreTargetQuat,
    );

    _weaponDir
      .set(0, 0, 0)
      .addScaledVector(_right, this.filteredLocalDirR.x)
      .addScaledVector(_up, this.filteredLocalDirR.y)
      .addScaledVector(_forward, this.filteredLocalDirR.z)
      .normalize();

    const localRot = this.rightWeapon ? this.rightLocalRot : DEFAULT_MELEE_LOCAL_ROT;
    buildHandTargetFromWeaponDir(
      _weaponDir,
      this.filteredEdgeRollR,
      localRot,
      _handTargetQuat,
      _weaponWorldQuat,
    );

    // 4. Separate tunable gains with mass/COM gravity compensation so heavy weapons stay raised without droop
    const comLocalY = this.rightWeapon ? this.rightWeapon.spec.comLocalY : 0;
    const massRotScale = 1 + Math.min(0.68, weaponMass * 0.24 + comLocalY * 0.35);
    const idlePosBoost = !isAttacking ? weaponMass * 22 : 0;

    const handStiffness =
      THREE.MathUtils.lerp(wp.handPosStiffnessIdle, wp.handPosStiffnessAttack, attackIntensity) +
      idlePosBoost;
    const handDamping = THREE.MathUtils.lerp(
      wp.handPosDampingIdle,
      wp.handPosDampingAttack,
      attackIntensity,
    );
    const handMaxForce =
      THREE.MathUtils.lerp(wp.handPosMaxForceIdle, wp.handPosMaxForceAttack, attackIntensity) +
      idlePosBoost * 0.45;

    const wristKp = THREE.MathUtils.lerp(
      wp.handRotStiffness * massRotScale,
      wp.wristAttackStiffness * (1 + Math.min(0.3, weaponMass * 0.12)),
      attackIntensity,
    );
    const wristKd = THREE.MathUtils.lerp(wp.handRotDamping, wp.wristAttackDamping, attackIntensity);
    const wristMaxTorque = THREE.MathUtils.lerp(
      wp.handRotMaxTorque * massRotScale,
      wp.wristAttackMaxTorque * (1 + Math.min(0.35, weaponMass * 0.14)),
      attackIntensity,
    );

    // Apply chest-coupled Newton's 3rd Law hand spring + wrist PD + coherent IK shoulder/elbow torques
    applyInternalPositionSpring(
      this.segments.handR,
      this.segments.chest,
      _clampedTargetPos,
      handStiffness * forceScale,
      handDamping * forceScale,
      handMaxForce * forceScale,
      dt,
      weaponMass,
    );

    const handShare = this.rightWeapon ? 0.42 : 1.0;
    applyOrientationPDTorque(
      this.segments.handR,
      _handTargetQuat,
      wristKp * handShare,
      wristKd,
      wristMaxTorque * handShare,
      dt,
      forceScale,
      this.rightWeapon ? 0 : extraInertia,
    );

    if (this.rightWeapon) {
      const gripAuthority = forceScale * THREE.MathUtils.clamp(this.rightGripStrength / 100, 0.25, 1);
      applyOrientationPDTorque(
        this.rightWeapon.body,
        _weaponWorldQuat,
        wristKp * 0.85,
        wristKd * 1.1,
        wristMaxTorque * 0.85,
        dt,
        gripAuthority,
      );
    }

    const ikBoost = 1 + attackIntensity * 0.35;
    applyOrientationPDTorque(
      this.segments.upperArmR,
      _upperTargetQuat,
      wp.shoulderIkKp * ikBoost,
      wp.shoulderIkKd,
      wp.shoulderIkMaxTorque * ikBoost,
      dt,
      forceScale,
    );

    applyOrientationPDTorque(
      this.segments.forearmR,
      _foreTargetQuat,
      wp.elbowIkKp * ikBoost,
      wp.elbowIkKd,
      wp.elbowIkMaxTorque * ikBoost,
      dt,
      forceScale,
    );

    softClampBodyAngularVelocity(this.segments.handR, wp.maxWeaponAngVel);
    if (this.rightWeapon) {
      softClampBodyAngularVelocity(this.rightWeapon.body, wp.maxWeaponAngVel);
    }
  }

  private updateLeftArm(dt: number, input: ArmControlInput, strength: number): void {
    const wp = CONTROL_TUNING.weapon;
    const hasShield = this.leftWeapon?.spec.isShield ?? false;
    const hasOffhandWeapon = this.leftWeapon !== null && !hasShield;
    const weaponMass = this.leftWeapon ? this.leftWeapon.spec.mass : 0;
    const extraInertia = getWeaponExtraInertia(this.leftWeapon);
    const forceScale = strength * (hasShield ? 1.25 : 0.95);

    const gx = input.guardX ?? 0;
    const gy = input.guardY ?? 0;
    let edgeRoll = 0.15;

    if (input.leftPunchActive) {
      _rawLocalPos.set(-0.16, 0.08, 0.48);
      _rawLocalDir.set(0, 0.28, 1);
      edgeRoll = 0;
    } else if (input.defendHeld) {
      if (hasShield) {
        const sd = wp.combatStances.shieldDefend;
        _rawLocalPos.set(sd.pos[0] + gx * 0.2, sd.pos[1] + gy * 0.15, sd.pos[2]);
        _rawLocalDir.set(sd.dir[0] - gx * 0.2, sd.dir[1] + gy * 0.2, sd.dir[2]);
        edgeRoll = sd.roll - gx * 0.45;
      } else {
        _rawLocalPos.set(-0.1 + gx * 0.22, 0.14 + gy * 0.18, 0.36);
        _rawLocalDir.set(0.45, 0.85, 0.35);
        edgeRoll = -0.95;
      }
    } else {
      if (hasShield) {
        const sr = wp.combatStances.shieldReady;
        _rawLocalPos.set(sr.pos[0], sr.pos[1] + input.aimPitch * 0.08, sr.pos[2]);
        _rawLocalDir.set(sr.dir[0], sr.dir[1] + input.aimPitch * 0.15, sr.dir[2]);
        edgeRoll = sr.roll;
      } else if (hasOffhandWeapon) {
        const oh = wp.combatStances.offhandReady;
        _rawLocalPos.set(oh.pos[0], oh.pos[1] + input.aimPitch * 0.12, oh.pos[2]);
        _rawLocalDir.set(0.18, 0.96, 0.72);
        edgeRoll = oh.roll;
      } else {
        const oh = wp.combatStances.offhandReady;
        _rawLocalPos.set(oh.pos[0], oh.pos[1] + input.aimPitch * 0.12, oh.pos[2]);
        _rawLocalDir.set(oh.dir[0], oh.dir[1], oh.dir[2]);
        edgeRoll = oh.roll;
      }
    }

    const posAlpha = 1 - Math.exp(-wp.handPosFilterHz * dt);
    const rotAlpha = 1 - Math.exp(-wp.handRotFilterHz * dt);
    if (!this.hasFilterL) {
      this.filteredLocalPosL.copy(_rawLocalPos);
      this.filteredLocalDirL.copy(_rawLocalDir).normalize();
      this.filteredEdgeRollL = edgeRoll;
      this.hasFilterL = true;
    } else {
      this.filteredLocalPosL.lerp(_rawLocalPos, posAlpha);
      this.filteredLocalDirL.lerp(_rawLocalDir, rotAlpha).normalize();
      this.filteredEdgeRollL = THREE.MathUtils.lerp(this.filteredEdgeRollL, edgeRoll, rotAlpha);
    }

    _shoulderPos.set(-0.21, 0.11, 0).applyQuaternion(_chestQuat).add(_chestPos);

    _rawTargetPos
      .copy(_chestPos)
      .addScaledVector(_right, this.filteredLocalPosL.x)
      .addScaledVector(_up, this.filteredLocalPosL.y)
      .addScaledVector(_forward, this.filteredLocalPosL.z);

    _poleVec
      .copy(_right)
      .multiplyScalar(-0.76)
      .addScaledVector(_up, -0.5)
      .addScaledVector(_forward, -0.46);

    solveTwoBoneArmIK(
      _shoulderPos,
      _rawTargetPos,
      _poleVec,
      _right,
      _clampedTargetPos,
      _upperTargetQuat,
      _foreTargetQuat,
    );

    _weaponDir
      .set(0, 0, 0)
      .addScaledVector(_right, this.filteredLocalDirL.x)
      .addScaledVector(_up, this.filteredLocalDirL.y)
      .addScaledVector(_forward, this.filteredLocalDirL.z)
      .normalize();

    const localRotL = input.leftPunchActive
      ? DEFAULT_MELEE_LOCAL_ROT
      : this.leftWeapon
        ? this.leftLocalRot
        : DEFAULT_MELEE_LOCAL_ROT;
    buildHandTargetFromWeaponDir(
      _weaponDir,
      this.filteredEdgeRollL,
      localRotL,
      _handTargetQuat,
      _weaponWorldQuat,
    );

    const stiffness = input.defendHeld || input.leftPunchActive ? 310 : hasShield ? 245 : 185;
    const damping = input.defendHeld || input.leftPunchActive ? 23 : hasShield ? 19 : 16;
    const maxForce = input.defendHeld || input.leftPunchActive ? 125 : hasShield ? 105 : 74;

    applyInternalPositionSpring(
      this.segments.handL,
      this.segments.chest,
      _clampedTargetPos,
      stiffness * forceScale,
      damping * forceScale,
      maxForce * forceScale,
      dt,
      weaponMass,
    );

    const leftHandShare = this.leftWeapon && !input.leftPunchActive ? 0.45 : 1.0;
    const wristKpL = input.defendHeld ? 42 : hasShield ? 38 : 24;
    const wristKdL = input.defendHeld ? 2.6 : hasShield ? 2.4 : 1.7;
    const wristMaxL = input.defendHeld ? 44 : hasShield ? 40 : 24;

    applyOrientationPDTorque(
      this.segments.handL,
      _handTargetQuat,
      wristKpL * leftHandShare,
      wristKdL,
      wristMaxL * leftHandShare,
      dt,
      forceScale,
      this.leftWeapon ? 0 : extraInertia,
    );

    if (this.leftWeapon && !input.leftPunchActive) {
      const gripAuthorityL = forceScale * THREE.MathUtils.clamp(this.leftGripStrength / 100, 0.25, 1);
      applyOrientationPDTorque(
        this.leftWeapon.body,
        _weaponWorldQuat,
        wristKpL * 0.85,
        wristKdL * 1.1,
        wristMaxL * 0.85,
        dt,
        gripAuthorityL,
      );
    }

    applyOrientationPDTorque(
      this.segments.upperArmL,
      _upperTargetQuat,
      wp.shoulderIkKp * 0.88,
      wp.shoulderIkKd,
      wp.shoulderIkMaxTorque * 0.9,
      dt,
      forceScale,
    );

    applyOrientationPDTorque(
      this.segments.forearmL,
      _foreTargetQuat,
      wp.elbowIkKp * 0.85,
      wp.elbowIkKd,
      wp.elbowIkMaxTorque * 0.88,
      dt,
      forceScale,
    );
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
