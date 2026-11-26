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
  appearance: FighterAppearance;
}> = [
  {
    name: 'Militia Swordsman',
    rightWeapon: 'arming_sword',
    leftWeapon: null,
    appearance: {
      tunicColor: 0x3b4d36,
      secondaryColor: 0x8f7e58,
      metalTint: 0x9aa2ab,
      armorTier: 'light',
      helmStyle: 'kettle',
      skinTone: 0xd4a483,
      hairColor: 0x4c301c,
      beardStyle: 'stubble',
    },
  },
  {
    name: 'Shield-Bearer',
    rightWeapon: 'mace',
    leftWeapon: 'shield',
    appearance: {
      tunicColor: 0x263f63,
      secondaryColor: 0xb89c5e,
      metalTint: 0xb6bec7,
      armorTier: 'medium',
      helmStyle: 'spangenhelm',
      skinTone: 0xc89572,
      hairColor: 0x261a14,
      beardStyle: 'full',
    },
  },
  {
    name: 'Iron Vanguard',
    rightWeapon: 'longsword',
    leftWeapon: null,
    appearance: {
      tunicColor: 0x6b2020,
      secondaryColor: 0xc2b293,
      metalTint: 0xd0d6de,
      armorTier: 'heavy',
      helmStyle: 'barbute',
      skinTone: 0xd9ad8e,
      hairColor: 0x5c2b19,
      beardStyle: 'goatee',
    },
  },
  {
    name: 'Ravager Axeman',
    rightWeapon: 'battle_axe',
    leftWeapon: null,
    appearance: {
      tunicColor: 0x4f3224,
      secondaryColor: 0x7e2824,
      metalTint: 0x8e959e,
      armorTier: 'medium',
      helmStyle: 'open',
      skinTone: 0xbc8662,
      hairColor: 0x6b3a20,
      beardStyle: 'full',
    },
  },
  {
    name: 'Arena Champion',
    rightWeapon: 'longsword',
    leftWeapon: 'shield',
    appearance: {
      tunicColor: 0x5c1928,
      secondaryColor: 0xd1b369,
      metalTint: 0xe0d6b8,
      armorTier: 'heavy',
      helmStyle: 'sallet',
      skinTone: 0xcfa07e,
      hairColor: 0x1e1815,
      beardStyle: 'goatee',
    },
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
              secondaryColor: 0xc4b082,
              metalTint: 0xb0b8c0,
              armorTier: 'medium',
              helmStyle: 'kettle',
              skinTone: 0xd6a888,
              hairColor: 0x57361f,
              beardStyle: 'stubble',
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
              secondaryColor: 0xc9a959,
              metalTint: 0xcfd5dc,
              armorTier: 'heavy',
              helmStyle: 'barbute',
              skinTone: 0xcf9b78,
              hairColor: 0x2d1e15,
              beardStyle: 'goatee',
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
          appearance: { ...arch.appearance },
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
        appearance: { ...arch.appearance },
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
