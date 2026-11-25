import type { CombatEvent, MatchHudSnapshot, MatchResult } from './types';

export interface EngineEvents {
  hudUpdate: MatchHudSnapshot;
  matchEnded: MatchResult;
  combatEvent: CombatEvent;
  pauseRequested: void;
}

type Listener<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<keyof EngineEvents, Set<Listener<unknown>>>();

  on<K extends keyof EngineEvents>(event: K, listener: Listener<EngineEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => {
      set?.delete(listener as Listener<unknown>);
    };
  }

  emit<K extends keyof EngineEvents>(event: K, payload: EngineEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      (fn as Listener<EngineEvents[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
