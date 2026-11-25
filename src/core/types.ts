export type QualityPreset = 'low' | 'medium' | 'high';

export type GameModeId = 'training' | 'duel' | 'survival' | 'arena';

export type ScreenState = 'title' | 'playing' | 'paused' | 'result';

export type WeaponType = 'longsword' | 'arming_sword' | 'battle_axe' | 'mace' | 'shield';

export type HandSide = 'left' | 'right';

export type BodyPartId =
  | 'pelvis'
  | 'abdomen'
  | 'chest'
  | 'neck'
  | 'head'
  | 'upperArmL'
  | 'forearmL'
  | 'handL'
  | 'upperArmR'
  | 'forearmR'
  | 'handR'
  | 'thighL'
  | 'lowerLegL'
  | 'footL'
  | 'thighR'
  | 'lowerLegR'
  | 'footR';

export interface KeyBindings {
  moveForward: string;
  moveBackward: string;
  moveLeft: string;
  moveRight: string;
  leftHand: string;
  rightHand: string;
  jump: string;
  recover: string;
  pause: string;
}

export interface GameSettings {
  quality: QualityPreset;
  shadows: boolean;
  physicsSubsteps: 1 | 2;
  physicsHz: 60 | 90;
  reducedParticles: boolean;
  mouseSensitivity: number;
  masterVolume: number;
  muted: boolean;
  showTelemetry: boolean;
  keyBindings: KeyBindings;
}

export interface FighterHudState {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  balance: number;
  isKnockedDown: boolean;
  isDead: boolean;
  rightWeapon: WeaponType | null;
  leftWeapon: WeaponType | null;
  rightGripStrength: number;
  leftGripStrength: number;
}

export interface MatchHudSnapshot {
  mode: GameModeId;
  wave: number;
  score: number;
  kills: number;
  elapsedTime: number;
  statusText: string;
  player: FighterHudState;
  opponents: FighterHudState[];
  nearbyWeapon: WeaponType | null;
  fps: number;
  physicsMs: number;
  bodyCount: number;
}

export interface MatchResult {
  victory: boolean;
  mode: GameModeId;
  score: number;
  kills: number;
  wave: number;
  durationSec: number;
  damageDealt: number;
  parries: number;
  disarms: number;
  reason: string;
}

export interface CombatEvent {
  type: 'hit' | 'parry' | 'shield_block' | 'disarm' | 'knockdown' | 'death';
  damage: number;
  impactSpeed: number;
  bodyPart?: BodyPartId;
  attackerId: string;
  defenderId: string;
  weaponType: WeaponType;
  position: { x: number; y: number; z: number };
}

export interface ColliderMetadata {
  kind: 'body' | 'weapon' | 'shield' | 'environment' | 'dummy';
  fighterId?: string;
  bodyPart?: BodyPartId;
  weaponId?: string;
  weaponType?: WeaponType;
  isBladeEdge?: boolean;
  isBladeTip?: boolean;
  armorRating?: number;
  damageMultiplier?: number;
}
