import React from 'react';
import { Swords, Shield, Flame, Compass, Settings, Keyboard, Play } from 'lucide-react';
import type { GameModeId } from '../core/types';

interface TitleScreenProps {
  onStartMode: (mode: GameModeId) => void;
  onOpenSettings: () => void;
  onOpenControls: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartMode,
  onOpenSettings,
  onOpenControls,
}) => {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none p-5 sm:p-8 bg-gradient-to-r from-[#0d0a08]/92 via-[#0d0a08]/55 to-transparent">
      {/* Top Left Title Lockup + Main Menu */}
      <div className="max-w-md pointer-events-auto flex flex-col gap-5 my-auto">
        <div className="flex items-center gap-3">
          <svg
            width="48"
            height="48"
            viewBox="0 0 64 64"
            fill="none"
            className="shrink-0 drop-shadow"
            aria-hidden="true"
          >
            <path
              d="M32 4L56 14V32C56 46.5 45.2 56.8 32 60C18.8 56.8 8 46.5 8 32V14L32 4Z"
              fill="#1c1512"
              stroke="#c89b3c"
              strokeWidth="2.5"
            />
            <path d="M20 44L44 20M44 44L20 20" stroke="#e2d7be" strokeWidth="3" strokeLinecap="round" />
            <path d="M18 39L25 46M39 46L46 39" stroke="#c89b3c" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="32" cy="32" r="4" fill="#991b1b" stroke="#c89b3c" strokeWidth="1.5" />
          </svg>
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-[#c89b3c] font-semibold">
              Physics-Driven Combat Simulation
            </p>
            <h1 className="font-medieval text-3xl sm:text-4xl font-extrabold tracking-wide text-[#f2e8d5] leading-tight">
              Medieval Blood Arena
            </h1>
          </div>
        </div>

        <p className="text-sm text-[#cfc3ad] leading-relaxed max-w-sm">
          Torque-balanced active ragdoll knights, articulated physical arms, and steel-on-steel
          momentum combat. Every parry, disarm, and knockdown emerges from simulation.
        </p>

        {/* Primary Play CTA */}
        <button
          onClick={() => onStartMode('duel')}
          className="group flex items-center justify-between px-5 py-3.5 rounded border border-[#c89b3c] bg-[#7f1d1d] hover:bg-[#991b1b] text-[#f8efe0] transition-colors cursor-pointer shadow-lg"
        >
          <span className="flex items-center gap-3 font-medieval text-lg font-bold tracking-wider uppercase">
            <Play className="w-5 h-5 fill-current text-[#e7c675]" />
            Play Honor Duel
          </span>
          <span className="text-xs uppercase tracking-widest text-[#e7c675]">1v1</span>
        </button>

        {/* Game Mode Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => onStartMode('training')}
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded border border-[#4a3b2c] bg-[#171311]/95 hover:border-[#c89b3c] hover:bg-[#221c18] text-left transition-colors cursor-pointer"
          >
            <Compass className="w-4 h-4 text-[#c89b3c] shrink-0" />
            <div>
              <div className="font-medieval text-sm font-bold text-[#efe4cf]">Training</div>
              <div className="text-[11px] text-[#a69882]">Dummies & Racks</div>
            </div>
          </button>

          <button
            onClick={() => onStartMode('duel')}
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded border border-[#4a3b2c] bg-[#171311]/95 hover:border-[#c89b3c] hover:bg-[#221c18] text-left transition-colors cursor-pointer"
          >
            <Swords className="w-4 h-4 text-[#c89b3c] shrink-0" />
            <div>
              <div className="font-medieval text-sm font-bold text-[#efe4cf]">Duel</div>
              <div className="text-[11px] text-[#a69882]">1v1 Stone Arena</div>
            </div>
          </button>

          <button
            onClick={() => onStartMode('survival')}
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded border border-[#4a3b2c] bg-[#171311]/95 hover:border-[#c89b3c] hover:bg-[#221c18] text-left transition-colors cursor-pointer"
          >
            <Flame className="w-4 h-4 text-[#d97706] shrink-0" />
            <div>
              <div className="font-medieval text-sm font-bold text-[#efe4cf]">Survival</div>
              <div className="text-[11px] text-[#a69882]">Escalating Waves</div>
            </div>
          </button>

          <button
            onClick={() => onStartMode('arena')}
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded border border-[#4a3b2c] bg-[#171311]/95 hover:border-[#c89b3c] hover:bg-[#221c18] text-left transition-colors cursor-pointer"
          >
            <Shield className="w-4 h-4 text-[#dc2626] shrink-0" />
            <div>
              <div className="font-medieval text-sm font-bold text-[#efe4cf]">Arena</div>
              <div className="text-[11px] text-[#a69882]">Grand Melee</div>
            </div>
          </button>
        </div>

        {/* Settings & Controls Row */}
        <div className="flex gap-2.5">
          <button
            onClick={onOpenSettings}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded border border-[#3d3126] bg-[#14100e]/95 hover:border-[#c89b3c] text-xs uppercase tracking-wider font-semibold text-[#d9ccb4] transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-[#c89b3c]" />
            Settings
          </button>
          <button
            onClick={onOpenControls}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded border border-[#3d3126] bg-[#14100e]/95 hover:border-[#c89b3c] text-xs uppercase tracking-wider font-semibold text-[#d9ccb4] transition-colors cursor-pointer"
          >
            <Keyboard className="w-3.5 h-3.5 text-[#c89b3c]" />
            Controls
          </button>
        </div>
      </div>

      {/* Flat single-line control hint */}
      <div className="text-center text-[11px] sm:text-xs text-[#b5a790] tracking-wide pointer-events-none">
        WASD Move · Mouse Look &amp; Swing · LMB Attack · RMB Guard · Q/E Hands · Space Jump · R Recover · Tab Pause
      </div>
    </div>
  );
};
