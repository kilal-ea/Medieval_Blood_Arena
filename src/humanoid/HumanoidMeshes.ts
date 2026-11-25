import * as THREE from 'three';
import type { BodyPartId } from '../core/types';

export interface FighterAppearance {
  tunicColor: number;
  metalTint: number;
  armorTier: 'light' | 'medium' | 'heavy';
}

export interface SegmentMeshResult {
  group: THREE.Group;
  fingersPivot?: THREE.Group;
  flashMaterials: THREE.MeshStandardMaterial[];
}

export function createSegmentMesh(
  partId: BodyPartId,
  appearance: FighterAppearance,
): SegmentMeshResult {
  const group = new THREE.Group();
  group.name = `seg_${partId}`;

  const steel = new THREE.MeshStandardMaterial({
    color: appearance.metalTint,
    metalness: 0.88,
    roughness: 0.28,
  });
  const darkIron = new THREE.MeshStandardMaterial({
    color: 0x2f3136,
    metalness: 0.82,
    roughness: 0.44,
  });
  const cloth = new THREE.MeshStandardMaterial({
    color: appearance.tunicColor,
    metalness: 0.04,
    roughness: 0.84,
  });
  const leather = new THREE.MeshStandardMaterial({
    color: 0x3b2416,
    metalness: 0.05,
    roughness: 0.8,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: 0xc99c7c,
    metalness: 0.02,
    roughness: 0.72,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xc6983b,
    metalness: 0.88,
    roughness: 0.26,
  });

  const flashMaterials: THREE.MeshStandardMaterial[] = [steel, cloth, leather, skin];
  let fingersPivot: THREE.Group | undefined;

  switch (partId) {
    case 'head': {
      // Barbute / Sallet Knight Helm
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), steel);
      dome.scale.set(0.95, 1.08, 1.05);
      group.add(dome);

      // Visor brow & face plate
      const visor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.112, 0.105, 0.11, 14, 1, false, Math.PI * 0.55, Math.PI * 0.9),
        steel,
      );
      visor.position.set(0, -0.02, -0.01);
      group.add(visor);

      // Dark visor eye slit
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.04), darkIron);
      slit.position.set(0, 0.012, -0.098);
      group.add(slit);

      // Brass crest ridge
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.14, 0.19), brass);
      crest.position.set(0, 0.06, 0.01);
      group.add(crest);
      break;
    }

    case 'neck': {
      const gorget = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.066, 0.095, 10), darkIron);
      group.add(gorget);
      break;
    }

    case 'chest': {
      // Padded gambeson under-layer
      const under = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.26, 0.2), cloth);
      group.add(under);

      // Steel cuirass breastplate & backplate
      const cuirassMat = appearance.armorTier === 'light' ? leather : steel;
      const cuirass = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.145, 0.24, 10), cuirassMat);
      cuirass.scale.set(1.12, 1, 0.72);
      group.add(cuirass);

      // Heraldic surcoat sash & brass trim
      const sash = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.25, 0.225), cloth);
      group.add(sash);
      const collarTrim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 14), brass);
      collarTrim.rotation.x = Math.PI * 0.5;
      collarTrim.position.y = 0.115;
      group.add(collarTrim);
      break;
    }

    case 'abdomen': {
      const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.135, 0.185, 10), cloth);
      waist.scale.set(1.08, 1, 0.75);
      group.add(waist);

      // Segmented steel fauld & leather belt
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.048, 0.21), leather);
      belt.position.y = -0.04;
      group.add(belt);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.02), brass);
      buckle.position.set(0, -0.04, -0.105);
      group.add(buckle);
      break;
    }

    case 'pelvis': {
      const hip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.2), cloth);
      group.add(hip);
      const tassetL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.19), darkIron);
      tassetL.position.set(-0.095, -0.02, -0.01);
      const tassetR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.19), darkIron);
      tassetR.position.set(0.095, -0.02, -0.01);
      group.add(tassetL, tassetR);
      break;
    }

    case 'upperArmL':
    case 'upperArmR': {
      const sideSign = partId === 'upperArmL' ? -1 : 1;
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.22, 4, 8), cloth);
      group.add(sleeve);

      // Steel pauldron shoulder armor
      const pauldron = new THREE.Mesh(
        new THREE.SphereGeometry(0.082, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
        appearance.armorTier === 'light' ? leather : steel,
      );
      pauldron.position.set(sideSign * 0.01, 0.11, 0);
      pauldron.rotation.z = -sideSign * 0.35;
      group.add(pauldron);
      break;
    }

    case 'forearmL':
    case 'forearmR': {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.039, 0.2, 4, 8), leather);
      group.add(arm);

      // Steel vambrace bracer
      const vambrace = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 0.18, 8), steel);
      group.add(vambrace);
      break;
    }

    case 'handL':
    case 'handR': {
      // Gauntlet palm
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.085, 0.046), darkIron);
      group.add(palm);

      // Thumb
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.05, 0.024), skin);
      const sideSign = partId === 'handL' ? 1 : -1;
      thumb.position.set(sideSign * 0.038, -0.01, -0.02);
      thumb.rotation.z = sideSign * 0.45;
      group.add(thumb);

      // Articulated finger group that curls around weapon grips
      fingersPivot = new THREE.Group();
      fingersPivot.position.set(0, -0.042, -0.01);
      for (let i = 0; i < 4; i++) {
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.052, 0.018), steel);
        finger.position.set(-0.024 + i * 0.016, -0.024, 0);
        fingersPivot.add(finger);
      }
      group.add(fingersPivot);
      break;
    }

    case 'thighL':
    case 'thighR': {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.066, 0.28, 4, 8), cloth);
      group.add(thigh);
      if (appearance.armorTier !== 'light') {
        const cuisse = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.06, 0.24, 8), steel);
        cuisse.position.z = -0.012;
        group.add(cuisse);
      }
      break;
    }

    case 'lowerLegL':
    case 'lowerLegR': {
      const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.28, 4, 8), leather);
      group.add(calf);
      const greave = new THREE.Mesh(
        new THREE.CylinderGeometry(0.056, 0.046, 0.26, 8, 1, false, Math.PI * 0.55, Math.PI * 0.9),
        steel,
      );
      greave.position.z = -0.008;
      group.add(greave);
      // Poleyn knee cop
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 8), steel);
      knee.position.set(0, 0.16, -0.018);
      group.add(knee);
      break;
    }

    case 'footL':
    case 'footR': {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.07, 0.22), leather);
      group.add(boot);
      const toeCap = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.055, 0.08), darkIron);
      toeCap.position.set(0, -0.004, -0.08);
      group.add(toeCap);
      break;
    }
  }

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return { group, fingersPivot, flashMaterials };
}
