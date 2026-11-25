# Control Rework Report — Medieval Blood Arena

## 1. Root Causes of the Unnatural Controls

1. **Arm, Hand & Weapon Rigidity and Control Hijacking (`InputManager.ts`, `GameEngine.ts`, `ArmHandController.ts`)**:
   - **No free weapon manipulation**: `InputManager.onMouseMove` ignored weapon steering unless `attackHeldMouse` (`LMB`) was held, and `ArmHandController.updateRightArm` ignored `swingX`/`swingY` completely in the ready stance.
   - **Canned `triggerAutoSwing` hijack**: Clicking `LMB` triggered `triggerAutoSwing` in `GameEngine.ts`, which overwrote `input.swingX`/`swingY` with a pre-scripted sine wave in a random direction for `0.36s`, overriding manual mouse movement.
   - **Camera fighting weapon control**: Moving the mouse while holding `LMB` still rotated camera yaw (`this.yawDelta -= dx * sens * 0.35`), rotating the character's `aimYaw` while the player tried to swing horizontally.
   - **No direct wrist rotation or IK harmony**: `upperArmR`, `forearmR`, and `handR` used independent hardcoded Euler target guesses instead of solving analytical 2-bone arm IK or computing wrist orientation directly from desired weapon direction (`handQuat = weaponWorldQuat * inv(localRot)`), causing shoulder/elbow/wrist springs to fight each other.
   - **Mobile single-thumb conflict**: `addTouchCameraDelta` required dragging the right touch pad while holding `STRIKE` on mobile, which is impossible with one right thumb.

2. **Abrupt Walking Transitions (`ActiveRagdoll.ts`)**:
   - Locomotion assigned an instantaneous step target (`targetVx = moveX * moveSpeed`) and snapped `footFriction` from `1.35` to `0.04` on the first frame of input and back to `1.35` on release, producing an abrupt pelvis shove on start and stop, and unscaled stride cadence relative to speed.

3. **Mechanical / Snapping Body Rotation (`ActiveRagdoll.ts`)**:
   - `facingYaw` was fed instantaneously to `pelvis`, `abdomen`, `chest`, `neck`, `head`, `thighs`, `lowerLegs`, and `feet` in a single physics step (`16ms`), causing instant `90°`/`180°` target jumps while planted idle feet fought `1.35` floor friction.

4. **Pointer Lock Transition Spikes (`InputManager.ts`)**:
   - Entering or exiting pointer lock had no spike guard, allowing browser cursor-warp deltas to jolt camera yaw/pitch.

---

## 2. Files Modified
- **`/src/controls/ControlTuning.ts`** *(Created)* — Centralized, documented configuration for locomotion acceleration/speeds, turning responsiveness/limits, 2-bone IK & wrist PD gains, velocity/angular limits, and desktop/mobile sensitivities.
- **`/src/physics/JointControllers.ts`** — Added `softClampBodyAngularVelocity` to cap excessive rotational energy injection on swinging limbs and weapons without snapping.
- **`/src/humanoid/ArmHandController.ts`** — Rebuilt with frame-rate-independent exponential filtering, speed-clamped hand target motion, 2-bone analytical arm IK (`solveTwoBoneArmIK`), direct `weaponDir + edgeRoll` wrist orientation (`buildHandTargetFromWeaponDir`), separate normal vs attack gain scaling, and automatic swing edge-lead.
- **`/src/humanoid/ActiveRagdoll.ts`** — Replaced step-function locomotion/turning with acceleration/deceleration velocity ramping (`currVelX`, `currVelZ`, `smoothedMoveMag`), rate-limited smooth yaw turning (`smoothedYaw`, `turnRate`), coordinated head lead, bounded spine twist (`maxSpineTwistRad`), upper-body weapon follow-through, and turn-pivot foot friction/stepping.
- **`/src/controls/InputManager.ts`** — Separated camera look from weapon control (`LMB` locks camera; `Alt` / `Middle Mouse` / `V` toggle enable free weapon positioning & wrist rotation; `Mouse Wheel` rotates blade edge roll; `RMB` angles guard with `0.22x` subtle camera follow), added pointer-lock spike filtering (`pointerLockSpikeThresholdPx = 110`), and added direct mobile strike/guard drag deltas.
- **`/src/core/GameEngine.ts`** — Passed full weapon orientation/manipulation state into `FighterControlIntent.arm`, and canceled `autoSwing` immediately whenever direct mouse/touch steering occurs.
- **`/src/ui/MobileControls.tsx`** — Added `touch-none select-none` isolation, drag-on-`STRIKE` weapon steering, drag-on-`GUARD` defense angling, and an `Aim` toggle for free weapon pad control.
- **`/src/ui/ControlsModal.tsx` & `/CONTROLS.md`** — Updated control instructions to reflect direct weapon manipulation and wrist rotation bindings.
- **`/src/tests/PhysicsVerification.ts`, `/PHYSICS_TEST_REPORT.md`, `/PROGRESS_REPORT.md`** — Added `TEST J` and `TEST K` covering smooth acceleration, strafing/backward walking, `90°/180°` turning, direct weapon 3D movement, wrist roll rotation, and 2-bone arm IK.

---

## 3. New Control Architecture

```
Desktop Mouse / Wheel / Keyboard  ─┐
                                   ├─▶ InputManager (pointer-lock spike guard, mode separation:
Mobile Touch Joystick / Drag Pads ─┘    Camera Look vs LMB Swing vs Alt/V Free Aim vs MMB/Wheel Wrist Roll)
                                           │
                                           ▼
                                   GameEngine (fixed-timestep latch + camera-relative XZ basis)
                                           │
              ┌────────────────────────────┴────────────────────────────┐
              ▼                                                         ▼
  ActiveRagdoll (Balance + Locomotion)                      ArmHandController (Weapon & Arms)
  • Rate-limited yaw (smoothedYaw, maxTurnSpeed)            • Exp-filtered target pos/rot (24Hz / 22Hz)
  • Head lead + bounded spine twist + weapon follow         • Speed-bounded target (4.8 / 9.8 m/s)
  • Accel/decel COM ramping (16.5 / 24.5 m/s²)              • Analytical 2-Bone Arm IK -> shoulder & elbow
  • Speed-matched stride + turn pivot foot friction         • handQuat = weaponWorldQuat * inv(localRot)
              │                                                         │
              └────────────────────────────┬────────────────────────────┘
                                           ▼
                       JointControllers + PhysicsWorld (Rapier3D fixed dt)
                       • Inertia-clamped dt-scaled PD torques
                       • Newton's 3rd Law chest-coupled hand position springs
                       • Soft angular velocity cap (21 rad/s)
```

---

## 4. Important Tuning Parameters (`CONTROL_TUNING` in `/src/controls/ControlTuning.ts`)

| Category | Parameter | Value | Purpose |
| :--- | :--- | :--- | :--- |
| **Locomotion** | `walkSpeed` / `runSpeed` | `2.65` / `3.75` m/s | Smooth analog walk-to-run range |
| | `acceleration` / `deceleration` / `directionChangeAccel` | `16.5` / `24.5` / `24.0` m/s² | Fluid starts, crisp stops, responsive WASD reversals |
| | `pelvisFollowRate` / `torsoFollowRate` / `legFollowRate` | `13.0` / `11.0` / `9.0` s⁻¹ | Coordinated whole-body velocity tracking |
| | `footFrictionIdle` / `Turn` / `Walk` / `Stagger` | `1.35` / `0.28` / `0.05` / `0.02` | Planted idle, natural pivot turn, low-drag walk, stagger slip |
| **Rotation** | `turnResponsiveness` / `maxTurnSpeed` | `12.5` s⁻¹ / `9.8` rad/s | Fluid turning without 180° instant snapping |
| | `maxSpineTwistRad` / `headLeadFactor` | `0.46` rad / `0.34` | Prevents over-twisting; head leads turns naturally |
| | `torsoWeaponFollowRad` | `0.16` rad | Upper-body follow-through on swings |
| **Weapon & IK** | `handPosFilterHz` / `handRotFilterHz` | `24.0` / `22.0` Hz | Frame-rate-independent target smoothing |
| | `handPosStiffnessIdle` / `DampingIdle` / `MaxForceIdle` | `210` N/m / `18` / `92` N | Smooth, lag-free normal weapon handling |
| | `handPosStiffnessAttack` / `DampingAttack` / `MaxForceAttack` | `460` N/m / `26` / `185` N | Decisive physical cut power during fast swings |
| | `handRotStiffness` / `wristAttackStiffness` | `34` / `48` N·m/rad | Responsive wrist orientation & edge alignment |
| | `shoulderIkKp` / `elbowIkKp` | `34` / `26` N·m/rad | Coherent 2-bone arm IK without fighting hand spring |
| | `maxHandSpeedNormal` / `Attack` / `maxWeaponAngVel` | `4.8` / `9.8` m/s / `21` rad/s | Prevents excessive physics energy injection |
| **Input** | `cameraMouseSensitivity` / `weaponMouseSensitivity` | `0.0022` / `0.0052` | Clean separation & precision |
| | `weaponRotMouseSensitivity` / `weaponRollWheelSensitivity` | `0.0046` / `0.2` rad | Direct wrist pitch & blade edge roll control |
| | `mobileCameraSensitivity` / `mobileWeaponSensitivity` | `0.0042` / `0.009` | Responsive touchscreen drag steering |

---

## 5. Tests Performed & Actual Results

### Physics & Control Verification (`npx tsx src/tests/runPhysicsTests.ts`) — **13 / 13 PASSED**
- **TEST A — Idle Stability (30s / 1800 steps, sword+shield)**: `maxDrift=0.0240m`, `maxYawErr=0.0083rad`, `finalPelvisY=0.913m`, `finalSpeed=0.0147m/s`, `knockedDown=false`
- **TEST B — Forward Movement (hold W for 3.0s)**: `forwardDist=9.938m`, `lateralErr=0.000m`, `pelvisY=0.897m`, `knockedDown=false`
- **TEST C — Stop & Deceleration**: `speed@1s=0.0761m/s`, `finalSpeed=0.0010m/s`, `lateDrift(1.5-2.5s)=0.0017m`
- **TEST D — Camera-Relative Direction Changes (W/S/A/D/Diag @ yaw=60°)**: `4.60–4.61m` distance, `0.0°–0.1°` angular error across all 5 cases
- **TEST E — External Impact & Stagger Recovery**: `peakDispX=0.196m`, `postPelvisY=0.896m`, `postSpeed=0.0059m/s`, `knockedDown=false`
- **TEST F — Physical Knockdown Recovery (no teleporting)**: `knockedOnImpact=true`, `postPelvisY=0.912m`, `isKnockedDown=false`, `maxStepDeltaY=0.0516m`
- **TEST G — Joint Anchor Stability (16 joints)**: `maxIdleSep=0.18cm`, `maxWalkSep=0.02cm`
- **TEST H — Frame Rate & Substep Independence (30/60/120fps + 90Hz/2sub)**: `6.36m / 6.36m / 6.36m / 6.28m` (`spread=0.083m`)
- **TEST I — Mobile Virtual Joystick & Release Zeroing**: `dead=(0,0)`, `diagMag=1.000`, `release=(0,0)`, `walkZ=-2.81m`, `stopSpeed=0.0056m/s`
- **TEST J — Smooth Acceleration, Strafe & 90°/180° Turning**: `earlySpeed=0.25m/s`, `maxStepYaw=0.229rad`, `yaw90Err=0.057rad`, `yaw180Err=0.138rad`, `jointErr=0.01cm`
- **TEST K — Direct Weapon Direction, Wrist Roll & 2-Bone Arm IK**: `horizSpan=2.16m`, `vertSpan=1.34m`, `edgeRot=2.69rad`, `jointErr=0.02cm`
- **Regression — Weapon Grip, Swing Velocity & Disarm**: `grabbed=true`, `peakBladeSpeed=5.68m/s`, `disarmed=true`
- **Regression — Weapon-vs-Body Collision Damage**: `hitsDetected=1`, `defenderDamage=6`, `defenderHealth=94`

### TypeScript & Production Build
- `npm run lint` (`tsc --noEmit`): **Passed** (0 errors)
- `npm run build` (`vite build`): **Passed**

---

## 6. Remaining Problems
- Weapon-to-hand fixed impulse joint (`grabWeapon`) remains stiffly coupled on impact as designed; extremely fast opposite-hand shield vs weapon self-intersection is prevented by collision bitmasks, though extreme wrist pitch extremes (`±0.85 rad`) combined with full reach can still slightly compress arm capsules near torso chest armor.

## 7. Tests That Could Not Be Performed
- Live interactive browser gameplay testing with physical mouse pointer-lock, scroll wheel, and physical touchscreen hardware could not be performed in this headless environment (no interactive browser/GPU input session attached). All headless simulation, input pipeline logic, TypeScript compilation, and production bundle checks were executed directly.
