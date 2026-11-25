import * as THREE from 'three';
import type { WeaponType } from '../core/types';

export interface WeaponMaterials {
  steel: THREE.MeshStandardMaterial;
  darkIron: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  shieldFace: THREE.MeshStandardMaterial;
}

let sharedMats: WeaponMaterials | null = null;

export function getWeaponMaterials(): WeaponMaterials {
  if (sharedMats) return sharedMats;
  sharedMats = {
    steel: new THREE.MeshStandardMaterial({
      color: 0xc8ced6,
      metalness: 0.92,
      roughness: 0.22,
    }),
    darkIron: new THREE.MeshStandardMaterial({
      color: 0x3b3e42,
      metalness: 0.85,
      roughness: 0.42,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xc29338,
      metalness: 0.88,
      roughness: 0.28,
    }),
    leather: new THREE.MeshStandardMaterial({
      color: 0x3d2416,
      metalness: 0.05,
      roughness: 0.82,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0x5c3c22,
      metalness: 0.04,
      roughness: 0.78,
    }),
    shieldFace: new THREE.MeshStandardMaterial({
      color: 0x6b1d1d,
      metalness: 0.12,
      roughness: 0.68,
    }),
  };
  return sharedMats;
}

/**
 * Builds composite 3-10 part procedural 3D meshes for each medieval weapon.
 * Local origin (0,0,0) is always at the primary grip point; +Y points toward the weapon tip.
 */
export function buildWeaponMesh(type: WeaponType, heraldryColor?: number): THREE.Group {
  const mats = getWeaponMaterials();
  const group = new THREE.Group();
  group.name = `weapon_${type}`;

  if (type === 'longsword' || type === 'arming_sword') {
    const isLong = type === 'longsword';
    const gripLen = isLong ? 0.24 : 0.14;
    const bladeLen = isLong ? 0.88 : 0.68;
    const bladeW = isLong ? 0.048 : 0.044;
    const guardW = isLong ? 0.24 : 0.18;

    // 1. Leather grip
    const gripGeo = new THREE.CylinderGeometry(0.017, 0.019, gripLen, 10);
    const grip = new THREE.Mesh(gripGeo, mats.leather);
    grip.position.y = -gripLen * 0.15;
    group.add(grip);

    // 2. Pommel (faceted steel/brass counterweight)
    const pommelGeo = new THREE.OctahedronGeometry(isLong ? 0.032 : 0.028, 0);
    const pommel = new THREE.Mesh(pommelGeo, mats.brass);
    pommel.position.y = -gripLen * 0.65 - 0.025;
    pommel.scale.set(1, 1.15, 0.78);
    group.add(pommel);

    // 3. Crossguard
    const guardGeo = new THREE.BoxGeometry(guardW, 0.022, 0.03);
    const guard = new THREE.Mesh(guardGeo, mats.darkIron);
    guard.position.y = gripLen * 0.35 + 0.012;
    group.add(guard);

    // Guard finials
    const finialGeo = new THREE.SphereGeometry(0.016, 8, 8);
    const finL = new THREE.Mesh(finialGeo, mats.brass);
    finL.position.set(-guardW * 0.5, guard.position.y, 0);
    const finR = new THREE.Mesh(finialGeo, mats.brass);
    finR.position.set(guardW * 0.5, guard.position.y, 0);
    group.add(finL, finR);

    // 4. Beveled extruded double-edged blade
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-bladeW * 0.5, 0);
    bladeShape.lineTo(bladeW * 0.5, 0);
    bladeShape.lineTo(bladeW * 0.34, bladeLen * 0.85);
    bladeShape.lineTo(0, bladeLen);
    bladeShape.lineTo(-bladeW * 0.34, bladeLen * 0.85);
    bladeShape.closePath();

    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.008,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.004,
      bevelSegments: 1,
    });
    bladeGeo.translate(0, 0, -0.004);
    const blade = new THREE.Mesh(bladeGeo, mats.steel);
    blade.position.y = guard.position.y + 0.01;
    group.add(blade);

    // 5. Central fuller ridge
    const fullerGeo = new THREE.BoxGeometry(0.012, bladeLen * 0.68, 0.016);
    const fuller = new THREE.Mesh(fullerGeo, mats.darkIron);
    fuller.position.y = guard.position.y + 0.01 + bladeLen * 0.36;
    group.add(fuller);
  } else if (type === 'battle_axe') {
    // 1. Ash wood shaft
    const shaftGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.96, 10);
    const shaft = new THREE.Mesh(shaftGeo, mats.wood);
    shaft.position.y = 0.32;
    group.add(shaft);

    // 2. Leather grip wrap
    const wrapGeo = new THREE.CylinderGeometry(0.021, 0.021, 0.24, 10);
    const wrap = new THREE.Mesh(wrapGeo, mats.leather);
    wrap.position.y = 0.0;
    group.add(wrap);

    // 3. Iron butt cap
    const capGeo = new THREE.ConeGeometry(0.024, 0.05, 8);
    capGeo.rotateX(Math.PI);
    const cap = new THREE.Mesh(capGeo, mats.darkIron);
    cap.position.y = -0.17;
    group.add(cap);

    // 4. Axe socket collar
    const collarGeo = new THREE.BoxGeometry(0.06, 0.09, 0.052);
    const collar = new THREE.Mesh(collarGeo, mats.darkIron);
    collar.position.y = 0.68;
    group.add(collar);

    // 5. Bearded curved axe head
    const axeShape = new THREE.Shape();
    axeShape.moveTo(0.02, -0.03);
    axeShape.lineTo(0.18, -0.12);
    axeShape.quadraticCurveTo(0.22, 0.0, 0.17, 0.13);
    axeShape.lineTo(0.02, 0.04);
    axeShape.closePath();

    const axeGeo = new THREE.ExtrudeGeometry(axeShape, {
      depth: 0.014,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.005,
      bevelSegments: 2,
    });
    axeGeo.translate(0, 0, -0.007);
    const head = new THREE.Mesh(axeGeo, mats.steel);
    head.position.y = 0.68;
    group.add(head);

    // 6. Top spike
    const spikeGeo = new THREE.ConeGeometry(0.018, 0.1, 6);
    const spike = new THREE.Mesh(spikeGeo, mats.steel);
    spike.position.y = 0.83;
    group.add(spike);
  } else if (type === 'mace') {
    // 1. Iron/wood haft
    const haftGeo = new THREE.CylinderGeometry(0.015, 0.018, 0.64, 10);
    const haft = new THREE.Mesh(haftGeo, mats.darkIron);
    haft.position.y = 0.2;
    group.add(haft);

    // 2. Leather grip
    const gripGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.18, 10);
    const grip = new THREE.Mesh(gripGeo, mats.leather);
    grip.position.y = 0.0;
    group.add(grip);

    // 3. Brass pommel ring
    const pommelGeo = new THREE.SphereGeometry(0.025, 10, 8);
    const pommel = new THREE.Mesh(pommelGeo, mats.brass);
    pommel.position.y = -0.12;
    group.add(pommel);

    // 4. Mace core hub
    const hubGeo = new THREE.CylinderGeometry(0.034, 0.028, 0.14, 10);
    const hub = new THREE.Mesh(hubGeo, mats.darkIron);
    hub.position.y = 0.54;
    group.add(hub);

    // 5-10. Six steel striking flanges
    const flangeGeo = new THREE.BoxGeometry(0.01, 0.15, 0.055);
    for (let i = 0; i < 6; i++) {
      const flange = new THREE.Mesh(flangeGeo, mats.steel);
      const angle = (i / 6) * Math.PI * 2;
      flange.position.set(Math.sin(angle) * 0.036, 0.54, Math.cos(angle) * 0.036);
      flange.rotation.y = angle;
      group.add(flange);
    }

    // Top finial spike
    const topCone = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 6), mats.steel);
    topCone.position.y = 0.64;
    group.add(topCone);
  } else if (type === 'shield') {
    const faceMat = heraldryColor
      ? new THREE.MeshStandardMaterial({
          color: heraldryColor,
          metalness: 0.12,
          roughness: 0.68,
        })
      : mats.shieldFace;

    // 1. Heater shield silhouette
    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(-0.23, 0.3);
    shieldShape.lineTo(0.23, 0.3);
    shieldShape.lineTo(0.23, 0.02);
    shieldShape.quadraticCurveTo(0.21, -0.22, 0, -0.34);
    shieldShape.quadraticCurveTo(-0.21, -0.22, -0.23, 0.02);
    shieldShape.closePath();

    const bodyGeo = new THREE.ExtrudeGeometry(shieldShape, {
      depth: 0.026,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 1,
    });
    bodyGeo.translate(0, 0, -0.013);
    const body = new THREE.Mesh(bodyGeo, faceMat);
    group.add(body);

    // 2. Iron boss center dome
    const bossGeo = new THREE.SphereGeometry(0.068, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    bossGeo.rotateX(Math.PI * 0.5);
    const boss = new THREE.Mesh(bossGeo, mats.steel);
    boss.position.z = 0.018;
    group.add(boss);

    // 3. Brass cross emblem on shield face
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.42, 0.01), mats.brass);
    crossV.position.set(0, 0.01, 0.019);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.032, 0.01), mats.brass);
    crossH.position.set(0, 0.08, 0.019);
    group.add(crossV, crossH);

    // 4. Rear leather arm strap & wooden handle
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), mats.wood);
    handle.position.set(0, 0, -0.045);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.02), mats.leather);
    strap.position.set(0, 0.12, -0.035);
    group.add(handle, strap);
  }

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return group;
}
