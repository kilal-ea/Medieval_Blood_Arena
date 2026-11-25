import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Shield, Swords } from 'lucide-react';
import type { WeaponType } from '../core/types';
import { WEAPON_CATALOG } from '../weapons/WeaponCatalog';

interface TrainingDockProps {
  onEquipWeapons: (right: WeaponType, left: WeaponType | null) => void;
  sparringPaused: boolean;
  onToggleSparring: () => void;
}

const WEAPONS: WeaponType[] = ['longsword', 'arming_sword', 'battle_axe', 'mace'];

export const TrainingDock: React.FC<TrainingDockProps> = ({
  onEquipWeapons,
  sparringPaused,
  onToggleSparring,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [rightW, setRightW] = useState<WeaponType>('longsword');
  const [withShield, setWithShield] = useState(true);

  const selectWeapon = (w: WeaponType) => {
    setRightW(w);
    onEquipWeapons(w, withShield ? 'shield' : null);
  };

  const toggleShield = () => {
    const next = !withShield;
    setWithShield(next);
    onEquipWeapons(rightW, next ? 'shield' : null);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-auto">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="px-3 py-1 rounded-t bg-[#1a1512] border border-b-0 border-[#4a3b2c] text-[11px] text-[#c89b3c] flex items-center gap-1 cursor-pointer"
      >
        {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {collapsed ? 'Arsenal' : 'Hide Arsenal'}
      </button>

      {!collapsed && (
        <div className="bg-[#14110f]/95 border border-[#4a3b2c] rounded px-3 py-2 flex flex-wrap items-center justify-center gap-2 shadow-xl">
          <div className="flex items-center gap-1 text-xs text-[#a69882] mr-1">
            <Swords className="w-3.5 h-3.5 text-[#c89b3c]" />
          </div>
          {WEAPONS.map((w) => (
            <button
              key={w}
              onClick={() => selectWeapon(w)}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                rightW === w
                  ? 'bg-[#7f1d1d] border-[#c89b3c] text-[#f8efe0]'
                  : 'bg-[#1c1714] border-[#3d3126] text-[#cfc3ad] hover:border-[#c89b3c]'
              }`}
            >
              {WEAPON_CATALOG[w].label}
            </button>
          ))}

          <button
            onClick={toggleShield}
            className={`px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1 cursor-pointer ${
              withShield
                ? 'bg-[#28364a] border-[#c89b3c] text-[#f2e8d5]'
                : 'bg-[#1c1714] border-[#3d3126] text-[#9b8d77]'
            }`}
          >
            <Shield className="w-3 h-3" />
            Shield {withShield ? 'On' : 'Off'}
          </button>

          <button
            onClick={onToggleSparring}
            className={`px-2.5 py-1 rounded text-xs font-medium border cursor-pointer ${
              sparringPaused
                ? 'bg-[#1c1714] border-[#3d3126] text-[#a69882]'
                : 'bg-[#2c3e26] border-[#6b8e4e] text-[#eef5e6]'
            }`}
          >
            Partner: {sparringPaused ? 'Passive' : 'Active'}
          </button>
        </div>
      )}
    </div>
  );
};
