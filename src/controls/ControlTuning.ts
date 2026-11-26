/**
 * Centralized gameplay & physics control tuning for Medieval Blood Arena.
 * All angular values are in radians, distances in meters, speeds in m/s, forces in N, torques in N*m.
 */
export const CONTROL_TUNING = {
  locomotion: {
    /** Steady walking speed at moderate pace / precision mode (m/s) */
    walkSpeed: 2.65,
    /** Full combat running pace when holding directional keys (m/s) */
    runSpeed: 3.75,
    /** Speed multiplier while holding guard / shield raise */
    guardSpeedFactor: 0.74,
    /** Speed multiplier when holding weapon-focus modifier (Alt / V) for careful footwork */
    precisionWalkFactor: 0.68,
    /** Smooth horizontal acceleration from idle into stride (m/s^2) */
    acceleration: 15.0,
    /** Smooth horizontal deceleration when releasing movement (m/s^2) */
    deceleration: 26.0,
    /** Extra responsiveness when reversing or redirecting WASD movement (m/s^2) */
    directionChangeAccel: 24.0,
    /** Nominal horizontal stride distance per step cycle (m) */
    stepLength: 0.68,
    /** Minimum and maximum stride cadence in full L+R stride cycles/sec */
    stepFrequencyMin: 0.95,
    stepFrequencyMax: 1.38,
    /** Peak swing foot vertical clearance lift via knee/ankle flexion (m equivalent) */
    stepHeight: 0.135,
    /** Fraction of cycle each foot spends planted in stance vs lifted in swing */
    stanceDurationRatio: 0.56,
    swingDurationRatio: 0.44,
    /** Vertical foot height threshold considered in ground contact (m) */
    groundContactThreshold: 0.115,
    /** Balance stabilization multiplier during active weight transfer */
    balanceAssistGain: 1.15,
    /** Pelvis horizontal velocity assist tracking rate (1/s) */
    pelvisFollowRate: 13.5,
    /** Abdomen & chest horizontal velocity assist tracking rate (1/s) */
    torsoFollowRate: 11.8,
    /** Swing-leg momentum assist rate (smoothly weighted by swing phase) */
    swingLegFollowRate: 11.2,
    /** Effective upper-body mass supported by leg vertical extensor controller (kg) */
    verticalSupportMass: 68.0,
    /** Steady gravity feed-forward upward force on pelvis when grounded (N) */
    verticalFeedforwardN: 542.0,
    /** Standing combat-ready (bent-knee) & walking target pelvis height (m) */
    idlePelvisHeight: 0.882,
    walkPelvisHeight: 0.892,
    /** Resting stance micro-creep anchor gain & speed clamp */
    idleAnchorGain: 2.8,
    idleAnchorMaxSpeed: 0.32,
    /** Per-foot dynamic friction states (stance grips ground; swing clears smoothly) */
    footFrictionIdle: 1.35,
    footFrictionStance: 0.06,
    footFrictionSwing: 0.015,
    footFrictionTurn: 0.08,
    footFrictionStagger: 0.02,
    footFrictionRagdoll: 0.65,
  },

  rotation: {
    /** Smooth proportional yaw tracking responsiveness (1/s) */
    turnResponsiveness: 13.0,
    /** Maximum angular turning rate so 90°/180° turns stay fluid without snapping (rad/s) */
    maxTurnSpeed: 10.2,
    /** Subtle alignment of pelvis toward travel direction while strafing (0..1) */
    walkTurnBlend: 0.16,
    /** Extra rotational damping factor applied to torso/pelvis during turns */
    bodyRotationDamping: 1.12,
    /** Maximum allowed yaw twist offset between pelvis and chest (rad) */
    maxSpineTwistRad: 0.44,
    /** Head/neck lead factor toward incoming target yaw */
    headLeadFactor: 0.36,
    /** Torso follow factor toward active right-arm weapon angle (rad) */
    torsoWeaponFollowRad: 0.18,
  },

  weapon: {
    /** Frame-rate-independent exponential smoothing cutoff for chest-local hand target (Hz) */
    handPosFilterHz: 26.0,
    /** Frame-rate-independent exponential smoothing cutoff for hand/wrist orientation (Hz) */
    handRotFilterHz: 24.0,
    /** Smooth ready / free-manipulation hand position spring stiffness (N/m) */
    handPosStiffnessIdle: 245.0,
    /** Smooth ready / free-manipulation hand linear damping (N*s/m) */
    handPosDampingIdle: 18.5,
    /** Maximum continuous hand reaction force during smooth manipulation (N) */
    handPosMaxForceIdle: 108.0,
    /** Attack / fast-swing hand position spring stiffness (N/m) */
    handPosStiffnessAttack: 485.0,
    /** Attack / fast-swing hand linear damping (N*s/m) */
    handPosDampingAttack: 25.0,
    /** Maximum continuous hand force during full attacks (N) */
    handPosMaxForceAttack: 192.0,
    /** Smooth wrist / hand orientation PD stiffness (N*m/rad) */
    handRotStiffness: 40.0,
    /** Smooth wrist / hand angular damping (N*m*s/rad) */
    handRotDamping: 2.35,
    /** Maximum wrist torque during normal handling (N*m) */
    handRotMaxTorque: 40.0,
    /** Attack / active-cut wrist PD stiffness (N*m/rad) */
    wristAttackStiffness: 52.0,
    /** Attack / active-cut wrist damping (N*m*s/rad) */
    wristAttackDamping: 2.45,
    /** Maximum wrist torque during intentional fast attacks (N*m) */
    wristAttackMaxTorque: 48.0,
    /** Analytical 2-bone IK shoulder tracking gains */
    shoulderIkKp: 38.0,
    shoulderIkKd: 1.48,
    shoulderIkMaxTorque: 50.0,
    /** Analytical 2-bone IK elbow tracking gains */
    elbowIkKp: 30.0,
    elbowIkKd: 1.22,
    elbowIkMaxTorque: 40.0,
    /** Max chest-local hand target speed during normal handling vs active attack (m/s) */
    maxHandSpeedNormal: 5.2,
    maxHandSpeedAttack: 10.5,
    /** Soft cap on weapon/hand angular velocity to prevent physics energy spikes (rad/s) */
    maxWeaponAngVel: 21.5,
    /** Automatic blade-edge alignment blend during fast sweeps (0..1) */
    swingEdgeLeadBlend: 0.74,
    /** Anatomical arm reach limits from shoulder joint (m) — keeps elbow out of 180° lock */
    minArmReach: 0.22,
    maxArmReach: 0.54,
    upperArmLength: 0.29,
    forearmLength: 0.28,
    /** Weapon-specific chest-local combat-ready guard presets (pos=[right,up,fwd], dir=[right,up,fwd], roll) */
    combatStances: {
      longsword: {
        pos: [0.15, 0.065, 0.4] as const,
        dir: [-0.26, 0.88, 0.94] as const,
        roll: -0.28,
      },
      armingSwordWithShield: {
        pos: [0.24, 0.115, 0.35] as const,
        dir: [-0.18, 1.02, 0.72] as const,
        roll: -0.24,
      },
      armingSwordSolo: {
        pos: [0.19, 0.075, 0.38] as const,
        dir: [-0.2, 0.9, 0.9] as const,
        roll: -0.26,
      },
      battleAxe: {
        pos: [0.22, 0.105, 0.36] as const,
        dir: [-0.24, 1.08, 0.64] as const,
        roll: -0.22,
      },
      mace: {
        pos: [0.21, 0.095, 0.37] as const,
        dir: [-0.18, 1.02, 0.76] as const,
        roll: -0.18,
      },
      unarmedRight: {
        pos: [0.19, 0.09, 0.35] as const,
        dir: [-0.12, 0.9, 0.55] as const,
        roll: -0.15,
      },
      shieldReady: {
        pos: [-0.2, 0.055, 0.34] as const,
        dir: [0.08, 1.0, 0.18] as const,
        roll: Math.PI - 0.42,
      },
      shieldDefend: {
        pos: [-0.04, 0.11, 0.42] as const,
        dir: [0.02, 1.0, 0.2] as const,
        roll: Math.PI + 0.14,
      },
      offhandReady: {
        pos: [-0.18, 0.075, 0.34] as const,
        dir: [0.16, 0.92, 0.65] as const,
        roll: 0.22,
      },
    },
  },

  input: {
    /** Mouse camera look sensitivity (rad / px at 1.0x setting) */
    cameraMouseSensitivity: 0.0022,
    /** Direct mouse-to-weapon cursor sensitivity (normalized units / px at 1.0x setting) */
    weaponMouseSensitivity: 0.0056,
    /** Mouse sensitivity for direct wrist pitch/roll rotation when MMB held */
    weaponRotMouseSensitivity: 0.0048,
    /** Scroll wheel increment for direct weapon blade roll (rad / step) */
    weaponRollWheelSensitivity: 0.2,
    /** Subtle camera follow factor when angling guard with RMB (0 = locked, 1 = full) */
    guardCameraFollowFactor: 0.22,
    /** Mobile virtual joystick radial deadzone (0..1) */
    mobileJoystickDeadzone: 0.04,
    /** Mobile right-pad camera sensitivity */
    mobileCameraSensitivity: 0.0042,
    /** Mobile drag-on-strike / drag-on-guard weapon steering sensitivity */
    mobileWeaponSensitivity: 0.0095,
    /** Discard single-event pointer deltas larger than this on pointer-lock transitions (px) */
    pointerLockSpikeThresholdPx: 110,
  },
} as const;
