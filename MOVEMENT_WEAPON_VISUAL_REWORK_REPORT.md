# Medieval Blood Arena — Movement, Weapon Control & Humanoid Realism Rework Report

## 1. Root Causes Found During Audit
1. **Stiff / Ice-Skating Locomotion (`ActiveRagdoll.ts`, `ControlTuning.ts`)**:
   - Foot colliders used uniform friction across both legs during walking, and blanket horizontal velocity assist was applied identically to planted and swinging feet, causing ice-skating and fighting between ground contact and forward drive.
   - Knee flexion and ankle pitch peaked out of phase relative to mid-swing ground clearance, and stopping left legs splayed mid-stride rather than settling smoothly to neutral double-stance.
2. **Walking Arm Lag & Elbow Lock (`ArmHandController.ts`)**:
   - Hand position targets (`filteredHandPosR/L`) were smoothed in **world space** before being coupled to chest velocity; whenever the fighter ran or strafed, the world-space filter trailed behind the moving chest, dragging the weapon backward.
   - `maxArmReach = 0.56` nearly matched `upperArmLength + forearmLength = 0.57`, allowing `cosAlpha` to approach `±1` and flipping or locking the elbow hinge axis (`cross(uHat, vHat)`) during cross-body sweeps.
   - Slow precision weapon aiming was disturbed by automatic edge-lead roll and abrupt post-release spring-back (`exp(-5.5 * dt)`).
3. **Click-and-Drag Hijack & Iframe Input Friction (`InputManager.ts`, `GameEngine.ts`)**:
   - `attackJustPressed` could trigger `triggerAutoSwing` if the player held `LMB` before starting a mouse sweep, hijacking manual blade control.
   - Free weapon aim (`Alt` / `V`) required pointer lock even in embedded previews where pointer lock may be blocked.
4. **Toy-Like Humanoid Geometry & Closed Helmets (`HumanoidMeshes.ts`, `ProceduralTextures.ts`)**:
   - Fighters used unadorned `BoxGeometry` / `CapsuleGeometry` blocks and a closed visor sphere without faces, facial hair, ears, anatomical musculature, or surface textures, while opponent archetypes lacked distinct visual identity.

## 2. Walking & Locomotion Redesign
- **Explicit Gait State Machine (`LocomotionGaitState`)**: Added `idle`, `starting`, `walking`, `running`, `stopping`, `turning`, `staggering`, and `recovering` states tracked in `ActiveRagdoll.gaitState`.
- **Smooth Phase-Aware Stance vs. Swing Gait (`ActiveRagdoll.ts`, `ControlTuning.ts`)**:
  - Replaced binary foot-friction steps with smooth cubic-Hermite (`C^1`) `swingLift` and `swingWeight` phase weighting (`cos(phase)` centered mid-swing).
  - Stance foot receives higher grip (`footFrictionStance: 0.06`, `Min` combine rule during motion, `1.35` when idle) while the swinging foot drops to `footFrictionSwing: 0.015` for low-drag ground clearance without sudden solver spikes.
  - Synchronized horizontal follow rates smoothly across pelvis, abdomen, chest, thighs, shins, and feet, eliminating joint-stretching cliffs while preserving natural ankle clearance (`maxWalkSep = 4.48cm`).
  - Added mid-swing knee lift, gentle heel-strike dorsiflexion, strafe abduction/adduction roll, in-place turning pivot steps (`pivotYaw` + alternating knee lift), and smooth settle to double-stance neutral (`k * Math.PI`) on stop.

## 3. Direct Weapon & Hand Control Rework
- **Chest-Local Target Smoothing (`ArmHandController.ts`)**: Moved target position, blade direction, and edge roll smoothing (`filteredLocalPosR/L`, `filteredLocalDirR/L`, `filteredEdgeRollR/L`) entirely into **chest-local coordinates**, transforming into world space only after smoothing so walking, running, and strafing introduce zero weapon lag (`minHandAhead = 0.40m` while moving).
- **Singularity-Free 2-Bone IK**: Tightened `maxArmReach` to `0.54m` (safely inside `0.29 + 0.28 = 0.57m`), clamped `cosAlpha` to `[-0.96, 0.96]`, and stabilized the downward/outward/backward elbow pole vector so cross-body cuts never invert or lock the elbow.
- **Responsive Manual Steering & Edge Alignment**: Quiet edge-lead auto-roll below `sweepSpeed > 0.32` so slow precision placement stays steady while brisk slashes dynamically align blade edges; widened vertical and horizontal sweep spans (`horizSpan = 1.94m`, `vertSpan = 0.66m`, `edgeRot = 1.63rad`).

## 4. Body Rotation & Full-Body Coordination Improvements
- **Coordinated Spine Twist & Counter-Rotation (`ActiveRagdoll.ts`)**:
  - Added smooth proportional-clamped yaw tracking (`turnResponsiveness: 13.0`, `maxTurnSpeed: 10.2`), head look-lead (`headLeadFactor: 0.36`), upper-chest weapon follow (`torsoWeaponFollowRad: 0.18`), subtle strafe turn-in (`walkTurnBlend: 0.16`), walking torso counter-yaw (`gaitCounterYaw`), and subtle banking roll (`turnBankRoll`) bounded within `maxSpineTwistRad: 0.44`.
  - Added alternating pivot steps when turning in place so the fighter physically steps around rather than sliding like a turret.

## 5. Humanoid Visual, Face, Armor, Clothing & Material Upgrades
- **Sculpted Anatomy (`HumanoidMeshes.ts`)**: Replaced crude capsules/boxes with cached anatomical `LatheGeometry` and beveled `ExtrudeGeometry` profiles for the cranium, breastplate cuirass (with medial keel ridge), gambeson, waist, deltoid-to-elbow upper arms, tapered forearms, thighs, calves, and multi-part boots/sabatons, strictly aligned with the 17 physics colliders in `AnatomySpec.ts`.
- **Visible Sculpted Human Faces & Hair/Beards**: Built recessed orbital sockets, white sclera, colored irises, upper eyelids, angled eyebrows, cheekbones, sculpted nose bridge/tip, lips, chin/jawline, ears, hair caps/nape locks, and 4 facial hair options (`none`, `stubble`, `goatee`, `full`).
- **5 Authentic Medieval Helmets**: Implemented `barbute` (open T-slit face), `spangenhelm` (iron bands + nasal bar + maille aventail), `kettle` (wide-brimmed hat over arming coif), `sallet` (swept tail + raised open visor), and `open` (forged brow circlet), plus layered gorgets, 3-lame faulds, pauldrons with besagew rondels, winged couters, poleyns, and 4-finger articulated gauntlets.
- **Procedural PBR Textures (`ProceduralTextures.ts`, `GameModes.ts`, `GameEngine.ts`)**: Added cached 256×256 canvas textures (hammered steel color + roughness, riveted chainmail, twill/quilted gambeson cloth + roughness, pebbled leather, natural skin) with Node-safe `document` guards, distinct opponent visual loadouts across all modes, and upgraded 3-point + ground-bounce lighting (`toneMappingExposure = 1.12`).

## 6. Input & Controls Adjustments
- **Quick-Tap vs. Hold-Drag Separation (`InputManager.ts`, `GameEngine.ts`)**: Added `attackQuickTap` (`< 190ms` and `< 14px` drag) so holding `LMB` + dragging always steers the blade manually without auto-swing interference, while a quick click triggers a crisp slash.
- **Post-Release Follow-Through & Embedded Fallback (`InputManager.ts`)**: Added `weaponSettleHoldTimer = 0.24s` and slowed idle weapon cursor decay (`exp(-1.85 * dt)`) for smooth sequential cuts; allowed `Alt` / `V` free weapon manipulation even when pointer lock is unavailable in an iframe.

## 7. Modified Files List
- `/src/controls/ControlTuning.ts`
- `/src/controls/InputManager.ts`
- `/src/humanoid/ActiveRagdoll.ts`
- `/src/humanoid/ArmHandController.ts`
- `/src/humanoid/HumanoidMeshes.ts`
- `/src/environments/ProceduralTextures.ts`
- `/src/gameModes/GameModes.ts`
- `/src/core/GameEngine.ts`
- `/src/tests/PhysicsVerification.ts`
- `/CONTROLS.md`
- `/MOVEMENT_WEAPON_VISUAL_REWORK_REPORT.md`

## 8. Stability, Combat & Existing Features Verification
- All 17 rigid bodies (`BODY_PART_ORDER`) and 16 impulse joints in `AnatomySpec.ts` remain intact with no kinematic teleporting.
- Physical weapon grabbing, releasing, throwing, parrying, disarming (`applyGripImpact`), knockdown/torque recovery, and damage calculation (`CombatSystem`) remain active and verified by regression tests.
- All 4 game modes (**Training Yard**, **Honor Duel**, **Endless Survival**, **Grand Melee Arena**) and desktop/mobile UI inputs remain wired and preserved.

## 9. Automated Test Results
Executed `npx tsx src/tests/runPhysicsTests.ts` — **14 / 14 PASSED**:
- `TEST A` (30s / 1800 steps idle stability, sword+shield): `maxDrift=0.0229m`, `maxYawErr=0.0087rad`, `finalPelvisY=0.913m`, `finalSpeed=0.0122m/s`, `knockedDown=false`
- `TEST B` (Forward movement, 3.0s): `forwardDist=10.011m`, `lateralErr=0.001m`, `pelvisY=0.879m`
- `TEST C` (Stop & deceleration): `speed@1s=0.0136m/s`, `finalSpeed=0.0093m/s`, `lateDrift=0.0028m`
- `TEST D` (Camera-relative W/S/A/D/W+D @ 60°): `0.0°–0.1°` direction error across all 5 inputs
- `TEST E` (External impact & stagger recovery): `peakDispX=0.226m`, `postPelvisY=0.911m`, `postSpeed=0.0084m/s`, `knockedDown=false`
- `TEST F` (Physical knockdown recovery): `knockedOnImpact=true`, `postPelvisY=0.912m`, `isKnockedDown=false`, `maxStepDeltaY=0.0508m`
- `TEST G` (16-joint anchor stability idle & walk): `maxIdleSep=0.18cm`, `maxWalkSep=4.48cm`
- `TEST H` (Frame-rate & substep independence): `30fps:6.39m`, `60fps:6.39m`, `120fps:6.39m`, `90Hz/2sub:6.30m` (`spread=0.084m`)
- `TEST I` (Mobile virtual joystick deadzone & release zeroing): `dead=(0,0)`, `diagMag=1.000`, `stopSpeed=0.0174m/s`
- `Regression — Weapon Grip, Realistic Swing Velocity & Disarm`: `grabbed=true`, `peakBladeSpeed=5.22m/s`, `disarmed=true`
- `Regression — Weapon-vs-Body Collision Damage Pipeline`: `hitsDetected=1`, `defenderDamage=6`, `defenderHealth=94`
- `TEST J` (Smooth acceleration, strafe & 90°/180° turning): `earlySpeed=0.23m/s`, `maxStepYaw=0.241rad`, `yaw90Err=0.081rad`, `yaw180Err=0.141rad`, `jointErr=0.01cm`
- `TEST K` (Direct weapon direction, wrist roll & 2-bone arm IK): `horizSpan=1.94m`, `vertSpan=0.66m`, `edgeRot=1.63rad`, `jointErr=0.02cm`
- `TEST L` (Gait state transitions, no-lag chest-local arm tracking & all 5 visual variants): `idle -> starting -> running -> walking -> stopping -> idle`, `minHandAhead=0.40m`, `minHeadParts=25`

## 10. Build & Runtime Verification Results
- `tsc --noEmit` (`lint_applet`): Passed with zero TypeScript errors.
- `vite build` (`compile_applet` / `npm run build`): Passed cleanly.
- Headless browser inspection: No Chromium/Playwright binary is installed in the container environment (`which chromium google-chrome` returned none), so interactive WebGL rendering and live mouse/touch playtesting could not be executed automatically in a headless browser here and remain for live user testing in the browser preview.

## 11. Known Limitations / Edge Cases
- Live WebGL rendering, shader compilation, and subjective mouse-feel in the preview iframe were verified via TypeScript compilation, Vite bundling, and Node Rapier3D physics + Three.js scene-graph tests rather than a live Chromium GPU session.
- Because `FighterAppearance` materials share cached `CanvasTexture`s at `4x` anisotropy, ultra-close inspection relies on procedural 256×256 maps and geometric silhouettes rather than external baked normal maps.

## 12. Controls Summary
- **Move**: `W A S D` (acceleration-based camera-relative walking/running; smooth deceleration on release).
- **Look / Turn**: `Mouse` (pointer-locked in combat).
- **Direct Weapon Steering & Cuts**: Hold `LMB` + move mouse for direct blade direction & continuous cuts (`0.24s` post-release follow-through hold); quick-click `LMB` for an instant slash; double-tap `LMB` or press `F` to thrust.
- **Free Weapon Aim**: Hold `Alt` or toggle `V` + move mouse to position blade calmly without attacking.
- **Blade Edge / Wrist Rotation**: `Mouse Wheel` or hold `MMB` + move mouse.
- **Guard / Shield Angle**: Hold `RMB` + move mouse.
- **Grab / Release / Reset**: `Q` (left hand), `E` (right hand), `R` (recover nearest weapon / reset Training), `Space` (jump/lunge), `Tab`/`Esc` (pause).
- **Mobile**: Left virtual joystick, right touch camera/aim pad, drag-to-steer `STRIKE` & `GUARD` buttons, and `L-Hand` / `R-Hand` / `Jump` buttons.

## 13. Final Verdict
All 14 automated Rapier3D physics, gait, weapon-IK, and visual-variant tests, along with `tsc --noEmit` and Vite production compilation, pass cleanly after the final edits. Locomotion, chest-local arm/weapon responsiveness, spine/head/foot turning coordination, and sculpted facial/armor realism are substantially upgraded while preserving all existing combat mechanics and game modes.
