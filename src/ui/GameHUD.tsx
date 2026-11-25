import React from 'react';
import { Volume2, VolumeX, Pause, RotateCcw } from 'lucide-react';
import type { MatchHudSnapshot, WeaponType } from '../core/types';
import { WEAPON_CATALOG } from '../weapons/WeaponCatalog';

interface GameHUDProps {
  hud: MatchHudSnapshot;
  muted: boolean;
  showTelemetry: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onResetTraining: () => void;
}

function weaponLabel(type: WeaponType | null): string {
  return type ? WEAPON_CATALOG[type].label : 'Empty Hand';
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  muted,
  showTelemetry,
  onToggleMute,
  onPause,
  onResetTraining,
}) => {
  const { player, opponents } = hud;
  const hpPct = Math.max(0, Math.min(100, (player.health / player.maxHealth) * 100));
  const stamPct = Math.max(0, Math.min(100, (player.stamina / player.maxStamina) * 100));

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Top Row: Player Status (Left) | Match/Wave/Score (Center) | Opponents & Actions (Right) */}
      <div className="flex items-start justify-between gap-3">
        {/* Player Vitals Cluster */}
        <div className="w-56 sm:w-64 bg-[#14110f]/90 border border-[#4a3b2c] rounded px-3 py-2.5">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medieval font-bold text-[#efe4cf] tracking-wide">
              KNIGHT
            </span>
            <span className="tabular-nums font-semibold text-[#e6c373]">
              {player.health}/{player.maxHealth} HP
            </span>
          </div>
          <div className="h-2.5 bg-[#2a1d1a] rounded-sm overflow-hidden mb-1.5 border border-[#3d2924]">
            <div
              className="h-full bg-[#991b1b] transition-[width] duration-100"
              style={{ width: `${hpPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#b8aa93] mb-0.5">
            <span>Stamina</span>
            <span className="tabular-nums">{player.stamina}%</span>
          </div>
          <div className="h-1.5 bg-[#262018] rounded-sm overflow-hidden mb-2">
            <div
              className="h-full bg-[#c89b3c] transition-[width] duration-75"
              style={{ width: `${stamPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#b8aa93] border-t border-[#2f261e] pt-1.5">
            <span className="truncate">
              L: <strong className="text-[#e7dec8]">{weaponLabel(player.leftWeapon)}</strong>
            </span>
            <span className="truncate ml-2">
              R: <strong className="text-[#e7dec8]">{weaponLabel(player.rightWeapon)}</strong>
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#9b8d77] mt-0.5 tabular-nums">
            <span>Balance: {player.balance}%</span>
            <span>Grip: {player.rightGripStrength}%</span>
          </div>
        </div>

        {/* Center Mode / Wave / Score Pill */}
        <div className="hidden sm:flex flex-col items-center">
          <div className="bg-[#14110f]/90 border border-[#4a3b2c] rounded px-4 py-1.5 flex items-center gap-4 text-xs">
            <span className="font-medieval font-bold uppercase tracking-wider text-[#c89b3c]">
              {hud.mode}
            </span>
            {hud.mode === 'survival' && (
              <span className="tabular-nums text-[#efe4cf] font-semibold">
                Wave {hud.wave}
              </span>
            )}
            <span className="tabular-nums text-[#efe4cf]">
              Score <strong className="text-[#e6c373]">{hud.score}</strong>
            </span>
            <span className="tabular-nums text-[#a69882]">
              {Math.floor(hud.elapsedTime)}s
            </span>
          </div>
          {hud.statusText && (
            <div className="mt-2 px-3 py-1 rounded bg-[#1a1411]/95 border border-[#7c5c2b] text-xs font-medieval text-[#f2e8d5] tracking-wide">
              {hud.statusText}
            </div>
          )}
        </div>

        {/* Right: Opponents & Quick Action Buttons */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {hud.mode === 'training' && (
              <button
                onClick={onResetTraining}
                title="Reset Training (R)"
                className="px-2.5 py-1.5 rounded bg-[#14110f]/90 border border-[#4a3b2c] hover:border-[#c89b3c] text-xs text-[#e7dec8] flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#c89b3c]" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
            <button
              onClick={onToggleMute}
              title={muted ? 'Unmute Audio' : 'Mute Audio'}
              className="p-1.5 rounded bg-[#14110f]/90 border border-[#4a3b2c] hover:border-[#c89b3c] text-[#e7dec8] cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4 text-[#dc2626]" /> : <Volume2 className="w-4 h-4 text-[#c89b3c]" />}
            </button>
            <button
              onClick={onPause}
              title="Pause (Tab)"
              className="p-1.5 rounded bg-[#14110f]/90 border border-[#4a3b2c] hover:border-[#c89b3c] text-[#e7dec8] cursor-pointer"
            >
              <Pause className="w-4 h-4 text-[#e7dec8]" />
            </button>
          </div>

          {/* Opponent Health Bars */}
          <div className="flex flex-col gap-1.5 w-48 sm:w-56">
            {opponents.map((opp) => {
              const ohp = Math.max(0, Math.min(100, (opp.health / opp.maxHealth) * 100));
              return (
                <div
                  key={opp.id}
                  className="bg-[#14110f]/90 border border-[#4a3b2c] rounded px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-medieval font-semibold text-[#e7dec8] truncate">
                      {opp.name}
                    </span>
                    <span className="tabular-nums text-[#cf665b] font-semibold ml-1">
                      {opp.isDead ? 'FALLEN' : `${opp.health}`}
                    </span>
                  </div>
                  <div className="h-2 bg-[#2a1d1a] rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-[#b91c1c] transition-[width] duration-100"
                      style={{ width: `${ohp}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Subtle Center Crosshair & Contextual Weapon Pickup Prompt */}
      <div className="flex flex-col items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-[#e7dec8]/60" />
        {hud.nearbyWeapon && !player.isDead && (
          <div className="mt-4 px-3 py-1 rounded bg-[#14110f]/95 border border-[#c89b3c] text-[11px] text-[#f2e8d5]">
            Press <strong>E</strong> (Right) or <strong>Q</strong> (Left) to grab{' '}
            <span className="text-[#e6c373] font-semibold">
              {WEAPON_CATALOG[hud.nearbyWeapon].label}
            </span>
          </div>
        )}
        {player.isKnockedDown && !player.isDead && (
          <div className="mt-2 px-3 py-1 rounded bg-[#7f1d1d]/90 border border-[#c89b3c] text-xs font-medieval text-[#f8efe0]">
            KNOCKED DOWN — Recovering balance...
          </div>
        )}
      </div>

      {/* Bottom Telemetry (only when toggled on in Settings) */}
      <div className="flex justify-between items-end">
        {showTelemetry ? (
          <div className="bg-[#14110f]/90 border border-[#3d3126] rounded px-2.5 py-1 text-[10px] text-[#a69882] tabular-nums">
            {hud.fps} FPS · Physics {hud.physicsMs}ms · Bodies {hud.bodyCount}
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
};
