import * as THREE from 'three';

interface PooledParticle {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  gravity: number;
  kind: 'spark' | 'blood' | 'dust';
}

const _dummy = new THREE.Object3D();

export class ParticlePool {
  private readonly maxPerKind = 96;
  private readonly sparks: PooledParticle[] = [];
  private readonly blood: PooledParticle[] = [];
  private readonly dust: PooledParticle[] = [];

  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly bloodMesh: THREE.InstancedMesh;
  private readonly dustMesh: THREE.InstancedMesh;

  public reducedMode = false;

  constructor(private readonly scene: THREE.Scene) {
    const sparkGeo = new THREE.BoxGeometry(0.025, 0.025, 0.08);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc857 });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, this.maxPerKind);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.count = 0;

    const bloodGeo = new THREE.SphereGeometry(0.028, 5, 5);
    const bloodMat = new THREE.MeshStandardMaterial({
      color: 0x7c1212,
      roughness: 0.35,
      metalness: 0.05,
    });
    this.bloodMesh = new THREE.InstancedMesh(bloodGeo, bloodMat, this.maxPerKind);
    this.bloodMesh.frustumCulled = false;
    this.bloodMesh.count = 0;

    const dustGeo = new THREE.DodecahedronGeometry(0.06, 0);
    const dustMat = new THREE.MeshStandardMaterial({
      color: 0xa6947a,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.65,
    });
    this.dustMesh = new THREE.InstancedMesh(dustGeo, dustMat, this.maxPerKind);
    this.dustMesh.frustumCulled = false;
    this.dustMesh.count = 0;

    scene.add(this.sparkMesh, this.bloodMesh, this.dustMesh);

    for (let i = 0; i < this.maxPerKind; i++) {
      this.sparks.push(this.createEmpty('spark'));
      this.blood.push(this.createEmpty('blood'));
      this.dust.push(this.createEmpty('dust'));
    }
  }

  private createEmpty(kind: 'spark' | 'blood' | 'dust'): PooledParticle {
    return {
      active: false,
      life: 0,
      maxLife: 0.4,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      scale: 1,
      gravity: kind === 'dust' ? -1.5 : -9.8,
      kind,
    };
  }

  public spawnSparks(origin: { x: number; y: number; z: number }, count = 12): void {
    const n = this.reducedMode ? Math.max(3, Math.floor(count * 0.4)) : count;
    this.spawnBurst(this.sparks, origin, n, 4.8, 0.28, 1.0);
  }

  public spawnBlood(origin: { x: number; y: number; z: number }, count = 7): void {
    const n = this.reducedMode ? Math.max(2, Math.floor(count * 0.4)) : count;
    this.spawnBurst(this.blood, origin, n, 2.8, 0.42, 0.9);
  }

  public spawnDust(origin: { x: number; y: number; z: number }, count = 6): void {
    const n = this.reducedMode ? Math.max(2, Math.floor(count * 0.4)) : count;
    this.spawnBurst(this.dust, origin, n, 1.8, 0.55, 1.1);
  }

  private spawnBurst(
    pool: PooledParticle[],
    origin: { x: number; y: number; z: number },
    count: number,
    speed: number,
    life: number,
    scale: number,
  ): void {
    let spawned = 0;
    for (let i = 0; i < pool.length && spawned < count; i++) {
      const p = pool[i];
      if (!p.active) {
        p.active = true;
        p.life = life * (0.7 + Math.random() * 0.5);
        p.maxLife = p.life;
        p.pos.set(origin.x, origin.y, origin.z);
        p.vel.set(
          (Math.random() - 0.5) * speed * 1.4,
          Math.random() * speed * 0.9 + 0.5,
          (Math.random() - 0.5) * speed * 1.4,
        );
        p.scale = scale * (0.75 + Math.random() * 0.5);
        spawned++;
      }
    }
  }

  public update(dt: number): void {
    this.updatePool(this.sparks, this.sparkMesh, dt);
    this.updatePool(this.blood, this.bloodMesh, dt);
    this.updatePool(this.dust, this.dustMesh, dt);
  }

  private updatePool(pool: PooledParticle[], mesh: THREE.InstancedMesh, dt: number): void {
    let activeCount = 0;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0 || p.pos.y < -0.5) {
        p.active = false;
        continue;
      }

      p.vel.y += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.02) {
        p.pos.y = 0.02;
        p.vel.y *= -0.35;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }

      const lifeRatio = Math.max(0.05, p.life / p.maxLife);
      _dummy.position.copy(p.pos);
      if (p.kind === 'spark' && p.vel.lengthSq() > 0.01) {
        _dummy.lookAt(
          p.pos.x + p.vel.x,
          p.pos.y + p.vel.y,
          p.pos.z + p.vel.z,
        );
      } else {
        _dummy.rotation.set(0, 0, 0);
      }
      _dummy.scale.setScalar(p.scale * lifeRatio);
      _dummy.updateMatrix();
      mesh.setMatrixAt(activeCount, _dummy.matrix);
      activeCount++;
    }
    mesh.count = activeCount;
    if (activeCount > 0) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public clear(): void {
    for (const p of this.sparks) p.active = false;
    for (const p of this.blood) p.active = false;
    for (const p of this.dust) p.active = false;
    this.sparkMesh.count = 0;
    this.bloodMesh.count = 0;
    this.dustMesh.count = 0;
  }

  public dispose(): void {
    this.scene.remove(this.sparkMesh, this.bloodMesh, this.dustMesh);
    this.sparkMesh.geometry.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
    this.bloodMesh.geometry.dispose();
    (this.bloodMesh.material as THREE.Material).dispose();
    this.dustMesh.geometry.dispose();
    (this.dustMesh.material as THREE.Material).dispose();
  }
}
