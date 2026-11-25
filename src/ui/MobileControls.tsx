import React, { useRef, useState } from 'react';
import { Swords, Shield, ArrowUp, Crosshair } from 'lucide-react';
import type { InputManager } from '../controls/InputManager';

interface MobileControlsProps {
  input: InputManager;
}

export const MobileControls: React.FC<MobileControlsProps> = ({ input }) => {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [weaponFocus, setWeaponFocus] = useState(false);

  const joyOrigin = useRef<{ x: number; y: number } | null>(null);
  const joyTouchId = useRef<number | null>(null);
  const camLast = useRef<{ x: number; y: number } | null>(null);
  const camTouchId = useRef<number | null>(null);
  const strikeLast = useRef<{ x: number; y: number } | null>(null);
  const strikeTouchId = useRef<number | null>(null);
  const guardLast = useRef<{ x: number; y: number } | null>(null);
  const guardTouchId = useRef<number | null>(null);

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
        input.setMobileJoystick(kx / maxRadius, -ky / maxRadius);
      }
    }
  };

  const onJoyEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchId.current || joyTouchId.current === null) {
        joyTouchId.current = null;
        joyOrigin.current = null;
        setKnob({ x: 0, y: 0 });
        input.setMobileJoystick(0, 0);
        return;
      }
    }
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

  // Drag directly on STRIKE button to steer weapon horizontally & vertically with one thumb
  const onStrikeStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    strikeTouchId.current = t.identifier;
    strikeLast.current = { x: t.clientX, y: t.clientY };
    input.setMobileAttack(true);
  };

  const onStrikeMove = (e: React.TouchEvent) => {
    if (!strikeLast.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === strikeTouchId.current) {
        const dx = t.clientX - strikeLast.current.x;
        const dy = t.clientY - strikeLast.current.y;
        strikeLast.current = { x: t.clientX, y: t.clientY };
        input.addTouchWeaponDelta(dx, dy);
      }
    }
  };

  const onStrikeEnd = () => {
    strikeTouchId.current = null;
    strikeLast.current = null;
    input.setMobileAttack(false);
  };

  // Drag directly on GUARD button to angle shield/parry height
  const onGuardStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    guardTouchId.current = t.identifier;
    guardLast.current = { x: t.clientX, y: t.clientY };
    input.setMobileDefend(true);
  };

  const onGuardMove = (e: React.TouchEvent) => {
    if (!guardLast.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === guardTouchId.current) {
        const dx = t.clientX - guardLast.current.x;
        const dy = t.clientY - guardLast.current.y;
        guardLast.current = { x: t.clientX, y: t.clientY };
        input.addTouchGuardDelta(dx, dy);
      }
    }
  };

  const onGuardEnd = () => {
    guardTouchId.current = null;
    guardLast.current = null;
    input.setMobileDefend(false);
  };

  const toggleWeaponFocus = () => {
    const next = !weaponFocus;
    setWeaponFocus(next);
    input.setMobileWeaponFocus(next);
  };

  return (
    <div className="fixed inset-0 z-15 pointer-events-none select-none touch-none">
      {/* Right half touch look / weapon focus pad */}
      <div
        className="absolute right-0 top-16 bottom-36 w-1/2 pointer-events-auto touch-none"
        onTouchStart={onCamStart}
        onTouchMove={onCamMove}
        onTouchEnd={onCamEnd}
        onTouchCancel={onCamEnd}
      />

      {/* Left Virtual Joystick */}
      <div
        className="absolute left-5 bottom-6 w-28 h-28 rounded-full border-2 border-[#c89b3c]/60 bg-[#14110f]/75 flex items-center justify-center pointer-events-auto touch-none"
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
      <div className="absolute right-4 bottom-5 flex flex-col items-end gap-2 pointer-events-auto touch-none">
        <div className="flex gap-1.5">
          <button
            onTouchStart={toggleWeaponFocus}
            onClick={toggleWeaponFocus}
            className={`px-2.5 py-2 rounded border text-[11px] font-semibold flex items-center gap-1 ${
              weaponFocus
                ? 'bg-[#7f1d1d]/90 border-[#c89b3c] text-[#f8efe0]'
                : 'bg-[#1b1613]/90 border-[#4a3b2c] text-[#e7dec8]'
            }`}
            aria-label="Weapon Aim Lock"
          >
            <Crosshair className="w-3.5 h-3.5" />
            Aim
          </button>
          <button
            onTouchStart={() => input.triggerMobileLeftHand()}
            onClick={() => input.triggerMobileLeftHand()}
            className="px-2.5 py-2 rounded bg-[#1b1613]/90 border border-[#4a3b2c] text-[11px] font-semibold text-[#e7dec8]"
          >
            L-Hand
          </button>
          <button
            onTouchStart={() => input.triggerMobileRightHand()}
            onClick={() => input.triggerMobileRightHand()}
            className="px-2.5 py-2 rounded bg-[#1b1613]/90 border border-[#4a3b2c] text-[11px] font-semibold text-[#e7dec8]"
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
            onTouchStart={onGuardStart}
            onTouchMove={onGuardMove}
            onTouchEnd={onGuardEnd}
            onTouchCancel={onGuardEnd}
            className="w-16 h-16 rounded-full bg-[#24364d]/90 border-2 border-[#7aa0c4] flex flex-col items-center justify-center text-[10px] font-bold text-[#eef4fa] touch-none"
          >
            <Shield className="w-5 h-5 mb-0.5" />
            GUARD
          </button>

          <button
            onTouchStart={onStrikeStart}
            onTouchMove={onStrikeMove}
            onTouchEnd={onStrikeEnd}
            onTouchCancel={onStrikeEnd}
            className="w-20 h-20 rounded-full bg-[#8f1d1d]/95 border-2 border-[#c89b3c] flex flex-col items-center justify-center text-xs font-bold text-[#f8efe0] touch-none"
          >
            <Swords className="w-6 h-6 mb-0.5" />
            STRIKE
          </button>
        </div>
      </div>
    </div>
  );
};
