import * as THREE from 'three';
import type { BodyPartId } from '../core/types';
import { getFighterTextures } from '../environments/ProceduralTextures';

export type HelmStyle = 'barbute' | 'spangenhelm' | 'kettle' | 'sallet' | 'open';
export type BeardStyle = 'none' | 'stubble' | 'goatee' | 'full';

export interface FighterAppearance {
  tunicColor: number;
  metalTint: number;
  armorTier: 'light' | 'medium' | 'heavy';
  helmStyle?: HelmStyle;
  skinTone?: number;
  hairColor?: number;
  beardStyle?: BeardStyle;
  secondaryColor?: number;
}

export interface SegmentMeshResult {
  group: THREE.Group;
  fingersPivot?: THREE.Group;
  flashMaterials: THREE.MeshStandardMaterial[];
}

interface SharedHumanoidGeometries {
  cranium: THREE.LatheGeometry;
  armoredChest: THREE.LatheGeometry;
  gambesonChest: THREE.LatheGeometry;
  waistLathe: THREE.LatheGeometry;
  upperArmLathe: THREE.LatheGeometry;
  forearmLathe: THREE.LatheGeometry;
  thighLathe: THREE.LatheGeometry;
  calfLathe: THREE.LatheGeometry;
  kettleBrim: THREE.LatheGeometry;
  salletTail: THREE.ExtrudeGeometry;
  keelRidge: THREE.ExtrudeGeometry;
  eyeSphere: THREE.SphereGeometry;
  pupilSphere: THREE.SphereGeometry;
  earSphere: THREE.SphereGeometry;
}

let cachedGeos: SharedHumanoidGeometries | null = null;

function getSharedGeometries(): SharedHumanoidGeometries {
  if (cachedGeos) return cachedGeos;

  // Anatomical skull profile (jaw taper -> cheekbones -> brow -> dome crown)
  const cranium = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.096),
      new THREE.Vector2(0.044, -0.088),
      new THREE.Vector2(0.072, -0.056),
      new THREE.Vector2(0.089, -0.015),
      new THREE.Vector2(0.096, 0.025),
      new THREE.Vector2(0.094, 0.062),
      new THREE.Vector2(0.074, 0.095),
      new THREE.Vector2(0.036, 0.114),
      new THREE.Vector2(0.0, 0.12),
    ],
    14,
  );
  cranium.computeVertexNormals();

  // Contoured breastplate cuirass profile (rib taper -> chest swell -> shoulder taper)
  const armoredChest = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.132),
      new THREE.Vector2(0.136, -0.13),
      new THREE.Vector2(0.144, -0.065),
      new THREE.Vector2(0.168, 0.02),
      new THREE.Vector2(0.172, 0.085),
      new THREE.Vector2(0.142, 0.126),
      new THREE.Vector2(0.068, 0.136),
      new THREE.Vector2(0.0, 0.138),
    ],
    14,
  );
  armoredChest.computeVertexNormals();

  // Padded gambeson under-chest
  const gambesonChest = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.138),
      new THREE.Vector2(0.132, -0.136),
      new THREE.Vector2(0.145, -0.05),
      new THREE.Vector2(0.164, 0.04),
      new THREE.Vector2(0.155, 0.115),
      new THREE.Vector2(0.068, 0.135),
      new THREE.Vector2(0.0, 0.138),
    ],
    12,
  );
  gambesonChest.computeVertexNormals();

  // Tapered abdomen / waist
  const waistLathe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.095),
      new THREE.Vector2(0.136, -0.092),
      new THREE.Vector2(0.128, -0.02),
      new THREE.Vector2(0.136, 0.05),
      new THREE.Vector2(0.142, 0.092),
      new THREE.Vector2(0.0, 0.095),
    ],
    12,
  );
  waistLathe.computeVertexNormals();

  // Deltoid-to-bicep-to-elbow upper arm profile
  const upperArmLathe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.145),
      new THREE.Vector2(0.042, -0.135),
      new THREE.Vector2(0.048, -0.05),
      new THREE.Vector2(0.055, 0.03),
      new THREE.Vector2(0.058, 0.095),
      new THREE.Vector2(0.044, 0.136),
      new THREE.Vector2(0.0, 0.145),
    ],
    10,
  );
  upperArmLathe.computeVertexNormals();

  // Muscular upper forearm tapering smoothly to wrist
  const forearmLathe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.138),
      new THREE.Vector2(0.032, -0.128),
      new THREE.Vector2(0.036, -0.055),
      new THREE.Vector2(0.047, 0.035),
      new THREE.Vector2(0.048, 0.095),
      new THREE.Vector2(0.038, 0.13),
      new THREE.Vector2(0.0, 0.138),
    ],
    10,
  );
  forearmLathe.computeVertexNormals();

  // Anatomical thigh (hip fullness tapering to knee)
  const thighLathe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.19),
      new THREE.Vector2(0.054, -0.175),
      new THREE.Vector2(0.066, -0.07),
      new THREE.Vector2(0.076, 0.04),
      new THREE.Vector2(0.078, 0.13),
      new THREE.Vector2(0.06, 0.18),
      new THREE.Vector2(0.0, 0.19),
    ],
    12,
  );
  thighLathe.computeVertexNormals();

  // Sculpted lower leg (knee taper -> gastrocnemius calf -> ankle taper)
  const calfLathe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.19),
      new THREE.Vector2(0.036, -0.178),
      new THREE.Vector2(0.042, -0.095),
      new THREE.Vector2(0.058, 0.015),
      new THREE.Vector2(0.06, 0.085),
      new THREE.Vector2(0.052, 0.155),
      new THREE.Vector2(0.042, 0.182),
      new THREE.Vector2(0.0, 0.19),
    ],
    12,
  );
  calfLathe.computeVertexNormals();

  // Sloped infantry kettle-hat brim
  const kettleBrim = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.095, 0.025),
      new THREE.Vector2(0.118, 0.015),
      new THREE.Vector2(0.158, -0.015),
      new THREE.Vector2(0.164, -0.022),
      new THREE.Vector2(0.112, 0.008),
      new THREE.Vector2(0.092, 0.018),
    ],
    16,
  );
  kettleBrim.computeVertexNormals();

  // Sallet swept lobster-tail flange
  const tailShape = new THREE.Shape();
  tailShape.moveTo(-0.075, 0.02);
  tailShape.quadraticCurveTo(0, 0.04, 0.075, 0.02);
  tailShape.lineTo(0.095, -0.075);
  tailShape.quadraticCurveTo(0, -0.09, -0.095, -0.075);
  tailShape.closePath();
  const salletTail = new THREE.ExtrudeGeometry(tailShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  salletTail.center();

  // Breastplate medial keel ridge
  const keelShape = new THREE.Shape();
  keelShape.moveTo(0, -0.115);
  keelShape.lineTo(0.016, 0.01);
  keelShape.lineTo(0.01, 0.105);
  keelShape.lineTo(-0.01, 0.105);
  keelShape.lineTo(-0.016, 0.01);
  keelShape.closePath();
  const keelRidge = new THREE.ExtrudeGeometry(keelShape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  keelRidge.center();

  cachedGeos = {
    cranium,
    armoredChest,
    gambesonChest,
    waistLathe,
    upperArmLathe,
    forearmLathe,
    thighLathe,
    calfLathe,
    kettleBrim,
    salletTail,
    keelRidge,
    eyeSphere: new THREE.SphereGeometry(0.012, 8, 8),
    pupilSphere: new THREE.SphereGeometry(0.0068, 8, 6),
    earSphere: new THREE.SphereGeometry(0.022, 8, 6),
  };
  return cachedGeos;
}

function deriveSecondaryColor(primary: number): number {
  const c = new THREE.Color(primary);
  c.offsetHSL(0.04, -0.1, -0.14);
  return c.getHex();
}

export function createSegmentMesh(
  partId: BodyPartId,
  appearance: FighterAppearance,
): SegmentMeshResult {
  const group = new THREE.Group();
  group.name = `seg_${partId}`;

  const geos = getSharedGeometries();
  const tex = getFighterTextures(4);

  const skinColor = appearance.skinTone ?? 0xcf9b78;
  const hairColor = appearance.hairColor ?? 0x362216;
  const beardStyle: BeardStyle = appearance.beardStyle ?? 'stubble';
  const helmStyle: HelmStyle =
    appearance.helmStyle ??
    (appearance.armorTier === 'heavy'
      ? 'sallet'
      : appearance.armorTier === 'medium'
        ? 'spangenhelm'
        : 'kettle');
  const secondaryHex = appearance.secondaryColor ?? deriveSecondaryColor(appearance.tunicColor);

  const steel = new THREE.MeshStandardMaterial({
    color: appearance.metalTint,
    map: tex?.steelColor ?? null,
    roughnessMap: tex?.steelRoughness ?? null,
    metalness: 0.88,
    roughness: 0.34,
  });

  const darkIron = new THREE.MeshStandardMaterial({
    color: 0x3b3f47,
    map: tex?.steelColor ?? null,
    roughnessMap: tex?.steelRoughness ?? null,
    metalness: 0.82,
    roughness: 0.46,
  });

  const chainmail = new THREE.MeshStandardMaterial({
    color: 0xb4bac4,
    map: tex?.chainmailColor ?? null,
    metalness: 0.78,
    roughness: 0.44,
  });

  const cloth = new THREE.MeshStandardMaterial({
    color: appearance.tunicColor,
    map: tex?.clothColor ?? null,
    roughnessMap: tex?.clothRoughness ?? null,
    metalness: 0.04,
    roughness: 0.86,
  });

  const trimCloth = new THREE.MeshStandardMaterial({
    color: secondaryHex,
    map: tex?.clothColor ?? null,
    roughnessMap: tex?.clothRoughness ?? null,
    metalness: 0.05,
    roughness: 0.82,
  });

  const leather = new THREE.MeshStandardMaterial({
    color: 0x452a19,
    map: tex?.leatherColor ?? null,
    metalness: 0.06,
    roughness: 0.76,
  });

  const skin = new THREE.MeshStandardMaterial({
    color: skinColor,
    map: tex?.skinColor ?? null,
    metalness: 0.02,
    roughness: 0.66,
  });

  const brass = new THREE.MeshStandardMaterial({
    color: 0xc99c3c,
    metalness: 0.88,
    roughness: 0.25,
  });

  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColor,
    metalness: 0.03,
    roughness: 0.84,
  });

  const stubbleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skinColor).lerp(new THREE.Color(hairColor), 0.45),
    metalness: 0.02,
    roughness: 0.76,
  });

  const scleraMat = new THREE.MeshStandardMaterial({
    color: 0xf0ece5,
    metalness: 0.0,
    roughness: 0.35,
  });

  const irisColor = (appearance.tunicColor & 0x1) === 0 ? 0x435b70 : 0x523c24;
  const irisMat = new THREE.MeshStandardMaterial({
    color: irisColor,
    metalness: 0.05,
    roughness: 0.28,
  });

  const lipMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skinColor).lerp(new THREE.Color(0x884840), 0.36),
    metalness: 0.01,
    roughness: 0.62,
  });

  const flashMaterials: THREE.MeshStandardMaterial[] = [
    steel,
    darkIron,
    chainmail,
    cloth,
    trimCloth,
    leather,
    skin,
  ];
  let fingersPivot: THREE.Group | undefined;

  switch (partId) {
    case 'head': {
      // 1. Sculpted anatomical head & jaw (forward = -Z)
      const cranium = new THREE.Mesh(geos.cranium, skin);
      cranium.scale.set(0.84, 1.0, 1.03);
      group.add(cranium);

      const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.056, 0.102), skin);
      lowerJaw.position.set(0, -0.056, -0.022);
      group.add(lowerJaw);

      const chin = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), skin);
      chin.scale.set(1.05, 0.85, 0.9);
      chin.position.set(0, -0.076, -0.062);
      group.add(chin);

      // Cheekbones & brow ridge for real facial structure
      for (const side of [-1, 1]) {
        const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), skin);
        cheek.scale.set(1.1, 0.82, 0.9);
        cheek.position.set(side * 0.038, -0.014, -0.068);
        group.add(cheek);

        // Ears
        const ear = new THREE.Mesh(geos.earSphere, skin);
        ear.scale.set(0.45, 1.15, 0.72);
        ear.position.set(side * 0.084, -0.008, 0.004);
        ear.rotation.y = side * 0.2;
        group.add(ear);
      }

      const browRidge = new THREE.Mesh(new THREE.BoxGeometry(0.114, 0.02, 0.036), skin);
      browRidge.position.set(0, 0.022, -0.08);
      group.add(browRidge);

      // Sculpted nose (bridge + tip + nostrils)
      const noseBridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.03), skin);
      noseBridge.position.set(0, -0.006, -0.092);
      noseBridge.rotation.x = 0.24;
      group.add(noseBridge);

      const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), skin);
      noseTip.position.set(0, -0.025, -0.104);
      group.add(noseTip);

      // Eyes (sclera + colored iris + upper eyelid + focused eyebrow)
      for (const side of [-1, 1]) {
        const eyeX = side * 0.03;
        const eyeY = 0.006;
        const eyeZ = -0.082;

        const sclera = new THREE.Mesh(geos.eyeSphere, scleraMat);
        sclera.scale.set(1.05, 0.76, 0.8);
        sclera.position.set(eyeX, eyeY, eyeZ);
        group.add(sclera);

        const iris = new THREE.Mesh(geos.pupilSphere, irisMat);
        iris.position.set(eyeX, eyeY, eyeZ - 0.0075);
        group.add(iris);

        const upperLid = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.008, 0.016), skin);
        upperLid.position.set(eyeX, eyeY + 0.0085, eyeZ - 0.004);
        upperLid.rotation.z = -side * 0.08;
        group.add(upperLid);

        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.008, 0.014), hairMat);
        brow.position.set(eyeX, eyeY + 0.019, eyeZ - 0.007);
        brow.rotation.z = side * 0.12;
        group.add(brow);
      }

      // Subtle lips / mouth
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.008, 0.014), lipMat);
      mouth.position.set(0, -0.049, -0.083);
      group.add(mouth);

      // Hair crown & nape locks
      const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.098, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
        hairMat,
      );
      hairCap.scale.set(0.87, 1.0, 1.06);
      hairCap.position.set(0, 0.016, 0.006);
      group.add(hairCap);

      const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.082, 0.07), hairMat);
      backHair.position.set(0, -0.028, 0.068);
      group.add(backHair);

      // Facial hair variations
      if (beardStyle === 'stubble') {
        const stub = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.046, 0.072), stubbleMat);
        stub.position.set(0, -0.062, -0.036);
        group.add(stub);
      } else if (beardStyle === 'goatee') {
        const stache = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.01, 0.018), hairMat);
        stache.position.set(0, -0.04, -0.088);
        const chinBeard = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.062, 8), hairMat);
        chinBeard.rotation.x = Math.PI;
        chinBeard.position.set(0, -0.086, -0.068);
        group.add(stache, chinBeard);
      } else if (beardStyle === 'full') {
        const stache = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.013, 0.02), hairMat);
        stache.position.set(0, -0.04, -0.09);
        const beardMass = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.068, 0.088), hairMat);
        beardMass.position.set(0, -0.072, -0.038);
        const beardTip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.06, 8), hairMat);
        beardTip.rotation.x = Math.PI;
        beardTip.position.set(0, -0.104, -0.052);
        group.add(stache, beardMass, beardTip);
      }

      // 2. Varied Medieval Helmets (all preserve visible facial features & eyes)
      if (helmStyle === 'barbute') {
        // Open T-faced Barbute: steel skull + side cheekplates + flared neck guard + brass brow rim
        const skull = new THREE.Mesh(
          new THREE.SphereGeometry(0.106, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
          steel,
        );
        skull.scale.set(0.92, 1.05, 1.08);
        skull.position.set(0, 0.016, 0.006);
        group.add(skull);

        // Cheek & back plates wrapping around leaving open face (-Z center)
        const wrapPlate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.104, 0.112, 0.135, 14, 1, true, Math.PI * 0.18, Math.PI * 1.64),
          steel,
        );
        wrapPlate.material = new THREE.MeshStandardMaterial({
          color: appearance.metalTint,
          map: tex?.steelColor ?? null,
          roughnessMap: tex?.steelRoughness ?? null,
          metalness: 0.88,
          roughness: 0.34,
          side: THREE.DoubleSide,
        });
        flashMaterials.push(wrapPlate.material);
        wrapPlate.position.set(0, -0.028, 0.008);
        group.add(wrapPlate);

        // Brass brow arch & nasal strip
        const browBand = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.008, 6, 16), brass);
        browBand.rotation.x = Math.PI * 0.5;
        browBand.position.set(0, 0.035, 0.002);
        group.add(browBand);

        const noseGuard = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.042, 0.014), steel);
        noseGuard.position.set(0, 0.014, -0.098);
        group.add(noseGuard);
      } else if (helmStyle === 'spangenhelm') {
        // Spangenhelm with iron cross-bands, nasal bar & maille cheek/neck aventail
        const bowl = new THREE.Mesh(
          new THREE.SphereGeometry(0.105, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
          steel,
        );
        bowl.scale.set(0.92, 1.02, 1.06);
        bowl.position.set(0, 0.022, 0.004);
        group.add(bowl);

        const rimBand = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.024, 14), darkIron);
        rimBand.scale.set(0.92, 1, 1.06);
        rimBand.position.set(0, 0.03, 0.004);
        group.add(rimBand);

        const spangenCross = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.09, 0.215), brass);
        spangenCross.position.set(0, 0.072, 0.004);
        group.add(spangenCross);

        const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.056, 0.012), steel);
        nasal.position.set(0, 0.004, -0.102);
        group.add(nasal);

        // Maille aventail wrapping ears/sides/back
        const mailleHood = new THREE.Mesh(
          new THREE.CylinderGeometry(0.102, 0.114, 0.105, 14, 1, false, -Math.PI * 0.65, Math.PI * 1.3),
          chainmail,
        );
        mailleHood.position.set(0, -0.035, 0.012);
        group.add(mailleHood);
      } else if (helmStyle === 'kettle') {
        // Wide-brimmed infantry kettle hat over padded arming cap (full face clearly exposed)
        const paddedCoif = new THREE.Mesh(
          new THREE.CylinderGeometry(0.098, 0.106, 0.105, 12, 1, false, -Math.PI * 0.65, Math.PI * 1.3),
          cloth,
        );
        paddedCoif.position.set(0, -0.032, 0.012);
        group.add(paddedCoif);

        const kettleCrown = new THREE.Mesh(
          new THREE.SphereGeometry(0.105, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
          steel,
        );
        kettleCrown.scale.set(0.95, 1.05, 1.05);
        kettleCrown.position.set(0, 0.034, 0.004);
        group.add(kettleCrown);

        const brim = new THREE.Mesh(geos.kettleBrim, steel);
        brim.scale.set(0.96, 1.0, 1.05);
        brim.position.set(0, 0.036, 0.004);
        group.add(brim);

        const chinStrap = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.012, 0.018), leather);
        chinStrap.position.set(0, -0.088, -0.018);
        group.add(chinStrap);
      } else if (helmStyle === 'sallet') {
        // Gothic Sallet with swept tail & raised hinged visor revealing eyes/nose/lower face
        const skull = new THREE.Mesh(
          new THREE.SphereGeometry(0.107, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
          steel,
        );
        skull.scale.set(0.93, 1.04, 1.08);
        skull.position.set(0, 0.024, 0.006);
        group.add(skull);

        const tail = new THREE.Mesh(geos.salletTail, steel);
        tail.position.set(0, -0.012, 0.112);
        tail.rotation.x = -0.38;
        group.add(tail);

        // Raised open visor tilted upward above brow so warrior's face is visible
        const raisedVisor = new THREE.Group();
        raisedVisor.position.set(0, 0.048, -0.055);
        raisedVisor.rotation.x = 0.58;
        const visorPlate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.106, 0.1, 0.054, 12, 1, false, Math.PI * 0.62, Math.PI * 0.76),
          steel,
        );
        visorPlate.position.set(0, 0.008, 0.035);
        const visorTrim = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.01, 0.022), brass);
        visorTrim.position.set(0, -0.018, -0.058);
        raisedVisor.add(visorPlate, visorTrim);
        group.add(raisedVisor);

        const crest = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.028, 0.18), brass);
        crest.position.set(0, 0.125, 0.012);
        group.add(crest);
      } else {
        // 'open' — veteran unhelmeted fighter with forged brow circlet
        const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.007, 6, 16), brass);
        circlet.rotation.x = Math.PI * 0.5;
        circlet.scale.set(0.9, 1.06, 1);
        circlet.position.set(0, 0.044, 0.002);
        group.add(circlet);
      }
      break;
    }

    case 'neck': {
      // Exposed neck flesh at front + chainmail aventail + steel gorget collar
      const neckCore = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.054, 0.092, 10), skin);
      group.add(neckCore);

      const aventail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.056, 0.088, 0.072, 12),
        chainmail,
      );
      aventail.position.y = -0.012;
      group.add(aventail);

      if (appearance.armorTier !== 'light') {
        const gorget = new THREE.Mesh(
          new THREE.CylinderGeometry(0.062, 0.094, 0.046, 12),
          steel,
        );
        gorget.position.y = -0.028;
        const trim = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.007, 6, 14), brass);
        trim.rotation.x = Math.PI * 0.5;
        trim.position.y = -0.006;
        group.add(gorget, trim);
      }
      break;
    }

    case 'chest': {
      // Sculpted quilted gambeson base
      const gambeson = new THREE.Mesh(geos.gambesonChest, cloth);
      gambeson.scale.set(1.02, 1.0, 0.68);
      group.add(gambeson);

      if (appearance.armorTier === 'light') {
        // Reinforced leather brigandine vest + heraldic sash
        const vest = new THREE.Mesh(geos.armoredChest, leather);
        vest.scale.set(1.01, 0.94, 0.69);
        group.add(vest);
      } else {
        // Articulated steel cuirass with central medial keel ridge & shoulder straps
        const cuirass = new THREE.Mesh(geos.armoredChest, steel);
        cuirass.scale.set(1.04, 0.95, 0.72);
        group.add(cuirass);

        const keel = new THREE.Mesh(geos.keelRidge, steel);
        keel.position.set(0, 0.01, -0.118);
        group.add(keel);

        // Collar rim & shoulder strap buckles
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.012, 6, 14), brass);
        collar.rotation.x = Math.PI * 0.5;
        collar.scale.set(1.1, 0.85, 1);
        collar.position.y = 0.125;
        group.add(collar);
      }

      // Heraldic surcoat center tabard (front & back) + contrasting trim
      const tabardFront = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.25, 0.022), cloth);
      tabardFront.position.set(0, -0.005, -0.116);
      const tabardTrim = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.024, 0.024), trimCloth);
      tabardTrim.position.set(0, -0.118, -0.116);
      const tabardBack = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.022), cloth);
      tabardBack.position.set(0, -0.005, 0.112);
      group.add(tabardFront, tabardTrim, tabardBack);

      // Diagonal leather baldric strap across chest
      const baldric = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.3, 0.238), leather);
      baldric.rotation.z = 0.54;
      group.add(baldric);
      break;
    }

    case 'abdomen': {
      // Sculpted quilted waist
      const waist = new THREE.Mesh(geos.waistLathe, cloth);
      waist.scale.set(1.02, 1.0, 0.7);
      group.add(waist);

      // Layered chainmail mid-skirt or 3-lame steel fauld
      if (appearance.armorTier === 'heavy') {
        for (let i = 0; i < 3; i++) {
          const lame = new THREE.Mesh(
            new THREE.CylinderGeometry(0.138 + i * 0.006, 0.144 + i * 0.006, 0.048, 12),
            steel,
          );
          lame.scale.set(1.04, 1, 0.72);
          lame.position.y = 0.055 - i * 0.045;
          group.add(lame);
        }
      } else {
        const mailWaist = new THREE.Mesh(
          new THREE.CylinderGeometry(0.136, 0.144, 0.13, 12),
          chainmail,
        );
        mailWaist.scale.set(1.03, 1, 0.71);
        mailWaist.position.y = 0.015;
        group.add(mailWaist);
      }

      // Pebbled leather sword belt + brass buckle + side pouch
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.296, 0.046, 0.206), leather);
      belt.position.y = -0.042;
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.052, 0.02), brass);
      buckle.position.set(0, -0.042, -0.106);
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.068, 0.045), leather);
      pouch.position.set(0.142, -0.065, -0.02);
      group.add(belt, buckle, pouch);
      break;
    }

    case 'pelvis': {
      // Chainmail hauberk hem + split heraldic surcoat skirt
      const mailSkirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.138, 0.156, 0.15, 12),
        chainmail,
      );
      mailSkirt.scale.set(1.02, 1, 0.72);
      group.add(mailSkirt);

      const surcoatFront = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.17, 0.024), cloth);
      surcoatFront.position.set(0, -0.01, -0.104);
      const surcoatFrontTrim = new THREE.Mesh(new THREE.BoxGeometry(0.168, 0.022, 0.026), trimCloth);
      surcoatFrontTrim.position.set(0, -0.085, -0.104);
      const surcoatBack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.17, 0.024), cloth);
      surcoatBack.position.set(0, -0.01, 0.104);
      group.add(surcoatFront, surcoatFrontTrim, surcoatBack);

      // Strapped side/front tassets on medium & heavy armor
      if (appearance.armorTier !== 'light') {
        const tassetMat = appearance.armorTier === 'heavy' ? steel : darkIron;
        for (const side of [-1, 1]) {
          const tasset = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.135, 0.032), tassetMat);
          tasset.position.set(side * 0.095, -0.03, -0.098);
          tasset.rotation.y = -side * 0.18;
          tasset.rotation.x = -0.08;
          const stud = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), brass);
          stud.position.set(side * 0.095, 0.018, -0.114);
          group.add(tasset, stud);
        }
      }
      break;
    }

    case 'upperArmL':
    case 'upperArmR': {
      const sideSign = partId === 'upperArmL' ? -1 : 1;
      const sleeve = new THREE.Mesh(geos.upperArmLathe, cloth);
      group.add(sleeve);

      const mailSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.045, 0.12, 10), chainmail);
      mailSleeve.position.y = -0.06;
      group.add(mailSleeve);

      // Multi-lame shoulder pauldron + protective rondel
      const pauldronMat = appearance.armorTier === 'light' ? leather : steel;
      const topPauldron = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56),
        pauldronMat,
      );
      topPauldron.position.set(sideSign * 0.014, 0.106, 0);
      topPauldron.rotation.z = -sideSign * 0.34;
      group.add(topPauldron);

      if (appearance.armorTier !== 'light') {
        const lowerLame = new THREE.Mesh(
          new THREE.CylinderGeometry(0.066, 0.06, 0.048, 10, 1, false, -Math.PI * 0.55, Math.PI * 1.1),
          pauldronMat,
        );
        lowerLame.position.set(sideSign * 0.01, 0.055, 0);
        lowerLame.rotation.y = sideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        group.add(lowerLame);

        const rondel = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.01, 10), brass);
        rondel.rotation.x = Math.PI * 0.5;
        rondel.position.set(-sideSign * 0.025, 0.088, -0.052);
        group.add(rondel);
      }
      break;
    }

    case 'forearmL':
    case 'forearmR': {
      const sideSign = partId === 'forearmL' ? -1 : 1;
      const arm = new THREE.Mesh(geos.forearmLathe, leather);
      group.add(arm);

      // Contoured steel vambrace bracer + leather straps
      const vambraceMat = appearance.armorTier === 'light' ? leather : steel;
      const vambrace = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.035, 0.19, 10), vambraceMat);
      vambrace.position.y = -0.01;
      group.add(vambrace);

      for (const yOff of [-0.06, 0.03]) {
        const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.043, 0.016, 10), leather);
        strap.position.y = yOff;
        group.add(strap);
      }

      // Winged elbow couter cop
      if (appearance.armorTier !== 'light') {
        const couter = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), steel);
        couter.position.set(0, 0.132, 0.018);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.055), darkIron);
        wing.position.set(sideSign * 0.044, 0.132, 0);
        group.add(couter, wing);
      }
      break;
    }

    case 'handL':
    case 'handR': {
      const sideSign = partId === 'handL' ? 1 : -1;
      const palmMat = appearance.armorTier === 'light' ? leather : darkIron;
      const plateMat = appearance.armorTier === 'light' ? leather : steel;

      // Contoured palm + cuff + armored knuckle plate
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.082, 0.044), palmMat);
      group.add(palm);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.038, 10), plateMat);
      cuff.position.y = 0.046;
      group.add(cuff);

      const knucklePlate = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.026, 0.022), plateMat);
      knucklePlate.position.set(0, -0.022, 0.018);
      group.add(knucklePlate);

      // Opposable thumb
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.032, 4, 6), plateMat);
      thumb.position.set(sideSign * 0.036, -0.014, -0.018);
      thumb.rotation.z = sideSign * 0.5;
      group.add(thumb);

      // Articulated 4-finger group with realistic staggered finger lengths
      fingersPivot = new THREE.Group();
      fingersPivot.position.set(0, -0.04, -0.01);
      const lengths = [0.046, 0.052, 0.048, 0.04];
      for (let i = 0; i < 4; i++) {
        const finger = new THREE.Mesh(
          new THREE.BoxGeometry(0.013, lengths[i], 0.016),
          plateMat,
        );
        finger.position.set(-0.023 + i * 0.0155, -lengths[i] * 0.5, 0);
        fingersPivot.add(finger);
      }
      group.add(fingersPivot);
      break;
    }

    case 'thighL':
    case 'thighR': {
      const thigh = new THREE.Mesh(geos.thighLathe, cloth);
      group.add(thigh);

      if (appearance.armorTier !== 'light') {
        const cuisse = new THREE.Mesh(
          new THREE.CylinderGeometry(0.077, 0.058, 0.27, 10, 1, false, Math.PI * 0.45, Math.PI * 1.1),
          steel,
        );
        cuisse.position.z = -0.008;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.07, 0.018, 10), leather);
        band.position.y = 0.04;
        group.add(cuisse, band);
      } else {
        const leatherCuisse = new THREE.Mesh(
          new THREE.CylinderGeometry(0.074, 0.058, 0.24, 10),
          leather,
        );
        group.add(leatherCuisse);
      }
      break;
    }

    case 'lowerLegL':
    case 'lowerLegR': {
      const sideSign = partId === 'lowerLegL' ? -1 : 1;
      const calf = new THREE.Mesh(geos.calfLathe, leather);
      group.add(calf);

      const greaveMat = appearance.armorTier === 'light' ? leather : steel;
      const greave = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.041, 0.28, 10, 1, false, Math.PI * 0.48, Math.PI * 1.04),
        greaveMat,
      );
      greave.position.z = -0.008;
      group.add(greave);

      // Boot cuff strap + winged poleyn knee cop
      const ankleStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.043, 0.024, 10), leather);
      ankleStrap.position.y = -0.145;
      group.add(ankleStrap);

      if (appearance.armorTier !== 'light') {
        const knee = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 8), steel);
        knee.scale.set(0.95, 1.05, 0.85);
        knee.position.set(0, 0.165, -0.02);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.056, 0.052), darkIron);
        wing.position.set(sideSign * 0.052, 0.165, -0.006);
        group.add(knee, wing);
      }
      break;
    }

    case 'footL':
    case 'footR': {
      const bootMat = leather;
      const sabatonMat = appearance.armorTier === 'heavy' ? steel : darkIron;

      // Sculpted sole + heel + raised instep vamp + tapered medieval toe
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.024, 0.224), darkIron);
      sole.position.set(0, -0.024, 0);
      group.add(sole);

      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.056, 0.095), bootMat);
      heel.position.set(0, 0.004, 0.058);
      group.add(heel);

      const vamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.054, 0.125, 10),
        appearance.armorTier === 'heavy' ? sabatonMat : bootMat,
      );
      vamp.rotation.x = Math.PI * 0.44;
      vamp.scale.set(1.06, 1, 0.65);
      vamp.position.set(0, -0.002, -0.036);
      group.add(vamp);

      const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), sabatonMat);
      toeCap.scale.set(1.05, 0.62, 1.15);
      toeCap.position.set(0, -0.012, -0.088);
      group.add(toeCap);

      const instepStrap = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.016, 0.034), leather);
      instepStrap.position.set(0, 0.022, 0.004);
      group.add(instepStrap);
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
