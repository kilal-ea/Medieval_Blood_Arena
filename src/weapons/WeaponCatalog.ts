import type { WeaponType } from '../core/types';

export interface WeaponSpec {
  type: WeaponType;
  label: string;
  mass: number;
  length: number;
  baseDamage: number;
  cutRatio: number;
  bluntRatio: number;
  thrustRatio: number;
  staminaCost: number;
  gripBreakThreshold: number;
  isShield: boolean;
  /** Local offset from weapon origin (which is at the grip center) to blade/head center of mass */
  comLocalY: number;
  /** Local tip Y along weapon axis (+Y points from pommel through grip toward tip) */
  tipLocalY: number;
  /** Local sweet-spot Y for maximum cutting/impact leverage */
  sweetSpotY: number;
  /** Collision half-extents for the primary striking/blocking part */
  strikeHalfExtents: { x: number; y: number; z: number };
  strikeCenterY: number;
}

export const WEAPON_CATALOG: Record<WeaponType, WeaponSpec> = {
  longsword: {
    type: 'longsword',
    label: 'Longsword',
    mass: 1.65,
    length: 1.24,
    baseDamage: 28,
    cutRatio: 0.78,
    bluntRatio: 0.22,
    thrustRatio: 0.9,
    staminaCost: 11,
    gripBreakThreshold: 44,
    isShield: false,
    comLocalY: 0.24,
    tipLocalY: 0.96,
    sweetSpotY: 0.68,
    strikeHalfExtents: { x: 0.032, y: 0.45, z: 0.018 },
    strikeCenterY: 0.51,
  },
  arming_sword: {
    type: 'arming_sword',
    label: 'Arming Sword',
    mass: 1.15,
    length: 0.94,
    baseDamage: 22,
    cutRatio: 0.8,
    bluntRatio: 0.2,
    thrustRatio: 0.85,
    staminaCost: 8,
    gripBreakThreshold: 38,
    isShield: false,
    comLocalY: 0.18,
    tipLocalY: 0.76,
    sweetSpotY: 0.52,
    strikeHalfExtents: { x: 0.03, y: 0.35, z: 0.016 },
    strikeCenterY: 0.41,
  },
  battle_axe: {
    type: 'battle_axe',
    label: 'Battle Axe',
    mass: 2.35,
    length: 1.05,
    baseDamage: 36,
    cutRatio: 0.68,
    bluntRatio: 0.5,
    thrustRatio: 0.25,
    staminaCost: 16,
    gripBreakThreshold: 48,
    isShield: false,
    comLocalY: 0.42,
    tipLocalY: 0.84,
    sweetSpotY: 0.68,
    strikeHalfExtents: { x: 0.11, y: 0.16, z: 0.025 },
    strikeCenterY: 0.68,
  },
  mace: {
    type: 'mace',
    label: 'War Mace',
    mass: 2.15,
    length: 0.78,
    baseDamage: 32,
    cutRatio: 0.05,
    bluntRatio: 1.1,
    thrustRatio: 0.2,
    staminaCost: 13,
    gripBreakThreshold: 46,
    isShield: false,
    comLocalY: 0.34,
    tipLocalY: 0.66,
    sweetSpotY: 0.54,
    strikeHalfExtents: { x: 0.065, y: 0.11, z: 0.065 },
    strikeCenterY: 0.54,
  },
  shield: {
    type: 'shield',
    label: 'Heater Shield',
    mass: 3.1,
    length: 0.68,
    baseDamage: 12,
    cutRatio: 0.0,
    bluntRatio: 0.85,
    thrustRatio: 0.1,
    staminaCost: 9,
    gripBreakThreshold: 62,
    isShield: true,
    comLocalY: 0.0,
    tipLocalY: 0.34,
    sweetSpotY: 0.0,
    strikeHalfExtents: { x: 0.24, y: 0.32, z: 0.032 },
    strikeCenterY: 0.0,
  },
};
