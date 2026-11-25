# Physics Test Report — Medieval Blood Arena

Executed via `npx tsx src/tests/runPhysicsTests.ts` against `@dimforge/rapier3d-compat` v0.21.0 and Three.js using the production simulation modules (`PhysicsWorld`, `ActiveRagdoll`, `ArmHandController`, `WeaponInstance`, `CombatSystem`).

## Summary
- **Total Tests**: 4
- **Passed**: 4
- **Failed**: 0

## Detailed Results

### 1. 17-Segment Active Ragdoll Standing Balance (120 steps)
- **Status**: PASS (326.72 ms)
- **Verified**: `segments=17`, `joints=16`, `pelvisY=1.016m`, `knockedDown=false`
- **Behavior**: Torque-driven PD orientation controllers on pelvis, abdomen, chest, neck, head, thighs, shins, and feet maintain upright standing equilibrium on the ground collider without joint explosion or NaN divergence.

### 2. Knockdown Impulse & Physical Recovery Simulation (180 steps)
- **Status**: PASS (335.76 ms)
- **Verified**: `knockedOnImpact=true`, `postRecoveryPelvisY=0.820m`, `isKnockedDown=false`
- **Behavior**: Lateral chest impact breaks balance (`isKnockedDown=true`), fighter collapses naturally under gravity, and after the stun window pushes back upright through physical pelvis/chest velocity assists and PD righting torques without teleportation.

### 3. Physical Weapon Grip, Arm Swing Velocity & Disarm
- **Status**: PASS (106.46 ms)
- **Verified**: `grabbed=true`, `peakBladeSpeed=43.58m/s`, `disarmed=true`
- **Behavior**: Longsword attaches to `handR` via a fixed impulse joint with self-collision disabled against the wielder's skeleton, swings through physical arm spring/PD torques, and cleanly detaches (`ownerId === null`) when grip impact shock exceeds threshold.

### 4. Physical Weapon-vs-Body Collision Damage Pipeline
- **Status**: PASS (178.34 ms)
- **Verified**: `hitsDetected=1`, `defenderDamage=18`, `defenderHealth=82`
- **Behavior**: Rapier contact force events evaluate relative sweet-spot impact velocity, weapon mass, edge alignment, armor mitigation, and hit zone multipliers to compute physical damage and apply knockdown shock.
