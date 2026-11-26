import * as THREE from 'three';
import { loadRapier, RAPIER } from '../physics/RapierLoader';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ActiveRagdoll, type FighterControlIntent } from '../humanoid/ActiveRagdoll';
import { WeaponInstance } from '../weapons/WeaponInstance';
import { CombatSystem } from '../combat/CombatSystem';
import { ParticlePool } from '../combat/ParticlePool';
import { AudioEngine } from '../audio/AudioEngine';
import { EventBus } from '../core/EventBus';
import { InputManager } from '../controls/InputManager';
import { BODY_PART_ORDER } from '../humanoid/AnatomySpec';

export interface PhysicsTestCaseResult {
  name: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

function makeIntent(moveX = 0, moveZ = 0, yaw = 0): FighterControlIntent {
  return {
    moveX,
    moveZ,
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

function createTestArenaFloor(physics: PhysicsWorld): void {
  const floorBody = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
  );
  physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setFriction(0.95).setRestitution(0.05),
    floorBody,
  );
}

function createTestFighter(
  physics: PhysicsWorld,
  scene: THREE.Scene,
  yaw = 0,
  equipDefaultLoadout = false,
): { fighter: ActiveRagdoll; weapons: WeaponInstance[] } {
  const fighter = new ActiveRagdoll(physics, scene, {
    name: 'TestKnight',
    isPlayer: true,
    slotIndex: 0,
    spawnPos: new THREE.Vector3(0, 0, 0),
    facingYaw: yaw,
    appearance: { tunicColor: 0x7a1c1c, metalTint: 0xcccccc, armorTier: 'heavy' },
  });

  const weapons: WeaponInstance[] = [];
  if (equipDefaultLoadout) {
    const sword = new WeaponInstance(physics, scene, 'longsword', new THREE.Vector3(0.3, 1.0, 0));
    const shield = new WeaponInstance(physics, scene, 'shield', new THREE.Vector3(-0.3, 1.0, 0));
    fighter.armController.grabWeapon(physics, sword, 'right');
    fighter.armController.grabWeapon(physics, shield, 'left');
    weapons.push(sword, shield);
  }
  return { fighter, weapons };
}

function cameraRelativeToWorld(moveX: number, moveY: number, camYaw: number): { x: number; z: number } {
  const fwdX = -Math.sin(camYaw);
  const fwdZ = -Math.cos(camYaw);
  const rightX = Math.cos(camYaw);
  const rightZ = -Math.sin(camYaw);
  const wx = rightX * moveX + fwdX * moveY;
  const wz = rightZ * moveX + fwdZ * moveY;
  return { x: Math.abs(wx) < 1e-6 ? 0 : wx, z: Math.abs(wz) < 1e-6 ? 0 : wz };
}

function hasAnyNonFinite(fighter: ActiveRagdoll): boolean {
  for (const partId of BODY_PART_ORDER) {
    const p = fighter.bodies[partId].translation();
    const v = fighter.bodies[partId].linvel();
    const w = fighter.bodies[partId].angvel();
    if (
      !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) ||
      !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z) ||
      !Number.isFinite(w.x) || !Number.isFinite(w.y) || !Number.isFinite(w.z)
    ) {
      return true;
    }
  }
  return false;
}

export async function runPhysicsVerificationSuite(): Promise<PhysicsTestCaseResult[]> {
  const results: PhysicsTestCaseResult[] = [];
  await loadRapier();

  // TEST A — Idle Stability (30 seconds = 1800 steps with default longsword + shield equipped)
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);
    const { fighter, weapons } = createTestFighter(physics, scene, 0, true);

    const intent = makeIntent(0, 0, 0);
    let maxHorizDrift = 0;
    let maxYawDrift = 0;

    for (let i = 0; i < 1800; i++) {
      physics.step(
        1 / 60,
        (dt) => fighter.updatePhysics(dt, intent),
        (dt) => weapons.forEach((w) => w.updateKinematics(dt)),
      );
      const p = fighter.getPosition();
      const d = Math.hypot(p.x, p.z);
      if (d > maxHorizDrift) maxHorizDrift = d;
      const yawErr = Math.abs(fighter.getFacingYaw());
      if (yawErr > maxYawDrift) maxYawDrift = yawErr;
    }

    const finalPos = fighter.getPosition();
    const finalVel = fighter.bodies.pelvis.linvel();
    const finalSpeed = Math.hypot(finalVel.x, finalVel.z);
    const nonFinite = hasAnyNonFinite(fighter);
    const upright = finalPos.y > 0.82 && finalPos.y < 1.02 && !fighter.isKnockedDown;
    const passed =
      !nonFinite &&
      upright &&
      maxHorizDrift < 0.08 &&
      maxYawDrift < 0.08 &&
      finalSpeed < 0.05;

    results.push({
      name: 'TEST A — Idle Stability (30s / 1800 steps, sword+shield)',
      passed,
      details: `maxDrift=${maxHorizDrift.toFixed(4)}m, maxYawErr=${maxYawDrift.toFixed(4)}rad, finalPelvisY=${finalPos.y.toFixed(3)}m, finalSpeed=${finalSpeed.toFixed(4)}m/s, knockedDown=${fighter.isKnockedDown}`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    weapons.forEach((w) => w.dispose(physics, scene));
    physics.dispose();
  }

  // TEST B — Movement (hold W for 3s)
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);
    const { fighter, weapons } = createTestFighter(physics, scene, 0, true);

    const intent = makeIntent(0, -1, 0); // Forward (-Z) at yaw=0
    for (let i = 0; i < 180; i++) {
      physics.step(
        1 / 60,
        (dt) => fighter.updatePhysics(dt, intent),
        (dt) => weapons.forEach((w) => w.updateKinematics(dt)),
      );
    }

    const pos = fighter.getPosition();
    const forwardDist = -pos.z;
    const lateralError = Math.abs(pos.x);
    const upright = pos.y > 0.8 && pos.y < 1.02 && !fighter.isKnockedDown;
    const passed = !hasAnyNonFinite(fighter) && upright && forwardDist > 7.5 && lateralError < 0.35;

    results.push({
      name: 'TEST B — Forward Movement (hold W for 3.0s)',
      passed,
      details: `forwardDist=${forwardDist.toFixed(3)}m, lateralErr=${lateralError.toFixed(3)}m, pelvisY=${pos.y.toFixed(3)}m, knockedDown=${fighter.isKnockedDown}`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    weapons.forEach((w) => w.dispose(physics, scene));
    physics.dispose();
  }

  // TEST C — Stop (walk 2s then release all keys and measure deceleration & post-stop drift)
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);
    const { fighter, weapons } = createTestFighter(physics, scene, 0, true);

    const walkIntent = makeIntent(0, -1, 0);
    for (let i = 0; i < 120; i++) {
      physics.step(
        1 / 60,
        (dt) => fighter.updatePhysics(dt, walkIntent),
        (dt) => weapons.forEach((w) => w.updateKinematics(dt)),
      );
    }

    const stopIntent = makeIntent(0, 0, 0);
    let speedAfter1s = 0;
    let posAt1_5s = new THREE.Vector3();
    for (let i = 0; i < 150; i++) {
      physics.step(
        1 / 60,
        (dt) => fighter.updatePhysics(dt, stopIntent),
        (dt) => weapons.forEach((w) => w.updateKinematics(dt)),
      );
      if (i === 59) {
        const v = fighter.bodies.pelvis.linvel();
        speedAfter1s = Math.hypot(v.x, v.z);
      }
      if (i === 89) {
        fighter.getPosition(posAt1_5s);
      }
    }

    const finalPos = fighter.getPosition();
    const finalVel = fighter.bodies.pelvis.linvel();
    const finalSpeed = Math.hypot(finalVel.x, finalVel.z);
    const lateDrift = Math.hypot(finalPos.x - posAt1_5s.x, finalPos.z - posAt1_5s.z);
    const passed =
      !fighter.isKnockedDown &&
      speedAfter1s < 0.08 &&
      finalSpeed < 0.025 &&
      lateDrift < 0.025;

    results.push({
      name: 'TEST C — Stop & Deceleration (release all keys after walk)',
      passed,
      details: `speed@1s=${speedAfter1s.toFixed(4)}m/s, finalSpeed=${finalSpeed.toFixed(4)}m/s, lateDrift(1.5-2.5s)=${lateDrift.toFixed(4)}m`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    weapons.forEach((w) => w.dispose(physics, scene));
    physics.dispose();
  }

  // TEST D — Direction Changes (W/S/A/D + Diagonal relative to rotated Camera Yaw)
  {
    const t0 = performance.now();
    const camYaw = Math.PI / 3; // 60 deg rotated camera
    const cases: Array<{ label: string; ix: number; iy: number }> = [
      { label: 'W', ix: 0, iy: 1 },
      { label: 'S', ix: 0, iy: -1 },
      { label: 'A', ix: -1, iy: 0 },
      { label: 'D', ix: 1, iy: 0 },
      { label: 'W+D', ix: Math.SQRT1_2, iy: Math.SQRT1_2 },
    ];

    const summary: string[] = [];
    let allOk = true;

    for (const c of cases) {
      const scene = new THREE.Scene();
      const physics = new PhysicsWorld(60, 1);
      createTestArenaFloor(physics);
      const { fighter, weapons } = createTestFighter(physics, scene, camYaw, false);

      const worldDir = cameraRelativeToWorld(c.ix, c.iy, camYaw);
      const intent = makeIntent(worldDir.x, worldDir.z, camYaw);
      for (let i = 0; i < 90; i++) {
        physics.step(
          1 / 60,
          (dt) => fighter.updatePhysics(dt, intent),
          () => {},
        );
      }

      const pos = fighter.getPosition();
      const disp = Math.hypot(pos.x, pos.z);
      const dot = disp > 0.01 ? (pos.x * worldDir.x + pos.z * worldDir.z) / disp : 0;
      const angleErrDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dot, -1, 1)));
      const ok = disp > 3.0 && angleErrDeg < 10 && !fighter.isKnockedDown;
      if (!ok) allOk = false;
      summary.push(`${c.label}:dist=${disp.toFixed(2)}m/err=${angleErrDeg.toFixed(1)}°`);

      fighter.dispose();
      weapons.forEach((w) => w.dispose(physics, scene));
      physics.dispose();
    }

    results.push({
      name: 'TEST D — Camera-Relative Direction Changes (W/S/A/D/Diag @ yaw=60°)',
      passed: allOk,
      details: summary.join(', '),
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });
  }

  // TEST E — External Impact (moderate chest impulse -> stagger & controlled recovery)
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);
    const { fighter, weapons } = createTestFighter(physics, scene, 0, true);

    const idleIntent = makeIntent(0, 0, 0);
    // Settle briefly for 20 steps
    for (let i = 0; i < 20; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, idleIntent), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
    }

    fighter.applyDamage(15, 0.42, 'chest', new THREE.Vector3(36, 2.0, 0));
    let peakX = 0;
    for (let i = 0; i < 180; i++) {
      physics.step(
        1 / 60,
        (dt) => fighter.updatePhysics(dt, idleIntent),
        (dt) => weapons.forEach((w) => w.updateKinematics(dt)),
      );
      peakX = Math.max(peakX, Math.abs(fighter.getPosition().x));
    }

    const pos = fighter.getPosition();
    const vel = fighter.bodies.pelvis.linvel();
    const postSpeed = Math.hypot(vel.x, vel.z);
    const passed = peakX > 0.15 && !fighter.isKnockedDown && pos.y > 0.8 && postSpeed < 0.08;

    results.push({
      name: 'TEST E — External Impact & Controlled Stagger Recovery',
      passed,
      details: `peakDispX=${peakX.toFixed(3)}m, postPelvisY=${pos.y.toFixed(3)}m, postSpeed=${postSpeed.toFixed(4)}m/s, knockedDown=${fighter.isKnockedDown}`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    weapons.forEach((w) => w.dispose(physics, scene));
    physics.dispose();
  }

  // TEST F — Standing Recovery from Knocked-Down / Tilted Posture (no teleportation)
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);
    const { fighter } = createTestFighter(physics, scene, 0, false);

    fighter.applyDamage(20, 0.95, 'chest', new THREE.Vector3(24, 2, 0));
    const knocked = fighter.isKnockedDown;

    const idleIntent = makeIntent(0, 0, 0);
    let maxSingleStepJumpY = 0;
    let prevY = fighter.getPosition().y;
    for (let i = 0; i < 240; i++) {
      physics.step(
        1 / 60,
        (dt) => fighter.updatePhysics(dt, idleIntent),
        () => {},
      );
      const currY = fighter.getPosition().y;
      maxSingleStepJumpY = Math.max(maxSingleStepJumpY, Math.abs(currY - prevY));
      prevY = currY;
    }

    const pos = fighter.getPosition();
    const passed =
      knocked &&
      !fighter.isKnockedDown &&
      pos.y > 0.78 &&
      maxSingleStepJumpY < 0.12 &&
      !hasAnyNonFinite(fighter);

    results.push({
      name: 'TEST F — Physical Knockdown Recovery (no teleporting)',
      passed,
      details: `knockedOnImpact=${knocked}, postPelvisY=${pos.y.toFixed(3)}m, isKnockedDown=${fighter.isKnockedDown}, maxStepDeltaY=${maxSingleStepJumpY.toFixed(4)}m`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    physics.dispose();
  }

  // TEST G — Joint Stability (all 16 joints anchor separation during idle + movement)
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);
    const { fighter, weapons } = createTestFighter(physics, scene, 0, true);

    let maxIdleJointErr = 0;
    let maxWalkJointErr = 0;
    const idleIntent = makeIntent(0, 0, 0);
    const walkIntent = makeIntent(0, -1, 0);

    for (let i = 0; i < 120; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, idleIntent), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
      maxIdleJointErr = Math.max(maxIdleJointErr, fighter.getMaxJointSeparation());
    }
    for (let i = 0; i < 120; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, walkIntent), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
      maxWalkJointErr = Math.max(maxWalkJointErr, fighter.getMaxJointSeparation());
    }

    const passed =
      fighter.joints.length === 16 &&
      Object.keys(fighter.bodies).length === 17 &&
      maxIdleJointErr < 0.03 &&
      maxWalkJointErr < 0.045;

    results.push({
      name: 'TEST G — Joint Anchor Stability (16 joints idle & walking)',
      passed,
      details: `segments=${Object.keys(fighter.bodies).length}, joints=${fighter.joints.length}, maxIdleSep=${(maxIdleJointErr * 100).toFixed(2)}cm, maxWalkSep=${(maxWalkJointErr * 100).toFixed(2)}cm`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    weapons.forEach((w) => w.dispose(physics, scene));
    physics.dispose();
  }

  // TEST H — Frame Rate & Substep Independence (30fps vs 60fps vs 120fps + 90Hz/2sub)
  {
    const t0 = performance.now();
    const configs: Array<{ label: string; frameDt: number; frames: number; hz: 60 | 90; sub: 1 | 2 }> = [
      { label: '30fps(60Hz/1s)', frameDt: 1 / 30, frames: 60, hz: 60, sub: 1 },
      { label: '60fps(60Hz/1s)', frameDt: 1 / 60, frames: 120, hz: 60, sub: 1 },
      { label: '120fps(60Hz/1s)', frameDt: 1 / 120, frames: 240, hz: 60, sub: 1 },
      { label: '60fps(90Hz/2s)', frameDt: 1 / 60, frames: 120, hz: 90, sub: 2 },
    ];

    const distances: number[] = [];
    const detailsArr: string[] = [];
    let allStanding = true;

    for (const cfg of configs) {
      const scene = new THREE.Scene();
      const physics = new PhysicsWorld(cfg.hz, cfg.sub);
      createTestArenaFloor(physics);
      const { fighter, weapons } = createTestFighter(physics, scene, 0, true);
      const walkIntent = makeIntent(0, -1, 0);

      for (let i = 0; i < cfg.frames; i++) {
        physics.step(
          cfg.frameDt,
          (dt) => fighter.updatePhysics(dt, walkIntent),
          (dt) => weapons.forEach((w) => w.updateKinematics(dt)),
        );
      }

      const pos = fighter.getPosition();
      const dist = -pos.z;
      distances.push(dist);
      detailsArr.push(`${cfg.label}:${dist.toFixed(2)}m`);
      if (fighter.isKnockedDown || pos.y < 0.78) allStanding = false;

      fighter.dispose();
      weapons.forEach((w) => w.dispose(physics, scene));
      physics.dispose();
    }

    const minD = Math.min(...distances);
    const maxD = Math.max(...distances);
    const spread = maxD - minD;
    const passed = allStanding && minD > 4.0 && spread < 0.45;

    results.push({
      name: 'TEST H — Frame Rate & Substep Independence (30/60/120fps + 90Hz/2sub)',
      passed,
      details: `${detailsArr.join(', ')} (spread=${spread.toFixed(3)}m)`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });
  }

  // TEST I — Mobile Virtual Joystick Normalization, Deadzone, & Release Zeroing
  {
    const t0 = performance.now();
    const input = new InputManager();
    input.setEnabled(true);

    input.setMobileJoystick(0.02, -0.01); // inside deadzone
    const deadSnap = input.consumeSnapshot(1 / 60);

    input.setMobileJoystick(1.4, 1.4); // clamped diagonal
    const diagSnap = input.consumeSnapshot(1 / 60);
    const diagMag = Math.hypot(diagSnap.moveX, diagSnap.moveY);

    input.setMobileJoystick(0, 1); // forward
    const fwdSnap = input.consumeSnapshot(1 / 60);

    input.setMobileJoystick(0, 0); // release
    const relSnap = input.consumeSnapshot(1 / 60);

    // Also drive fighter with mobile forward then release
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);
    const { fighter } = createTestFighter(physics, scene, 0, false);

    input.setMobileJoystick(0, 1);
    for (let i = 0; i < 60; i++) {
      const s = input.consumeSnapshot(1 / 60);
      const w = cameraRelativeToWorld(s.moveX, s.moveY, 0);
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, makeIntent(w.x, w.z, 0)), () => {});
    }
    const afterWalkZ = fighter.getPosition().z;

    input.setMobileJoystick(0, 0);
    for (let i = 0; i < 90; i++) {
      const s = input.consumeSnapshot(1 / 60);
      const w = cameraRelativeToWorld(s.moveX, s.moveY, 0);
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, makeIntent(w.x, w.z, 0)), () => {});
    }
    const finalV = fighter.bodies.pelvis.linvel();
    const stopSpeed = Math.hypot(finalV.x, finalV.z);

    const passed =
      deadSnap.moveX === 0 &&
      deadSnap.moveY === 0 &&
      Math.abs(diagMag - 1) < 0.001 &&
      fwdSnap.moveX === 0 &&
      fwdSnap.moveY === 1 &&
      relSnap.moveX === 0 &&
      relSnap.moveY === 0 &&
      afterWalkZ < -1.5 &&
      stopSpeed < 0.04;

    results.push({
      name: 'TEST I — Mobile Virtual Joystick & Release Zeroing',
      passed,
      details: `dead=(${deadSnap.moveX},${deadSnap.moveY}), diagMag=${diagMag.toFixed(3)}, release=(${relSnap.moveX},${relSnap.moveY}), walkZ=${afterWalkZ.toFixed(2)}m, stopSpeed=${stopSpeed.toFixed(4)}m/s`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    physics.dispose();
    input.dispose();
  }

  // Regression Test: Weapon gripping, realistic arm swing kinematics, and disarming
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);

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

    const swingIntent = makeIntent(0, 0, 0);
    swingIntent.arm.attackHeld = true;

    let maxTipSpeed = 0;
    for (let i = 0; i < 60; i++) {
      swingIntent.arm.swingX = Math.sin((i / 30) * Math.PI) * 0.95;
      physics.step(
        1 / 60,
        (dt) => fighter.updatePhysics(dt, swingIntent),
        (dt) => {
          sword.updateKinematics(dt);
          maxTipSpeed = Math.max(maxTipSpeed, sword.sweetSpotVelocity.length());
        },
      );
    }

    const disarmed = fighter.armController.applyGripImpact(physics, 'right', 95);
    const passed = grabbed && maxTipSpeed > 3.0 && maxTipSpeed < 24.0 && disarmed && sword.ownerId === null;

    results.push({
      name: 'Regression — Weapon Grip, Realistic Swing Velocity & Disarm',
      passed,
      details: `grabbed=${grabbed}, peakBladeSpeed=${maxTipSpeed.toFixed(2)}m/s, disarmed=${disarmed}`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    sword.dispose(physics, scene);
    physics.dispose();
  }

  // Regression Test: Physics-based collision combat damage
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    const eventBus = new EventBus();
    const particles = new ParticlePool(scene);
    const audio = new AudioEngine();
    const combat = new CombatSystem(physics, eventBus, particles, audio);

    createTestArenaFloor(physics);

    const attacker = new ActiveRagdoll(physics, scene, {
      name: 'Attacker',
      isPlayer: true,
      slotIndex: 0,
      spawnPos: new THREE.Vector3(0, 0, 0.82),
      facingYaw: 0,
      appearance: { tunicColor: 0x7a1c1c, metalTint: 0xcccccc, armorTier: 'heavy' },
    });
    const defender = new ActiveRagdoll(physics, scene, {
      name: 'Defender',
      isPlayer: false,
      slotIndex: 1,
      spawnPos: new THREE.Vector3(0, 0, -0.18),
      facingYaw: Math.PI,
      appearance: { tunicColor: 0x243b5e, metalTint: 0xcccccc, armorTier: 'light' },
    });

    const axe = new WeaponInstance(physics, scene, 'battle_axe', new THREE.Vector3(0.25, 1.2, 0.7));
    attacker.armController.grabWeapon(physics, axe, 'right');

    const fighters = new Map([[attacker.id, attacker], [defender.id, defender]]);
    const weapons = new Map([[axe.id, axe]]);

    let hitCount = 0;
    eventBus.on('combatEvent', (ev) => {
      if (ev.type === 'hit') hitCount++;
    });

    const swingIntent = makeIntent(0, 0, 0);
    swingIntent.arm.attackHeld = true;
    const idleOpp = makeIntent(0, 0, Math.PI);

    for (let i = 0; i < 60; i++) {
      swingIntent.arm.swingX = -Math.cos((i / 35) * Math.PI) * 0.95;
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
      name: 'Regression — Weapon-vs-Body Collision Damage Pipeline',
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

  // TEST J — Smooth Acceleration, Strafe/Backward & 90°/180° Body Rotation
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);
    const { fighter, weapons } = createTestFighter(physics, scene, 0, true);

    // 1. Gradual start (check first 3 steps don't instantaneously jump to full run speed)
    const walkFwd = makeIntent(0, -1, 0);
    for (let i = 0; i < 4; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, walkFwd), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
    }
    const earlySpeed = Math.hypot(fighter.bodies.pelvis.linvel().x, fighter.bodies.pelvis.linvel().z);

    // 2. Smooth 90° and 180° rotation while walking + strafing/backward
    let maxStepYawDelta = 0;
    let prevYaw = fighter.getFacingYaw();
    const turn90 = makeIntent(0.6, -0.8, Math.PI * 0.5);
    for (let i = 0; i < 60; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, turn90), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
      const y = fighter.getFacingYaw();
      let dy = y - prevYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      maxStepYawDelta = Math.max(maxStepYawDelta, Math.abs(dy));
      prevYaw = y;
    }
    const yawAfter90 = fighter.getFacingYaw();

    const turn180 = makeIntent(0, 1, -Math.PI * 0.5); // 180 deg turn + backward move
    for (let i = 0; i < 90; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, turn180), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
      const y = fighter.getFacingYaw();
      let dy = y - prevYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      maxStepYawDelta = Math.max(maxStepYawDelta, Math.abs(dy));
      prevYaw = y;
    }
    const yawAfter180 = fighter.getFacingYaw();
    const maxJointErr = fighter.getMaxJointSeparation();

    const yaw90Err = Math.abs(Math.atan2(Math.sin(yawAfter90 - Math.PI * 0.5), Math.cos(yawAfter90 - Math.PI * 0.5)));
    const yaw180Err = Math.abs(Math.atan2(Math.sin(yawAfter180 - (-Math.PI * 0.5)), Math.cos(yawAfter180 - (-Math.PI * 0.5))));

    const passed =
      !fighter.isKnockedDown &&
      earlySpeed > 0.15 &&
      earlySpeed < 1.9 &&
      maxStepYawDelta < 0.28 &&
      yaw90Err < 0.25 &&
      yaw180Err < 0.25 &&
      maxJointErr < 0.035;

    results.push({
      name: 'TEST J — Smooth Acceleration, Strafe & 90°/180° Turning',
      passed,
      details: `earlySpeed=${earlySpeed.toFixed(2)}m/s, maxStepYaw=${maxStepYawDelta.toFixed(3)}rad, yaw90Err=${yaw90Err.toFixed(3)}rad, yaw180Err=${yaw180Err.toFixed(3)}rad, jointErr=${(maxJointErr * 100).toFixed(2)}cm`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    weapons.forEach((w) => w.dispose(physics, scene));
    physics.dispose();
  }

  // TEST K — Direct Weapon Direction, Wrist Roll Rotation & 2-Bone Arm IK
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);
    const { fighter, weapons } = createTestFighter(physics, scene, 0, true);
    const sword = weapons[0];

    const manipIntent = makeIntent(0, 0, 0);
    manipIntent.arm.weaponManipActive = true;

    // Sweep left -> right and low -> high while rotating wrist blade roll
    manipIntent.arm.swingX = -0.85;
    manipIntent.arm.swingY = -0.55;
    manipIntent.arm.weaponRoll = -1.0;
    for (let i = 0; i < 45; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, manipIntent), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
    }
    const leftLowTip = sword.tipWorld.clone();
    const leftEdge = sword.edgeWorldDir.clone();

    manipIntent.arm.swingX = 0.85;
    manipIntent.arm.swingY = 0.75;
    manipIntent.arm.weaponRoll = 1.1;
    manipIntent.arm.weaponPitchOffset = 0.35;
    for (let i = 0; i < 45; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, manipIntent), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
    }
    const rightHighTip = sword.tipWorld.clone();
    const rightEdge = sword.edgeWorldDir.clone();

    const horizSpan = rightHighTip.x - leftLowTip.x;
    const vertSpan = rightHighTip.y - leftLowTip.y;
    const edgeAngleChanged = leftEdge.angleTo(rightEdge);
    const jointErr = fighter.getMaxJointSeparation();

    const passed =
      !fighter.isKnockedDown &&
      horizSpan > 0.65 &&
      vertSpan > 0.55 &&
      edgeAngleChanged > 0.85 &&
      jointErr < 0.035 &&
      !hasAnyNonFinite(fighter);

    results.push({
      name: 'TEST K — Direct Weapon Direction, Wrist Roll & 2-Bone Arm IK',
      passed,
      details: `horizSpan=${horizSpan.toFixed(2)}m, vertSpan=${vertSpan.toFixed(2)}m, edgeRot=${edgeAngleChanged.toFixed(2)}rad, jointErr=${(jointErr * 100).toFixed(2)}cm`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    weapons.forEach((w) => w.dispose(physics, scene));
    physics.dispose();
  }

  // TEST L — Gait Transitions, Chest-Local No-Lag Arm Tracking & Visual Variants
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);
    const { fighter, weapons } = createTestFighter(physics, scene, 0, true);

    const idleIntent = makeIntent(0, 0, 0);
    for (let i = 0; i < 30; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, idleIntent), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
    }
    const idleState = fighter.gaitState;

    // 1. Full-speed run forward -> verify idle -> starting -> running
    const runIntent = makeIntent(0, -1, 0);
    let sawStarting = false;
    let sawRunning = false;
    for (let i = 0; i < 60; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, runIntent), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
      if (fighter.gaitState === 'starting') sawStarting = true;
      if (fighter.gaitState === 'running') sawRunning = true;
    }

    // 2. Precision walk with active weapon manipulation -> verify walking + zero chest-local hand lag
    const runArmIntent = makeIntent(0, -1, 0);
    runArmIntent.arm.weaponManipActive = true;
    runArmIntent.arm.swingX = 0.25;
    runArmIntent.arm.swingY = 0.15;

    let sawWalking = false;
    let minHandAheadChest = Infinity;
    for (let i = 0; i < 60; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, runArmIntent), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
      if (fighter.gaitState === 'walking') sawWalking = true;
      if (i > 15) {
        const chestP = fighter.bodies.chest.translation();
        const handP = fighter.bodies.handR.translation();
        const fwd = fighter.getForwardDir();
        const ahead = (handP.x - chestP.x) * fwd.x + (handP.z - chestP.z) * fwd.z;
        minHandAheadChest = Math.min(minHandAheadChest, ahead);
      }
    }

    let sawStopping = false;
    for (let i = 0; i < 90; i++) {
      physics.step(1 / 60, (dt) => fighter.updatePhysics(dt, idleIntent), (dt) => weapons.forEach((w) => w.updateKinematics(dt)));
      if (fighter.gaitState === 'stopping') sawStopping = true;
    }
    const settledState = fighter.gaitState;

    // Verify all 5 helm/face/armor variants instantiate cleanly in Node & browser paths
    const styles: Array<{
      helmStyle: 'barbute' | 'spangenhelm' | 'kettle' | 'sallet' | 'open';
      beardStyle: 'none' | 'stubble' | 'goatee' | 'full';
      armorTier: 'light' | 'medium' | 'heavy';
    }> = [
      { helmStyle: 'barbute', beardStyle: 'goatee', armorTier: 'heavy' },
      { helmStyle: 'spangenhelm', beardStyle: 'full', armorTier: 'medium' },
      { helmStyle: 'kettle', beardStyle: 'stubble', armorTier: 'light' },
      { helmStyle: 'sallet', beardStyle: 'none', armorTier: 'heavy' },
      { helmStyle: 'open', beardStyle: 'full', armorTier: 'medium' },
    ];
    let minHeadMeshes = Infinity;
    for (let idx = 0; idx < styles.length; idx++) {
      const f = new ActiveRagdoll(physics, scene, {
        name: `Variant_${idx}`,
        isPlayer: false,
        slotIndex: 1,
        spawnPos: new THREE.Vector3(3 + idx * 1.5, 0, 0),
        facingYaw: 0,
        appearance: {
          tunicColor: 0x5c1928,
          metalTint: 0xd0d6de,
          ...styles[idx],
        },
      });
      minHeadMeshes = Math.min(minHeadMeshes, f.meshes.head.children.length);
      f.dispose();
    }

    const passed =
      idleState === 'idle' &&
      sawStarting &&
      sawRunning &&
      sawWalking &&
      sawStopping &&
      settledState === 'idle' &&
      minHandAheadChest > 0.25 &&
      minHeadMeshes >= 15 &&
      !hasAnyNonFinite(fighter);

    results.push({
      name: 'TEST L — Gait State Transitions, No-Lag Chest-Local Arm & Visual Variants',
      passed,
      details: `states=(${idleState}->starting:${sawStarting}->running:${sawRunning}->walking:${sawWalking}->stopping:${sawStopping}->${settledState}), minHandAhead=${minHandAheadChest.toFixed(2)}m, minHeadParts=${minHeadMeshes}`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    fighter.dispose();
    weapons.forEach((w) => w.dispose(physics, scene));
    physics.dispose();
  }

  // TEST M — Aggressive Combat-Ready Stance, Weapon-Specific Guards & Upright Shield Orientation
  {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld(60, 1);
    createTestArenaFloor(physics);

    const idleIntent = makeIntent(0, 0, 0);

    // 1. Arming sword + shield default ready stance
    const { fighter: knight } = createTestFighter(physics, scene, 0, false);
    const armingSword = new WeaponInstance(physics, scene, 'arming_sword', new THREE.Vector3(0.3, 1.0, 0));
    const shield = new WeaponInstance(physics, scene, 'shield', new THREE.Vector3(-0.3, 1.0, 0));
    knight.armController.grabWeapon(physics, armingSword, 'right');
    knight.armController.grabWeapon(physics, shield, 'left');

    for (let i = 0; i < 90; i++) {
      physics.step(
        1 / 60,
        (dt) => knight.updatePhysics(dt, idleIntent),
        (dt) => {
          armingSword.updateKinematics(dt);
          shield.updateKinematics(dt);
        },
      );
    }

    const pelvisP = knight.bodies.pelvis.translation();
    const footLP = knight.bodies.footL.translation();
    const footRP = knight.bodies.footR.translation();
    const handRP = knight.bodies.handR.translation();
    const shieldP = shield.body.translation();
    const shieldR = shield.body.rotation();
    const shieldNormalWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion(shieldR.x, shieldR.y, shieldR.z, shieldR.w),
    );
    const swordRaisedDeltaY = armingSword.tipWorld.y - handRP.y;
    const swordUpDot = armingSword.thrustAxisWorld.y;
    const swordFwdDot = -armingSword.thrustAxisWorld.z;
    const shieldAbovePelvis = shieldP.y - pelvisP.y;
    const shieldUpDot = shield.thrustAxisWorld.y;
    const shieldFwdFaceDot = -shieldNormalWorld.z;
    const kneeStaggerZ = footRP.z - footLP.z; // + when lead left foot is ahead (-Z) of rear right foot (+Z)
    const knightChestLocalHandR = new THREE.Vector3(handRP.x, handRP.y, handRP.z)
      .sub(new THREE.Vector3(knight.bodies.chest.translation().x, knight.bodies.chest.translation().y, knight.bodies.chest.translation().z));

    // 2. Smooth transitions: combat stance -> walk -> attack -> defend -> release back to combat stance
    const walkIntent = makeIntent(0, -1, 0);
    for (let i = 0; i < 36; i++) {
      physics.step(1 / 60, (dt) => knight.updatePhysics(dt, walkIntent), (dt) => {
        armingSword.updateKinematics(dt);
        shield.updateKinematics(dt);
      });
    }
    const atkIntent = makeIntent(0, 0, 0);
    atkIntent.arm.attackHeld = true;
    atkIntent.arm.swingX = -0.5;
    atkIntent.arm.swingY = 0.2;
    for (let i = 0; i < 24; i++) {
      physics.step(1 / 60, (dt) => knight.updatePhysics(dt, atkIntent), (dt) => {
        armingSword.updateKinematics(dt);
        shield.updateKinematics(dt);
      });
    }
    const defIntent = makeIntent(0, 0, 0);
    defIntent.arm.defendHeld = true;
    for (let i = 0; i < 24; i++) {
      physics.step(1 / 60, (dt) => knight.updatePhysics(dt, defIntent), (dt) => {
        armingSword.updateKinematics(dt);
        shield.updateKinematics(dt);
      });
    }
    const defShieldFwd = -new THREE.Vector3(0, 0, 1)
      .applyQuaternion(new THREE.Quaternion(shield.body.rotation().x, shield.body.rotation().y, shield.body.rotation().z, shield.body.rotation().w))
      .z;
    for (let i = 0; i < 75; i++) {
      physics.step(1 / 60, (dt) => knight.updatePhysics(dt, idleIntent), (dt) => {
        armingSword.updateKinematics(dt);
        shield.updateKinematics(dt);
      });
    }
    const recoveredTipDeltaY = armingSword.tipWorld.y - knight.bodies.handR.translation().y;
    const knightJointErr = knight.getMaxJointSeparation();

    // 3. Weapon-specific guard differences across longsword, battle_axe, and mace
    const measureWeaponGuard = (wType: 'longsword' | 'battle_axe' | 'mace', spawnX: number) => {
      const f = new ActiveRagdoll(physics, scene, {
        name: `Guard_${wType}`,
        isPlayer: false,
        slotIndex: 1,
        spawnPos: new THREE.Vector3(spawnX, 0, 0),
        facingYaw: 0,
        appearance: { tunicColor: 0x5c1928, metalTint: 0xd0d6de, armorTier: 'medium' },
      });
      const w = new WeaponInstance(physics, scene, wType, new THREE.Vector3(spawnX + 0.3, 1.0, 0));
      f.armController.grabWeapon(physics, w, 'right');
      for (let i = 0; i < 90; i++) {
        physics.step(1 / 60, (dt) => f.updatePhysics(dt, idleIntent), (dt) => w.updateKinematics(dt));
      }
      const h = f.bodies.handR.translation();
      const c = f.bodies.chest.translation();
      const res = {
        tipDeltaY: w.tipWorld.y - h.y,
        upDot: w.thrustAxisWorld.y,
        fwdDot: -w.thrustAxisWorld.z,
        handLocal: new THREE.Vector3(h.x - c.x, h.y - c.y, h.z - c.z),
        jointErr: f.getMaxJointSeparation(),
        fallen: f.isKnockedDown,
      };
      f.dispose();
      w.dispose(physics, scene);
      return res;
    };

    const longswordGuard = measureWeaponGuard('longsword', 3.0);
    const axeGuard = measureWeaponGuard('battle_axe', 6.0);
    const maceGuard = measureWeaponGuard('mace', 9.0);

    const longswordVsSwordDiff = longswordGuard.handLocal.distanceTo(knightChestLocalHandR);
    const axeVsLongswordDiff = Math.abs(axeGuard.upDot - longswordGuard.upDot) + axeGuard.handLocal.distanceTo(longswordGuard.handLocal);

    const passed =
      !knight.isKnockedDown &&
      !longswordGuard.fallen &&
      !axeGuard.fallen &&
      !maceGuard.fallen &&
      pelvisP.y > 0.84 &&
      pelvisP.y < 0.905 &&
      kneeStaggerZ > 0.04 &&
      swordRaisedDeltaY > 0.14 &&
      swordUpDot > 0.35 &&
      swordFwdDot > 0.25 &&
      shieldAbovePelvis > 0.34 &&
      shieldUpDot > 0.72 &&
      shieldFwdFaceDot > 0.55 &&
      defShieldFwd > 0.65 &&
      recoveredTipDeltaY > 0.14 &&
      longswordGuard.tipDeltaY > 0.18 &&
      longswordGuard.upDot > 0.35 &&
      axeGuard.tipDeltaY > 0.18 &&
      axeGuard.upDot > 0.35 &&
      maceGuard.tipDeltaY > 0.14 &&
      maceGuard.upDot > 0.35 &&
      longswordVsSwordDiff > 0.04 &&
      axeVsLongswordDiff > 0.04 &&
      knightJointErr < 0.035 &&
      longswordGuard.jointErr < 0.035 &&
      axeGuard.jointErr < 0.035 &&
      maceGuard.jointErr < 0.035 &&
      !hasAnyNonFinite(knight);

    results.push({
      name: 'TEST M — Aggressive Combat-Ready Stance, Weapon Guards & Upright Shield',
      passed,
      details: `pelvisY=${pelvisP.y.toFixed(3)}m, footStagger=${kneeStaggerZ.toFixed(3)}m, sword(dY=${swordRaisedDeltaY.toFixed(2)}, up=${swordUpDot.toFixed(2)}, fwd=${swordFwdDot.toFixed(2)}), shield(abovePelvis=${shieldAbovePelvis.toFixed(2)}, up=${shieldUpDot.toFixed(2)}, faceFwd=${shieldFwdFaceDot.toFixed(2)}), longUp=${longswordGuard.upDot.toFixed(2)}, axeUp=${axeGuard.upDot.toFixed(2)}, maceUp=${maceGuard.upDot.toFixed(2)}, poseDiff=${longswordVsSwordDiff.toFixed(2)}m`,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    });

    knight.dispose();
    armingSword.dispose(physics, scene);
    shield.dispose(physics, scene);
    physics.dispose();
  }

  return results;
}


