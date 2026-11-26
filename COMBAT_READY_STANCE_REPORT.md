# COMBAT READY STANCE REPORT

## 1. Files Modified

- `/src/controls/ControlTuning.ts`
- `/src/humanoid/ActiveRagdoll.ts`
- `/src/humanoid/ArmHandController.ts`
- `/src/physics/PhysicsWorld.ts`
- `/src/weapons/WeaponInstance.ts`
- `/src/core/GameEngine.ts`
- `/src/tests/PhysicsVerification.ts`

---

## 2. Previous Stance Problems

1. **Weapon Droop Under Fixed-Joint Mass/Inertia Mismatch**:
   - `ArmHandController.updateRightArm()` and `updateLeftArm()` previously applied wrist orientation PD torque exclusively to the lightweight hand body (`handR`/`handL`, mass `0.7 kg`, principal inertia `~0.0009 kg·m²`), which was welded to a heavy weapon body (`1.65–3.1 kg`, principal inertia `~0.32–0.55 kg·m²`) via a Rapier `fixed` joint. Because of the ~350:1 inertia ratio across Rapier's iterative joint solver, gravity acting on the weapon's forward center-of-mass (`comLocalY = 0.25–0.42 m`) pulled the blade/axe/mace downward (`thrustAxisWorld.y = -0.73` to `-0.95`) even when targeting an upward pose.
2. **Low Passive Right-Hand Target**:
   - All melee weapons previously shared one low chest-local idle target (`pos: [0.22, -0.02, 0.33]`, `dir: [-0.06, 0.48, 1]`), leaving the weapon arm low and visually indistinguishable across weapon types.
3. **Shield Tilted Face-Down Beside the Hip/Leg**:
   - `WeaponFactory` builds the heater shield with top edge `+Y`, bottom point `-Y`, and front heraldic boss face `+Z`. `updateLeftArm()` previously passed `dir = [0.22, 0.06, 1]` (`idle`) and `[-gx * 0.3, 0.12 + gy * 0.25, 1]` (`defendHeld`) with `edgeRoll = 0`, aligning `+Y` forward instead of upward and rotating the shield's front face (`+Z`) downward toward the ground at hip height (`y = -0.03`).
4. **Vertical Symmetric Legs & Square Torso**:
   - Fighters spawned vertically with side-by-side feet (`z = -0.035 m`), minimal symmetric knee flex, high pelvis height (`0.905 m`), zero idle forward lean, and zero shoulder obliquity.
5. **Same-Wielder Weapon/Shield Self-Snagging**:
   - All weapons shared `CollisionBit.WEAPON`, causing a fighter's own right-hand sword to collide physically with their raised left-hand shield during wide cross-body swings even though `CombatSystem` ignored self-clashes.

---

## 3. New Default Combat-Ready Stance

- Applied via existing PD orientation torques, Newton's-3rd-law internal hand-to-chest springs, 2-bone analytical arm IK, and ground-coupled leg controllers (no limb teleporting, no animated mesh overrides, no disabled opponent/environment collisions).
- Both player fighters, AI opponents (whose neutral `APPROACH`/`CIRCLE` intents feed into `ArmHandController` and `ActiveRagdoll`), and title-screen showcase duelists (`GameEngine.setupTitleShowcase`) adopt their weapon-appropriate combat-ready guard from frame 0.
- Transitions cleanly into walking, strafing, turning, free weapon aiming/manipulation (`weaponManipActive`), attacking (`attackHeld`/`thrustActive`), blocking (`defendHeld`), disarming, and knockdown recovery, and returns smoothly to combat guard upon input release.

---

## 4. Sword / Primary Weapon Positioning

- **Chest-Local Target & Raised Blade**: Primary weapons are held forward at chest/upper-torso level with elbows naturally bent (`poleVec` raised to `(0.76, -0.48, -0.46)` for relaxed shoulders and natural elbow bend) and blade/striking head angled upward and forward toward the opponent (`arming_sword`: tip `+0.57 m` above right hand, `thrustAxisWorld.y = +0.77`, forward dot `+0.62`; `longsword`: `thrustAxisWorld.y = +0.60`).
- **Direct Held-Weapon Orientation PD**: `buildHandTargetFromWeaponDir()` outputs `_weaponWorldQuat` alongside `_handTargetQuat`. While a weapon is gripped, wrist orientation PD is distributed cleanly across `handR` (`0.42` share) and `rightWeapon.body` (`0.85` share scaled by `rightGripStrength / 100` and mass/COM compensation), eliminating fixed-joint droop while preserving full physical collisions and disarms.
- **Unarmed Right Ready Guard**: Raised athletic parry/fist guard (`pos: [0.19, 0.09, 0.35]`, `dir: [-0.12, 0.9, 0.55]`) instead of hanging beside the thigh.

---

## 5. Shield Positioning

- **Upright Front-Facing Alignment**: `shieldReady` (`pos: [-0.20, 0.055, 0.34]`, `dir: [0.08, 1.0, 0.18]`, `edgeRoll: Math.PI - 0.42`) aligns the heater shield's top edge `+Y` upright (`thrustAxisWorld.y = 0.98`) and rotates its front heraldic face `+Z` forward toward incoming strikes (`faceFwd = 0.98`), positioned `0.38 m` above the pelvis over the left/center upper torso without blocking the right-shoulder camera sightline.
- **Active Defend Guard (`shieldDefend`)**: Raises and centers the shield across the upper chest/shoulder line (`pos: [-0.04, 0.11, 0.42]`, `dir: [0.02, 1.0, 0.20]`, `edgeRoll: Math.PI + 0.14`) with steer offsets `guardX`/`guardY` and reinforced PD stiffness (`310 N/m`, `42 N·m/rad` wrist torque).
- **Per-Wielder Collision Bits**: Added `HELD_WEAPON_0..5` bits in `PhysicsWorld` and `WeaponInstance` so a fighter's own right-hand weapon clears their raised left-hand shield smoothly during cross-body cuts while still colliding with all opponent weapons/shields/bodies and loose weapons.
- **Unarmed / Offhand Left Guard**: Uses `offhandReady` (`pos: [-0.18, 0.075, 0.34]`, `dir: [0.16, 0.92, 0.65]`) so an empty left hand stays raised in an athletic ready guard.

---

## 6. Body Positioning

- **Bent-Knee Staggered Stance**: Lowered standing pelvis target (`idlePelvisHeight = 0.882 m`, `walkPelvisHeight = 0.892 m`) and initialized exact forward-kinematic leg spawn angles in `ActiveRagdoll` (`thighL` forward pitch `+0.23 rad`, `lowerLegL` `-0.11 rad`; `thighR` `-0.04 rad`, `lowerLegR` `-0.33 rad`) matched by `updateLocomotionController()` idle targets (`footStagger = 0.191 m`, `pelvisY = 0.888 m`, `0.00 cm` spawn joint separation).
- **Athletic Torso & Head Alignment**: Added subtle combat-ready forward torso lean (`combatPitch = -0.075 * idleWeight`) and slight oblique shoulder blade turn (`idleChestTurn = -0.09 * idleWeight` on `chest`, `0.5x` on `abdomen`) while keeping `pelvisYaw` centered (`maxYawErr = 0.018 rad`) and `headYaw` aimed directly forward at the opponent.

---

## 7. Weapon-Specific Differences

Configured in `CONTROL_TUNING.weapon.combatStances` and selected dynamically in `ArmHandController.updateRightArm()`:
- **Longsword (`longsword`)**: Centered forward two-handed-style Vom Tag / mid-guard (`pos: [0.15, 0.065, 0.40]`, `dir: [-0.26, 0.88, 0.94]`, `roll: -0.28`), long blade angled forward across the centerline.
- **Arming Sword + Shield (`armingSwordWithShield`)**: Higher retracted right-shoulder guard (`pos: [0.24, 0.115, 0.35]`, `dir: [-0.18, 1.02, 0.72]`, `roll: -0.24`), clearing the left-side shield cleanly.
- **Arming Sword Solo (`armingSwordSolo`)**: Balanced forward center-right guard (`pos: [0.19, 0.075, 0.38]`, `dir: [-0.20, 0.90, 0.90]`, `roll: -0.26`).
- **Battle Axe (`battleAxe`)**: Elevated high-poise heavy axe stance (`pos: [0.22, 0.105, 0.36]`, `dir: [-0.24, 1.08, 0.64]`, `roll: -0.22`) with mass/COM torque scaling holding the `2.35 kg` axe head upright (`thrustAxisWorld.y = +0.69`).
- **Flanged Mace (`mace`)**: High compact crushing guard (`pos: [0.21, 0.095, 0.37]`, `dir: [-0.18, 1.02, 0.76]`, `roll: -0.18`, `thrustAxisWorld.y = +0.80`).

---

## 8. Tests Performed

1. **Automated Physics Verification Suite (`npx tsx src/tests/runPhysicsTests.ts`)**: **15 / 15 PASS**
   - `TEST A` (30s idle stability, sword+shield): `maxDrift=0.0288m`, `maxYawErr=0.0180rad`, `finalPelvisY=0.882m`, `finalSpeed=0.0161m/s`, `knockedDown=false`
   - `TEST B` (Forward movement, 3s): `forwardDist=10.008m`, `lateralErr=0.001m`, `pelvisY=0.878m`
   - `TEST C` (Stop & deceleration): `speed@1s=0.0380m/s`, `finalSpeed=0.0200m/s`, `lateDrift=0.0010m`
   - `TEST D` (Camera-relative W/S/A/D/Diag @ 60°): `4.61–4.62m`, `0.0°–0.1°` error
   - `TEST E` (External impact & stagger recovery): `peakDispX=0.223m`, `postPelvisY=0.887m`
   - `TEST F` (Physical knockdown recovery): `knockedOnImpact=true`, `postPelvisY=0.893m`, `isKnockedDown=false`
   - `TEST G` (16-joint anchor stability): `maxIdleSep=0.19cm`, `maxWalkSep=4.43cm`
   - `TEST H` (Frame-rate/substep independence): `spread=0.081m`
   - `TEST I` (Mobile joystick & release zeroing): `walkZ=-2.82m`, `stopSpeed=0.0027m/s`
   - `Regression — Weapon Grip & Disarm`: `peakBladeSpeed=5.77m/s`, `disarmed=true`
   - `Regression — Weapon-vs-Body Collision`: `hitsDetected=3`, `defenderDamage=16`
   - `TEST J` (Smooth acceleration, strafe & 90°/180° turning): `yaw90Err=0.084rad`, `yaw180Err=0.146rad`, `jointErr=0.01cm`
   - `TEST K` (Direct weapon direction, wrist roll & 2-bone IK): `horizSpan=1.10m`, `vertSpan=0.66m`, `edgeRot=1.59rad`, `jointErr=0.01cm`
   - `TEST L` (Gait transitions, chest-local arm tracking & visual variants): `minHandAhead=0.40m`, `minHeadParts=25`
   - `TEST M` (Aggressive combat-ready stance, weapon guards & upright shield): `pelvisY=0.888m`, `footStagger=0.191m`, `sword(dY=0.57, up=0.77, fwd=0.62)`, `shield(abovePelvis=0.38, up=0.98, faceFwd=0.98)`, `longUp=0.60`, `axeUp=0.69`, `maceUp=0.80`, `poseDiff=0.11m`
2. **Type Check & Production Build (`lint_applet` / `tsc --noEmit` & `compile_applet` / `npm run build`)**: Both succeeded with zero errors.
3. **Browser Preview Limitation**: No headless Chromium/Playwright binary is installed in the container environment, so live WebGL browser preview screenshots could not be captured or visually inspected here; all spatial posture, blade orientation, shield facing normal, knee bend, and transition checks were verified quantitatively via the Rapier physics suite above.

---

## 9. Remaining Problems / Limitations

- Because no Chromium binary is available in this headless container, final visual aesthetics (silhouette overlap against armor plates, camera framing across resolutions, and interactive mouse/touch feel) should be verified once in a live WebGL browser session.
- Collision bit assignment allocates 6 dedicated held-weapon bits (`HELD_WEAPON_0..5` via `slotIndex`); any future mode exceeding 6 simultaneous armed fighters would reuse bits across higher slot indices unless extended.
