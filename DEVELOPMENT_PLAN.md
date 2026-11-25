# Medieval Blood Arena — Development Plan

## 1. Architecture Overview
Medieval Blood Arena separates simulation, rendering, audio, input, and UI into independent modules under `src/`:
- `src/core/`: Engine lifecycle, fixed-timestep simulation loop, typed event bus, and shared domain types.
- `src/physics/`: Rapier3D WASM initialization, collision bitmask filtering, interpolation state buffers, and PD torque/spring joint controllers.
- `src/humanoid/`: 17-segment anatomical humanoid specification, composite procedural armor/body meshes, active ragdoll balance & recovery controller, and independent physical arm/hand/grip controller.
- `src/weapons/`: Physical medieval weapon catalog (Longsword, Arming Sword, Battle Axe, Mace, Shield), composite procedural meshes, inertial colliders, and blade/edge velocity tracking.
- `src/combat/`: Physical impact evaluation (velocity, mass, edge alignment, armor, body zone), parry deflection, disarming, stagger/knockdown, bleeding droplets, and hitstop.
- `src/ai/`: Combat state machine using the exact same active ragdoll & arm physics controllers as the player.
- `src/environments/`: Procedural PBR canvas textures, Training Yard (with weapon racks and training dummies), and Stone Arena (with tiered stands, braziers, and natural horizon).
- `src/controls/` & `src/camera/`: Unified desktop keyboard/mouse + mobile virtual joystick & touch camera + configurable keybinds, paired with damped third-person combat camera.
- `src/audio/`: 100% procedural Web Audio API sound effects (blade clangs, shield blocks, impacts, swings, footsteps, arena horn).
- `src/gameModes/`: Training, Duel, Survival, and Arena (multi-opponent) rule controllers.
- `src/ui/`: React medieval HUD, menus, settings, controls guide, and responsive mobile controls.
- `src/debug/` & `src/tests/`: Performance monitor and automated physics verification suite.

## 2. Performance Risks & Mitigations
1. **Multi-body Ragdoll Solver Cost**: Each fighter has 17 rigid bodies and 16 impulse joints. Mitigation: strict collision bitmask filtering so adjacent bones in the same skeleton do not self-collide, capped `maxVelocityIterations`/`maxPositionIterations` configurable by quality preset, and capped simultaneous fighters in Arena mode based on quality setting.
2. **Tunneling on Fast Weapon Swings**: Thin sword blades moving rapidly can tunnel through limbs. Mitigation: fixed `1/60s` (or `1/90s` high quality) physics substep, generous capsule/cuboid blade collider thickness, and `Ccd` enabled on weapon rigid bodies.
3. **React Re-render Overhead**: Driving HUD state at 60Hz through React slows down the simulation. Mitigation: isolated `<div ref>` WebGL mount, mutable engine state outside React, and throttled (~15Hz) HUD snapshot emissions.
4. **Software WebGL / Low-End Hardware**: Mitigation: `isSoftwareGl` detection with `afterDraw` pacing, `RoomEnvironment` reflections, object pooling for spark/blood particles, and Low/Medium/High quality presets (shadows, pixel ratio, particle count, physics substeps).

## 3. Incremental Implementation Sequence
1. Core types, EventBus, Rapier3D loader, and PhysicsWorld with collision groups and interpolation.
2. 17-segment Anatomical Humanoid, ActiveRagdoll balance/stepping/recovery, and ArmHandController.
3. Physical Weapon Catalog, composite weapon geometry/colliders, and grip/disarm mechanics.
4. CombatSystem (impact damage, parrying, stagger, knockdown, pooled particles).
5. Procedural Textures, Training Yard & Stone Arena environments, ThirdPersonCamera, AudioEngine.
6. Opponent AI state machine and all 4 Game Modes (Training, Duel, Survival, Arena).
7. InputManager (Desktop + Mobile) and complete Medieval React UI.
8. TypeScript checks, production build, automated physics verification suite, and live browser verification.
