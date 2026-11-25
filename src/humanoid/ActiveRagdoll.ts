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
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _up = new THREE.Vector3(0, 1, 0);
const _bodyUp = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pelvisPos = new THREE.Vector3();

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
        .setLinearDamping(0.4)
        .setAngularDamping(1.2);
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
        .setFriction(isFoot ? 1.1 : 0.45)
        .setRestitution(0.05)
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

    // 2. Connect anatomical impulse joints
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
      this.staggerTimer = Math.max(this.staggerTimer, 0.35);
    }

    if (impulseVec) {
      const targetBody = this.bodies[partId] ?? this.bodies.chest;
      targetBody.applyImpulse({ x: impulseVec.x, y: impulseVec.y, z: impulseVec.z }, true);
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
    // Lower angular damping slightly for natural ragdoll collapse
    for (const partId of BODY_PART_ORDER) {
      this.bodies[partId].setAngularDamping(0.45);
      this.bodies[partId].setLinearDamping(0.25);
    }
    // Release weapons with slight tumble impulse
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

  public updatePhysics(dt: number, intent: FighterControlIntent): void {
    if (this.isDead) {
      return;
    }

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

    // Grounded & upright checks
    const pp = this.bodies.pelvis.translation();
    _pelvisPos.set(pp.x, pp.y, pp.z);
    const footLY = this.bodies.footL.translation().y;
    const footRY = this.bodies.footR.translation().y;
    const grounded = footLY < 0.22 || footRY < 0.22 || pp.y < 1.05;

    const chestRot = this.bodies.chest.rotation();
    _quat.set(chestRot.x, chestRot.y, chestRot.z, chestRot.w);
    _bodyUp.set(0, 1, 0).applyQuaternion(_quat);
    const uprightDot = _bodyUp.dot(_up);

    // Trigger natural knockdown if tipped past 55 degrees
    if (!this.isKnockedDown && uprightDot < 0.42 && pp.y < 0.72) {
      this.isKnockedDown = true;
      this.knockdownTimer = 1.15;
      this.recoveryProgress = 0;
      this.balance = 0.1;
    }

    let muscleScale = 1;

    if (this.isKnockedDown) {
      this.knockdownTimer -= dt;
      if (this.knockdownTimer > 0) {
        // Collapsed / stunned on ground — minimal muscle tone so gravity wins
        muscleScale = 0.08;
      } else {
        // Active physical recovery attempt (no teleporting!)
        this.recoveryProgress = Math.min(1, this.recoveryProgress + dt * 0.95);
        muscleScale = 0.35 + this.recoveryProgress * 0.85;

        // Push pelvis & chest physically upward against gravity as recovery ramps up
        if (pp.y < 0.92) {
          applyLinearVelocityAssist(
            this.bodies.pelvis,
            0,
            2.2 * this.recoveryProgress,
            0,
            4.0,
            34 * this.recoveryProgress,
          );
          applyLinearVelocityAssist(
            this.bodies.chest,
            0,
            2.4 * this.recoveryProgress,
            0,
            3.5,
            28 * this.recoveryProgress,
          );
        }
        if (uprightDot > 0.72 && pp.y > 0.72) {
          this.isKnockedDown = false;
          this.balance = 0.68;
        }
      }
    } else {
      // Recover balance gradually while upright
      this.balance = Math.min(1, this.balance + dt * 0.22);
      muscleScale = THREE.MathUtils.clamp(
        0.55 + this.balance * 0.45 - (this.staggerTimer > 0 ? 0.28 : 0),
        0.25,
        1,
      );
    }

    // 1. Torso & head PD balance torques
    const yawQuat = _quat.setFromAxisAngle(_up, intent.facingYaw);
    _forward.set(0, 0, -1).applyQuaternion(yawQuat);
    _right.set(1, 0, 0).applyQuaternion(yawQuat);

    const leanForward = intent.arm.attackHeld ? -0.08 : intent.arm.defendHeld ? 0.06 : -0.02;
    _euler.set(leanForward, intent.facingYaw, 0);
    const torsoTarget = new THREE.Quaternion().setFromEuler(_euler);

    applyOrientationPDTorque(
      this.bodies.pelvis,
      yawQuat,
      ANATOMY_SPECS.pelvis.kp,
      ANATOMY_SPECS.pelvis.kd,
      ANATOMY_SPECS.pelvis.maxTorque,
      muscleScale,
    );
    applyOrientationPDTorque(
      this.bodies.abdomen,
      torsoTarget,
      ANATOMY_SPECS.abdomen.kp,
      ANATOMY_SPECS.abdomen.kd,
      ANATOMY_SPECS.abdomen.maxTorque,
      muscleScale,
    );
    applyOrientationPDTorque(
      this.bodies.chest,
      torsoTarget,
      ANATOMY_SPECS.chest.kp,
      ANATOMY_SPECS.chest.kd,
      ANATOMY_SPECS.chest.maxTorque,
      muscleScale,
    );
    applyOrientationPDTorque(
      this.bodies.neck,
      yawQuat,
      ANATOMY_SPECS.neck.kp,
      ANATOMY_SPECS.neck.kd,
      ANATOMY_SPECS.neck.maxTorque,
      muscleScale,
    );
    applyOrientationPDTorque(
      this.bodies.head,
      yawQuat,
      ANATOMY_SPECS.head.kp,
      ANATOMY_SPECS.head.kd,
      ANATOMY_SPECS.head.maxTorque,
      muscleScale,
    );

    // 2. Standing vertical pelvis support + WASD/AI locomotion + procedural leg stepping
    if (!this.isKnockedDown) {
      const moveMag = Math.min(1, Math.hypot(intent.moveX, intent.moveZ));
      const moveSpeed = (3.4 + staminaRatio * 0.6) * (intent.arm.defendHeld ? 0.72 : 1);
      const targetVx = intent.moveX * moveSpeed;
      const targetVz = intent.moveZ * moveSpeed;

      // Vertical spring keeps pelvis at anatomical hip height when grounded
      const targetPelvisY = 0.94 - (moveMag > 0.1 ? 0.02 : 0);
      const desiredVy = grounded ? THREE.MathUtils.clamp((targetPelvisY - pp.y) * 9.5, -2.5, 4.0) : null;

      applyLinearVelocityAssist(
        this.bodies.pelvis,
        targetVx,
        desiredVy,
        targetVz,
        grounded ? 3.2 : 0.85,
        grounded ? 26 * muscleScale : 8,
      );

      // Jump / Lunge impulse
      if (intent.jumpPressed && grounded && this.jumpCooldown <= 0 && this.stamina >= 12) {
        this.stamina -= 12;
        this.jumpCooldown = 0.65;
        const lungeX = intent.moveX * 8;
        const lungeZ = intent.moveZ * 8;
        this.bodies.pelvis.applyImpulse({ x: lungeX, y: 42, z: lungeZ }, true);
        this.bodies.chest.applyImpulse({ x: lungeX * 0.7, y: 34, z: lungeZ * 0.7 }, true);
      }

      // Leg stride gait
      if (moveMag > 0.08 && grounded) {
        this.walkPhase += dt * (7.5 + moveMag * 3.5);
      } else {
        // Settle toward neutral stance
        this.walkPhase = THREE.MathUtils.lerp(this.walkPhase, Math.round(this.walkPhase / Math.PI) * Math.PI, Math.min(1, dt * 6));
      }

      const strideAmp = moveMag * 0.58;
      const sL = Math.sin(this.walkPhase) * strideAmp;
      const sR = Math.sin(this.walkPhase + Math.PI) * strideAmp;

      // Left leg
      _euler.set(sL, intent.facingYaw, 0.04);
      const thighLQuat = new THREE.Quaternion().setFromEuler(_euler);
      applyOrientationPDTorque(
        this.bodies.thighL,
        thighLQuat,
        ANATOMY_SPECS.thighL.kp,
        ANATOMY_SPECS.thighL.kd,
        ANATOMY_SPECS.thighL.maxTorque,
        muscleScale,
      );

      _euler.set(Math.max(0, -sL) * 0.95 + 0.08, intent.facingYaw, 0);
      const shinLQuat = new THREE.Quaternion().setFromEuler(_euler);
      applyOrientationPDTorque(
        this.bodies.lowerLegL,
        shinLQuat,
        ANATOMY_SPECS.lowerLegL.kp,
        ANATOMY_SPECS.lowerLegL.kd,
        ANATOMY_SPECS.lowerLegL.maxTorque,
        muscleScale,
      );

      applyOrientationPDTorque(
        this.bodies.footL,
        yawQuat,
        ANATOMY_SPECS.footL.kp,
        ANATOMY_SPECS.footL.kd,
        ANATOMY_SPECS.footL.maxTorque,
        muscleScale,
      );

      // Right leg
      _euler.set(sR, intent.facingYaw, -0.04);
      const thighRQuat = new THREE.Quaternion().setFromEuler(_euler);
      applyOrientationPDTorque(
        this.bodies.thighR,
        thighRQuat,
        ANATOMY_SPECS.thighR.kp,
        ANATOMY_SPECS.thighR.kd,
        ANATOMY_SPECS.thighR.maxTorque,
        muscleScale,
      );

      _euler.set(Math.max(0, -sR) * 0.95 + 0.08, intent.facingYaw, 0);
      const shinRQuat = new THREE.Quaternion().setFromEuler(_euler);
      applyOrientationPDTorque(
        this.bodies.lowerLegR,
        shinRQuat,
        ANATOMY_SPECS.lowerLegR.kp,
        ANATOMY_SPECS.lowerLegR.kd,
        ANATOMY_SPECS.lowerLegR.maxTorque,
        muscleScale,
      );

      applyOrientationPDTorque(
        this.bodies.footR,
        yawQuat,
        ANATOMY_SPECS.footR.kp,
        ANATOMY_SPECS.footR.kd,
        ANATOMY_SPECS.footR.maxTorque,
        muscleScale,
      );
    }

    // 3. Independent Arm & Hand control
    this.armController.update(dt, intent.arm, muscleScale, staminaRatio);
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
