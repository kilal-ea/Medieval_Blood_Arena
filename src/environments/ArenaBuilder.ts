import * as THREE from 'three';
import { RAPIER } from '../physics/RapierLoader';
import { CollisionBit, ALL_FIGHTERS_MASK, makeCollisionGroups, type PhysicsWorld } from '../physics/PhysicsWorld';
import type { TrainingDummyTarget } from '../combat/CombatSystem';
import type { WeaponType } from '../core/types';
import type { ArenaTextureSet } from './ProceduralTextures';

export type ArenaKind = 'training' | 'colosseum';

export interface ArenaBuildResult {
  root: THREE.Group;
  bodies: RAPIER.RigidBody[];
  joints: RAPIER.ImpulseJoint[];
  dummies: TrainingDummyTarget[];
  rackSpawns: Array<{ type: WeaponType; pos: THREE.Vector3; quat: THREE.Quaternion }>;
  torchLights: THREE.PointLight[];
  dispose: () => void;
}

export function buildArena(
  kind: ArenaKind,
  physics: PhysicsWorld,
  scene: THREE.Scene,
  textures: ArenaTextureSet,
  onDummyHit?: (damage: number, pos: { x: number; y: number; z: number }) => void,
): ArenaBuildResult {
  const root = new THREE.Group();
  root.name = `arena_${kind}`;
  const bodies: RAPIER.RigidBody[] = [];
  const joints: RAPIER.ImpulseJoint[] = [];
  const dummies: TrainingDummyTarget[] = [];
  const rackSpawns: Array<{ type: WeaponType; pos: THREE.Vector3; quat: THREE.Quaternion }> = [];
  const torchLights: THREE.PointLight[] = [];
  const colliderHandles: number[] = [];

  const envGroups = makeCollisionGroups(
    CollisionBit.ENVIRONMENT,
    CollisionBit.WEAPON | ALL_FIGHTERS_MASK | CollisionBit.DUMMY,
  );

  // Extended natural horizon ground (prevents floating rectangle in void)
  const outerGroundMat = new THREE.MeshStandardMaterial({
    map: textures.grassColor,
    roughness: 0.95,
    metalness: 0.0,
  });
  const outerGround = new THREE.Mesh(new THREE.CircleGeometry(140, 48), outerGroundMat);
  outerGround.rotation.x = -Math.PI * 0.5;
  outerGround.position.y = -0.04;
  outerGround.receiveShadow = true;
  root.add(outerGround);

  // Rolling distant hills ring
  const hillGeo = new THREE.ConeGeometry(28, 12, 7);
  const hillMat = new THREE.MeshStandardMaterial({
    color: 0x2c3024,
    roughness: 0.96,
    metalness: 0,
  });
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const dist = 68 + (i % 3) * 14;
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.position.set(Math.cos(angle) * dist, 4.5, Math.sin(angle) * dist);
    hill.scale.set(1.3 + (i % 2) * 0.5, 0.8 + (i % 3) * 0.35, 1.2);
    hill.rotation.y = angle;
    root.add(hill);
  }

  // Static infinite-thickness arena floor physics slab
  const floorBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  const floorCol = physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(60, 0.5, 60)
      .setFriction(0.95)
      .setRestitution(0.05)
      .setCollisionGroups(envGroups),
    floorBody,
  );
  bodies.push(floorBody);
  colliderHandles.push(floorCol.handle);
  physics.registerColliderMeta(floorCol.handle, { kind: 'environment' });

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneColor,
    roughness: 0.86,
    metalness: 0.06,
  });
  const sandMat = new THREE.MeshStandardMaterial({
    map: textures.sandColor,
    roughness: 0.94,
    metalness: 0.02,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodColor,
    roughness: 0.82,
    metalness: 0.05,
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x34363a,
    roughness: 0.45,
    metalness: 0.85,
  });
  const bannerRedMat = new THREE.MeshStandardMaterial({
    color: 0x7b1a1a,
    roughness: 0.85,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const bannerGoldMat = new THREE.MeshStandardMaterial({
    color: 0xc29338,
    roughness: 0.35,
    metalness: 0.78,
  });

  if (kind === 'training') {
    // Stone & sand courtyard floor
    const yard = new THREE.Mesh(new THREE.CircleGeometry(15.5, 40), sandMat);
    yard.rotation.x = -Math.PI * 0.5;
    yard.position.y = 0.005;
    yard.receiveShadow = true;
    root.add(yard);

    const centerRing = new THREE.Mesh(new THREE.RingGeometry(4.6, 5.1, 36), stoneMat);
    centerRing.rotation.x = -Math.PI * 0.5;
    centerRing.position.y = 0.015;
    centerRing.receiveShadow = true;
    root.add(centerRing);

    // Circular wooden palisade perimeter (16 posts + rails with physics colliders)
    const radius = 14.5;
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const am = (a0 + a1) * 0.5;
      const px = Math.cos(a0) * radius;
      const pz = Math.sin(a0) * radius;

      // Timber post
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.4, 8), woodMat);
      post.position.set(px, 1.2, pz);
      post.castShadow = true;
      post.receiveShadow = true;
      root.add(post);

      // Palisade fence wall segment
      const wallLen = 2 * radius * Math.sin(Math.PI / segments);
      const wx = Math.cos(am) * (radius - 0.1);
      const wz = Math.sin(am) * (radius - 0.1);

      const railGroup = new THREE.Group();
      railGroup.position.set(wx, 0, wz);
      railGroup.rotation.y = -am + Math.PI * 0.5;

      const lowerPlank = new THREE.Mesh(new THREE.BoxGeometry(wallLen, 0.32, 0.14), woodMat);
      lowerPlank.position.y = 0.55;
      const upperPlank = new THREE.Mesh(new THREE.BoxGeometry(wallLen, 0.32, 0.14), woodMat);
      upperPlank.position.y = 1.25;
      lowerPlank.castShadow = true;
      upperPlank.castShadow = true;
      railGroup.add(lowerPlank, upperPlank);
      root.add(railGroup);

      const wallBody = physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(wx, 1.0, wz)
          .setRotation(
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -am + Math.PI * 0.5),
          ),
      );
      const wallCol = physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(wallLen * 0.5, 1.0, 0.25)
          .setFriction(0.6)
          .setCollisionGroups(envGroups),
        wallBody,
      );
      bodies.push(wallBody);
      colliderHandles.push(wallCol.handle);
      physics.registerColliderMeta(wallCol.handle, { kind: 'environment' });
    }

    // Wooden training platform / sparring dais
    const dais = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.28, 3.2), woodMat);
    dais.position.set(-6.5, 0.14, -5.5);
    dais.castShadow = true;
    dais.receiveShadow = true;
    root.add(dais);

    const daisBody = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(-6.5, 0.14, -5.5),
    );
    const daisCol = physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.6, 0.14, 1.6).setCollisionGroups(envGroups),
      daisBody,
    );
    bodies.push(daisBody);
    colliderHandles.push(daisCol.handle);
    physics.registerColliderMeta(daisCol.handle, { kind: 'environment' });

    // Weapon Rack with all 5 medieval weapons ready to grab
    buildWeaponRack(new THREE.Vector3(-4.8, 0, 5.5), 0.35, root, woodMat, ironMat, bodies, colliderHandles, envGroups, physics, rackSpawns);

    // Two spring-mounted physical Training Dummies
    const dummyPositions = [
      new THREE.Vector3(4.2, 0, -3.5),
      new THREE.Vector3(6.2, 0, 1.2),
    ];
    dummyPositions.forEach((dPos) => {
      const dummy = buildTrainingDummy(
        dPos,
        root,
        woodMat,
        bannerRedMat,
        ironMat,
        physics,
        bodies,
        joints,
        colliderHandles,
        onDummyHit,
      );
      dummies.push(dummy);
    });
  } else {
    // GRAND STONE COLOSSEUM ARENA
    const arenaRadius = 16.5;
    const floorDisk = new THREE.Mesh(new THREE.CircleGeometry(arenaRadius + 1.5, 48), sandMat);
    floorDisk.rotation.x = -Math.PI * 0.5;
    floorDisk.position.y = 0.008;
    floorDisk.receiveShadow = true;
    root.add(floorDisk);

    // Stone inner duel ring
    const stoneRing = new THREE.Mesh(new THREE.RingGeometry(5.5, 6.2, 48), stoneMat);
    stoneRing.rotation.x = -Math.PI * 0.5;
    stoneRing.position.y = 0.018;
    stoneRing.receiveShadow = true;
    root.add(stoneRing);

    // Tiered circular stone arena walls & spectator stands
    const wallSegments = 24;
    for (let i = 0; i < wallSegments; i++) {
      const a = (i / wallSegments) * Math.PI * 2;
      const am = ((i + 0.5) / wallSegments) * Math.PI * 2;
      const segW = 2 * arenaRadius * Math.sin(Math.PI / wallSegments) + 0.35;

      const wx = Math.cos(am) * arenaRadius;
      const wz = Math.sin(am) * arenaRadius;
      const rotY = -am + Math.PI * 0.5;

      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(segW, 2.8, 1.2), stoneMat);
      wallMesh.position.set(wx, 1.4, wz);
      wallMesh.rotation.y = rotY;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      root.add(wallMesh);

      // Upper spectator tier behind wall
      const tierMesh = new THREE.Mesh(new THREE.BoxGeometry(segW * 1.15, 2.4, 2.8), stoneMat);
      tierMesh.position.set(Math.cos(am) * (arenaRadius + 2.0), 2.8, Math.sin(am) * (arenaRadius + 2.0));
      tierMesh.rotation.y = rotY;
      tierMesh.receiveShadow = true;
      root.add(tierMesh);

      // Physics wall collider
      const wallBody = physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(wx, 1.4, wz)
          .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)),
      );
      const wallCol = physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(segW * 0.5, 1.4, 0.6)
          .setFriction(0.6)
          .setCollisionGroups(envGroups),
        wallBody,
      );
      bodies.push(wallBody);
      colliderHandles.push(wallCol.handle);
      physics.registerColliderMeta(wallCol.handle, { kind: 'environment' });

      // Every 3rd segment gets a stone pillar, banner, and iron torch brazier
      if (i % 3 === 0) {
        const px = Math.cos(a) * (arenaRadius - 0.5);
        const pz = Math.sin(a) * (arenaRadius - 0.5);

        const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.2, 1.1), stoneMat);
        pillar.position.set(px, 2.6, pz);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        root.add(pillar);

        const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.2), bannerRedMat);
        banner.position.set(Math.cos(a) * (arenaRadius - 1.12), 2.9, Math.sin(a) * (arenaRadius - 1.12));
        banner.rotation.y = -a - Math.PI * 0.5;
        root.add(banner);

        const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.16, 0.45, 8), ironMat);
        brazier.position.set(px, 5.4, pz);
        root.add(brazier);

        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 0.52, 6),
          new THREE.MeshBasicMaterial({ color: 0xff8c24 }),
        );
        flame.position.set(px, 5.8, pz);
        root.add(flame);

        if (i % 6 === 0) {
          const pLight = new THREE.PointLight(0xff7b29, 12, 18, 1.8);
          pLight.position.set(px * 0.9, 5.9, pz * 0.9);
          root.add(pLight);
          torchLights.push(pLight);
        }
      }
    }

    // Two timber barrier props in the arena for tactical cover/collisions
    const barrierPositions = [
      { pos: new THREE.Vector3(-6.2, 0.55, 0), rot: 0.3 },
      { pos: new THREE.Vector3(6.2, 0.55, 0), rot: -0.3 },
    ];
    for (const b of barrierPositions) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 2.6), woodMat);
      bar.position.copy(b.pos);
      bar.rotation.y = b.rot;
      bar.castShadow = true;
      bar.receiveShadow = true;
      root.add(bar);

      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 2.64), bannerGoldMat);
      trim.position.copy(b.pos);
      trim.position.y += 0.48;
      trim.rotation.y = b.rot;
      root.add(trim);

      const bBody = physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(b.pos.x, b.pos.y, b.pos.z)
          .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot)),
      );
      const bCol = physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.24, 0.55, 1.3).setCollisionGroups(envGroups),
        bBody,
      );
      bodies.push(bBody);
      colliderHandles.push(bCol.handle);
      physics.registerColliderMeta(bCol.handle, { kind: 'environment' });
    }

    // Side weapon rack inside arena
    buildWeaponRack(new THREE.Vector3(0, 0, 13.0), Math.PI, root, woodMat, ironMat, bodies, colliderHandles, envGroups, physics, rackSpawns);
  }

  scene.add(root);

  return {
    root,
    bodies,
    joints,
    dummies,
    rackSpawns,
    torchLights,
    dispose: () => {
      for (const j of joints) {
        if (j.isValid()) physics.world.removeImpulseJoint(j, true);
      }
      for (const h of colliderHandles) {
        physics.unregisterColliderMeta(h);
      }
      for (const b of bodies) {
        if (physics.world.bodies.contains(b.handle)) {
          physics.world.removeRigidBody(b);
        }
      }
      scene.remove(root);
    },
  };
}

function buildWeaponRack(
  pos: THREE.Vector3,
  rotY: number,
  root: THREE.Group,
  woodMat: THREE.Material,
  ironMat: THREE.Material,
  bodies: RAPIER.RigidBody[],
  colliderHandles: number[],
  envGroups: number,
  physics: PhysicsWorld,
  rackSpawns: Array<{ type: WeaponType; pos: THREE.Vector3; quat: THREE.Quaternion }>,
): void {
  const rack = new THREE.Group();
  rack.position.copy(pos);
  rack.rotation.y = rotY;

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.35, 0.55), woodMat);
  legL.position.set(-1.35, 0.675, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.35, 0.55), woodMat);
  legR.position.set(1.35, 0.675, 0);
  const barLow = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.1, 0.14), woodMat);
  barLow.position.set(0, 0.35, 0);
  const barHigh = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.1, 0.14), woodMat);
  barHigh.position.set(0, 1.05, 0);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.06, 0.06), ironMat);
  brace.position.set(0, 1.25, 0);

  rack.add(legL, legR, barLow, barHigh, brace);
  rack.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  root.add(rack);

  const rackBody = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(pos.x, pos.y + 0.5, pos.z)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)),
  );
  const rackCol = physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(1.4, 0.5, 0.25).setCollisionGroups(envGroups),
    rackBody,
  );
  bodies.push(rackBody);
  colliderHandles.push(rackCol.handle);
  physics.registerColliderMeta(rackCol.handle, { kind: 'environment' });

  const types: WeaponType[] = ['longsword', 'arming_sword', 'battle_axe', 'mace', 'shield'];
  const qRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  types.forEach((type, idx) => {
    const localOffset = new THREE.Vector3(-1.0 + idx * 0.5, 0.92, 0.32).applyQuaternion(qRot);
    const wPos = pos.clone().add(localOffset);
    const wQuat = qRot.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.18, 0, 0)));
    rackSpawns.push({ type, pos: wPos, quat: wQuat });
  });
}

function buildTrainingDummy(
  pos: THREE.Vector3,
  root: THREE.Group,
  woodMat: THREE.Material,
  clothMat: THREE.Material,
  ironMat: THREE.Material,
  physics: PhysicsWorld,
  bodies: RAPIER.RigidBody[],
  joints: RAPIER.ImpulseJoint[],
  colliderHandles: number[],
  onDummyHit?: (damage: number, pos: { x: number; y: number; z: number }) => void,
): TrainingDummyTarget {
  const dummyGroups = makeCollisionGroups(
    CollisionBit.DUMMY,
    CollisionBit.ENVIRONMENT | CollisionBit.WEAPON | ALL_FIGHTERS_MASK,
  );

  // Fixed wooden base stand
  const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.16, 12), woodMat);
  baseMesh.position.set(pos.x, 0.08, pos.z);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  root.add(baseMesh);

  const baseBody = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, 0.08, pos.z),
  );
  const baseCol = physics.world.createCollider(
    RAPIER.ColliderDesc.cylinder(0.08, 0.45).setCollisionGroups(dummyGroups),
    baseBody,
  );
  bodies.push(baseBody);
  colliderHandles.push(baseCol.handle);
  physics.registerColliderMeta(baseCol.handle, { kind: 'environment' });

  // Dynamic upper dummy torso + crossbeam arms connected via motorized spherical spring
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(pos.x, 1.1, pos.z);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.5, 10), woodMat);
  post.position.y = -0.15;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 0.65, 12), clothMat);
  barrel.position.y = 0.2;
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.1), woodMat);
  cross.position.y = 0.35;
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), ironMat);
  helm.position.y = 0.65;
  torsoGroup.add(post, barrel, cross, helm);
  torsoGroup.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  root.add(torsoGroup);

  const torsoBody = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, 1.1, pos.z)
      .setLinearDamping(1.2)
      .setAngularDamping(2.8),
  );
  const torsoCol = physics.world.createCollider(
    RAPIER.ColliderDesc.cylinder(0.65, 0.22)
      .setMass(26)
      .setFriction(0.5)
      .setCollisionGroups(dummyGroups)
      .setActiveEvents(
        RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
      )
      .setContactForceEventThreshold(4),
    torsoBody,
  );
  bodies.push(torsoBody);
  colliderHandles.push(torsoCol.handle);
  physics.registerColliderMeta(torsoCol.handle, { kind: 'dummy' });
  physics.registerInterpolated(torsoBody, torsoGroup);

  // Spherical pivot joint with angular spring motors to stand back up after being struck
  const jData = RAPIER.JointData.spherical({ x: 0, y: 0.15, z: 0 }, { x: 0, y: -0.92, z: 0 });
  const joint = physics.world.createImpulseJoint(jData, baseBody, torsoBody, true) as RAPIER.SphericalImpulseJoint;
  joint.setContactsEnabled(false);
  joint.configureMotorPosition(RAPIER.JointAxis.AngX, 0, 140, 14);
  joint.configureMotorPosition(RAPIER.JointAxis.AngY, 0, 80, 10);
  joint.configureMotorPosition(RAPIER.JointAxis.AngZ, 0, 140, 14);
  joints.push(joint);

  return {
    colliderHandle: torsoCol.handle,
    body: torsoBody,
    onHit: (damage, hitPos) => {
      onDummyHit?.(damage, hitPos);
    },
  };
}
