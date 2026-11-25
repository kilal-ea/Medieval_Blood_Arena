import * as THREE from 'three';
import { RAPIER } from '../physics/RapierLoader';
import {
  applyLinearVelocityAssist,
  applyOrientationPDTorque,
} from '../physics/JointControllers';
import {
  ALL_FIGHTERS_MASK,
  CollisionBit,
  makeCollisionGroups,
  type PhysicsWorld,
} from '../physics/PhysicsWorld';
import { CONTROL_TUNING } from '../controls/ControlTuning';
import type { BodyPartId, FighterHudState } from '../core/types';
import { ANATOMY_SPECS, BODY_PART_ORDER } from './AnatomySpec';
import { createSegmentMesh, type FighterAppearance } from './HumanoidMeshes';
import {
  ArmHandController,
  extractArmSegments,
  type ArmControlInput,
} from './ArmHandController';

export interface FighterControlIntent {
  moveX: number; // -1..1 in world XZ or camera-relative converted before passing
  moveZ: number; // -1..1
  facingYaw: number;
  jumpPressed: boolean;
  arm: ArmControlInput;
}

const _quat = new THREE.Quaternion();
const _torsoTarget = new THREE.Quaternion();
const _pelvisTarget = new THREE.Quaternion();
const _headTarget = new THREE.Quaternion();
const _thighLQuat = new THREE.Quaternion();
const _shinLQuat = new THREE.Quaternion();
const _thighRQuat = new THREE.Quaternion();
const _shinRQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _up = new THREE.Vector3(0, 1, 0);
const _bodyUp = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pelvisPos = new THREE.Vector3();
const _anchorA = new THREE.Vector3();
const _anchorB = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();

function wrapAngleRad(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export const RAGDOLL_TUNING = CONTROL_TUNING.locomotion;

let nextFighterUid = 1;

export class ActiveRagdoll {
  public readonly id: string;
  public readonly name: string;
  public readonly isPlayer: boolean;
  public readonly collisionBit: number;

  public readonly bodies = {} as Record<BodyPartId, RAPIER.RigidBody>;
  public readonly colliders = {} as Record<BodyPartId, RAPIER.Collider>;
  public readonly meshes = {} as Record<BodyPartId, THREE.Group>;
  public readonly joints: RAPIER.ImpulseJoint[] = [];
  public readonly armController: ArmHandController;

  public health = 100;
  public maxHealth = 100;
  public stamina = 100;
  public maxStamina = 100;
  public balance = 1;
  public isKnockedDown = false;
  public isDead = false;
  public staggerTimer = 0;

  private knockdownTimer = 0;
  private recoveryProgress = 0;
  private walkPhase = 0;
  private jumpCooldown = 0;
  private hitFlashTimer = 0;
  private currentFootFriction: number = RAGDOLL_TUNING.footFrictionIdle;
  private stanceAnchorX: number | null = null;
  private stanceAnchorZ: number | null = null;
  private smoothedYaw = 0;
  private currVelX = 0;
  private currVelZ = 0;
  private smoothedMoveMag = 0;
  private flashMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly scene: THREE.Scene,
    options: {
      name: string;
      isPlayer: boolean;
      slotIndex: number; // 0..5 for collision group bitmask
      spawnPos: THREE.Vector3;
      facingYaw: number;
      appearance: FighterAppearance;
      maxHealth?: number;
    },
  ) {
    this.id = `ftr_${nextFighterUid++}`;
    this.name = options.name;
    this.isPlayer = options.isPlayer;
    this.maxHealth = options.maxHealth ?? 100;
    this.health = this.maxHealth;
    this.smoothedYaw = wrapAngleRad(options.facingYaw);

    const bitShift = Math.min(5, Math.max(0, options.slotIndex));
    this.collisionBit = CollisionBit.FIGHTER_0 << bitShift;
    const filterMask =
      CollisionBit.ENVIRONMENT |
      CollisionBit.WEAPON |
      CollisionBit.DUMMY |
      (ALL_FIGHTERS_MASK & ~this.collisionBit);
    const groups = makeCollisionGroups(this.collisionBit, filterMask);

    const yawQuat = new THREE.Quaternion().setFromAxisAngle(_up, options.facingYaw);
    let fingersL: THREE.Group | undefined;
    let fingersR: THREE.Group | undefined;

    // 1. Create all 17 rigid bodies, colliders, and Three.js composite meshes
    for (const partId of BODY_PART_ORDER) {
      const spec = ANATOMY_SPECS[partId];
      const localOffset = new THREE.Vector3(...spec.initialOffset).applyQuaternion(yawQuat);
      const wx = options.spawnPos.x + localOffset.x;
      const wy = options.spawnPos.y + localOffset.y;
      const wz = options.spawnPos.z + localOffset.z;

      const rbDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(wx, wy, wz)
        .setRotation({ x: yawQuat.x, y: yawQuat.y, z: yawQuat.z, w: yawQuat.w })
        .setLinearDamping(0.35)
        .setAngularDamping(1.1);
      const body = physics.world.createRigidBody(rbDesc);

      let colDesc: RAPIER.ColliderDesc;
      if (spec.shape === 'box') {
        colDesc = RAPIER.ColliderDesc.cuboid(spec.dims[0], spec.dims[1], spec.dims[2]);
      } else if (spec.shape === 'capsule') {
        colDesc = RAPIER.ColliderDesc.capsule(spec.dims[0], spec.dims[1]);
      } else {
        colDesc = RAPIER.ColliderDesc.ball(spec.dims[0]);
      }

      const isFoot = partId === 'footL' || partId === 'footR';
      colDesc
        .setMass(spec.mass)
        .setFriction(isFoot ? RAGDOLL_TUNING.footFrictionIdle : 0.45)
        .setRestitution(0.02)
        .setCollisionGroups(groups)
        .setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
        )
        .setContactForceEventThreshold(6);

      const collider = physics.world.createCollider(colDesc, body);
      physics.registerColliderMeta(collider.handle, {
        kind: 'body',
        fighterId: this.id,
        bodyPart: partId,
        armorRating: spec.armorRating,
        damageMultiplier: spec.damageMultiplier,
      });

      const segVisual = createSegmentMesh(partId, options.appearance);
      segVisual.group.position.set(wx, wy, wz);
      segVisual.group.quaternion.copy(yawQuat);
      scene.add(segVisual.group);
      this.flashMaterials.push(...segVisual.flashMaterials);

      if (partId === 'handL') fingersL = segVisual.fingersPivot;
      if (partId === 'handR') fingersR = segVisual.fingersPivot;

      this.bodies[partId] = body;
      this.colliders[partId] = collider;
      this.meshes[partId] = segVisual.group;
      physics.registerInterpolated(body, segVisual.group);
    }

    // 2. Connect all 16 anatomical impulse joints
    for (const partId of BODY_PART_ORDER) {
      const spec = ANATOMY_SPECS[partId];
      if (!spec.parent || !spec.anchorParent || !spec.anchorChild) continue;
      const parentBody = this.bodies[spec.parent];
      const childBody = this.bodies[partId];

      const a1 = { x: spec.anchorParent[0], y: spec.anchorParent[1], z: spec.anchorParent[2] };
      const a2 = { x: spec.anchorChild[0], y: spec.anchorChild[1], z: spec.anchorChild[2] };

      let jData: RAPIER.JointData;
      if (spec.jointType === 'revolute' && spec.hingeAxis) {
        jData = RAPIER.JointData.revolute(a1, a2, {
          x: spec.hingeAxis[0],
          y: spec.hingeAxis[1],
          z: spec.hingeAxis[2],
        });
        if (spec.limits) {
          jData.limitsEnabled = true;
          jData.limits = [spec.limits[0], spec.limits[1]];
        }
      } else {
        jData = RAPIER.JointData.spherical(a1, a2);
      }

      const joint = physics.world.createImpulseJoint(jData, parentBody, childBody, true);
      joint.setContactsEnabled(false);
      this.joints.push(joint);
    }

    this.armController = new ArmHandController(
      this.id,
      this.collisionBit,
      extractArmSegments(this.bodies, fingersL, fingersR),
    );
  }

  public getPosition(out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.bodies.pelvis.translation();
    return out.set(p.x, p.y, p.z);
  }

  public getHeadPosition(out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.bodies.head.translation();
    return out.set(p.x, p.y, p.z);
  }

  public getForwardDir(out = new THREE.Vector3()): THREE.Vector3 {
    const r = this.bodies.chest.rotation();
    _quat.set(r.x, r.y, r.z, r.w);
    return out.set(0, 0, -1).applyQuaternion(_quat).setY(0).normalize();
  }

  public getFacingYaw(): number {
    const r = this.bodies.pelvis.rotation();
    _quat.set(r.x, r.y, r.z, r.w);
    _forward.set(0, 0, -1).applyQuaternion(_quat);
    return Math.atan2(-_forward.x, -_forward.z);
  }

  /**
   * Measures maximum world-space joint anchor separation error across all 16 anatomical joints.
   */
  public getMaxJointSeparation(): number {
    let maxErr = 0;
    for (const partId of BODY_PART_ORDER) {
      const spec = ANATOMY_SPECS[partId];
      if (!spec.parent || !spec.anchorParent || !spec.anchorChild) continue;
      const pBody = this.bodies[spec.parent];
      const cBody = this.bodies[partId];
      const pp = pBody.translation();
      const pr = pBody.rotation();
      const cp = cBody.translation();
      const cr = cBody.rotation();

      _qA.set(pr.x, pr.y, pr.z, pr.w);
      _qB.set(cr.x, cr.y, cr.z, cr.w);
      _anchorA.set(spec.anchorParent[0], spec.anchorParent[1], spec.anchorParent[2]).applyQuaternion(_qA);
      _anchorA.x += pp.x;
      _anchorA.y += pp.y;
      _anchorA.z += pp.z;

      _anchorB.set(spec.anchorChild[0], spec.anchorChild[1], spec.anchorChild[2]).applyQuaternion(_qB);
      _anchorB.x += cp.x;
      _anchorB.y += cp.y;
      _anchorB.z += cp.z;

      const err = _anchorA.distanceTo(_anchorB);
      if (err > maxErr) maxErr = err;
    }
    return maxErr;
  }

  public applyDamage(
    amount: number,
    balanceShock: number,
    partId: BodyPartId,
    impulseVec?: THREE.Vector3,
  ): void {
    if (this.isDead) return;

    this.health = Math.max(0, this.health - amount);
    this.balance = Math.max(0, this.balance - balanceShock);
    this.hitFlashTimer = 0.14;

    if (balanceShock >= 0.25) {
      this.staggerTimer = Math.max(this.staggerTimer, 0.55);
      this.stanceAnchorX = null;
      this.stanceAnchorZ = null;
      this.setFootFriction(RAGDOLL_TUNING.footFrictionStagger, true);
    }

    if (impulseVec) {
      const targetBody = this.bodies[partId] ?? this.bodies.chest;
      targetBody.applyImpulse({ x: impulseVec.x, y: impulseVec.y, z: impulseVec.z }, true);
      if (Math.hypot(impulseVec.x, impulseVec.z) > 6) {
        this.stanceAnchorX = null;
        this.stanceAnchorZ = null;
      }
    }

    if (this.balance <= 0.16 && !this.isKnockedDown) {
      this.isKnockedDown = true;
      this.knockdownTimer = 1.65;
      this.recoveryProgress = 0;
    }

    if (this.health <= 0) {
      this.die();
    }
  }

  public die(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.isKnockedDown = true;
    this.balance = 0;
    this.setFootFriction(RAGDOLL_TUNING.footFrictionRagdoll);
    for (const partId of BODY_PART_ORDER) {
      this.bodies[partId].setAngularDamping(0.45);
      this.bodies[partId].setLinearDamping(0.25);
    }
    this.armController.releaseWeapon(
      this.physics,
      'right',
      new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.6, (Math.random() - 0.5) * 1.2),
    );
    this.armController.releaseWeapon(
      this.physics,
      'left',
      new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.6, (Math.random() - 0.5) * 1.2),
    );
  }

  public updateVisualFlash(dt: number): void {
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const flash = this.hitFlashTimer > 0 ? 0.55 : 0;
      for (const m of this.flashMaterials) {
        m.emissive.setRGB(flash, flash * 0.08, flash * 0.08);
      }
    }
  }

  private setFootFriction(friction: number, slipLow = false): void {
    if (Math.abs(this.currentFootFriction - friction) < 0.01) return;
    this.currentFootFriction = friction;
    const rule = slipLow
      ? RAPIER.CoefficientCombineRule.Min
      : RAPIER.CoefficientCombineRule.Average;
    this.colliders.footL.setFriction(friction);
    this.colliders.footR.setFriction(friction);
    this.colliders.footL.setFrictionCombineRule(rule);
    this.colliders.footR.setFrictionCombineRule(rule);
  }

  public updatePhysics(dt: number, intent: FighterControlIntent): void {
    if (this.isDead) return;

    if (this.jumpCooldown > 0) this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    if (this.staggerTimer > 0) this.staggerTimer = Math.max(0, this.staggerTimer - dt);

    // Stamina drain & regeneration
    const staminaDrain =
      (intent.arm.attackHeld ? 9 : 0) +
      (intent.arm.defendHeld ? 4 : 0) +
      (intent.arm.thrustActive ? 14 : 0);
    if (staminaDrain > 0) {
      this.stamina = Math.max(0, this.stamina - staminaDrain * dt);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + 18 * dt);
    }
    const staminaRatio = this.stamina / this.maxStamina;

    // 1. State Assessment & Impact / Recovery Controller
    const pp = this.bodies.pelvis.translation();
    _pelvisPos.set(pp.x, pp.y, pp.z);
    const footLP = this.bodies.footL.translation();
    const footRP = this.bodies.footR.translation();
    const footMinY = Math.min(footLP.y, footRP.y);
    const grounded = footMinY < 0.18 && pp.y < 1.08;

    const chestRot = this.bodies.chest.rotation();
    _quat.set(chestRot.x, chestRot.y, chestRot.z, chestRot.w);
    _bodyUp.set(0, 1, 0).applyQuaternion(_quat);
    const uprightDot = _bodyUp.dot(_up);

    // Trigger natural knockdown if tipped past ~65 degrees and low
    if (!this.isKnockedDown && uprightDot < 0.42 && pp.y < 0.72) {
      this.isKnockedDown = true;
      this.knockdownTimer = 1.15;
      this.recoveryProgress = 0;
      this.balance = 0.1;
    }

    let muscleScale = 1;
    if (this.isKnockedDown) {
      this.stanceAnchorX = null;
      this.stanceAnchorZ = null;
      this.setFootFriction(RAGDOLL_TUNING.footFrictionRagdoll);
      this.knockdownTimer -= dt;
      if (this.knockdownTimer > 0) {
        muscleScale = 0.08;
      } else {
        // Torque-driven physical recovery attempt (no teleporting)
        this.recoveryProgress = Math.min(1, this.recoveryProgress + dt * 1.15);
        muscleScale = 0.4 + this.recoveryProgress * 0.9;

        if (pp.y < 0.9) {
          // Direct gravity-overcoming upward recovery lift split between pelvis and chest
          const pVy = this.bodies.pelvis.linvel().y;
          const cVy = this.bodies.chest.linvel().y;
          const liftPelvis = THREE.MathUtils.clamp((490 - pVy * 110) * this.recoveryProgress, 0, 560);
          const liftChest = THREE.MathUtils.clamp((460 - cVy * 110) * this.recoveryProgress, 0, 520);
          this.bodies.pelvis.applyImpulse({ x: 0, y: liftPelvis * dt, z: 0 }, true);
          this.bodies.chest.applyImpulse({ x: 0, y: liftChest * dt, z: 0 }, true);
        }
        if (uprightDot > 0.72 && pp.y > 0.72) {
          this.isKnockedDown = false;
          this.balance = 0.68;
        }
      }
    } else {
      this.balance = Math.min(1, this.balance + dt * 0.25);
      muscleScale = THREE.MathUtils.clamp(
        0.58 + this.balance * 0.42 - (this.staggerTimer > 0 ? 0.28 : 0),
        0.25,
        1,
      );
    }

    // 2. Smooth Yaw & Balance Controller (upright torso, coordinated head/pelvis turning)
    const rot = CONTROL_TUNING.rotation;
    const rawMoveMag = Math.hypot(intent.moveX, intent.moveZ);
    const moveMag = Math.min(1, rawMoveMag);
    const invMag = rawMoveMag > 1 ? 1 / rawMoveMag : 1;
    const normMoveX = intent.moveX * invMag;
    const normMoveZ = intent.moveZ * invMag;

    const rawYawErr = wrapAngleRad(intent.facingYaw - this.smoothedYaw);
    const turnRate = THREE.MathUtils.clamp(
      rawYawErr * rot.turnResponsiveness,
      -rot.maxTurnSpeed,
      rot.maxTurnSpeed,
    );
    this.smoothedYaw = wrapAngleRad(this.smoothedYaw + turnRate * dt);
    const activeYaw = this.smoothedYaw;

    _yawQuat.setFromAxisAngle(_up, activeYaw);
    _forward.set(0, 0, -1).applyQuaternion(_yawQuat);
    _right.set(1, 0, 0).applyQuaternion(_yawQuat);

    const localFwd = normMoveX * _forward.x + normMoveZ * _forward.z;
    const localRight = normMoveX * _right.x + normMoveZ * _right.z;

    this.updateBalanceController(
      dt,
      intent,
      muscleScale,
      activeYaw,
      rawYawErr,
      turnRate,
      localFwd,
      localRight,
      moveMag,
    );

    // 3. Acceleration-Based Locomotion & Ground Stance Controller
    if (!this.isKnockedDown) {
      this.updateLocomotionController(
        dt,
        intent,
        muscleScale,
        staminaRatio,
        grounded,
        pp.x,
        pp.y,
        pp.z,
        normMoveX,
        normMoveZ,
        moveMag,
        activeYaw,
        turnRate,
        localFwd,
        localRight,
      );
    }

    // 4. Independent Arm & Hand Controller (2-bone IK + filtered wrist/weapon control)
    this.armController.update(dt, intent.arm, muscleScale, staminaRatio);
  }

  private updateBalanceController(
    dt: number,
    intent: FighterControlIntent,
    muscleScale: number,
    activeYaw: number,
    rawYawErr: number,
    turnRate: number,
    localFwd: number,
    localRight: number,
    moveMag: number,
  ): void {
    const rot = CONTROL_TUNING.rotation;
    const isTurning = Math.abs(turnRate) > 0.35;
    const rotScale = muscleScale * (isTurning ? rot.bodyRotationDamping : 1.0);

    // Natural torso lean during active motion or guard/strike (zero bias when idle)
    const combatPitch = intent.arm.attackHeld ? -0.045 : intent.arm.defendHeld ? 0.035 : 0;
    const movePitch = this.smoothedMoveMag > 0.04 ? -localFwd * 0.048 * this.smoothedMoveMag : 0;
    const moveRoll = this.smoothedMoveMag > 0.04 ? -localRight * 0.038 * this.smoothedMoveMag : 0;

    // Subtle upper-body follow-through toward active weapon sweep/position
    const weaponFollowYaw =
      intent.arm.attackHeld || intent.arm.weaponManipActive
        ? THREE.MathUtils.clamp(-intent.arm.swingX * rot.torsoWeaponFollowRad, -0.22, 0.22)
        : 0;

    // Subtle pelvis alignment toward strafe/diagonal movement without over-twisting spine
    let pelvisYaw = activeYaw;
    if (moveMag > 0.15 && Math.abs(localRight) > 0.15 && !intent.arm.defendHeld) {
      const strafeOffset = Math.atan2(-localRight, Math.max(0.35, Math.abs(localFwd)));
      const clampedTwist = THREE.MathUtils.clamp(
        strafeOffset * rot.walkTurnBlend,
        -rot.maxSpineTwistRad * 0.6,
        rot.maxSpineTwistRad * 0.6,
      );
      pelvisYaw = wrapAngleRad(activeYaw + clampedTwist);
    }

    const chestYawOffset = THREE.MathUtils.clamp(
      rawYawErr * 0.12 + weaponFollowYaw,
      -rot.maxSpineTwistRad,
      rot.maxSpineTwistRad,
    );
    const chestYaw = wrapAngleRad(activeYaw + chestYawOffset);
    const abdomenYaw = wrapAngleRad(activeYaw + chestYawOffset * 0.5);
    const headYaw = wrapAngleRad(
      activeYaw + THREE.MathUtils.clamp(rawYawErr * rot.headLeadFactor, -0.32, 0.32),
    );

    _euler.set(0, pelvisYaw, 0);
    _pelvisTarget.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.pelvis,
      _pelvisTarget,
      ANATOMY_SPECS.pelvis.kp,
      ANATOMY_SPECS.pelvis.kd,
      ANATOMY_SPECS.pelvis.maxTorque,
      dt,
      rotScale,
    );

    _euler.set((combatPitch + movePitch) * 0.5, abdomenYaw, moveRoll * 0.5);
    _torsoTarget.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.abdomen,
      _torsoTarget,
      ANATOMY_SPECS.abdomen.kp,
      ANATOMY_SPECS.abdomen.kd,
      ANATOMY_SPECS.abdomen.maxTorque,
      dt,
      rotScale,
    );

    _euler.set(combatPitch + movePitch, chestYaw, moveRoll);
    _torsoTarget.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.chest,
      _torsoTarget,
      ANATOMY_SPECS.chest.kp,
      ANATOMY_SPECS.chest.kd,
      ANATOMY_SPECS.chest.maxTorque,
      dt,
      rotScale,
    );

    _euler.set(0, wrapAngleRad(activeYaw + (headYaw - activeYaw) * 0.5), 0);
    _headTarget.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.neck,
      _headTarget,
      ANATOMY_SPECS.neck.kp,
      ANATOMY_SPECS.neck.kd,
      ANATOMY_SPECS.neck.maxTorque,
      dt,
      muscleScale,
    );

    _euler.set(intent.arm.aimPitch * 0.25, headYaw, 0);
    _headTarget.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.head,
      _headTarget,
      ANATOMY_SPECS.head.kp,
      ANATOMY_SPECS.head.kd,
      ANATOMY_SPECS.head.maxTorque,
      dt,
      muscleScale,
    );
  }

  private updateLocomotionController(
    dt: number,
    intent: FighterControlIntent,
    muscleScale: number,
    staminaRatio: number,
    grounded: boolean,
    px: number,
    py: number,
    pz: number,
    moveX: number,
    moveZ: number,
    moveMag: number,
    activeYaw: number,
    turnRate: number,
    localFwd: number,
    localRight: number,
  ): void {
    const loco = CONTROL_TUNING.locomotion;
    const isInputMoving = moveMag > 0.03;

    // Smooth analog walk-to-run speed curve
    const baseTopSpeed =
      THREE.MathUtils.lerp(loco.walkSpeed, loco.runSpeed, Math.min(1, moveMag * 1.15)) *
      (0.88 + staminaRatio * 0.12) *
      (intent.arm.defendHeld ? loco.guardSpeedFactor : 1) *
      (intent.arm.weaponManipActive ? loco.precisionWalkFactor : 1);

    const desiredVx = isInputMoving ? moveX * baseTopSpeed : 0;
    const desiredVz = isInputMoving ? moveZ * baseTopSpeed : 0;

    // Acceleration-based smooth velocity ramping (eliminates sudden pelvis jerks)
    const dvx = desiredVx - this.currVelX;
    const dvz = desiredVz - this.currVelZ;
    const dvMag = Math.hypot(dvx, dvz);

    if (dvMag > 1e-4) {
      const currSpeed = Math.hypot(this.currVelX, this.currVelZ);
      let accelRate: number = loco.acceleration;
      if (!isInputMoving) {
        accelRate = loco.deceleration;
      } else if (currSpeed > 0.2) {
        const dot = (this.currVelX * desiredVx + this.currVelZ * desiredVz) / (currSpeed * Math.max(0.01, baseTopSpeed));
        if (dot < 0.35) accelRate = loco.directionChangeAccel;
      }
      const maxStep = accelRate * dt;
      if (dvMag <= maxStep) {
        this.currVelX = desiredVx;
        this.currVelZ = desiredVz;
      } else {
        const s = maxStep / dvMag;
        this.currVelX += dvx * s;
        this.currVelZ += dvz * s;
      }
    }

    const smoothedSpeed = Math.hypot(this.currVelX, this.currVelZ);
    const targetMoveRatio = Math.min(1, smoothedSpeed / loco.runSpeed);
    this.smoothedMoveMag = THREE.MathUtils.lerp(
      this.smoothedMoveMag,
      targetMoveRatio,
      1 - Math.exp(-14 * dt),
    );
    const isMoving = isInputMoving || smoothedSpeed > 0.06;

    let targetVx = this.currVelX;
    let targetVz = this.currVelZ;

    const pelvisVel = this.bodies.pelvis.linvel();
    const horizSpeed = Math.hypot(pelvisVel.x, pelvisVel.z);
    const isTurningInPlace = !isMoving && Math.abs(turnRate) > 0.45;

    if (isMoving || this.staggerTimer > 0 || isTurningInPlace) {
      this.stanceAnchorX = null;
      this.stanceAnchorZ = null;
    } else if (grounded) {
      if (this.stanceAnchorX === null || this.stanceAnchorZ === null) {
        if (horizSpeed < 0.08) {
          this.stanceAnchorX = px;
          this.stanceAnchorZ = pz;
        }
      } else {
        const dx = this.stanceAnchorX - px;
        const dz = this.stanceAnchorZ - pz;
        if (Math.hypot(dx, dz) > 0.28) {
          this.stanceAnchorX = px;
          this.stanceAnchorZ = pz;
        } else {
          targetVx = THREE.MathUtils.clamp(
            dx * loco.idleAnchorGain,
            -loco.idleAnchorMaxSpeed,
            loco.idleAnchorMaxSpeed,
          );
          targetVz = THREE.MathUtils.clamp(
            dz * loco.idleAnchorGain,
            -loco.idleAnchorMaxSpeed,
            loco.idleAnchorMaxSpeed,
          );
        }
      }
    }

    // Dynamic foot friction modulation: planted idle, smooth pivot turn, low-drag walk, free stagger
    if (this.staggerTimer > 0) {
      this.setFootFriction(loco.footFrictionStagger, true);
    } else if (isMoving) {
      const walkFric = THREE.MathUtils.lerp(loco.footFrictionTurn, loco.footFrictionWalk, Math.min(1, this.smoothedMoveMag * 1.4));
      this.setFootFriction(walkFric, true);
    } else if (isTurningInPlace) {
      this.setFootFriction(loco.footFrictionTurn, true);
    } else {
      this.setFootFriction(loco.footFrictionIdle, false);
    }

    // Whole-body vertical leg extensor support when grounded
    if (grounded) {
      const targetPelvisY = THREE.MathUtils.lerp(
        loco.idlePelvisHeight,
        loco.walkPelvisHeight,
        this.smoothedMoveMag,
      );
      const vertForce = THREE.MathUtils.clamp(
        (loco.verticalSupportMass * ((targetPelvisY - py) * 48 - pelvisVel.y * 10.5) +
          loco.verticalFeedforwardN) *
          muscleScale,
        -220,
        1250,
      );
      this.bodies.pelvis.applyImpulse({ x: 0, y: vertForce * dt, z: 0 }, true);
    }

    // Coordinated horizontal COM velocity drive across pelvis + abdomen + chest + legs
    if (this.staggerTimer <= 0) {
      const pelvisHorizRate = grounded ? loco.pelvisFollowRate : 1.8;

      applyLinearVelocityAssist(
        this.bodies.pelvis,
        targetVx,
        null,
        targetVz,
        pelvisHorizRate,
        (grounded ? 720 : 120) * muscleScale,
        dt,
      );

      if (grounded) {
        applyLinearVelocityAssist(
          this.bodies.abdomen,
          targetVx,
          null,
          targetVz,
          loco.torsoFollowRate,
          400 * muscleScale,
          dt,
        );
        applyLinearVelocityAssist(
          this.bodies.chest,
          targetVx,
          null,
          targetVz,
          loco.torsoFollowRate,
          600 * muscleScale,
          dt,
        );
        if (isMoving) {
          applyLinearVelocityAssist(
            this.bodies.thighL,
            targetVx,
            null,
            targetVz,
            loco.legFollowRate,
            240 * muscleScale,
            dt,
          );
          applyLinearVelocityAssist(
            this.bodies.thighR,
            targetVx,
            null,
            targetVz,
            loco.legFollowRate,
            240 * muscleScale,
            dt,
          );
          applyLinearVelocityAssist(
            this.bodies.lowerLegL,
            targetVx,
            null,
            targetVz,
            loco.legFollowRate * 0.85,
            150 * muscleScale,
            dt,
          );
          applyLinearVelocityAssist(
            this.bodies.lowerLegR,
            targetVx,
            null,
            targetVz,
            loco.legFollowRate * 0.85,
            150 * muscleScale,
            dt,
          );
          applyLinearVelocityAssist(
            this.bodies.footL,
            targetVx,
            null,
            targetVz,
            loco.legFollowRate * 0.85,
            82 * muscleScale,
            dt,
          );
          applyLinearVelocityAssist(
            this.bodies.footR,
            targetVx,
            null,
            targetVz,
            loco.legFollowRate * 0.85,
            82 * muscleScale,
            dt,
          );
        }
      }
    } else {
      this.currVelX = pelvisVel.x;
      this.currVelZ = pelvisVel.z;
    }

    // Jump / Lunge impulse
    if (intent.jumpPressed && grounded && this.jumpCooldown <= 0 && this.stamina >= 12) {
      this.stamina -= 12;
      this.jumpCooldown = 0.65;
      const lungeX = moveX * 8;
      const lungeZ = moveZ * 8;
      this.bodies.pelvis.applyImpulse({ x: lungeX, y: 42, z: lungeZ }, true);
      this.bodies.chest.applyImpulse({ x: lungeX * 0.7, y: 34, z: lungeZ * 0.7 }, true);
    }

    // Speed-matched directional leg stride + pivot stepping during turns
    if (isMoving && grounded) {
      this.walkPhase += dt * (4.2 + this.smoothedMoveMag * 7.2);
    } else if (isTurningInPlace && grounded) {
      this.walkPhase += dt * Math.min(8.0, Math.abs(turnRate) * 2.2);
    } else {
      const nearestHalfPi = Math.round(this.walkPhase / Math.PI) * Math.PI;
      this.walkPhase = THREE.MathUtils.lerp(this.walkPhase, nearestHalfPi, Math.min(1, dt * 8));
    }

    const turnStepAmp = isTurningInPlace ? Math.min(0.18, Math.abs(turnRate) * 0.035) : 0;
    const strideAmp = this.smoothedMoveMag * 0.44 + turnStepAmp;
    const sL = Math.sin(this.walkPhase) * strideAmp;
    const sR = Math.sin(this.walkPhase + Math.PI) * strideAmp;

    const dirFwd = isMoving ? localFwd : isTurningInPlace ? 0.65 : 0;
    const dirRight = isMoving ? localRight : 0;

    // Standing slight athletic knee flex keeps ankles directly beneath hips
    const baseThighPitch = 0.08;
    const baseKneeFlex = -0.16;

    // Left leg
    const thighLPitch = baseThighPitch + sL * dirFwd;
    const thighLRoll = 0.035 - sL * dirRight * 0.52;
    _euler.set(thighLPitch, activeYaw, thighLRoll);
    _thighLQuat.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.thighL,
      _thighLQuat,
      ANATOMY_SPECS.thighL.kp,
      ANATOMY_SPECS.thighL.kd,
      ANATOMY_SPECS.thighL.maxTorque,
      dt,
      muscleScale,
    );

    const kneeFlexL =
      baseKneeFlex - Math.max(0, sL * dirFwd) * 0.56 - Math.abs(sL * dirRight) * 0.35;
    _euler.set(thighLPitch + kneeFlexL, activeYaw, thighLRoll * 0.5);
    _shinLQuat.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.lowerLegL,
      _shinLQuat,
      ANATOMY_SPECS.lowerLegL.kp,
      ANATOMY_SPECS.lowerLegL.kd,
      ANATOMY_SPECS.lowerLegL.maxTorque,
      dt,
      muscleScale,
    );

    const footLPitch = isMoving || isTurningInPlace ? Math.max(0, sL * dirFwd) * 0.34 : 0;
    _euler.set(footLPitch, activeYaw, 0);
    _thighLQuat.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.footL,
      _thighLQuat,
      ANATOMY_SPECS.footL.kp,
      ANATOMY_SPECS.footL.kd,
      ANATOMY_SPECS.footL.maxTorque,
      dt,
      muscleScale,
    );

    // Right leg
    const thighRPitch = baseThighPitch + sR * dirFwd;
    const thighRRoll = -0.035 - sR * dirRight * 0.52;
    _euler.set(thighRPitch, activeYaw, thighRRoll);
    _thighRQuat.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.thighR,
      _thighRQuat,
      ANATOMY_SPECS.thighR.kp,
      ANATOMY_SPECS.thighR.kd,
      ANATOMY_SPECS.thighR.maxTorque,
      dt,
      muscleScale,
    );

    const kneeFlexR =
      baseKneeFlex - Math.max(0, sR * dirFwd) * 0.56 - Math.abs(sR * dirRight) * 0.35;
    _euler.set(thighRPitch + kneeFlexR, activeYaw, thighRRoll * 0.5);
    _shinRQuat.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.lowerLegR,
      _shinRQuat,
      ANATOMY_SPECS.lowerLegR.kp,
      ANATOMY_SPECS.lowerLegR.kd,
      ANATOMY_SPECS.lowerLegR.maxTorque,
      dt,
      muscleScale,
    );

    const footRPitch = isMoving || isTurningInPlace ? Math.max(0, sR * dirFwd) * 0.34 : 0;
    _euler.set(footRPitch, activeYaw, 0);
    _thighRQuat.setFromEuler(_euler);
    applyOrientationPDTorque(
      this.bodies.footR,
      _thighRQuat,
      ANATOMY_SPECS.footR.kp,
      ANATOMY_SPECS.footR.kd,
      ANATOMY_SPECS.footR.maxTorque,
      dt,
      muscleScale,
    );
  }

  public getHudState(): FighterHudState {
    return {
      id: this.id,
      name: this.name,
      health: Math.ceil(this.health),
      maxHealth: this.maxHealth,
      stamina: Math.round(this.stamina),
      maxStamina: this.maxStamina,
      balance: Math.round(this.balance * 100),
      isKnockedDown: this.isKnockedDown,
      isDead: this.isDead,
      rightWeapon: this.armController.rightWeapon?.type ?? null,
      leftWeapon: this.armController.leftWeapon?.type ?? null,
      rightGripStrength: Math.round(this.armController.rightGripStrength),
      leftGripStrength: Math.round(this.armController.leftGripStrength),
    };
  }

  public dispose(): void {
    this.armController.dispose(this.physics);
    for (const joint of this.joints) {
      if (joint.isValid()) {
        this.physics.world.removeImpulseJoint(joint, true);
      }
    }
    this.joints.length = 0;

    for (const partId of BODY_PART_ORDER) {
      const body = this.bodies[partId];
      const col = this.colliders[partId];
      const mesh = this.meshes[partId];
      this.physics.unregisterInterpolated(body.handle);
      this.physics.unregisterColliderMeta(col.handle);
      if (this.physics.world.bodies.contains(body.handle)) {
        this.physics.world.removeRigidBody(body);
      }
      this.scene.remove(mesh);
    }
  }
}
