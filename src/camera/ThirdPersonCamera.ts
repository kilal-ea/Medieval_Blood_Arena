import * as THREE from 'three';

const _desiredPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();

export class ThirdPersonCamera {
  public yaw = 0;
  public pitch = 0.24;
  public distance = 3.55;

  private currentPos = new THREE.Vector3(0, 2.5, 4.5);
  private currentLook = new THREE.Vector3(0, 1.2, 0);
  private titleOrbitAngle = 0.35;

  constructor(public readonly camera: THREE.PerspectiveCamera) {}

  public resetBehind(yaw: number, targetPos: THREE.Vector3): void {
    this.yaw = yaw;
    this.pitch = 0.24;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    this.currentPos.set(
      targetPos.x + sinY * this.distance,
      targetPos.y + 1.35 + Math.sin(this.pitch) * this.distance * 0.5,
      targetPos.z + cosY * this.distance,
    );
    this.currentLook.set(targetPos.x, targetPos.y + 0.45, targetPos.z);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  public addInputDelta(yawDelta: number, pitchDelta: number): void {
    this.yaw += yawDelta;
    this.pitch = THREE.MathUtils.clamp(this.pitch - pitchDelta, -0.25, 1.05);
  }

  public updateTitleOrbit(dt: number): void {
    this.titleOrbitAngle += dt * 0.14;
    const radius = 8.8;
    const cx = Math.sin(this.titleOrbitAngle) * radius;
    const cz = Math.cos(this.titleOrbitAngle) * radius;
    _desiredPos.set(cx, 3.6 + Math.sin(this.titleOrbitAngle * 0.7) * 0.35, cz);
    _desiredLook.set(0, 1.25, 0);

    this.currentPos.lerp(_desiredPos, 1 - Math.exp(-3.5 * dt));
    this.currentLook.lerp(_desiredLook, 1 - Math.exp(-3.5 * dt));
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  public updateCombat(
    dt: number,
    playerPelvisPos: THREE.Vector3,
    shakeIntensity: number,
  ): void {
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const horizDist = Math.cos(this.pitch * 0.65) * this.distance;
    const vertOffset = 0.85 + Math.sin(this.pitch) * this.distance * 0.75;

    // Slight right-shoulder offset for clear view of weapon & opponent
    const shoulderOffsetX = cosY * 0.34;
    const shoulderOffsetZ = -sinY * 0.34;

    _desiredPos.set(
      playerPelvisPos.x + sinY * horizDist + shoulderOffsetX,
      Math.max(0.55, playerPelvisPos.y + vertOffset),
      playerPelvisPos.z + cosY * horizDist + shoulderOffsetZ,
    );

    // Keep camera inside arena radius so walls never occlude player
    const radialDist = Math.hypot(_desiredPos.x, _desiredPos.z);
    if (radialDist > 13.8) {
      const scale = 13.8 / radialDist;
      _desiredPos.x *= scale;
      _desiredPos.z *= scale;
    }

    _desiredLook.set(
      playerPelvisPos.x - sinY * 1.4,
      playerPelvisPos.y + 0.42 - this.pitch * 0.4,
      playerPelvisPos.z - cosY * 1.4,
    );

    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, _desiredPos.x, 12, dt);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, _desiredPos.y, 12, dt);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, _desiredPos.z, 12, dt);

    this.currentLook.x = THREE.MathUtils.damp(this.currentLook.x, _desiredLook.x, 16, dt);
    this.currentLook.y = THREE.MathUtils.damp(this.currentLook.y, _desiredLook.y, 16, dt);
    this.currentLook.z = THREE.MathUtils.damp(this.currentLook.z, _desiredLook.z, 16, dt);

    this.camera.position.copy(this.currentPos);
    if (shakeIntensity > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * shakeIntensity;
      this.camera.position.z += (Math.random() - 0.5) * shakeIntensity;
    }
    this.camera.lookAt(this.currentLook);
  }
}
