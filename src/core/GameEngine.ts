import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadRapier } from '../physics/RapierLoader';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ActiveRagdoll, type FighterControlIntent } from '../humanoid/ActiveRagdoll';
import { WeaponInstance } from '../weapons/WeaponInstance';
import { ParticlePool } from '../combat/ParticlePool';
import { CombatSystem } from '../combat/CombatSystem';
import { AudioEngine } from '../audio/AudioEngine';
import { FighterAI } from '../ai/FighterAI';
import { createProceduralTextures, type ArenaTextureSet } from '../environments/ProceduralTextures';
import { buildArena, type ArenaBuildResult } from '../environments/ArenaBuilder';
import { InputManager, DEFAULT_KEY_BINDINGS } from '../controls/InputManager';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { PerformanceMonitor } from '../debug/PerformanceMonitor';
import { createModeRules, type OpponentLoadout } from '../gameModes/GameModes';
import { EventBus } from './EventBus';
import type {
  GameModeId,
  GameSettings,
  HandSide,
  MatchHudSnapshot,
  QualityPreset,
  WeaponType,
} from './types';

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'medium',
  shadows: true,
  physicsSubsteps: 1,
  physicsHz: 60,
  reducedParticles: false,
  mouseSensitivity: 1.0,
  masterVolume: 0.75,
  muted: false,
  showTelemetry: false,
  keyBindings: { ...DEFAULT_KEY_BINDINGS },
};

const _moveForward = new THREE.Vector3();
const _moveRight = new THREE.Vector3();
const _playerPos = new THREE.Vector3();
const _wpPos = new THREE.Vector3();

export class GameEngine {
  public readonly eventBus = new EventBus();
  public readonly input = new InputManager();
  public readonly audio = new AudioEngine();
  private readonly perf = new PerformanceMonitor();

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private camRig!: ThirdPersonCamera;
  private keyLight!: THREE.DirectionalLight;
  private textures!: ArenaTextureSet;
  private isSoftwareGl = false;

  private physics!: PhysicsWorld;
  private particles!: ParticlePool;
  private combat!: CombatSystem;
  private arena: ArenaBuildResult | null = null;

  private fighters = new Map<string, ActiveRagdoll>();
  private aiControllers = new Map<string, FighterAI>();
  private weapons = new Map<string, WeaponInstance>();
  private player: ActiveRagdoll | null = null;

  private mode: GameModeId = 'duel';
  private settings: GameSettings = { ...DEFAULT_SETTINGS };
  private isTitleShowcase = true;
  private isPaused = false;
  private matchEnded = false;
  private trainingOpponentPaused = false;

  private wave = 1;
  private score = 0;
  private kills = 0;
  private elapsedTime = 0;
  private statusText = '';
  private statusClearTimer = 0;
  private waveSpawnTimer = 0;
  private hudEmitAccum = 0;
  private torchFlickerTime = 0;

  // Player swing & thrust timing
  private playerThrustTimer = 0;
  private playerLeftPunchTimer = 0;
  private playerWhooshCooldown = 0;
  private pendingJumpPress = false;
  private playerSelectedRightWeapon: WeaponType = 'longsword';
  private playerSelectedLeftWeapon: WeaponType | null = 'shield';

  private frameId = 0;
  private lastTimeMs = 0;
  private disposed = false;

  constructor(private readonly mountEl: HTMLElement) {}

  public async init(initialSettings: GameSettings): Promise<void> {
    this.settings = { ...initialSettings, keyBindings: { ...initialSettings.keyBindings } };
    await loadRapier();
    if (this.disposed) return;

    this.initRendererAndScene();
    this.physics = new PhysicsWorld(this.settings.physicsHz, this.settings.physicsSubsteps);
    this.particles = new ParticlePool(this.scene);
    this.combat = new CombatSystem(this.physics, this.eventBus, this.particles, this.audio);

    this.input.attach(this.renderer.domElement, () => {
      if (!this.isTitleShowcase && !this.matchEnded) {
        this.eventBus.emit('pauseRequested', undefined);
      }
    });
    this.applySettings(this.settings);

    this.setupTitleShowcase();
    window.addEventListener('resize', this.onResize);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.lastTimeMs = performance.now();
    this.scheduleNextTick();
  }

  private initRendererAndScene(): void {
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(this.mountEl.clientWidth || window.innerWidth, this.mountEl.clientHeight || window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mountEl.innerHTML = '';
    this.mountEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x28211c);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0x28211c, 0.017);

    // Procedural Studio IBL Environment (required for PBR steel/brass highlights)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const aspect = (this.mountEl.clientWidth || window.innerWidth) / (this.mountEl.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 220);
    this.camRig = new ThirdPersonCamera(this.camera);

    // Warm/cool 3-point medieval sunlight rig
    const hemi = new THREE.HemisphereLight(0x9eb8d9, 0x4d3a27, 0.85);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xffdfb0, 2.3);
    this.keyLight.position.set(14, 22, 10);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 55;
    const d = 18;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.025;
    this.scene.add(this.keyLight);

    const rimLight = new THREE.DirectionalLight(0x8bb2e6, 0.75);
    rimLight.position.set(-12, 10, -14);
    this.scene.add(rimLight);

    this.textures = createProceduralTextures(
      Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
    );
  }

  public applySettings(next: GameSettings): void {
    this.settings = { ...next, keyBindings: { ...next.keyBindings } };
    this.input.setConfig(this.settings.keyBindings, this.settings.mouseSensitivity);
    this.audio.setSettings(this.settings.masterVolume, this.settings.muted);
    this.particles.reducedMode = this.settings.reducedParticles || this.settings.quality === 'low';

    const preset = this.settings.quality;
    const pr = this.isSoftwareGl
      ? 1
      : preset === 'low'
        ? 1
        : preset === 'medium'
          ? Math.min(window.devicePixelRatio, 1.5)
          : Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pr);

    const enableShadows = !this.isSoftwareGl && this.settings.shadows && preset !== 'low';
    this.renderer.shadowMap.enabled = enableShadows;
    this.keyLight.castShadow = enableShadows;
    const shadowRes = preset === 'high' ? 2048 : 1024;
    if (this.keyLight.shadow.mapSize.width !== shadowRes) {
      this.keyLight.shadow.mapSize.set(shadowRes, shadowRes);
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
    }

    const solverIters = preset === 'low' ? 6 : preset === 'medium' ? 8 : 10;
    this.physics.configure(this.settings.physicsHz, this.settings.physicsSubsteps, solverIters);
  }

  public applyQualityPreset(quality: QualityPreset): GameSettings {
    const next: GameSettings = {
      ...this.settings,
      quality,
      shadows: quality !== 'low',
      physicsSubsteps: quality === 'high' ? 2 : 1,
      physicsHz: quality === 'high' ? 90 : 60,
      reducedParticles: quality === 'low',
    };
    this.applySettings(next);
    return next;
  }

  public setupTitleShowcase(): void {
    this.clearMatchEntities();
    this.isTitleShowcase = true;
    this.isPaused = false;
    this.matchEnded = false;
    this.input.setEnabled(false);

    this.arena = buildArena('colosseum', this.physics, this.scene, this.textures);
    for (const r of this.arena.rackSpawns) {
      const w = new WeaponInstance(this.physics, this.scene, r.type, r.pos, r.quat);
      this.weapons.set(w.id, w);
    }

    // Spawn two posed gladiators facing each other in the center of the Colosseum
    const hero = new ActiveRagdoll(this.physics, this.scene, {
      name: 'Champion',
      isPlayer: false,
      slotIndex: 0,
      spawnPos: new THREE.Vector3(-1.35, 0, 0),
      facingYaw: -Math.PI * 0.5,
      appearance: { tunicColor: 0x7a1c1c, metalTint: 0xd0d6de, armorTier: 'heavy' },
    });
    const wHeroR = new WeaponInstance(this.physics, this.scene, 'longsword', new THREE.Vector3(-1.1, 1.1, 0));
    const wHeroL = new WeaponInstance(this.physics, this.scene, 'shield', new THREE.Vector3(-1.5, 1.1, 0), undefined, 0x7a1c1c);
    hero.armController.grabWeapon(this.physics, wHeroR, 'right');
    hero.armController.grabWeapon(this.physics, wHeroL, 'left');
    this.weapons.set(wHeroR.id, wHeroR);
    this.weapons.set(wHeroL.id, wHeroL);
    this.fighters.set(hero.id, hero);

    const rival = new ActiveRagdoll(this.physics, this.scene, {
      name: 'Challenger',
      isPlayer: false,
      slotIndex: 1,
      spawnPos: new THREE.Vector3(1.35, 0, 0),
      facingYaw: Math.PI * 0.5,
      appearance: { tunicColor: 0x243b5e, metalTint: 0xbac2cc, armorTier: 'heavy' },
    });
    const wRivalR = new WeaponInstance(this.physics, this.scene, 'battle_axe', new THREE.Vector3(1.1, 1.1, 0));
    rival.armController.grabWeapon(this.physics, wRivalR, 'right');
    this.weapons.set(wRivalR.id, wRivalR);
    this.fighters.set(rival.id, rival);
  }

  public startMatch(mode: GameModeId): void {
    this.audio.unlock();
    this.clearMatchEntities();

    this.mode = mode;
    this.isTitleShowcase = false;
    this.isPaused = false;
    this.matchEnded = false;
    this.trainingOpponentPaused = false;
    this.wave = 1;
    this.score = 0;
    this.kills = 0;
    this.elapsedTime = 0;
    this.waveSpawnTimer = 0;
    this.combat.resetStats();

    const rules = createModeRules(mode);
    this.arena = buildArena(
      rules.arenaKind,
      this.physics,
      this.scene,
      this.textures,
      (dmg) => {
        this.setStatus(`Dummy Hit: ${dmg} dmg`, 1.4);
      },
    );

    // Populate physical weapon racks
    for (const r of this.arena.rackSpawns) {
      const w = new WeaponInstance(this.physics, this.scene, r.type, r.pos, r.quat);
      this.weapons.set(w.id, w);
    }

    // Spawn Player
    const playerSpawn = new THREE.Vector3(0, 0, 4.2);
    this.player = new ActiveRagdoll(this.physics, this.scene, {
      name: 'You',
      isPlayer: true,
      slotIndex: 0,
      spawnPos: playerSpawn,
      facingYaw: 0,
      appearance: {
        tunicColor: 0x7c1d1d,
        metalTint: 0xd2d8e0,
        armorTier: 'heavy',
      },
      maxHealth: mode === 'survival' ? 120 : 100,
    });
    this.fighters.set(this.player.id, this.player);
    this.equipPlayerWeapons(this.playerSelectedRightWeapon, this.playerSelectedLeftWeapon);

    // Spawn Opponents
    const opponents = rules.getInitialOpponents(this.settings.quality);
    opponents.forEach((opp, idx) => this.spawnOpponent(opp, idx + 1));

    this.pendingJumpPress = false;
    this.camRig.resetBehind(0, new THREE.Vector3(0, 0.92, 4.2));
    this.input.setEnabled(true);
    this.setStatus(
      mode === 'training'
        ? 'Training Yard — Strike dummies, test weapons, or spar'
        : `${rules.title} — Fight!`,
      3.0,
    );
    this.audio.playHorn(true);
    this.emitHudSnapshot();
  }

  public equipPlayerWeapons(rightType: WeaponType | null, leftType: WeaponType | null): void {
    if (!this.player || this.player.isDead) return;
    if (rightType) this.playerSelectedRightWeapon = rightType;
    this.playerSelectedLeftWeapon = leftType;

    this.player.armController.releaseWeapon(this.physics, 'right');
    this.player.armController.releaseWeapon(this.physics, 'left');

    const pos = this.player.getPosition();
    if (rightType) {
      const w = new WeaponInstance(this.physics, this.scene, rightType, pos.clone().add(new THREE.Vector3(0.3, 1.1, -0.3)));
      this.weapons.set(w.id, w);
      this.player.armController.grabWeapon(this.physics, w, 'right');
    }
    if (leftType) {
      const w = new WeaponInstance(this.physics, this.scene, leftType, pos.clone().add(new THREE.Vector3(-0.3, 1.1, -0.3)), undefined, 0x7c1d1d);
      this.weapons.set(w.id, w);
      this.player.armController.grabWeapon(this.physics, w, 'left');
    }
  }

  public setTrainingOpponentPaused(paused: boolean): void {
    this.trainingOpponentPaused = paused;
    this.setStatus(paused ? 'Sparring Partner: Passive' : 'Sparring Partner: Active', 1.8);
  }

  private spawnOpponent(loadout: OpponentLoadout, slotIdx: number): void {
    const yawToCenter = Math.atan2(loadout.spawnPos.x, loadout.spawnPos.z);
    const enemy = new ActiveRagdoll(this.physics, this.scene, {
      name: loadout.name,
      isPlayer: false,
      slotIndex: slotIdx,
      spawnPos: loadout.spawnPos,
      facingYaw: yawToCenter,
      appearance: loadout.appearance,
      maxHealth: loadout.maxHealth,
    });

    const rw = new WeaponInstance(
      this.physics,
      this.scene,
      loadout.rightWeapon,
      loadout.spawnPos.clone().add(new THREE.Vector3(0.3, 1.1, 0.3)),
    );
    this.weapons.set(rw.id, rw);
    enemy.armController.grabWeapon(this.physics, rw, 'right');

    if (loadout.leftWeapon) {
      const lw = new WeaponInstance(
        this.physics,
        this.scene,
        loadout.leftWeapon,
        loadout.spawnPos.clone().add(new THREE.Vector3(-0.3, 1.1, 0.3)),
        undefined,
        loadout.appearance.tunicColor,
      );
      this.weapons.set(lw.id, lw);
      enemy.armController.grabWeapon(this.physics, lw, 'left');
    }

    this.fighters.set(enemy.id, enemy);
    this.aiControllers.set(enemy.id, new FighterAI(enemy, loadout.ai));
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    this.input.setEnabled(!paused && !this.isTitleShowcase && !this.matchEnded);
  }

  private setStatus(text: string, duration = 2.0): void {
    this.statusText = text;
    this.statusClearTimer = duration;
  }

  private clearMatchEntities(): void {
    for (const f of this.fighters.values()) {
      f.dispose();
    }
    this.fighters.clear();
    this.aiControllers.clear();

    for (const w of this.weapons.values()) {
      w.dispose(this.physics, this.scene);
    }
    this.weapons.clear();

    if (this.arena) {
      this.arena.dispose();
      this.arena = null;
    }
    this.particles?.clear();
    this.player = null;
  }

  private tick = (nowMs: number): void => {
    if (this.disposed) return;

    const rawDt = Math.max(0, (nowMs - this.lastTimeMs) / 1000);
    this.lastTimeMs = nowMs;
    const dt = Math.min(rawDt, 0.05);

    this.perf.tick(dt || 0.016);
    this.torchFlickerTime += dt;
    this.animateTorches();

    if (!this.isPaused) {
      if (this.combat.hitstopTimer > 0) {
        this.combat.hitstopTimer = Math.max(0, this.combat.hitstopTimer - dt);
      } else {
        this.stepSimulation(dt);
      }
      this.particles.update(dt);
    }

    if (this.combat.cameraShake > 0) {
      this.combat.cameraShake = Math.max(0, this.combat.cameraShake - dt * 1.4);
    }

    if (this.isTitleShowcase) {
      this.camRig.updateTitleOrbit(dt);
    } else if (this.player) {
      this.player.getPosition(_playerPos);
      this.camRig.updateCombat(dt, _playerPos, this.combat.cameraShake);
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  };

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick(performance.now()));
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private animateTorches(): void {
    if (!this.arena) return;
    const lights = this.arena.torchLights;
    for (let i = 0; i < lights.length; i++) {
      lights[i].intensity = 10 + Math.sin(this.torchFlickerTime * 8.5 + i * 2.1) * 2.5;
    }
  }

  private stepSimulation(dt: number): void {
    if (this.isTitleShowcase) {
      // Keep showcase fighters standing poised with subtle breathing idle
      this.physics.step(
        dt,
        (subDt) => {
          let i = 0;
          for (const f of this.fighters.values()) {
            const yaw = i === 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
            f.updatePhysics(subDt, {
              moveX: 0,
              moveZ: 0,
              facingYaw: yaw,
              jumpPressed: false,
              arm: {
                aimYaw: yaw,
                aimPitch: 0,
                swingX: 0,
                swingY: 0,
                attackHeld: false,
                defendHeld: i === 0,
                thrustActive: false,
                leftPunchActive: false,
              },
            });
            i++;
          }
        },
        (subDt) => {
          for (const w of this.weapons.values()) w.updateKinematics(subDt);
        },
      );
      return;
    }

    if (!this.player) return;

    this.elapsedTime += dt;
    if (this.statusClearTimer > 0) {
      this.statusClearTimer -= dt;
      if (this.statusClearTimer <= 0) this.statusText = '';
    }

    const snap = this.input.consumeSnapshot(dt);
    this.camRig.addInputDelta(snap.yawDelta, snap.pitchDelta);

    if (snap.jumpJustPressed) this.pendingJumpPress = true;
    if (snap.thrustJustPressed) this.playerThrustTimer = 0.28;
    if (this.playerThrustTimer > 0) this.playerThrustTimer = Math.max(0, this.playerThrustTimer - dt);
    if (this.playerLeftPunchTimer > 0) this.playerLeftPunchTimer = Math.max(0, this.playerLeftPunchTimer - dt);
    if (this.playerWhooshCooldown > 0) this.playerWhooshCooldown = Math.max(0, this.playerWhooshCooldown - dt);

    if (snap.attackJustPressed && !this.player.isDead) {
      if (snap.swingSpeed < 0.12 && !snap.weaponManipActive) {
        const tapDir = snap.swingX > 0.08 ? -1 : snap.swingX < -0.08 ? 1 : Math.random() > 0.5 ? 1 : -1;
        this.player.armController.triggerAutoSwing(tapDir, 0.24);
      } else {
        this.player.armController.cancelAutoSwing();
      }
      if (this.playerWhooshCooldown <= 0) {
        this.audio.playWhoosh(6.5);
        this.playerWhooshCooldown = 0.28;
      }
    } else if (snap.swingSpeed >= 0.12 || snap.weaponManipActive) {
      this.player.armController.cancelAutoSwing();
    }

    // Physical hand grab / release controls (Q = left hand, E = right hand, R = recover/reset)
    if (snap.leftHandJustPressed && !this.player.isDead) {
      this.handleHandToggle('left');
    }
    if (snap.rightHandJustPressed && !this.player.isDead) {
      this.handleHandToggle('right');
    }
    if (snap.recoverJustPressed) {
      if (this.mode === 'training') {
        this.startMatch('training');
        return;
      }
      if (!this.player.isDead) {
        const allW = Array.from(this.weapons.values());
        const nearest = this.player.armController.findNearestGrabbableWeapon(allW, 'right', 2.4);
        if (nearest) {
          this.player.armController.releaseWeapon(this.physics, 'right');
          this.player.armController.grabWeapon(this.physics, nearest, 'right');
          this.setStatus(`Recovered ${nearest.spec.label}`, 1.5);
        }
      }
    }

    // Build camera-relative player movement vector
    _moveForward.set(-Math.sin(this.camRig.yaw), 0, -Math.cos(this.camRig.yaw));
    _moveRight.set(Math.cos(this.camRig.yaw), 0, -Math.sin(this.camRig.yaw));
    const moveWorldX = _moveRight.x * snap.moveX + _moveForward.x * snap.moveY;
    const moveWorldZ = _moveRight.z * snap.moveX + _moveForward.z * snap.moveY;

    const playerIntent: FighterControlIntent = {
      moveX: Math.abs(moveWorldX) < 1e-6 ? 0 : moveWorldX,
      moveZ: Math.abs(moveWorldZ) < 1e-6 ? 0 : moveWorldZ,
      facingYaw: this.camRig.yaw,
      jumpPressed: this.pendingJumpPress,
      arm: {
        aimYaw: this.camRig.yaw,
        aimPitch: this.camRig.pitch - 0.18,
        swingX: snap.swingX,
        swingY: snap.swingY,
        swingSpeed: snap.swingSpeed,
        weaponRoll: snap.weaponRoll,
        weaponPitchOffset: snap.weaponPitchOffset,
        weaponManipActive: snap.weaponManipActive,
        guardX: snap.guardX,
        guardY: snap.guardY,
        attackHeld: snap.attackHeld,
        defendHeld: snap.defendHeld,
        thrustActive: this.playerThrustTimer > 0,
        leftPunchActive: this.playerLeftPunchTimer > 0,
      },
    };

    const allWeaponsArr = Array.from(this.weapons.values());
    const aiIntents = new Map<string, FighterControlIntent>();
    for (const [id, ai] of this.aiControllers.entries()) {
      if (this.mode === 'training' && this.trainingOpponentPaused) {
        const oppYaw = ai.fighter.getFacingYaw();
        aiIntents.set(id, {
          moveX: 0,
          moveZ: 0,
          facingYaw: oppYaw,
          jumpPressed: false,
          arm: {
            aimYaw: oppYaw,
            aimPitch: 0,
            swingX: 0,
            swingY: 0,
            attackHeld: false,
            defendHeld: false,
            thrustActive: false,
            leftPunchActive: false,
          },
        });
      } else {
        aiIntents.set(id, ai.update(dt, this.player, allWeaponsArr, this.physics));
      }
    }

    this.physics.step(
      dt,
      (subDt) => {
        if (this.player) {
          playerIntent.jumpPressed = this.pendingJumpPress;
          this.player.updatePhysics(subDt, playerIntent);
          this.pendingJumpPress = false;
        }
        for (const [id, ai] of this.aiControllers.entries()) {
          const intent = aiIntents.get(id);
          if (intent) ai.fighter.updatePhysics(subDt, intent);
        }
      },
      (subDt) => {
        for (const w of this.weapons.values()) w.updateKinematics(subDt);
        this.combat.step(
          subDt,
          this.fighters,
          this.weapons,
          this.arena?.dummies ?? [],
        );
      },
    );

    for (const f of this.fighters.values()) {
      f.updateVisualFlash(dt);
    }

    this.evaluateGameModeRules(dt);

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.065) {
      this.hudEmitAccum = 0;
      this.emitHudSnapshot();
    }
  }

  private handleHandToggle(side: HandSide): void {
    if (!this.player) return;
    const held = side === 'left' ? this.player.armController.leftWeapon : this.player.armController.rightWeapon;
    if (held) {
      const fwd = this.player.getForwardDir();
      this.player.armController.releaseWeapon(
        this.physics,
        side,
        fwd.multiplyScalar(2.4).add(new THREE.Vector3(0, 1.4, 0)),
      );
      this.setStatus(`Released ${held.spec.label}`, 1.2);
      return;
    }

    const allW = Array.from(this.weapons.values());
    const nearest = this.player.armController.findNearestGrabbableWeapon(allW, side, 1.85);
    if (nearest) {
      this.player.armController.grabWeapon(this.physics, nearest, side);
      this.setStatus(`Equipped ${nearest.spec.label}`, 1.2);
    } else if (side === 'left') {
      this.playerLeftPunchTimer = 0.24;
      this.audio.playWhoosh(4.5);
    }
  }

  private evaluateGameModeRules(dt: number): void {
    if (!this.player || this.matchEnded) return;

    const opponents = Array.from(this.fighters.values()).filter((f) => !f.isPlayer);
    const livingOpponents = opponents.filter((o) => !o.isDead);

    // Player defeated
    if (this.player.isDead) {
      if (this.mode === 'training') {
        this.player.health = this.player.maxHealth;
        this.player.isDead = false;
        this.player.isKnockedDown = false;
        this.player.balance = 1;
        this.setStatus('Training Revival', 1.8);
        return;
      }
      this.finishMatch(false, 'You fell in combat.');
      return;
    }

    if (livingOpponents.length === 0) {
      if (this.mode === 'training') {
        this.waveSpawnTimer += dt;
        if (this.waveSpawnTimer >= 2.2) {
          this.waveSpawnTimer = 0;
          for (const o of opponents) {
            this.aiControllers.delete(o.id);
            o.dispose();
            this.fighters.delete(o.id);
          }
          const rules = createModeRules('training');
          const next = rules.getInitialOpponents(this.settings.quality)[0];
          this.spawnOpponent(next, 1);
          this.setStatus('New Sparring Partner Ready', 1.8);
        }
        return;
      }

      if (this.mode === 'survival') {
        if (this.waveSpawnTimer === 0) {
          this.kills++;
          this.score += 150 * this.wave;
          // Partial stamina & health recovery between survival waves
          this.player.health = Math.min(this.player.maxHealth, this.player.health + 22);
          this.setStatus(`Wave ${this.wave} Cleared! Next challenger approaching...`, 2.4);
          this.audio.playHorn(true);
        }
        this.waveSpawnTimer += dt;
        if (this.waveSpawnTimer >= 2.4) {
          this.waveSpawnTimer = 0;
          // Clean up defeated opponent bodies to keep physics fast across waves
          for (const o of opponents) {
            this.aiControllers.delete(o.id);
            o.dispose();
            this.fighters.delete(o.id);
          }
          this.wave++;
          const rules = createModeRules('survival');
          const nextOpp = rules.getSurvivalWaveOpponent(this.wave);
          this.spawnOpponent(nextOpp, 1);
        }
        return;
      }

      // Duel or Arena victory
      this.kills = opponents.length;
      this.score += opponents.length * 250 + Math.round(this.player.health * 3);
      this.finishMatch(
        true,
        this.mode === 'duel'
          ? 'Your opponent has fallen. Honor is yours!'
          : 'You stand victorious in the Grand Melee!',
      );
    }
  }

  private finishMatch(victory: boolean, reason: string): void {
    this.matchEnded = true;
    this.input.setEnabled(false);
    this.audio.playHorn(victory);
    this.emitHudSnapshot();
    this.eventBus.emit('matchEnded', {
      victory,
      mode: this.mode,
      score: this.score,
      kills: this.kills,
      wave: this.wave,
      durationSec: Math.round(this.elapsedTime),
      damageDealt: this.combat.playerDamageDealt,
      parries: this.combat.playerParries,
      disarms: this.combat.playerDisarms,
      reason,
    });
  }

  private emitHudSnapshot(): void {
    if (!this.player) return;
    const allW = Array.from(this.weapons.values());
    const nearW =
      this.player.armController.findNearestGrabbableWeapon(allW, 'right', 2.0) ??
      this.player.armController.findNearestGrabbableWeapon(allW, 'left', 2.0);

    const opponents = Array.from(this.fighters.values())
      .filter((f) => !f.isPlayer)
      .map((f) => f.getHudState());

    const snapshot: MatchHudSnapshot = {
      mode: this.mode,
      wave: this.wave,
      score: this.score,
      kills: this.kills,
      elapsedTime: this.elapsedTime,
      statusText: this.statusText,
      player: this.player.getHudState(),
      opponents,
      nearbyWeapon: nearW?.type ?? null,
      fps: this.perf.fps,
      physicsMs: Number(this.physics.lastStepDurationMs.toFixed(2)),
      bodyCount: this.physics.getActiveBodyCount(),
    };
    this.eventBus.emit('hudUpdate', snapshot);
  }

  private onResize = (): void => {
    const w = this.mountEl.clientWidth || window.innerWidth;
    const h = this.mountEl.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.onResize);
    this.clearMatchEntities();
    this.input.dispose();
    this.particles?.dispose();
    this.physics?.dispose();
    this.audio.dispose();
    this.eventBus.clear();
    this.renderer?.dispose();
  }
}

export function getNearbyWeaponPositionHint(w: WeaponInstance): THREE.Vector3 {
  const p = w.body.translation();
  return _wpPos.set(p.x, p.y, p.z);
}
