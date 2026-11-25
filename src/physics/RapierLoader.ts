import RAPIER from '@dimforge/rapier3d-compat';

let initialized = false;
let initPromise: Promise<typeof RAPIER> | null = null;

export async function loadRapier(): Promise<typeof RAPIER> {
  if (initialized) return RAPIER;
  if (!initPromise) {
    initPromise = RAPIER.init().then(() => {
      initialized = true;
      return RAPIER;
    });
  }
  return initPromise;
}

export { RAPIER };
