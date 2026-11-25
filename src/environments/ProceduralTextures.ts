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
