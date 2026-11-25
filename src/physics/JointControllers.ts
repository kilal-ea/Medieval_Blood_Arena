import * as THREE from 'three';
import type { RAPIER } from './RapierLoader';

const _currQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();
const _errQuat = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _angVel = new THREE.Vector3();
const _torque = new THREE.Vector3();
const _inertia = { x: 0.01, y: 0.01, z: 0.01 };

/**
 * Computes a dt-scaled world-space PD orientation torque impulse to drive a rigid body
 * toward a desired world quaternion without teleporting, framerate drift, or discrete damping ringing.
 *
 * @param kp Continuous proportional stiffness (N*m / rad)
 * @param kd Continuous angular damping (N*m*s / rad)
 * @param maxTorque Continuous maximum torque (N*m)
 * @param dt Fixed physics substep duration (seconds)
 * @param scale Muscle authority multiplier (0..1+)
 * @param extraInertia Optional extra rotational inertia (kg*m^2) from rigidly attached weapon
 */
export function applyOrientationPDTorque(
  body: RAPIER.RigidBody,
  targetQuat: THREE.Quaternion,
  kp: number,
  kd: number,
  maxTorque: number,
  dt: number,
  scale = 1,
  extraInertia = 0,
): void {
  if (scale <= 0.001 || dt <= 1e-6) return;

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
    const s = Math.sqrt(Math.max(1e-8, 1 - clampedW * clampedW));
    _axis.set(_errQuat.x / s, _errQuat.y / s, _errQuat.z / s);
  } else {
    _axis.set(0, 0, 0);
  }

  const av = body.angvel();
  _angVel.set(av.x, av.y, av.z);

  // Safeguard discrete damping against reversing angular velocity on low-inertia limbs
  body.principalInertia(_inertia);
  const minInertia = Math.max(0.0008, Math.min(_inertia.x, _inertia.y, _inertia.z)) + extraInertia;
  const maxSafeKd = (0.72 * minInertia) / dt;
  const effectiveKd = Math.min(kd * scale, maxSafeKd);

  _torque
    .copy(_axis)
    .multiplyScalar(angle * kp * scale)
    .addScaledVector(_angVel, -effectiveKd);

  const lenSq = _torque.lengthSq();
  const maxAllowed = maxTorque * scale;
  if (lenSq > maxAllowed * maxAllowed) {
    _torque.multiplyScalar(maxAllowed / Math.sqrt(lenSq));
  }

  body.applyTorqueImpulse(
    { x: _torque.x * dt, y: _torque.y * dt, z: _torque.z * dt },
    true,
  );
}

/**
 * Applies a dt-consistent exponential velocity-matching impulse to track target velocities
 * without overshoot across any physics timestep or substep configuration.
 *
 * @param accelRate Exponential tracking rate (1/s)
 * @param maxForce Continuous maximum force (N)
 * @param dt Fixed physics substep duration (seconds)
 */
export function applyLinearVelocityAssist(
  body: RAPIER.RigidBody,
  targetVx: number,
  targetVy: number | null,
  targetVz: number,
  accelRate: number,
  maxForce: number,
  dt: number,
): void {
  if (dt <= 1e-6 || maxForce <= 0.001) return;

  const lv = body.linvel();
  const mass = body.mass();
  // Exact discrete exponential relaxation factor bounded strictly in [0, 1)
  const alpha = 1 - Math.exp(-accelRate * dt);

  let ix = (targetVx - lv.x) * mass * alpha;
  let iy = targetVy !== null ? (targetVy - lv.y) * mass * alpha : 0;
  let iz = (targetVz - lv.z) * mass * alpha;

  const maxImpulse = maxForce * dt;
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
 * Applies a Newton's 3rd Law internal spring-damper between a child segment (e.g. hand)
 * and its reaction torso segment (e.g. chest). Damping uses relative velocity so whole-body
 * locomotion does not experience arm drag, and equal-and-opposite impulse prevents idle drift.
 *
 * @param stiffness Continuous spring stiffness (N/m)
 * @param damping Continuous spring damping (N*s/m)
 * @param maxForce Continuous maximum force (N)
 * @param dt Fixed physics substep duration (seconds)
 * @param extraChildMass Optional held weapon mass (kg)
 */
export function applyInternalPositionSpring(
  childBody: RAPIER.RigidBody,
  reactionBody: RAPIER.RigidBody,
  targetPos: THREE.Vector3,
  stiffness: number,
  damping: number,
  maxForce: number,
  dt: number,
  extraChildMass = 0,
): void {
  if (dt <= 1e-6 || maxForce <= 0.001) return;

  const p = childBody.translation();
  const v = childBody.linvel();
  const rv = reactionBody.linvel();

  const relVx = v.x - rv.x;
  const relVy = v.y - rv.y;
  const relVz = v.z - rv.z;

  const m1 = childBody.mass() + extraChildMass;
  const m2 = reactionBody.mass();
  const reducedMass = (m1 * m2) / Math.max(0.01, m1 + m2);
  const safeDamping = Math.min(damping, (0.72 * reducedMass) / dt);

  let fx = (targetPos.x - p.x) * stiffness - relVx * safeDamping;
  let fy = (targetPos.y - p.y) * stiffness - relVy * safeDamping;
  let fz = (targetPos.z - p.z) * stiffness - relVz * safeDamping;

  const mag = Math.hypot(fx, fy, fz);
  if (mag > maxForce && mag > 1e-6) {
    const s = maxForce / mag;
    fx *= s;
    fy *= s;
    fz *= s;
  }

  const ix = fx * dt;
  const iy = fy * dt;
  const iz = fz * dt;

  childBody.applyImpulse({ x: ix, y: iy, z: iz }, true);
  reactionBody.applyImpulse({ x: -ix, y: -iy, z: -iz }, true);
}

/**
 * Smoothly caps angular velocity above a physical safety ceiling without abrupt zeroing,
 * preventing energy runaway during rapid wrist flicks or high-mass weapon collisions.
 */
export function softClampBodyAngularVelocity(
  body: RAPIER.RigidBody,
  maxAngVel: number,
): void {
  const av = body.angvel();
  const magSq = av.x * av.x + av.y * av.y + av.z * av.z;
  if (magSq <= maxAngVel * maxAngVel) return;
  const mag = Math.sqrt(magSq);
  const scale = maxAngVel / mag;
  body.setAngvel({ x: av.x * scale, y: av.y * scale, z: av.z * scale }, true);
}
