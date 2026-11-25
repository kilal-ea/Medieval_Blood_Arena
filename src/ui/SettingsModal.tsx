import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, Activity } from 'lucide-react';
import type { GameSettings, QualityPreset } from '../core/types';
import { runPhysicsVerificationSuite, type PhysicsTestCaseResult } from '../tests/PhysicsVerification';

interface SettingsModalProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onApplyPreset: (preset: QualityPreset) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onChange,
  onApplyPreset,
  onClose,
}) => {
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResults, setDiagResults] = useState<PhysicsTestCaseResult[] | null>(null);

  const runDiagnostics = async () => {
    setDiagRunning(true);
    try {
      const res = await runPhysicsVerificationSuite();
      setDiagResults(res);
    } finally {
      setDiagRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#161210] border-2 border-[#7c5c2b] rounded-md p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#382d23] pb-3 mb-4">
          <h2 className="font-medieval text-xl font-bold text-[#f2e8d5] tracking-wider">
            Arena Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#2a211b] text-[#b8aa93] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-sm">
          {/* Quality Presets */}
          <div>
            <div className="text-xs uppercase tracking-wider text-[#c89b3c] font-semibold mb-2">
              Graphics Quality Preset
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as QualityPreset[]).map((q) => (
                <button
                  key={q}
                  onClick={() => onApplyPreset(q)}
                  className={`py-2 rounded border text-xs uppercase font-bold tracking-wider cursor-pointer ${
                    settings.quality === q
                      ? 'bg-[#7f1d1d] border-[#c89b3c] text-[#f8efe0]'
                      : 'bg-[#1f1a17] border-[#3d3126] text-[#b8aa93] hover:border-[#c89b3c]'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-between bg-[#1c1714] border border-[#382d23] rounded px-3 py-2 cursor-pointer">
              <span className="text-xs text-[#e7dec8]">Dynamic Shadows</span>
              <input
                type="checkbox"
                checked={settings.shadows}
                onChange={(e) => onChange({ ...settings, shadows: e.target.checked })}
                className="accent-[#c89b3c]"
              />
            </label>

            <label className="flex items-center justify-between bg-[#1c1714] border border-[#382d23] rounded px-3 py-2 cursor-pointer">
              <span className="text-xs text-[#e7dec8]">Reduced Particles</span>
              <input
                type="checkbox"
                checked={settings.reducedParticles}
                onChange={(e) => onChange({ ...settings, reducedParticles: e.target.checked })}
                className="accent-[#c89b3c]"
              />
            </label>

            <label className="flex items-center justify-between bg-[#1c1714] border border-[#382d23] rounded px-3 py-2 cursor-pointer">
              <span className="text-xs text-[#e7dec8]">Show FPS / Physics</span>
              <input
                type="checkbox"
                checked={settings.showTelemetry}
                onChange={(e) => onChange({ ...settings, showTelemetry: e.target.checked })}
                className="accent-[#c89b3c]"
              />
            </label>

            <label className="flex items-center justify-between bg-[#1c1714] border border-[#382d23] rounded px-3 py-2 cursor-pointer">
              <span className="text-xs text-[#e7dec8]">Mute Audio</span>
              <input
                type="checkbox"
                checked={settings.muted}
                onChange={(e) => onChange({ ...settings, muted: e.target.checked })}
                className="accent-[#c89b3c]"
              />
            </label>
          </div>

          {/* Physics Tuning */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#1c1714] border border-[#382d23] rounded px-3 py-2">
              <div className="text-[11px] text-[#a69882] mb-1.5">Physics Rate</div>
              <div className="flex gap-2">
                {([60, 90] as const).map((hz) => (
                  <button
                    key={hz}
                    onClick={() => onChange({ ...settings, physicsHz: hz })}
                    className={`flex-1 py-1 rounded text-xs font-semibold border cursor-pointer ${
                      settings.physicsHz === hz
                        ? 'bg-[#2e241b] border-[#c89b3c] text-[#f2e8d5]'
                        : 'bg-[#14100e] border-[#382d23] text-[#9b8d77]'
                    }`}
                  >
                    {hz} Hz
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#1c1714] border border-[#382d23] rounded px-3 py-2">
              <div className="text-[11px] text-[#a69882] mb-1.5">Physics Substeps</div>
              <div className="flex gap-2">
                {([1, 2] as const).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => onChange({ ...settings, physicsSubsteps: sub })}
                    className={`flex-1 py-1 rounded text-xs font-semibold border cursor-pointer ${
                      settings.physicsSubsteps === sub
                        ? 'bg-[#2e241b] border-[#c89b3c] text-[#f2e8d5]'
                        : 'bg-[#14100e] border-[#382d23] text-[#9b8d77]'
                    }`}
                  >
                    {sub}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sliders */}
          <div className="bg-[#1c1714] border border-[#382d23] rounded px-3 py-2.5 flex flex-col gap-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#e7dec8]">Mouse / Touch Sensitivity</span>
                <span className="tabular-nums text-[#c89b3c]">
                  {settings.mouseSensitivity.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={0.4}
                max={2.2}
                step={0.1}
                value={settings.mouseSensitivity}
                onChange={(e) =>
                  onChange({ ...settings, mouseSensitivity: parseFloat(e.target.value) })
                }
                className="w-full accent-[#c89b3c]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#e7dec8]">Master Audio Volume</span>
                <span className="tabular-nums text-[#c89b3c]">
                  {Math.round(settings.masterVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.masterVolume}
                onChange={(e) =>
                  onChange({ ...settings, masterVolume: parseFloat(e.target.value) })
                }
                className="w-full accent-[#c89b3c]"
              />
            </div>
          </div>

          {/* Live Physics Verification Diagnostics */}
          <div className="border-t border-[#382d23] pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider text-[#a69882] font-semibold">
                Physics Engine Self-Test
              </span>
              <button
                onClick={runDiagnostics}
                disabled={diagRunning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#231c17] hover:bg-[#302720] border border-[#c89b3c]/70 text-xs text-[#e6c373] cursor-pointer disabled:opacity-50"
              >
                <Activity className="w-3.5 h-3.5" />
                {diagRunning ? 'Running...' : 'Run Physics Tests'}
              </button>
            </div>
            {diagResults && (
              <div className="flex flex-col gap-1.5 bg-[#100d0b] border border-[#382d23] rounded p-2.5 text-[11px]">
                {diagResults.map((r) => (
                  <div key={r.name} className="flex items-start gap-2">
                    {r.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="text-[#efe4cf] font-medium">
                        {r.name} ({r.durationMs}ms)
                      </div>
                      <div className="text-[#9b8d77]">{r.details}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
