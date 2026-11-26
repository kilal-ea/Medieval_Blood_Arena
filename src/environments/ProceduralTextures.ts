import * as THREE from 'three';

export interface ArenaTextureSet {
  stoneColor: THREE.CanvasTexture;
  sandColor: THREE.CanvasTexture;
  woodColor: THREE.CanvasTexture;
  grassColor: THREE.CanvasTexture;
}

export function createProceduralTextures(maxAnisotropy: number): ArenaTextureSet {
  const stoneColor = makeStoneFlagstoneTexture(maxAnisotropy);
  const sandColor = makeSandDirtTexture(maxAnisotropy);
  const woodColor = makeTimberTexture(maxAnisotropy);
  const grassColor = makeGrassEarthTexture(maxAnisotropy);
  return { stoneColor, sandColor, woodColor, grassColor };
}

function makeStoneFlagstoneTexture(aniso: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#534f4a';
  ctx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 4;
  const rowH = size / rows;
  const colW = size / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset;
      const y = r * rowH;
      const shade = 78 + Math.floor(Math.random() * 28);
      ctx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 9})`;
      ctx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);

      // Subtle weathering speckles
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(
          x + 5 + Math.random() * (colW - 12),
          y + 5 + Math.random() * (rowH - 12),
          3 + Math.random() * 5,
          2 + Math.random() * 4,
        );
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = aniso;
  return tex;
}

function makeSandDirtTexture(aniso: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#7b684e';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 3;
    ctx.fillStyle =
      Math.random() > 0.45 ? 'rgba(58, 44, 28, 0.22)' : 'rgba(195, 168, 125, 0.16)';
    ctx.fillRect(x, y, r, r);
  }

  // Subtle combat scuff rings
  ctx.strokeStyle = 'rgba(65, 48, 30, 0.16)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.arc(
      Math.random() * size,
      Math.random() * size,
      18 + Math.random() * 44,
      0,
      Math.PI * 1.4,
    );
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = aniso;
  return tex;
}

function makeTimberTexture(aniso: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5c3c22';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 3) {
    const v = 50 + Math.floor(Math.random() * 32);
    ctx.fillStyle = `rgba(${v + 20}, ${v}, ${Math.floor(v * 0.6)}, 0.35)`;
    ctx.fillRect(0, y, size, 2);
  }

  // Plank seams
  ctx.fillStyle = 'rgba(20, 12, 6, 0.65)';
  for (let y = 0; y < size; y += 64) {
    ctx.fillRect(0, y, size, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = aniso;
  return tex;
}

function makeGrassEarthTexture(aniso: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#384029';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(72, 84, 48, 0.35)' : 'rgba(38, 32, 22, 0.32)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.anisotropy = aniso;
  return tex;
}

export interface FighterTextureSet {
  steelColor: THREE.CanvasTexture;
  steelRoughness: THREE.CanvasTexture;
  chainmailColor: THREE.CanvasTexture;
  clothColor: THREE.CanvasTexture;
  clothRoughness: THREE.CanvasTexture;
  leatherColor: THREE.CanvasTexture;
  skinColor: THREE.CanvasTexture;
}

let cachedFighterTextures: FighterTextureSet | null = null;

function seededNoise(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

export function getFighterTextures(maxAnisotropy = 4): FighterTextureSet | null {
  if (typeof document === 'undefined') return null;
  if (cachedFighterTextures) return cachedFighterTextures;

  const aniso = Math.min(8, Math.max(1, maxAnisotropy));
  cachedFighterTextures = {
    steelColor: makeSteelColorTex(aniso),
    steelRoughness: makeSteelRoughnessTex(aniso),
    chainmailColor: makeChainmailTex(aniso),
    clothColor: makeWovenClothTex(aniso),
    clothRoughness: makeClothRoughnessTex(aniso),
    leatherColor: makeLeatherTex(aniso),
    skinColor: makeSkinTex(aniso),
  };
  return cachedFighterTextures;
}

function configureTex(
  canvas: HTMLCanvasElement,
  aniso: number,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = aniso;
  return tex;
}

function makeSteelColorTex(aniso: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const rand = seededNoise(104729);

  ctx.fillStyle = '#d4d8de';
  ctx.fillRect(0, 0, size, size);

  // Subtle hammer-forged dimples
  for (let i = 0; i < 420; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 3 + rand() * 8;
    const g = ctx.createRadialGradient(x, y, 0.5, x, y, r);
    const dark = rand() > 0.48;
    g.addColorStop(0, dark ? 'rgba(130,136,146,0.16)' : 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(200,205,212,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine directional armor-polishing & battle wear scratches
  for (let i = 0; i < 160; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 10 + rand() * 34;
    const ang = (rand() - 0.5) * 0.45;
    ctx.strokeStyle = rand() > 0.35 ? 'rgba(255,255,255,0.14)' : 'rgba(70,74,82,0.16)';
    ctx.lineWidth = 0.8 + rand() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  return configureTex(c, aniso, true, 1, 1);
}

function makeSteelRoughnessTex(aniso: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const rand = seededNoise(22193);

  ctx.fillStyle = '#585858';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 500; i++) {
    const shade = 55 + Math.floor(rand() * 75);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.22)`;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 2 + rand() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  return configureTex(c, aniso, false, 1, 1);
}

function makeChainmailTex(aniso: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#25272b';
  ctx.fillRect(0, 0, size, size);

  const stepX = 16;
  const stepY = 12;
  ctx.lineWidth = 2.4;
  for (let row = -1; row < size / stepY + 2; row++) {
    const offset = (row % 2) * (stepX * 0.5);
    for (let col = -1; col < size / stepX + 2; col++) {
      const cx = col * stepX + offset;
      const cy = row * stepY;
      ctx.strokeStyle = '#6f757e';
      ctx.beginPath();
      ctx.arc(cx, cy, 6.2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#b4bac4';
      ctx.beginPath();
      ctx.arc(cx - 0.7, cy - 0.7, 5.4, Math.PI * 0.9, Math.PI * 1.9);
      ctx.stroke();
    }
  }
  return configureTex(c, aniso, true, 3, 3);
}

function makeWovenClothTex(aniso: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const rand = seededNoise(88171);

  ctx.fillStyle = '#dcd7ce';
  ctx.fillRect(0, 0, size, size);

  // Linen/wool twill threads
  for (let y = 0; y < size; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(60,52,44,0.12)';
    ctx.fillRect(0, y, size, 1.5);
  }
  for (let x = 0; x < size; x += 3) {
    ctx.fillStyle = x % 6 === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(50,42,36,0.1)';
    ctx.fillRect(x, 0, 1.5, size);
  }

  // Subtle quilted gambeson diamond seams
  ctx.strokeStyle = 'rgba(40, 32, 26, 0.24)';
  ctx.lineWidth = 1.6;
  const step = 32;
  for (let i = -size; i < size * 2; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i, size);
    ctx.lineTo(i + size, 0);
    ctx.stroke();
  }

  for (let i = 0; i < 650; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }
  return configureTex(c, aniso, true, 2, 2);
}

function makeClothRoughnessTex(aniso: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#9c9c9c';
  ctx.lineWidth = 2;
  for (let i = -size; i < size * 2; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  return configureTex(c, aniso, false, 2, 2);
}

function makeLeatherTex(aniso: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const rand = seededNoise(51903);

  ctx.fillStyle = '#9c7f68';
  ctx.fillRect(0, 0, size, size);

  // Pebbled hide grain & crease lines
  for (let i = 0; i < 1800; i++) {
    const shade = rand() > 0.5 ? 'rgba(42,24,12,0.18)' : 'rgba(235,205,175,0.12)';
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 1.2 + rand() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 36; i++) {
    const y = rand() * size;
    ctx.strokeStyle = 'rgba(35, 18, 8, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.33, y + (rand() - 0.5) * 14, size * 0.66, y + (rand() - 0.5) * 14, size, y);
    ctx.stroke();
  }
  return configureTex(c, aniso, true, 1, 1);
}

function makeSkinTex(aniso: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const rand = seededNoise(77317);

  ctx.fillStyle = '#f2e6df';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() > 0.45 ? 'rgba(180,115,92,0.08)' : 'rgba(255,235,220,0.08)';
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 2 + rand() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return configureTex(c, aniso, true, 1, 1);
}
