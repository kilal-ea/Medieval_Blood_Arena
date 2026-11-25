# Medieval Blood Arena

A physics-driven 3D medieval melee combat game inspired by Half Sword, built from scratch with **Three.js**, **Rapier3D**, **TypeScript**, **React**, and the **Web Audio API**.

## Key Features
- **17-Segment Active Ragdoll Humanoids**: Pelvis, abdomen, chest, neck, head, upper/lower arms, hands, thighs, lower legs, and feet connected with anatomically constrained Rapier3D impulse joints and torque-driven PD balance & recovery.
- **Articulated Physical Arm & Grip Control**: Independent left/right arm torque targeting, wrist rotation, finger curl visual representation, grip strength, weapon release, grabbing, and impact-based disarming.
- **Physical Medieval Weapons**: Longsword, Arming Sword, Battle Axe, War Mace, and Heater Shield with realistic mass, center of mass, inertia, cutting-edge direction alignment, thrusting, parrying, and shield blocking.
- **Physics-Driven Damage Model**: Hit detection derived from Rapier contact manifolds, relative impact velocity, weapon mass, edge alignment, armor mitigation, and anatomical hit zones.
- **Modular Combat AI**: Opponents use the exact same active ragdoll and physical arm systems to approach, circle, wind up strikes, parry, dodge, recover from knockdowns, and pick up dropped weapons.
- **Four Complete Game Modes**: Training Yard, 1v1 Duel, Endless Survival, and Stone Arena Multi-Opponent Melee.
- **Cross-Platform & Configurable**: Desktop keyboard/mouse + mobile virtual joystick/touch controls, Low/Medium/High quality presets, configurable keybinds, and procedural Web Audio SFX.

## Development Commands
- `npm run dev` — Start Vite development server on port 3000
- `npm run lint` — Run TypeScript type check (`tsc --noEmit`)
- `npm run build` — Build production bundle
