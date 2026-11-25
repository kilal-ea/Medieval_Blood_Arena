# Physics Test Report — Medieval Blood Arena

Executed via `npx tsx src/tests/runPhysicsTests.ts` against `@dimforge/rapier3d-compat` v0.21.0 and Three.js using the production simulation modules (`PhysicsWorld`, `ActiveRagdoll`, `ArmHandController`, `WeaponInstance`, `CombatSystem`, `InputManager`).

## Summary
- **Total Tests**: 13 (`TEST A`–`TEST K` + 2 Combat/Weapon Regressions)
- **Passed**: 13
- **Failed**: 0

## Detailed Results

- **TEST A — Idle Stability (30s / 1800 steps, sword+shield)**: PASS — `maxDrift=0.0240m, maxYawErr=0.0083rad, finalPelvisY=0.913m, finalSpeed=0.0147m/s, knockedDown=false`
- **TEST B — Forward Movement (hold W for 3.0s)**: PASS — `forwardDist=9.938m, lateralErr=0.000m, pelvisY=0.897m, knockedDown=false`
- **TEST C — Stop & Deceleration (release all keys after walk)**: PASS — `speed@1s=0.0761m/s, finalSpeed=0.0010m/s, lateDrift(1.5-2.5s)=0.0017m`
- **TEST D — Camera-Relative Direction Changes (W/S/A/D/Diag @ yaw=60°)**: PASS — `W:dist=4.61m/err=0.0°, S:dist=4.60m/err=0.0°, A:dist=4.60m/err=0.1°, D:dist=4.60m/err=0.1°, W+D:dist=4.61m/err=0.0°`
- **TEST E — External Impact & Controlled Stagger Recovery**: PASS — `peakDispX=0.196m, postPelvisY=0.896m, postSpeed=0.0059m/s, knockedDown=false`
- **TEST F — Physical Knockdown Recovery (no teleporting)**: PASS — `knockedOnImpact=true, postPelvisY=0.912m, isKnockedDown=false, maxStepDeltaY=0.0516m`
- **TEST G — Joint Anchor Stability (16 joints idle & walking)**: PASS — `segments=17, joints=16, maxIdleSep=0.18cm, maxWalkSep=0.02cm`
- **TEST H — Frame Rate & Substep Independence (30/60/120fps + 90Hz/2sub)**: PASS — `30fps(60Hz/1s):6.36m, 60fps(60Hz/1s):6.36m, 120fps(60Hz/1s):6.36m, 60fps(90Hz/2s):6.28m (spread=0.083m)`
- **TEST I — Mobile Virtual Joystick & Release Zeroing**: PASS — `dead=(0,0), diagMag=1.000, release=(0,0), walkZ=-2.81m, stopSpeed=0.0056m/s`
- **TEST J — Smooth Acceleration, Strafe & 90°/180° Turning**: PASS — `earlySpeed=0.25m/s, maxStepYaw=0.229rad, yaw90Err=0.057rad, yaw180Err=0.138rad, jointErr=0.01cm`
- **TEST K — Direct Weapon Direction, Wrist Roll & 2-Bone Arm IK**: PASS — `horizSpan=2.16m, vertSpan=1.34m, edgeRot=2.69rad, jointErr=0.02cm`
- **Regression — Weapon Grip, Realistic Swing Velocity & Disarm**: PASS — `grabbed=true, peakBladeSpeed=5.68m/s, disarmed=true`
- **Regression — Weapon-vs-Body Collision Damage Pipeline**: PASS — `hitsDetected=1, defenderDamage=6, defenderHealth=94`
