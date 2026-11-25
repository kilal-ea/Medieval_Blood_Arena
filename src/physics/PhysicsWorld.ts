import * as THREE from 'three';
import { RAPIER } from './RapierLoader';
import type { ColliderMetadata } from '../core/types';

/**
 * Collision group bitmasks (16-bit membership + 16-bit filter packed into 32-bit uint):
 * (membership << 16) | filter
 */
export const CollisionBit = {
  ENVIRONMENT: 0x0001,
  WEAPON: 0x0002,
  FIGHTER_0: 0x0004,
  FIGHTER_1: 0x0008,
  FIGHTER_2: 0x0010,
  FIGHTER_3: 0x0020,
  FIGHTER_4: 0x0040,
  FIGHTER_5: 0x0080,
  DUMMY: 0x0100,
} as const;

export const ALL_FIGHTERS_MASK =
  CollisionBit.FIGHTER_0 |
  CollisionBit.FIGHTER_1 |
  CollisionBit.FIGHTER_2 |
  CollisionBit.FIGHTER_3 |
  CollisionBit.FIGHTER_4 |
  CollisionBit.FIGHTER_5;

export function makeCollisionGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export interface InterpolatedBodyRecord {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  currQuat: THREE.Quaternion;
  offsetPos?: THREE.Vector3;
}

const _interpPos = new THREE.Vector3();
const _interpQuat = new THREE.Quaternion();
const _offsetVec = new THREE.Vector3();

export class PhysicsWorld {
  public readonly world: RAPIER.World;
  public readonly eventQueue: RAPIER.EventQueue;
  public fixedDt: number;
  public maxSubsteps: number;

  private accumulator = 0;
  private colliderMeta = new Map<number, ColliderMetadata>();
  private interpolated = new Map<number, InterpolatedBodyRecord>();

  public lastStepDurationMs = 0;

  constructor(hz: 60 | 90 = 60, maxSubsteps = 2) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.fixedDt = 1 / hz;
    this.maxSubsteps = maxSubsteps;
    this.world.timestep = this.fixedDt;
    this.world.numSolverIterations = 10;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  configure(hz: 60 | 90, substeps: 1 | 2, solverIterations: number): void {
    this.fixedDt = 1 / hz;
    this.maxSubsteps = substeps;
    this.world.timestep = this.fixedDt / substeps;
    this.world.numSolverIterations = solverIterations;
  }

  registerColliderMeta(handle: number, meta: ColliderMetadata): void {
    this.colliderMeta.set(handle, meta);
  }

  unregisterColliderMeta(handle: number): void {
    this.colliderMeta.delete(handle);
  }

  getColliderMeta(handle: number): ColliderMetadata | undefined {
    return this.colliderMeta.get(handle);
  }

  registerInterpolated(body: RAPIER.RigidBody, mesh: THREE.Object3D, offsetPos?: THREE.Vector3): void {
    const p = body.translation();
    const r = body.rotation();
    const rec: InterpolatedBodyRecord = {
      body,
      mesh,
      prevPos: new THREE.Vector3(p.x, p.y, p.z),
      currPos: new THREE.Vector3(p.x, p.y, p.z),
      prevQuat: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      currQuat: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      offsetPos,
    };
    this.interpolated.set(body.handle, rec);
  }

  unregisterInterpolated(bodyHandle: number): void {
    this.interpolated.delete(bodyHandle);
  }

  snapInterpolation(body: RAPIER.RigidBody): void {
    const rec = this.interpolated.get(body.handle);
    if (!rec) return;
    const p = body.translation();
    const r = body.rotation();
    rec.prevPos.set(p.x, p.y, p.z);
    rec.currPos.set(p.x, p.y, p.z);
    rec.prevQuat.set(r.x, r.y, r.z, r.w);
    rec.currQuat.set(r.x, r.y, r.z, r.w);
  }

  /**
   * Advances physics with fixed timestep + substep support and updates interpolation buffers.
   */
  step(
    frameDt: number,
    onFixedStep: (dt: number) => void,
    onPostPhysicsStep: (dt: number) => void,
  ): number {
    const clampedDt = Math.min(frameDt, 0.05);
    this.accumulator += clampedDt;
    const startMs = performance.now();

    let stepsRun = 0;
    const maxStepsPerFrame = 3;

    while (this.accumulator >= this.fixedDt && stepsRun < maxStepsPerFrame) {
      // Snapshot previous transforms before step
      for (const rec of this.interpolated.values()) {
        rec.prevPos.copy(rec.currPos);
        rec.prevQuat.copy(rec.currQuat);
      }

      const subDt = this.fixedDt / this.maxSubsteps;
      this.world.timestep = subDt;

      for (let s = 0; s < this.maxSubsteps; s++) {
        onFixedStep(subDt);
        this.world.step(this.eventQueue);
        onPostPhysicsStep(subDt);
      }

      // Capture latest transforms
      for (const rec of this.interpolated.values()) {
        const p = rec.body.translation();
        const r = rec.body.rotation();
        rec.currPos.set(p.x, p.y, p.z);
        rec.currQuat.set(r.x, r.y, r.z, r.w);
      }

      this.accumulator -= this.fixedDt;
      stepsRun++;
    }

    if (stepsRun >= maxStepsPerFrame && this.accumulator > this.fixedDt) {
      this.accumulator = this.fixedDt * 0.5;
    }

    const alpha = THREE.MathUtils.clamp(this.accumulator / this.fixedDt, 0, 1);
    for (const rec of this.interpolated.values()) {
      _interpPos.lerpVectors(rec.prevPos, rec.currPos, alpha);
      _interpQuat.slerpQuaternions(rec.prevQuat, rec.currQuat, alpha);
      if (rec.offsetPos) {
        _offsetVec.copy(rec.offsetPos).applyQuaternion(_interpQuat);
        _interpPos.add(_offsetVec);
      }
      rec.mesh.position.copy(_interpPos);
      rec.mesh.quaternion.copy(_interpQuat);
    }

    this.lastStepDurationMs = performance.now() - startMs;
    return stepsRun;
  }

  getActiveBodyCount(): number {
    return this.world.bodies.len();
  }

  dispose(): void {
    this.interpolated.clear();
    this.colliderMeta.clear();
    this.eventQueue.free();
    this.world.free();
  }
}
