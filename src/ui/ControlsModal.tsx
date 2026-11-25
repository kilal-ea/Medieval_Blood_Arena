import React, { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import type { KeyBindings } from '../core/types';
import { DEFAULT_KEY_BINDINGS } from '../controls/InputManager';

interface ControlsModalProps {
  bindings: KeyBindings;
  onChange: (next: KeyBindings) => void;
  onClose: () => void;
}

const BIND_LABELS: Array<{ key: keyof KeyBindings; label: string }> = [
  { key: 'moveForward', label: 'Move Forward' },
  { key: 'moveBackward', label: 'Move Backward' },
  { key: 'moveLeft', label: 'Strafe Left' },
  { key: 'moveRight', label: 'Strafe Right' },
  { key: 'leftHand', label: 'Left Hand Grab / Punch' },
  { key: 'rightHand', label: 'Right Hand Grab / Release' },
  { key: 'jump', label: 'Jump / Lunge' },
  { key: 'recover', label: 'Recover Weapon / Reset Training' },
  { key: 'pause', label: 'Pause Menu' },
];

function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export const ControlsModal: React.FC<ControlsModalProps> = ({
  bindings,
  onChange,
  onClose,
}) => {
  const [listeningKey, setListeningKey] = useState<keyof KeyBindings | null>(null);

  useEffect(() => {
    if (!listeningKey) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onChange({ ...bindings, [listeningKey]: e.code });
      setListeningKey(null);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [listeningKey, bindings, onChange]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#161210] border-2 border-[#7c5c2b] rounded-md p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#382d23] pb-3 mb-4">
          <h2 className="font-medieval text-xl font-bold text-[#f2e8d5] tracking-wider">
            Combat Controls
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#2a211b] text-[#b8aa93] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-[#110e0c] border border-[#382d23] rounded p-3 mb-4 text-xs text-[#cfc3ad] space-y-1.5">
          <div>
            <strong className="text-[#e6c373]">Direct Weapon Control:</strong> Hold{' '}
            <strong>Left Mouse</strong> (camera locks) and move mouse to swing or position your blade directly; double-click LMB or press <strong>F</strong> to thrust.
          </div>
          <div>
            <strong className="text-[#e6c373]">Free Stance &amp; Wrist Rotation:</strong> Hold{' '}
            <strong>Alt</strong> (or toggle <strong>V</strong>) + Mouse for free weapon positioning; scroll <strong>Mouse Wheel</strong> or hold <strong>Middle Mouse</strong> to rotate blade angle &amp; pitch.
          </div>
          <div>
            <strong className="text-[#e6c373]">Defense:</strong> Hold <strong>Right Mouse</strong> + move mouse to angle your shield or parry guard.
          </div>
          <div>
            <strong className="text-[#e6c373]">Mobile Touch:</strong> Left thumbstick moves; drag on <strong>STRIKE</strong> or <strong>GUARD</strong> to steer swings &amp; blocks; toggle <strong>Aim</strong> for free weapon pad control.
          </div>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          {BIND_LABELS.map(({ key, label }) => {
            const isListening = listeningKey === key;
            return (
              <div
                key={key}
                className="flex items-center justify-between bg-[#1c1714] border border-[#382d23] rounded px-3 py-2 text-xs"
              >
                <span className="text-[#e7dec8]">{label}</span>
                <button
                  onClick={() => setListeningKey(key)}
                  className={`min-w-24 px-2.5 py-1 rounded border font-mono font-semibold cursor-pointer ${
                    isListening
                      ? 'bg-[#7f1d1d] border-[#c89b3c] text-[#f8efe0]'
                      : 'bg-[#120f0d] border-[#4a3b2c] text-[#e6c373] hover:border-[#c89b3c]'
                  }`}
                >
                  {isListening ? 'Press Key...' : formatKeyCode(bindings[key])}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={() => onChange({ ...DEFAULT_KEY_BINDINGS })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#211b17] hover:bg-[#2c241e] border border-[#4a3b2c] text-xs text-[#cfc3ad] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#c89b3c]" />
            Reset Defaults
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded bg-[#7f1d1d] hover:bg-[#991b1b] border border-[#c89b3c] text-xs font-medieval font-bold text-[#f8efe0] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
