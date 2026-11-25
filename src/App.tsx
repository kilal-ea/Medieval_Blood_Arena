import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, GameEngine } from './core/GameEngine';
import type {
  GameModeId,
  GameSettings,
  KeyBindings,
  MatchHudSnapshot,
  MatchResult,
  QualityPreset,
  ScreenState,
  WeaponType,
} from './core/types';
import { TitleScreen } from './ui/TitleScreen';
import { GameHUD } from './ui/GameHUD';
import { TrainingDock } from './ui/TrainingDock';
import { MobileControls } from './ui/MobileControls';
import { PauseModal } from './ui/PauseModal';
import { MatchResultModal } from './ui/MatchResultModal';
import { SettingsModal } from './ui/SettingsModal';
import { ControlsModal } from './ui/ControlsModal';

const SETTINGS_STORAGE_KEY = 'medieval_blood_arena_settings_v1';

function loadSavedSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      keyBindings: {
        ...DEFAULT_SETTINGS.keyBindings,
        ...(parsed.keyBindings ?? {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<ScreenState>('title');
  const [activeMode, setActiveMode] = useState<GameModeId>('duel');
  const [settings, setSettings] = useState<GameSettings>(() => loadSavedSettings());
  const [hud, setHud] = useState<MatchHudSnapshot | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [sparringPaused, setSparringPaused] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const hasTouch =
      'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 820;
    setIsTouchDevice(hasTouch);
  }, []);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new GameEngine(mount);
    engineRef.current = engine;

    const unsubHud = engine.eventBus.on('hudUpdate', (snap) => {
      setHud(snap);
    });
    const unsubEnd = engine.eventBus.on('matchEnded', (res) => {
      setMatchResult(res);
      setScreen('result');
    });
    const unsubPause = engine.eventBus.on('pauseRequested', () => {
      setScreen((prev) => {
        if (prev === 'playing') {
          engine.setPaused(true);
          return 'paused';
        }
        if (prev === 'paused') {
          engine.setPaused(false);
          return 'playing';
        }
        return prev;
      });
    });

    void engine.init(loadSavedSettings()).then(() => {
      setReady(true);
    });

    return () => {
      unsubHud();
      unsubEnd();
      unsubPause();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const persistAndApplySettings = (next: GameSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
    engineRef.current?.applySettings(next);
  };

  const handleApplyQualityPreset = (preset: QualityPreset) => {
    if (!engineRef.current) return;
    const next = engineRef.current.applyQualityPreset(preset);
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleKeyBindingsChange = (bindings: KeyBindings) => {
    persistAndApplySettings({ ...settings, keyBindings: bindings });
  };

  const handleStartMode = (mode: GameModeId) => {
    if (!engineRef.current || !ready) return;
    setActiveMode(mode);
    setMatchResult(null);
    setSparringPaused(false);
    setShowSettings(false);
    setShowControls(false);
    setScreen('playing');
    engineRef.current.startMatch(mode);
  };

  const handleResume = () => {
    setScreen('playing');
    engineRef.current?.setPaused(false);
  };

  const handlePause = () => {
    setScreen('paused');
    engineRef.current?.setPaused(true);
  };

  const handleRestart = () => {
    handleStartMode(activeMode);
  };

  const handleMainMenu = () => {
    setShowSettings(false);
    setShowControls(false);
    setMatchResult(null);
    setHud(null);
    setScreen('title');
    engineRef.current?.setupTitleShowcase();
  };

  const handleEquipTrainingWeapons = (right: WeaponType, left: WeaponType | null) => {
    engineRef.current?.equipPlayerWeapons(right, left);
  };

  const handleToggleSparring = () => {
    const next = !sparringPaused;
    setSparringPaused(next);
    engineRef.current?.setTrainingOpponentPaused(next);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0e0c0b]">
      {/* Isolated WebGL Canvas Container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {!ready && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e0c0b]">
          <div className="text-center">
            <div className="font-medieval text-2xl font-bold text-[#e6c373] tracking-widest mb-2">
              MEDIEVAL BLOOD ARENA
            </div>
            <div className="text-xs text-[#a69882] tracking-wider uppercase">
              Initializing Rapier3D Physics Simulation...
            </div>
          </div>
        </div>
      )}

      {ready && screen === 'title' && (
        <TitleScreen
          onStartMode={handleStartMode}
          onOpenSettings={() => setShowSettings(true)}
          onOpenControls={() => setShowControls(true)}
        />
      )}

      {ready && screen === 'playing' && hud && (
        <>
          <GameHUD
            hud={hud}
            muted={settings.muted}
            showTelemetry={settings.showTelemetry}
            onToggleMute={() => persistAndApplySettings({ ...settings, muted: !settings.muted })}
            onPause={handlePause}
            onResetTraining={() => handleStartMode('training')}
          />

          {activeMode === 'training' && (
            <TrainingDock
              onEquipWeapons={handleEquipTrainingWeapons}
              sparringPaused={sparringPaused}
              onToggleSparring={handleToggleSparring}
            />
          )}

          {isTouchDevice && engineRef.current && (
            <MobileControls input={engineRef.current.input} />
          )}
        </>
      )}

      {ready && screen === 'paused' && !showSettings && !showControls && (
        <PauseModal
          onResume={handleResume}
          onRestart={handleRestart}
          onOpenSettings={() => setShowSettings(true)}
          onOpenControls={() => setShowControls(true)}
          onMainMenu={handleMainMenu}
        />
      )}

      {ready && screen === 'result' && matchResult && (
        <MatchResultModal
          result={matchResult}
          onRestart={handleRestart}
          onMainMenu={handleMainMenu}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={persistAndApplySettings}
          onApplyPreset={handleApplyQualityPreset}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showControls && (
        <ControlsModal
          bindings={settings.keyBindings}
          onChange={handleKeyBindingsChange}
          onClose={() => setShowControls(false)}
        />
      )}
    </div>
  );
}
