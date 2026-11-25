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
    guardSpeedFactor: 0.72,
    /** Speed multiplier when holding weapon-focus modifier (Alt) for careful footwork */
    precisionWalkFactor: 0.65,
    /** Smooth horizontal acceleration from idle into stride (m/s^2) */
    acceleration: 16.5,
    /** Smooth horizontal deceleration when releasing movement (m/s^2) */
    deceleration: 24.5,
    /** Extra responsiveness when reversing or redirecting WASD movement (m/s^2) */
    directionChangeAccel: 24.0,
    /** Pelvis horizontal velocity assist tracking rate (1/s) */
    pelvisFollowRate: 13.0,
    /** Abdomen & chest horizontal velocity assist tracking rate (1/s) */
    torsoFollowRate: 11.0,
    /** Thigh & lower-leg horizontal velocity assist tracking rate (1/s) */
    legFollowRate: 9.0,
    /** Effective upper-body mass supported by leg vertical extensor controller (kg) */
    verticalSupportMass: 68.0,
    /** Steady gravity feed-forward upward force on pelvis when grounded (N) */
    verticalFeedforwardN: 540.0,
    /** Standing & walking target pelvis height (m) */
    idlePelvisHeight: 0.905,
    walkPelvisHeight: 0.898,
    /** Resting stance micro-creep anchor gain & speed clamp */
    idleAnchorGain: 2.6,
    idleAnchorMaxSpeed: 0.32,
    /** Foot friction states (using Min combine rule during slip/pivot phases) */
    footFrictionIdle: 1.35,
    footFrictionTurn: 0.28,
    footFrictionWalk: 0.05,
    footFrictionStagger: 0.02,
    footFrictionRagdoll: 0.65,
  },

  rotation: {
    /** Smooth proportional yaw tracking responsiveness (1/s) */
    turnResponsiveness: 12.5,
    /** Maximum angular turning rate so 90°/180° turns stay fluid without snapping (rad/s) */
    maxTurnSpeed: 9.8,
    /** Subtle alignment of pelvis toward walk velocity while strafing (0..1) */
    walkTurnBlend: 0.1,
    /** Extra rotational damping factor applied to torso/pelvis during turns */
    bodyRotationDamping: 1.12,
    /** Maximum allowed yaw twist offset between pelvis and chest (rad) */
    maxSpineTwistRad: 0.46,
    /** Head/neck lead factor toward incoming target yaw */
    headLeadFactor: 0.34,
    /** Torso follow factor toward active right-arm weapon angle (rad) */
    torsoWeaponFollowRad: 0.16,
  },

  weapon: {
    /** Frame-rate-independent exponential smoothing cutoff for hand target position (Hz) */
    handPosFilterHz: 24.0,
    /** Frame-rate-independent exponential smoothing cutoff for hand/wrist orientation (Hz) */
    handRotFilterHz: 22.0,
    /** Smooth ready / free-manipulation hand position spring stiffness (N/m) */
    handPosStiffnessIdle: 210.0,
    /** Smooth ready / free-manipulation hand linear damping (N*s/m) */
    handPosDampingIdle: 18.0,
    /** Maximum continuous hand reaction force during smooth manipulation (N) */
    handPosMaxForceIdle: 92.0,
    /** Attack / fast-swing hand position spring stiffness (N/m) */
    handPosStiffnessAttack: 460.0,
    /** Attack / fast-swing hand linear damping (N*s/m) */
    handPosDampingAttack: 26.0,
    /** Maximum continuous hand force during full attacks (N) */
    handPosMaxForceAttack: 185.0,
    /** Smooth wrist / hand orientation PD stiffness (N*m/rad) */
    handRotStiffness: 34.0,
    /** Smooth wrist / hand angular damping (N*m*s/rad) */
    handRotDamping: 2.2,
    /** Maximum wrist torque during normal handling (N*m) */
    handRotMaxTorque: 34.0,
    /** Attack / active-cut wrist PD stiffness (N*m/rad) */
    wristAttackStiffness: 48.0,
    /** Attack / active-cut wrist damping (N*m*s/rad) */
    wristAttackDamping: 2.5,
    /** Maximum wrist torque during intentional fast attacks (N*m) */
    wristAttackMaxTorque: 44.0,
    /** Analytical 2-bone IK shoulder tracking gains */
    shoulderIkKp: 34.0,
    shoulderIkKd: 1.5,
    shoulderIkMaxTorque: 46.0,
    /** Analytical 2-bone IK elbow tracking gains */
    elbowIkKp: 26.0,
    elbowIkKd: 1.2,
    elbowIkMaxTorque: 36.0,
    /** Max hand target speed during normal handling vs active attack (m/s) */
    maxHandSpeedNormal: 4.8,
    maxHandSpeedAttack: 9.8,
    /** Soft cap on weapon/hand angular velocity to prevent physics energy spikes (rad/s) */
    maxWeaponAngVel: 21.0,
    /** Automatic blade-edge alignment blend during fast sweeps (0..1) */
    swingEdgeLeadBlend: 0.72,
    /** Anatomical arm reach limits from shoulder joint (m) */
    minArmReach: 0.2,
    maxArmReach: 0.55,
    upperArmLength: 0.29,
    forearmLength: 0.28,
  },

  input: {
    /** Mouse camera look sensitivity (rad / px at 1.0x setting) */
    cameraMouseSensitivity: 0.0022,
    /** Direct mouse-to-weapon cursor sensitivity (normalized units / px at 1.0x setting) */
    weaponMouseSensitivity: 0.0052,
    /** Mouse sensitivity for direct wrist pitch/roll rotation when Alt/MMB held */
    weaponRotMouseSensitivity: 0.0046,
    /** Scroll wheel increment for direct weapon blade roll (rad / step) */
    weaponRollWheelSensitivity: 0.2,
    /** Subtle camera follow factor when angling guard with RMB (0 = locked, 1 = full) */
    guardCameraFollowFactor: 0.22,
    /** Mobile virtual joystick radial deadzone (0..1) */
    mobileJoystickDeadzone: 0.04,
    /** Mobile right-pad camera sensitivity */
    mobileCameraSensitivity: 0.0042,
    /** Mobile drag-on-strike / drag-on-guard weapon steering sensitivity */
    mobileWeaponSensitivity: 0.009,
    /** Discard single-event pointer deltas larger than this on pointer-lock transitions (px) */
    pointerLockSpikeThresholdPx: 110,
  },
} as const;
