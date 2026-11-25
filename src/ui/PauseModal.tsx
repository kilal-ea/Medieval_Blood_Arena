import React from 'react';
import { Play, RotateCcw, Settings, Keyboard, Home } from 'lucide-react';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onOpenControls: () => void;
  onMainMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onOpenSettings,
  onOpenControls,
  onMainMenu,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-sm bg-[#161210] border-2 border-[#7c5c2b] rounded-md p-6 shadow-2xl flex flex-col gap-3">
        <h2 className="font-medieval text-2xl font-bold text-center text-[#f2e8d5] tracking-wider mb-1">
          Combat Paused
        </h2>

        <button
          onClick={onResume}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-[#7f1d1d] hover:bg-[#991b1b] border border-[#c89b3c] font-medieval font-bold text-[#f8efe0] cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" />
          Resume Match
        </button>

        <button
          onClick={onRestart}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-[#211b17] hover:bg-[#2b231e] border border-[#4a3b2c] text-sm font-medium text-[#e7dec8] cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-[#c89b3c]" />
          Restart Match
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-[#211b17] hover:bg-[#2b231e] border border-[#4a3b2c] text-sm font-medium text-[#e7dec8] cursor-pointer"
        >
          <Settings className="w-4 h-4 text-[#c89b3c]" />
          Settings
        </button>

        <button
          onClick={onOpenControls}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-[#211b17] hover:bg-[#2b231e] border border-[#4a3b2c] text-sm font-medium text-[#e7dec8] cursor-pointer"
        >
          <Keyboard className="w-4 h-4 text-[#c89b3c]" />
          Controls
        </button>

        <button
          onClick={onMainMenu}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-[#14100e] hover:bg-[#1f1916] border border-[#3d3126] text-sm text-[#b8aa93] cursor-pointer mt-1"
        >
          <Home className="w-4 h-4" />
          Return to Main Menu
        </button>
      </div>
    </div>
  );
};
