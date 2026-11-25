import * as THREE from 'three';
import type { ActiveRagdoll, FighterControlIntent } from '../humanoid/ActiveRagdoll';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { WeaponInstance } from '../weapons/WeaponInstance';

export type AIState =
  | 'APPROACH'
  | 'CIRCLE'
  | 'WINDUP'
  | 'STRIKE'
  | 'THRUST'
  | 'BLOCK_PARRY'
  | 'DODGE'
  | 'RECOVER'
  | 'SEEK_WEAPON';

export interface AIConfig {
  aggression: number; // 0.3 .. 1.0
  parrySkill: number; // 0.2 .. 0.95
  reactionSpeed: number; // 0.4 .. 1.0
  preferredRange: number;
}

const _selfPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _side = new THREE.Vector3();
const _wpPos = new THREE.Vector3();

export class FighterAI {
  public state: AIState = 'APPROACH';
  private stateTimer = 0;
  private decisionCooldown = 0;
  private circleDir = 1;
  private swingDir = 1;
  private swingPitch = 0;
  private facingYaw = 0;
  private targetWeapon: WeaponInstance | null = null;

  constructor(
    public readonly fighter: ActiveRagdoll,
    public readonly config: AIConfig,
  ) {
    this.circleDir = Math.random() > 0.5 ? 1 : -1;
    this.facingYaw = fighter.bodies.pelvis.rotation().y;
  }

  public update(
    dt: number,
    target: ActiveRagdoll | null,
    allWeapons: WeaponInstance[],
    physics: PhysicsWorld,
  ): FighterControlIntent {
    const intent: FighterControlIntent = {
      moveX: 0,
      moveZ: 0,
      facingYaw: this.facingYaw,
      jumpPressed: false,
      arm: {
        aimYaw: this.facingYaw,
        aimPitch: 0,
        swingX: 0,
        swingY: 0,
        attackHeld: false,
        defendHeld: false,
        thrustActive: false,
        leftPunchActive: false,
      },
    };

    if (this.fighter.isDead) return intent;

    if (this.fighter.isKnockedDown) {
      this.state = 'RECOVER';
      return intent;
    }

    if (!target || target.isDead) {
      this.state = 'CIRCLE';
      return intent;
    }

    this.fighter.getPosition(_selfPos);
    target.getPosition(_targetPos);
    _toTarget.copy(_targetPos).sub(_selfPos);
    _toTarget.y = 0;
    const dist = _toTarget.length();
    if (dist > 0.01) {
      _toTarget.divideScalar(dist);
    } else {
      _toTarget.set(0, 0, -1);
    }

    // Smooth yaw facing toward target (-Z forward convention -> atan2(-x, -z))
    const desiredYaw = Math.atan2(-_toTarget.x, -_toTarget.z);
    let yawDiff = desiredYaw - this.facingYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.facingYaw += yawDiff * Math.min(1, dt * (5 + this.config.reactionSpeed * 4));
    intent.facingYaw = this.facingYaw;
    intent.arm.aimYaw = this.facingYaw;

    _side.set(-_toTarget.z, 0, _toTarget.x);

    this.stateTimer -= dt;
    this.decisionCooldown -= dt;

    // 1. Disarmed check: seek nearest dropped weapon
    if (!this.fighter.armController.rightWeapon) {
      const nearby = this.fighter.armController.findNearestGrabbableWeapon(
        allWeapons,
        'right',
        7.5,
      );
      if (nearby) {
        this.targetWeapon = nearby;
        this.state = 'SEEK_WEAPON';
      }
    }

    if (this.state === 'SEEK_WEAPON') {
      if (
        !this.targetWeapon ||
        this.targetWeapon.ownerId !== null ||
        this.fighter.armController.rightWeapon !== null
      ) {
        this.targetWeapon = null;
        this.state = 'APPROACH';
      } else {
        const wp = this.targetWeapon.body.translation();
        _wpPos.set(wp.x, wp.y, wp.z);
        const toW = _wpPos.sub(_selfPos);
        toW.y = 0;
        const wDist = toW.length();
        if (wDist < 1.35) {
          this.fighter.armController.grabWeapon(physics, this.targetWeapon, 'right');
          this.targetWeapon = null;
          this.state = 'APPROACH';
        } else {
          toW.normalize();
          intent.moveX = toW.x * 0.95;
          intent.moveZ = toW.z * 0.95;
          this.facingYaw = Math.atan2(-toW.x, -toW.z);
          intent.facingYaw = this.facingYaw;
          intent.arm.aimYaw = this.facingYaw;
        }
        return intent;
      }
    }

    // 2. React to incoming attacks from target
    const targetWeapon = target.armController.rightWeapon;
    const incomingThreat =
      dist < 2.65 &&
      targetWeapon !== null &&
      targetWeapon.sweetSpotVelocity.lengthSq() > 10;

    if (
      incomingThreat &&
      this.state !== 'BLOCK_PARRY' &&
      this.state !== 'DODGE' &&
      this.decisionCooldown <= 0
    ) {
      this.decisionCooldown = 0.45 - this.config.reactionSpeed * 0.2;
      const roll = Math.random();
      if (roll < this.config.parrySkill) {
        this.state = 'BLOCK_PARRY';
        this.stateTimer = 0.45 + Math.random() * 0.25;
      } else if (roll < this.config.parrySkill + 0.25) {
        this.state = 'DODGE';
        this.stateTimer = 0.35;
        this.circleDir = Math.random() > 0.5 ? 1 : -1;
      }
    }

    // 3. State Transitions & Physical Steering
    if (this.stateTimer <= 0) {
      if (dist > this.config.preferredRange + 0.85) {
        this.state = 'APPROACH';
        this.stateTimer = 0.35;
      } else if (
        this.state === 'WINDUP' &&
        dist < this.config.preferredRange + 0.9
      ) {
        this.state = Math.random() < 0.28 ? 'THRUST' : 'STRIKE';
        this.stateTimer = 0.34;
      } else if (dist <= this.config.preferredRange + 0.45) {
        const roll = Math.random();
        if (roll < this.config.aggression * 0.72 && this.fighter.stamina > 20) {
          this.state = 'WINDUP';
          this.stateTimer = 0.26 + (1 - this.config.reactionSpeed) * 0.16;
          this.swingDir = Math.random() > 0.5 ? 1 : -1;
          this.swingPitch = (Math.random() - 0.35) * 0.65;
        } else if (roll < 0.88) {
          this.state = 'CIRCLE';
          this.stateTimer = 0.45 + Math.random() * 0.45;
          if (Math.random() < 0.35) this.circleDir *= -1;
        } else {
          this.state = 'BLOCK_PARRY';
          this.stateTimer = 0.4;
        }
      } else {
        this.state = 'APPROACH';
        this.stateTimer = 0.3;
      }
    }

    switch (this.state) {
      case 'APPROACH': {
        intent.moveX = _toTarget.x * 0.9 + _side.x * this.circleDir * 0.22;
        intent.moveZ = _toTarget.z * 0.9 + _side.z * this.circleDir * 0.22;
        break;
      }
      case 'CIRCLE': {
        const distErr = dist - this.config.preferredRange;
        const radial = THREE.MathUtils.clamp(distErr * 0.8, -0.5, 0.7);
        intent.moveX = _toTarget.x * radial + _side.x * this.circleDir * 0.75;
        intent.moveZ = _toTarget.z * radial + _side.z * this.circleDir * 0.75;
        break;
      }
      case 'WINDUP': {
        // Pull weapon back to windup side as clear telegraph
        intent.moveX = _toTarget.x * 0.25 + _side.x * this.circleDir * 0.35;
        intent.moveZ = _toTarget.z * 0.25 + _side.z * this.circleDir * 0.35;
        intent.arm.attackHeld = true;
        intent.arm.swingX = -this.swingDir * 0.88;
        intent.arm.swingY = 0.45 + this.swingPitch * 0.3;
        break;
      }
      case 'STRIKE': {
        const progress = 1 - Math.max(0, this.stateTimer / 0.34);
        intent.moveX = _toTarget.x * 0.65;
        intent.moveZ = _toTarget.z * 0.65;
        intent.arm.attackHeld = true;
        intent.arm.swingX = THREE.MathUtils.lerp(-this.swingDir * 0.85, this.swingDir * 0.98, progress);
        intent.arm.swingY = THREE.MathUtils.lerp(0.45, -0.35 + this.swingPitch, progress);
        break;
      }
      case 'THRUST': {
        intent.moveX = _toTarget.x * 0.85;
        intent.moveZ = _toTarget.z * 0.85;
        intent.arm.thrustActive = true;
        break;
      }
      case 'BLOCK_PARRY': {
        intent.moveX = -_toTarget.x * 0.35 + _side.x * this.circleDir * 0.3;
        intent.moveZ = -_toTarget.z * 0.35 + _side.z * this.circleDir * 0.3;
        intent.arm.defendHeld = true;
        break;
      }
      case 'DODGE': {
        intent.moveX = -_toTarget.x * 0.6 + _side.x * this.circleDir * 0.85;
        intent.moveZ = -_toTarget.z * 0.6 + _side.z * this.circleDir * 0.85;
        intent.arm.defendHeld = true;
        break;
      }
      default:
        break;
    }

    return intent;
  }
}
