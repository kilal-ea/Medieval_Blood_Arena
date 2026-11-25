import React, { useRef, useState } from 'react';
import { Swords, Shield, ArrowUp } from 'lucide-react';
import type { InputManager } from '../controls/InputManager';

interface MobileControlsProps {
  input: InputManager;
}

export const MobileControls: React.FC<MobileControlsProps> = ({ input }) => {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const joyOrigin = useRef<{ x: number; y: number } | null>(null);
  const joyTouchId = useRef<number | null>(null);
  const camLast = useRef<{ x: number; y: number } | null>(null);
  const camTouchId = useRef<number | null>(null);

  const maxRadius = 42;

  const onJoyStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    joyTouchId.current = t.identifier;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    joyOrigin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const onJoyMove = (e: React.TouchEvent) => {
    if (!joyOrigin.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchId.current) {
        const dx = t.clientX - joyOrigin.current.x;
        const dy = t.clientY - joyOrigin.current.y;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(maxRadius, dist);
        const ang = Math.atan2(dy, dx);
        const kx = Math.cos(ang) * clamped;
        const ky = Math.sin(ang) * clamped;
        setKnob({ x: kx, y: ky });
        input.mobileMoveX = kx / maxRadius;
        input.mobileMoveY = -ky / maxRadius;
      }
    }
  };

  const onJoyEnd = () => {
    joyTouchId.current = null;
    joyOrigin.current = null;
    setKnob({ x: 0, y: 0 });
    input.mobileMoveX = 0;
    input.mobileMoveY = 0;
  };

  const onCamStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    camTouchId.current = t.identifier;
    camLast.current = { x: t.clientX, y: t.clientY };
  };

  const onCamMove = (e: React.TouchEvent) => {
    if (!camLast.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === camTouchId.current) {
        const dx = t.clientX - camLast.current.x;
        const dy = t.clientY - camLast.current.y;
        camLast.current = { x: t.clientX, y: t.clientY };
        input.addTouchCameraDelta(dx, dy);
      }
    }
  };

  const onCamEnd = () => {
    camTouchId.current = null;
    camLast.current = null;
  };

  return (
    <div className="fixed inset-0 z-15 pointer-events-none">
      {/* Right half touch look / swing drag surface */}
      <div
        className="absolute right-0 top-16 bottom-36 w-1/2 pointer-events-auto"
        onTouchStart={onCamStart}
        onTouchMove={onCamMove}
        onTouchEnd={onCamEnd}
        onTouchCancel={onCamEnd}
      />

      {/* Left Virtual Joystick */}
      <div
        className="absolute left-5 bottom-6 w-28 h-28 rounded-full border-2 border-[#c89b3c]/60 bg-[#14110f]/75 flex items-center justify-center pointer-events-auto"
        onTouchStart={onJoyStart}
        onTouchMove={onJoyMove}
        onTouchEnd={onJoyEnd}
        onTouchCancel={onJoyEnd}
      >
        <div
          className="w-11 h-11 rounded-full bg-[#c89b3c]/85 border border-[#f2e8d5]"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>

      {/* Right Combat Action Cluster */}
      <div className="absolute right-4 bottom-5 flex flex-col items-end gap-2 pointer-events-auto">
        <div className="flex gap-2">
          <button
            onTouchStart={() => input.triggerMobileLeftHand()}
            onClick={() => input.triggerMobileLeftHand()}
            className="px-3 py-2 rounded bg-[#1b1613]/90 border border-[#4a3b2c] text-[11px] font-semibold text-[#e7dec8]"
          >
            L-Hand
          </button>
          <button
            onTouchStart={() => input.triggerMobileRightHand()}
            onClick={() => input.triggerMobileRightHand()}
            className="px-3 py-2 rounded bg-[#1b1613]/90 border border-[#4a3b2c] text-[11px] font-semibold text-[#e7dec8]"
          >
            R-Hand
          </button>
          <button
            onTouchStart={() => input.triggerMobileJump()}
            onClick={() => input.triggerMobileJump()}
            className="p-2.5 rounded bg-[#1b1613]/90 border border-[#4a3b2c] text-[#e7dec8]"
            aria-label="Jump"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2.5">
          <button
            onTouchStart={() => input.setMobileDefend(true)}
            onTouchEnd={() => input.setMobileDefend(false)}
            onTouchCancel={() => input.setMobileDefend(false)}
            className="w-16 h-16 rounded-full bg-[#24364d]/90 border-2 border-[#7aa0c4] flex flex-col items-center justify-center text-[10px] font-bold text-[#eef4fa]"
          >
            <Shield className="w-5 h-5 mb-0.5" />
            GUARD
          </button>

          <button
            onTouchStart={() => input.setMobileAttack(true)}
            onTouchEnd={() => input.setMobileAttack(false)}
            onTouchCancel={() => input.setMobileAttack(false)}
            className="w-20 h-20 rounded-full bg-[#8f1d1d]/95 border-2 border-[#c89b3c] flex flex-col items-center justify-center text-xs font-bold text-[#f8efe0]"
          >
            <Swords className="w-6 h-6 mb-0.5" />
            STRIKE
          </button>
        </div>
      </div>
    </div>
  );
};
