import * as THREE from 'three';
import { loadRapier } from '../physics/RapierLoader';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ActiveRagdoll, type FighterControlIntent } from '../humanoid/ActiveRagdoll';
import { WeaponInstance } from '../weapons/WeaponInstance';
import { CombatSystem } from '../combat/CombatSystem';
import { ParticlePool } from '../combat/ParticlePool';
import { AudioEngine } from '../audio/AudioEngine';
import { EventBus } from '../core/EventBus';
import { RAPIER } from '../physics/RapierLoader';

export interface PhysicsTestCaseResult {
  name: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

function makeIdleIntent(yaw = 0): FighterControlIntent {
  return {
    moveX: 0,
    moveZ: 0,
    facingYaw: yaw,
    jumpPressed: false,
    arm: {
      aimYaw: yaw,
      aimPitch: 0,
      swingX: 0,
      swingY: 0,
      attackHeld: false,
      defendHeld: false,
      thrustActive: false,
      leftPunchActive: false,
    },
  };
}

export async function runPhysicsVerificationSuite(): Promise<PhysicsTestCaseResult[]> {
  const results: PhysicsTestCaseResult[] = [];
  await loadRapier();

  // Test 1: 17-segment humanoid creation & standing balance stability
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);

    // Ground floor
    const floorBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20), floorBody);

    const fighter = new ActiveRagdoll(physics, scene, {
      name: 'TestKnight',
      isPlayer: true,
      slotIndex: 0,
      spawnPos: new THREE.Vector3(0, 0, 0),
      facingYaw: 0,
      appearance: { tunicColor: 0x7a1c1c, metalTint: 0xcccccc, armorTier: 'heavy' },
    });

    const intent = makeIdleIntent(0);
    for (let i = 0; i < 120; i++) {
      physics.step(
        1 / 60,
        (dt) => fighter.updatePhysics(dt, intent),
        () => {},
      );
    }

    const pos = fighter.getPosition();
    const validNums = Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z);
    const upright = pos.y > 0.72 && pos.y < 1.25 && !fighter.isKnockedDown;
    const jointCount = fighter.joints.length;
    const segmentCount = Object.keys(fighter.bodies).length;

    const passed = validNums && upright && segmentCount === 17 && jointCount === 16;
    results.push({
      name: '17-Segment Active Ragdoll Standing Balance (120 steps)',
      passed,
      details: `segments=${segmentCount}, joints=${jointCount}, pelvisY=${pos.y.toFixed(3)}m, knockedDown=${fighter.isKnockedDown}`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    physics.dispose();
  }

  // Test 2: Natural knockdown & physical recovery attempt
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    const floorBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20), floorBody);

    const fighter = new ActiveRagdoll(physics, scene, {
      name: 'FallTest',
      isPlayer: false,
      slotIndex: 0,
      spawnPos: new THREE.Vector3(0, 0, 0),
      facingYaw: 0,
      appearance: { tunicColor: 0x243b5e, metalTint: 0xcccccc, armorTier: 'medium' },
    });

    // Apply strong lateral knock impulse
    fighter.applyDamage(20, 0.95, 'chest', new THREE.Vector3(24, 2, 0));
    const knocked = fighter.isKnockedDown;

    const intent = makeIdleIntent(0);
    for (let i = 0; i < 180; i++) {
      physics.step(
        1 / 60,
        (dt) => fighter.updatePhysics(dt, intent),
        () => {},
      );
    }

    const pos = fighter.getPosition();
    const valid = Number.isFinite(pos.y) && pos.y > 0.1;
    const passed = knocked && valid;
    results.push({
      name: 'Knockdown Impulse & Physical Recovery Simulation (180 steps)',
      passed,
      details: `knockedOnImpact=${knocked}, postRecoveryPelvisY=${pos.y.toFixed(3)}m, isKnockedDown=${fighter.isKnockedDown}`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    physics.dispose();
  }

  // Test 3: Weapon gripping, arm swing kinematics, and disarming
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    const floorBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20), floorBody);

    const fighter = new ActiveRagdoll(physics, scene, {
      name: 'GripTest',
      isPlayer: true,
      slotIndex: 0,
      spawnPos: new THREE.Vector3(0, 0, 0),
      facingYaw: 0,
      appearance: { tunicColor: 0x7a1c1c, metalTint: 0xcccccc, armorTier: 'heavy' },
    });
    const sword = new WeaponInstance(physics, scene, 'longsword', new THREE.Vector3(0.3, 1.0, 0));
    const grabbed = fighter.armController.grabWeapon(physics, sword, 'right');

    const swingIntent = makeIdleIntent(0);
    swingIntent.arm.attackHeld = true;
    swingIntent.arm.swingX = 0.9;

    let maxTipSpeed = 0;
    for (let i = 0; i < 45; i++) {
      physics.step(
        1 / 60,
        (dt) => fighter.updatePhysics(dt, swingIntent),
        (dt) => {
          sword.updateKinematics(dt);
          maxTipSpeed = Math.max(maxTipSpeed, sword.sweetSpotVelocity.length());
        },
      );
    }

    // Apply heavy disarm shock
    const disarmed = fighter.armController.applyGripImpact(physics, 'right', 95);
    const passed = grabbed && maxTipSpeed > 2.5 && disarmed && sword.ownerId === null;

    results.push({
      name: 'Physical Weapon Grip, Arm Swing Velocity & Disarm',
      passed,
      details: `grabbed=${grabbed}, peakBladeSpeed=${maxTipSpeed.toFixed(2)}m/s, disarmed=${disarmed}`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    sword.dispose(physics, scene);
    physics.dispose();
  }

  // Test 4: Physics-based collision combat damage
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    const eventBus = new EventBus();
    const particles = new ParticlePool(scene);
    const audio = new AudioEngine();
    const combat = new CombatSystem(physics, eventBus, particles, audio);

    const floorBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20), floorBody);

    const attacker = new ActiveRagdoll(physics, scene, {
      name: 'Attacker',
      isPlayer: true,
      slotIndex: 0,
      spawnPos: new THREE.Vector3(0, 0, 1.0),
      facingYaw: 0,
      appearance: { tunicColor: 0x7a1c1c, metalTint: 0xcccccc, armorTier: 'heavy' },
    });
    const defender = new ActiveRagdoll(physics, scene, {
      name: 'Defender',
      isPlayer: false,
      slotIndex: 1,
      spawnPos: new THREE.Vector3(0, 0, -0.15),
      facingYaw: Math.PI,
      appearance: { tunicColor: 0x243b5e, metalTint: 0xcccccc, armorTier: 'light' },
    });

    const axe = new WeaponInstance(physics, scene, 'battle_axe', new THREE.Vector3(0.25, 1.2, 0.8));
    attacker.armController.grabWeapon(physics, axe, 'right');

    const fighters = new Map([[attacker.id, attacker], [defender.id, defender]]);
    const weapons = new Map([[axe.id, axe]]);

    let hitCount = 0;
    eventBus.on('combatEvent', (ev) => {
      if (ev.type === 'hit') hitCount++;
    });

    const swingIntent = makeIdleIntent(0);
    swingIntent.arm.attackHeld = true;
    const idleOpp = makeIdleIntent(Math.PI);

    for (let i = 0; i < 60; i++) {
      swingIntent.arm.swingX = Math.sin((i / 60) * Math.PI * 2) * 0.95;
      physics.step(
        1 / 60,
        (dt) => {
          attacker.updatePhysics(dt, swingIntent);
          defender.updatePhysics(dt, idleOpp);
        },
        (dt) => {
          axe.updateKinematics(dt);
          combat.step(dt, fighters, weapons, []);
        },
      );
    }

    const damageDealt = defender.maxHealth - defender.health;
    const passed = hitCount > 0 && damageDealt > 0;
    results.push({
      name: 'Physical Weapon-vs-Body Collision Damage Pipeline',
      passed,
      details: `hitsDetected=${hitCount}, defenderDamage=${damageDealt}, defenderHealth=${defender.health}`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    attacker.dispose();
    defender.dispose();
    axe.dispose(physics, scene);
    particles.dispose();
    eventBus.clear();
    physics.dispose();
  }

  return results;
}
