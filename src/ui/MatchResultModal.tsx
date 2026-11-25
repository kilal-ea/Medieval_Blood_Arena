import React from 'react';
import { Trophy, Skull, RotateCcw, Home } from 'lucide-react';
import type { MatchResult } from '../core/types';

interface MatchResultModalProps {
  result: MatchResult;
  onRestart: () => void;
  onMainMenu: () => void;
}

export const MatchResultModal: React.FC<MatchResultModalProps> = ({
  result,
  onRestart,
  onMainMenu,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md bg-[#161210] border-2 border-[#c89b3c] rounded-md p-6 shadow-2xl flex flex-col items-center text-center gap-4">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center border-2 ${
            result.victory
              ? 'bg-[#2a2212] border-[#c89b3c] text-[#e6c373]'
              : 'bg-[#2d1313] border-[#991b1b] text-[#ef4444]'
          }`}
        >
          {result.victory ? <Trophy className="w-7 h-7" /> : <Skull className="w-7 h-7" />}
        </div>

        <div>
          <h2
            className={`font-medieval text-3xl font-extrabold tracking-wider ${
              result.victory ? 'text-[#e6c373]' : 'text-[#dc2626]'
            }`}
          >
            {result.victory ? 'VICTORY' : 'DEFEATED'}
          </h2>
          <p className="text-sm text-[#cfc3ad] mt-1">{result.reason}</p>
        </div>

        <div className="w-full grid grid-cols-2 gap-2.5 bg-[#110e0c] border border-[#3d3126] rounded p-3.5 text-xs">
          <div className="flex justify-between">
            <span className="text-[#9b8d77]">Score</span>
            <strong className="tabular-nums text-[#e6c373]">{result.score}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9b8d77]">Defeated</span>
            <strong className="tabular-nums text-[#efe4cf]">{result.kills}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9b8d77]">Damage</span>
            <strong className="tabular-nums text-[#efe4cf]">{result.damageDealt}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9b8d77]">Parries / Disarms</span>
            <strong className="tabular-nums text-[#efe4cf]">
              {result.parries} / {result.disarms}
            </strong>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9b8d77]">Duration</span>
            <strong className="tabular-nums text-[#efe4cf]">{result.durationSec}s</strong>
          </div>
          {result.mode === 'survival' && (
            <div className="flex justify-between">
              <span className="text-[#9b8d77]">Wave Reached</span>
              <strong className="tabular-nums text-[#e6c373]">{result.wave}</strong>
            </div>
          )}
        </div>

        <div className="w-full flex gap-3 mt-1">
          <button
            onClick={onRestart}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-[#7f1d1d] hover:bg-[#991b1b] border border-[#c89b3c] font-medieval font-bold text-[#f8efe0] cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Fight Again
          </button>
          <button
            onClick={onMainMenu}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-[#211b17] hover:bg-[#2c241e] border border-[#4a3b2c] text-sm font-medium text-[#e7dec8] cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};
