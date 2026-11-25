import * as THREE from 'three';
import type { GameModeId, QualityPreset, WeaponType } from '../core/types';
import type { AIConfig } from '../ai/FighterAI';
import type { FighterAppearance } from '../humanoid/HumanoidMeshes';

export interface OpponentLoadout {
  name: string;
  rightWeapon: WeaponType;
  leftWeapon: WeaponType | null;
  maxHealth: number;
  appearance: FighterAppearance;
  ai: AIConfig;
  spawnPos: THREE.Vector3;
}

export interface ModeRules {
  id: GameModeId;
  title: string;
  arenaKind: 'training' | 'colosseum';
  getInitialOpponents: (quality: QualityPreset) => OpponentLoadout[];
  getSurvivalWaveOpponent: (wave: number) => OpponentLoadout;
}

const OPPONENT_ARCHETYPES: Array<{
  name: string;
  rightWeapon: WeaponType;
  leftWeapon: WeaponType | null;
  tunicColor: number;
  metalTint: number;
  armorTier: 'light' | 'medium' | 'heavy';
}> = [
  {
    name: 'Militia Swordsman',
    rightWeapon: 'arming_sword',
    leftWeapon: null,
    tunicColor: 0x3b4d36,
    metalTint: 0x9aa2ab,
    armorTier: 'light',
  },
  {
    name: 'Shield-Bearer',
    rightWeapon: 'mace',
    leftWeapon: 'shield',
    tunicColor: 0x263f63,
    metalTint: 0xb6bec7,
    armorTier: 'medium',
  },
  {
    name: 'Iron Vanguard',
    rightWeapon: 'longsword',
    leftWeapon: null,
    tunicColor: 0x6b2020,
    metalTint: 0xd0d6de,
    armorTier: 'heavy',
  },
  {
    name: 'Ravager Axeman',
    rightWeapon: 'battle_axe',
    leftWeapon: null,
    tunicColor: 0x4f3224,
    metalTint: 0x8e959e,
    armorTier: 'medium',
  },
  {
    name: 'Arena Champion',
    rightWeapon: 'longsword',
    leftWeapon: 'shield',
    tunicColor: 0x5c1928,
    metalTint: 0xe0d6b8,
    armorTier: 'heavy',
  },
];

export function createModeRules(mode: GameModeId): ModeRules {
  return {
    id: mode,
    title:
      mode === 'training'
        ? 'Training Yard'
        : mode === 'duel'
          ? 'Honor Duel'
          : mode === 'survival'
            ? 'Endless Survival'
            : 'Grand Melee Arena',
    arenaKind: mode === 'training' ? 'training' : 'colosseum',

    getInitialOpponents(quality: QualityPreset): OpponentLoadout[] {
      if (mode === 'training') {
        return [
          {
            name: 'Sparring Squire',
            rightWeapon: 'arming_sword',
            leftWeapon: 'shield',
            maxHealth: 100,
            appearance: {
              tunicColor: 0x2c4b66,
              metalTint: 0xb0b8c0,
              armorTier: 'medium',
            },
            ai: {
              aggression: 0.42,
              parrySkill: 0.4,
              reactionSpeed: 0.5,
              preferredRange: 1.75,
            },
            spawnPos: new THREE.Vector3(0, 0, -4.5),
          },
        ];
      }

      if (mode === 'duel') {
        return [
          {
            name: 'Sir Aldric of Ashbourne',
            rightWeapon: 'longsword',
            leftWeapon: 'shield',
            maxHealth: 120,
            appearance: {
              tunicColor: 0x6e1f24,
              metalTint: 0xcfd5dc,
              armorTier: 'heavy',
            },
            ai: {
              aggression: 0.72,
              parrySkill: 0.65,
              reactionSpeed: 0.75,
              preferredRange: 1.8,
            },
            spawnPos: new THREE.Vector3(0, 0, -5.2),
          },
        ];
      }

      if (mode === 'survival') {
        return [this.getSurvivalWaveOpponent(1)];
      }

      // Grand Melee Arena: 2 opponents on Low, 3 opponents on Medium/High
      const count = quality === 'low' ? 2 : 3;
      const spawns = [
        new THREE.Vector3(-3.2, 0, -5.5),
        new THREE.Vector3(3.2, 0, -5.5),
        new THREE.Vector3(0, 0, -8.2),
      ];
      const list: OpponentLoadout[] = [];
      for (let i = 0; i < count; i++) {
        const arch = OPPONENT_ARCHETYPES[(i + 1) % OPPONENT_ARCHETYPES.length];
        list.push({
          name: arch.name,
          rightWeapon: arch.rightWeapon,
          leftWeapon: arch.leftWeapon,
          maxHealth: 95 + i * 15,
          appearance: {
            tunicColor: arch.tunicColor,
            metalTint: arch.metalTint,
            armorTier: arch.armorTier,
          },
          ai: {
            aggression: 0.58 + i * 0.08,
            parrySkill: 0.45 + i * 0.08,
            reactionSpeed: 0.65,
            preferredRange: 1.8,
          },
          spawnPos: spawns[i],
        });
      }
      return list;
    },

    getSurvivalWaveOpponent(wave: number): OpponentLoadout {
      const arch = OPPONENT_ARCHETYPES[(wave - 1) % OPPONENT_ARCHETYPES.length];
      const scale = Math.min(1, (wave - 1) * 0.12);
      return {
        name: `${arch.name} (Wave ${wave})`,
        rightWeapon: arch.rightWeapon,
        leftWeapon: arch.leftWeapon,
        maxHealth: Math.round(90 + (wave - 1) * 18),
        appearance: {
          tunicColor: arch.tunicColor,
          metalTint: arch.metalTint,
          armorTier: arch.armorTier,
        },
        ai: {
          aggression: Math.min(0.95, 0.48 + scale * 0.45),
          parrySkill: Math.min(0.88, 0.35 + scale * 0.5),
          reactionSpeed: Math.min(0.98, 0.5 + scale * 0.45),
          preferredRange: arch.rightWeapon === 'longsword' ? 1.9 : 1.65,
        },
        spawnPos: new THREE.Vector3((Math.random() - 0.5) * 4, 0, -6.0),
      };
    },
  };
}
