import * as THREE from 'three';
import { RAPIER } from '../physics/RapierLoader';
import {
  ALL_FIGHTERS_MASK,
  ALL_HELD_WEAPONS_MASK,
  CollisionBit,
  getHeldWeaponBit,
  makeCollisionGroups,
  type PhysicsWorld,
} from '../physics/PhysicsWorld';
import type { HandSide, WeaponType } from '../core/types';
import { WEAPON_CATALOG, type WeaponSpec } from './WeaponCatalog';
import { buildWeaponMesh } from './WeaponFactory';

const _tipLocal = new THREE.Vector3();
const _sweetLocal = new THREE.Vector3();
const _prevSweetWorld = new THREE.Vector3();
const _currSweetWorld = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _edgeLocal = new THREE.Vector3(1, 0, 0);

let nextWeaponUid = 1;

export class WeaponInstance {
  public readonly id: string;
  public readonly type: WeaponType;
  public readonly spec: WeaponSpec;
  public readonly mesh: THREE.Group;
  public readonly body: RAPIER.RigidBody;
  public readonly colliders: RAPIER.Collider[] = [];

  public ownerId: string | null = null;
  public ownerCollisionBit = 0;
  public heldSide: HandSide | null = null;
  public gripJoint: RAPIER.ImpulseJoint | null = null;

  public readonly sweetSpotWorld = new THREE.Vector3();
  public readonly tipWorld = new THREE.Vector3();
  public readonly sweetSpotVelocity = new THREE.Vector3();
  public readonly edgeWorldDir = new THREE.Vector3(1, 0, 0);
  public readonly thrustAxisWorld = new THREE.Vector3(0, 1, 0);

  private hasPrevSweet = false;

  constructor(
    physics: PhysicsWorld,
    scene: THREE.Scene,
    type: WeaponType,
    spawnPos: THREE.Vector3,
    spawnQuat?: THREE.Quaternion,
    heraldryColor?: number,
  ) {
    this.id = `wpn_${nextWeaponUid++}_${type}`;
    this.type = type;
    this.spec = WEAPON_CATALOG[type];

    this.mesh = buildWeaponMesh(type, heraldryColor);
    this.mesh.position.copy(spawnPos);
    if (spawnQuat) this.mesh.quaternion.copy(spawnQuat);
    scene.add(this.mesh);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
      .setLinearDamping(0.35)
      .setAngularDamping(0.65)
      .setCcdEnabled(true);

    if (spawnQuat) {
      bodyDesc.setRotation({ x: spawnQuat.x, y: spawnQuat.y, z: spawnQuat.z, w: spawnQuat.w });
    }

    this.body = physics.world.createRigidBody(bodyDesc);

    const defaultGroups = makeCollisionGroups(
      CollisionBit.WEAPON,
      CollisionBit.ENVIRONMENT |
        CollisionBit.WEAPON |
        ALL_HELD_WEAPONS_MASK |
        ALL_FIGHTERS_MASK |
        CollisionBit.DUMMY,
    );

    if (this.spec.isShield) {
      const colDesc = RAPIER.ColliderDesc.cuboid(
        this.spec.strikeHalfExtents.x,
        this.spec.strikeHalfExtents.y,
        this.spec.strikeHalfExtents.z,
      )
        .setMass(this.spec.mass)
        .setFriction(0.6)
        .setRestitution(0.15)
        .setCollisionGroups(defaultGroups)
        .setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
        )
        .setContactForceEventThreshold(8);

      const col = physics.world.createCollider(colDesc, this.body);
      this.colliders.push(col);
      physics.registerColliderMeta(col.handle, {
        kind: 'shield',
        weaponId: this.id,
        weaponType: this.type,
      });
    } else {
      // Handle collider (lightweight mass at grip)
      const handleDesc = RAPIER.ColliderDesc.cylinder(0.12, 0.022)
        .setMass(this.spec.mass * 0.25)
        .setFriction(0.5)
        .setRestitution(0.1)
        .setCollisionGroups(defaultGroups);
      const handleCol = physics.world.createCollider(handleDesc, this.body);
      this.colliders.push(handleCol);
      physics.registerColliderMeta(handleCol.handle, {
        kind: 'weapon',
        weaponId: this.id,
        weaponType: this.type,
        isBladeEdge: false,
      });

      // Blade / striking head collider
      const bladeDesc = RAPIER.ColliderDesc.cuboid(
        this.spec.strikeHalfExtents.x,
        this.spec.strikeHalfExtents.y,
        this.spec.strikeHalfExtents.z,
      )
        .setTranslation(0, this.spec.strikeCenterY, 0)
        .setMass(this.spec.mass * 0.75)
        .setFriction(0.35)
        .setRestitution(0.2)
        .setCollisionGroups(defaultGroups)
        .setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
        )
        .setContactForceEventThreshold(5);

      const bladeCol = physics.world.createCollider(bladeDesc, this.body);
      this.colliders.push(bladeCol);
      physics.registerColliderMeta(bladeCol.handle, {
        kind: 'weapon',
        weaponId: this.id,
        weaponType: this.type,
        isBladeEdge: true,
        isBladeTip: true,
      });
    }

    physics.registerInterpolated(this.body, this.mesh);
    this.updateKinematics(1 / 60);
  }

  public setHeldBy(
    physics: PhysicsWorld,
    fighterId: string,
    fighterCollisionBit: number,
    side: HandSide,
    joint: RAPIER.ImpulseJoint,
  ): void {
    this.ownerId = fighterId;
    this.ownerCollisionBit = fighterCollisionBit;
    this.heldSide = side;
    this.gripJoint = joint;

    // Exclude collisions with the wielder's own skeleton and own offhand weapon/shield
    const ownWeaponBit = getHeldWeaponBit(fighterCollisionBit);
    const filter =
      (CollisionBit.ENVIRONMENT |
        CollisionBit.WEAPON |
        ALL_HELD_WEAPONS_MASK |
        ALL_FIGHTERS_MASK |
        CollisionBit.DUMMY) &
      ~fighterCollisionBit &
      ~ownWeaponBit;
    const groups = makeCollisionGroups(ownWeaponBit, filter);

    for (const col of this.colliders) {
      col.setCollisionGroups(groups);
      const meta = physics.getColliderMeta(col.handle);
      if (meta) meta.fighterId = fighterId;
    }
    this.body.setLinearDamping(0.15);
    this.body.setAngularDamping(0.35);
    this.hasPrevSweet = false;
    this.updateKinematics(1 / 60);
  }

  public release(physics: PhysicsWorld, impulse?: THREE.Vector3): void {
    if (this.gripJoint) {
      if (this.gripJoint.isValid()) {
        physics.world.removeImpulseJoint(this.gripJoint, true);
      }
      this.gripJoint = null;
    }

    this.ownerId = null;
    this.ownerCollisionBit = 0;
    this.heldSide = null;

    if (!physics.world.bodies.contains(this.body.handle)) {
      return;
    }

    const groups = makeCollisionGroups(
      CollisionBit.WEAPON,
      CollisionBit.ENVIRONMENT |
        CollisionBit.WEAPON |
        ALL_HELD_WEAPONS_MASK |
        ALL_FIGHTERS_MASK |
        CollisionBit.DUMMY,
    );
    for (const col of this.colliders) {
      if (!col.isValid()) continue;
      col.setCollisionGroups(groups);
      const meta = physics.getColliderMeta(col.handle);
      if (meta) meta.fighterId = undefined;
    }

    this.body.setLinearDamping(0.45);
    this.body.setAngularDamping(0.75);
    if (impulse) {
      this.body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    }
  }

  public updateKinematics(dt: number): void {
    const p = this.body.translation();
    const r = this.body.rotation();
    _pos.set(p.x, p.y, p.z);
    _quat.set(r.x, r.y, r.z, r.w);

    _prevSweetWorld.copy(this.sweetSpotWorld);

    _sweetLocal.set(0, this.spec.sweetSpotY, 0).applyQuaternion(_quat).add(_pos);
    _tipLocal.set(0, this.spec.tipLocalY, 0).applyQuaternion(_quat).add(_pos);

    this.sweetSpotWorld.copy(_sweetLocal);
    this.tipWorld.copy(_tipLocal);

    if (this.hasPrevSweet && dt > 0.0001) {
      _currSweetWorld.copy(this.sweetSpotWorld).sub(_prevSweetWorld).divideScalar(dt);
      this.sweetSpotVelocity.copy(_currSweetWorld);
    } else {
      this.sweetSpotVelocity.set(0, 0, 0);
      this.hasPrevSweet = true;
    }

    this.edgeWorldDir.copy(_edgeLocal).applyQuaternion(_quat).normalize();
    this.thrustAxisWorld.set(0, 1, 0).applyQuaternion(_quat).normalize();
  }

  public dispose(physics: PhysicsWorld, scene: THREE.Scene): void {
    if (this.gripJoint && this.gripJoint.isValid()) {
      physics.world.removeImpulseJoint(this.gripJoint, true);
    }
    this.gripJoint = null;
    physics.unregisterInterpolated(this.body.handle);
    for (const col of this.colliders) {
      physics.unregisterColliderMeta(col.handle);
    }
    if (physics.world.bodies.contains(this.body.handle)) {
      physics.world.removeRigidBody(this.body);
    }
    scene.remove(this.mesh);
  }
}
