import * as THREE from 'three';
import type { RAPIER } from './RapierLoader';

const _currQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();
const _errQuat = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _angVel = new THREE.Vector3();
const _torque = new THREE.Vector3();

/**
 * Computes a world-space PD orientation torque to drive a rigid body
 * toward a desired world quaternion without teleporting or violating collisions.
 */
export function applyOrientationPDTorque(
  body: RAPIER.RigidBody,
  targetQuat: THREE.Quaternion,
  kp: number,
  kd: number,
  maxTorque: number,
  scale = 1,
): void {
  if (scale <= 0.001) return;
  const r = body.rotation();
  _currQuat.set(r.x, r.y, r.z, r.w).normalize();
  _targetQuat.copy(targetQuat).normalize();

  // Shortest-arc error quaternion: err = target * inv(current)
  if (_currQuat.dot(_targetQuat) < 0) {
    _targetQuat.set(-_targetQuat.x, -_targetQuat.y, -_targetQuat.z, -_targetQuat.w);
  }
  _errQuat.copy(_currQuat).invert().premultiply(_targetQuat);

  const clampedW = THREE.MathUtils.clamp(_errQuat.w, -1, 1);
  const angle = 2 * Math.acos(clampedW);

  if (angle > 0.0005) {
    const s = Math.sqrt(Math.max(1e-6, 1 - clampedW * clampedW));
    _axis.set(_errQuat.x / s, _errQuat.y / s, _errQuat.z / s);
  } else {
    _axis.set(0, 0, 0);
  }

  const av = body.angvel();
  _angVel.set(av.x, av.y, av.z);

  _torque
    .copy(_axis)
    .multiplyScalar(angle * kp * scale)
    .addScaledVector(_angVel, -kd * scale);

  const lenSq = _torque.lengthSq();
  const maxAllowed = maxTorque * scale;
  if (lenSq > maxAllowed * maxAllowed) {
    _torque.multiplyScalar(maxAllowed / Math.sqrt(lenSq));
  }

  body.applyTorqueImpulse({ x: _torque.x, y: _torque.y, z: _torque.z }, true);
}

/**
 * Applies a damped velocity-matching force to keep a body segment at a target height or velocity.
 */
export function applyLinearVelocityAssist(
  body: RAPIER.RigidBody,
  targetVx: number,
  targetVy: number | null,
  targetVz: number,
  gain: number,
  maxImpulse: number,
): void {
  const lv = body.linvel();
  const mass = body.mass();
  let ix = (targetVx - lv.x) * mass * gain;
  let iy = targetVy !== null ? (targetVy - lv.y) * mass * gain : 0;
  let iz = (targetVz - lv.z) * mass * gain;

  const mag = Math.hypot(ix, iy, iz);
  if (mag > maxImpulse && mag > 1e-6) {
    const s = maxImpulse / mag;
    ix *= s;
    iy *= s;
    iz *= s;
  }

  body.applyImpulse({ x: ix, y: iy, z: iz }, true);
}

/**
 * Applies a world-space spring force toward a target world position (used for hand/arm reach).
 */
export function applyWorldPositionSpring(
  body: RAPIER.RigidBody,
  targetPos: THREE.Vector3,
  stiffness: number,
  damping: number,
  maxImpulse: number,
): void {
  const p = body.translation();
  const v = body.linvel();

  let ix = (targetPos.x - p.x) * stiffness - v.x * damping;
  let iy = (targetPos.y - p.y) * stiffness - v.y * damping;
  let iz = (targetPos.z - p.z) * stiffness - v.z * damping;

  const mag = Math.hypot(ix, iy, iz);
  if (mag > maxImpulse && mag > 1e-6) {
    const s = maxImpulse / mag;
    ix *= s;
    iy *= s;
    iz *= s;
  }

  body.applyImpulse({ x: ix, y: iy, z: iz }, true);
}
