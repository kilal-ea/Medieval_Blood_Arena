import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { ColliderMetadata, CombatEvent, WeaponType } from '../core/types';
import type { ActiveRagdoll } from '../humanoid/ActiveRagdoll';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { WeaponInstance } from '../weapons/WeaponInstance';
import type { ParticlePool } from './ParticlePool';
import type { AudioEngine } from '../audio/AudioEngine';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _impulse = new THREE.Vector3();

export interface TrainingDummyTarget {
  colliderHandle: number;
  body: { applyImpulse(v: { x: number; y: number; z: number }, wakeUp: boolean): void };
  onHit: (damage: number, pos: { x: number; y: number; z: number }) => void;
}

export class CombatSystem {
  private pairCooldown = new Map<string, number>();
  private elapsedTime = 0;

  public hitstopTimer = 0;
  public cameraShake = 0;

  // Match telemetry stats for player
  public playerDamageDealt = 0;
  public playerParries = 0;
  public playerDisarms = 0;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly eventBus: EventBus,
    private readonly particles: ParticlePool,
    private readonly audio: AudioEngine,
  ) {}

  public resetStats(): void {
    this.pairCooldown.clear();
    this.playerDamageDealt = 0;
    this.playerParries = 0;
    this.playerDisarms = 0;
    this.hitstopTimer = 0;
    this.cameraShake = 0;
  }

  public step(
    dt: number,
    fighters: Map<string, ActiveRagdoll>,
    weapons: Map<string, WeaponInstance>,
    dummies: TrainingDummyTarget[],
  ): void {
    this.elapsedTime += dt;

    // Drain Rapier contact force events
    this.physics.eventQueue.drainContactForceEvents((event) => {
      const h1 = event.collider1();
      const h2 = event.collider2();
      const meta1 = this.physics.getColliderMeta(h1);
      const meta2 = this.physics.getColliderMeta(h2);
      if (!meta1 || !meta2) return;

      const forceMag = event.totalForceMagnitude();
      const dir = event.maxForceDirection();
      this.handleContactPair(
        h1,
        h2,
        meta1,
        meta2,
        forceMag,
        dir,
        fighters,
        weapons,
        dummies,
      );
    });

    // Also drain collision events (mainly for fast started contacts & footstep dust)
    this.physics.eventQueue.drainCollisionEvents((_h1, _h2, _started) => {
      // Handled smoothly via contact force events and weapon kinematics
    });
  }

  private getCooldownKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private isOnCooldown(key: string, minGap = 0.2): boolean {
    const prev = this.pairCooldown.get(key) ?? -10;
    if (this.elapsedTime - prev < minGap) return true;
    this.pairCooldown.set(key, this.elapsedTime);
    return false;
  }

  private handleContactPair(
    h1: number,
    h2: number,
    meta1: ColliderMetadata,
    meta2: ColliderMetadata,
    forceMag: number,
    forceDir: { x: number; y: number; z: number },
    fighters: Map<string, ActiveRagdoll>,
    weapons: Map<string, WeaponInstance>,
    dummies: TrainingDummyTarget[],
  ): void {
    // 1. Weapon vs Weapon or Weapon vs Shield (Parry / Block / Deflect)
    if (
      (meta1.kind === 'weapon' || meta1.kind === 'shield') &&
      (meta2.kind === 'weapon' || meta2.kind === 'shield')
    ) {
      const w1 = meta1.weaponId ? weapons.get(meta1.weaponId) : undefined;
      const w2 = meta2.weaponId ? weapons.get(meta2.weaponId) : undefined;
      if (!w1 || !w2) return;
      if (w1.ownerId && w1.ownerId === w2.ownerId) return; // Same wielder
      if (!w1.ownerId && !w2.ownerId) return; // Loose weapons clattering on floor

      const key = this.getCooldownKey(w1.id, w2.id);
      if (this.isOnCooldown(key, 0.22)) return;

      _relVel.copy(w1.sweetSpotVelocity).sub(w2.sweetSpotVelocity);
      const impactSpeed = _relVel.length();
      if (impactSpeed < 1.8 && forceMag < 25) return;

      const midPos = {
        x: (w1.sweetSpotWorld.x + w2.sweetSpotWorld.x) * 0.5,
        y: (w1.sweetSpotWorld.y + w2.sweetSpotWorld.y) * 0.5,
        z: (w1.sweetSpotWorld.z + w2.sweetSpotWorld.z) * 0.5,
      };

      const isShieldInvolvement = w1.spec.isShield || w2.spec.isShield;
      this.particles.spawnSparks(midPos, isShieldInvolvement ? 9 : 14);
      this.audio.playClang(isShieldInvolvement ? 'shield' : 'steel', Math.min(1, impactSpeed / 10));
      this.cameraShake = Math.max(this.cameraShake, 0.08);
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.032);

      // Deflection impulse & stamina / grip shock
      const deflectMag = Math.min(14, impactSpeed * 1.15);
      _impulse.set(forceDir.x * deflectMag, Math.abs(forceDir.y) * 2 + 1.5, forceDir.z * deflectMag);
      w1.body.applyImpulse({ x: -_impulse.x, y: _impulse.y, z: -_impulse.z }, true);
      w2.body.applyImpulse({ x: _impulse.x, y: _impulse.y, z: _impulse.z }, true);

      const f1 = w1.ownerId ? fighters.get(w1.ownerId) : undefined;
      const f2 = w2.ownerId ? fighters.get(w2.ownerId) : undefined;

      if (f1?.isPlayer || f2?.isPlayer) {
        this.playerParries++;
      }

      // Check physical disarm on heavy clashes!
      if (f1 && w1.heldSide && impactSpeed > 6.2) {
        const disarmed = f1.armController.applyGripImpact(
          this.physics,
          w1.heldSide,
          impactSpeed * w2.spec.mass * 2.1,
        );
        if (disarmed) {
          if (f2?.isPlayer) this.playerDisarms++;
          this.emitEvent('disarm', 0, impactSpeed, f2?.id ?? 'world', f1.id, w1.type, midPos);
        }
      }
      if (f2 && w2.heldSide && impactSpeed > 6.2) {
        const disarmed = f2.armController.applyGripImpact(
          this.physics,
          w2.heldSide,
          impactSpeed * w1.spec.mass * 2.1,
        );
        if (disarmed) {
          if (f1?.isPlayer) this.playerDisarms++;
          this.emitEvent('disarm', 0, impactSpeed, f1?.id ?? 'world', f2.id, w2.type, midPos);
        }
      }

      this.emitEvent(
        isShieldInvolvement ? 'shield_block' : 'parry',
        0,
        impactSpeed,
        w1.ownerId ?? 'env',
        w2.ownerId ?? 'env',
        w1.type,
        midPos,
      );
      return;
    }

    // 2. Weapon vs Body Segment
    if (
      (meta1.kind === 'weapon' && meta2.kind === 'body') ||
      (meta2.kind === 'weapon' && meta1.kind === 'body')
    ) {
      const wMeta = meta1.kind === 'weapon' ? meta1 : meta2;
      const bMeta = meta1.kind === 'body' ? meta1 : meta2;
      const weapon = wMeta.weaponId ? weapons.get(wMeta.weaponId) : undefined;
      const defender = bMeta.fighterId ? fighters.get(bMeta.fighterId) : undefined;
      if (!weapon || !defender || !weapon.ownerId || weapon.ownerId === defender.id) return;

      const attacker = fighters.get(weapon.ownerId);
      if (!attacker || attacker.isDead) return;

      const key = this.getCooldownKey(weapon.id, defender.id);
      if (this.isOnCooldown(key, 0.24)) return;

      const partId = bMeta.bodyPart ?? 'chest';
      const targetBody = defender.bodies[partId];
      const bv = targetBody.linvel();
      _v1.set(bv.x, bv.y, bv.z);
      _relVel.copy(weapon.sweetSpotVelocity).sub(_v1);
      const impactSpeed = _relVel.length();

      if (impactSpeed < 2.2) return;

      // Cutting direction & thrust alignment approximation
      _v2.copy(_relVel).normalize();
      const edgeAlign = Math.abs(_v2.dot(weapon.edgeWorldDir));
      const thrustAlign = Math.max(0, _v2.dot(weapon.thrustAxisWorld));
      const strikeQuality = Math.max(
        0.35,
        weapon.spec.cutRatio * (0.45 + 0.65 * edgeAlign) +
          weapon.spec.bluntRatio * 0.85 +
          weapon.spec.thrustRatio * thrustAlign * 0.65,
      );

      const speedFactor = THREE.MathUtils.clamp((impactSpeed - 1.5) / 8.5, 0.2, 1.85);
      const armorMitigation = 1 - (bMeta.armorRating ?? 0.25) * (weapon.spec.bluntRatio > 0.7 ? 0.35 : 0.68);
      const zoneMult = bMeta.damageMultiplier ?? 1.0;

      const rawDamage =
        weapon.spec.baseDamage *
        (0.65 + weapon.spec.mass * 0.22) *
        speedFactor *
        strikeQuality *
        armorMitigation *
        zoneMult;
      const finalDamage = Math.max(2, Math.round(rawDamage));

      const tp = targetBody.translation();
      const hitPos = { x: tp.x, y: tp.y, z: tp.z };

      const balanceShock =
        (0.14 + weapon.spec.mass * 0.1) *
        speedFactor *
        (weapon.spec.bluntRatio > 0.6 ? 1.45 : 1.0);

      _impulse
        .copy(_v2)
        .multiplyScalar(Math.min(26, impactSpeed * weapon.spec.mass * 1.45));
      _impulse.y += 2.0;

      const wasKnocked = defender.isKnockedDown;
      const wasDead = defender.isDead;
      defender.applyDamage(finalDamage, balanceShock, partId, _impulse);

      if (attacker.isPlayer) {
        this.playerDamageDealt += finalDamage;
      }

      // Visual & Audio feedback
      const armoredZone = (bMeta.armorRating ?? 0) > 0.4;
      if (armoredZone) {
        this.particles.spawnSparks(hitPos, 6);
      }
      this.particles.spawnBlood(hitPos, finalDamage > 18 ? 10 : 6);
      this.audio.playImpact(armoredZone ? 'armor' : 'flesh', Math.min(1, impactSpeed / 9));

      if (attacker.isPlayer || defender.isPlayer) {
        this.cameraShake = Math.max(this.cameraShake, finalDamage > 20 ? 0.22 : 0.1);
        this.hitstopTimer = Math.max(this.hitstopTimer, finalDamage > 22 ? 0.055 : 0.032);
      }

      this.emitEvent('hit', finalDamage, impactSpeed, attacker.id, defender.id, weapon.type, hitPos);

      if (!wasKnocked && defender.isKnockedDown && !defender.isDead) {
        this.emitEvent('knockdown', finalDamage, impactSpeed, attacker.id, defender.id, weapon.type, hitPos);
      }
      if (!wasDead && defender.isDead) {
        this.emitEvent('death', finalDamage, impactSpeed, attacker.id, defender.id, weapon.type, hitPos);
      }
      return;
    }

    // 3. Weapon vs Training Dummy
    if (
      (meta1.kind === 'weapon' && meta2.kind === 'dummy') ||
      (meta2.kind === 'weapon' && meta1.kind === 'dummy')
    ) {
      const wMeta = meta1.kind === 'weapon' ? meta1 : meta2;
      const dHandle = meta1.kind === 'dummy' ? h1 : h2;
      const weapon = wMeta.weaponId ? weapons.get(wMeta.weaponId) : undefined;
      const dummy = dummies.find((d) => d.colliderHandle === dHandle);
      if (!weapon || !dummy) return;

      const key = this.getCooldownKey(weapon.id, `dummy_${dHandle}`);
      if (this.isOnCooldown(key, 0.22)) return;

      const speed = weapon.sweetSpotVelocity.length();
      if (speed < 2.0) return;

      const dmg = Math.round(weapon.spec.baseDamage * THREE.MathUtils.clamp(speed / 8, 0.3, 1.5));
      this.particles.spawnDust(weapon.sweetSpotWorld, 7);
      this.audio.playImpact('wood', Math.min(1, speed / 9));
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.025);
      dummy.body.applyImpulse(
        {
          x: weapon.sweetSpotVelocity.x * weapon.spec.mass * 0.9,
          y: 1.5,
          z: weapon.sweetSpotVelocity.z * weapon.spec.mass * 0.9,
        },
        true,
      );
      dummy.onHit(dmg, weapon.sweetSpotWorld);
      return;
    }

    // 4. Unarmed Hand/Forearm Punch vs Body
    if (
      meta1.kind === 'body' &&
      meta2.kind === 'body' &&
      meta1.fighterId &&
      meta2.fighterId &&
      meta1.fighterId !== meta2.fighterId
    ) {
      const isHand1 = meta1.bodyPart === 'handL' || meta1.bodyPart === 'handR';
      const isHand2 = meta2.bodyPart === 'handL' || meta2.bodyPart === 'handR';
      if (!isHand1 && !isHand2) return;

      const attackerMeta = isHand1 ? meta1 : meta2;
      const defenderMeta = isHand1 ? meta2 : meta1;
      const attacker = fighters.get(attackerMeta.fighterId!);
      const defender = fighters.get(defenderMeta.fighterId!);
      if (!attacker || !defender || attacker.isDead || defender.isDead) return;

      const handPart = attackerMeta.bodyPart!;
      const handBody = attacker.bodies[handPart];
      const hv = handBody.linvel();
      const speed = Math.hypot(hv.x, hv.y, hv.z);
      if (speed < 3.8) return;

      const key = this.getCooldownKey(`${attacker.id}_${handPart}`, defender.id);
      if (this.isOnCooldown(key, 0.35)) return;

      const dmg = Math.round(4 + speed * 0.8);
      const hp = handBody.translation();
      const pos = { x: hp.x, y: hp.y, z: hp.z };
      defender.applyDamage(dmg, 0.16, defenderMeta.bodyPart ?? 'chest', new THREE.Vector3(hv.x * 1.6, 1.5, hv.z * 1.6));
      this.audio.playImpact('flesh', 0.45);
      this.particles.spawnDust(pos, 4);
      if (attacker.isPlayer) this.playerDamageDealt += dmg;
      this.emitEvent('hit', dmg, speed, attacker.id, defender.id, 'mace' as WeaponType, pos);
    }
  }

  private emitEvent(
    type: CombatEvent['type'],
    damage: number,
    impactSpeed: number,
    attackerId: string,
    defenderId: string,
    weaponType: WeaponType,
    position: { x: number; y: number; z: number },
  ): void {
    this.eventBus.emit('combatEvent', {
      type,
      damage,
      impactSpeed,
      attackerId,
      defenderId,
      weaponType,
      position,
    });
  }
}
