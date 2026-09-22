import * as THREE from 'three';

export const PIXEL_FONT = '"DungGeunMo", "Galmuri11", "NeoDunggeunmo", "Apple SD Gothic Neo", monospace';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function crisp(t: THREE.CanvasTexture): THREE.CanvasTexture {
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

/** 팀 이름 간판 (픽셀 폰트, 팀 색 테두리) */
export function signTexture(name: string, color: string, w = 512, h = 160): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#3a1f2e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, 14);
  ctx.fillRect(0, h - 14, w, 14);
  ctx.fillStyle = '#f2c744';
  ctx.fillRect(14, 14, w - 28, h - 28);
  ctx.fillStyle = '#3a1f2e';
  ctx.fillRect(28, 28, w - 56, h - 56);
  ctx.fillStyle = color;
  ctx.fillRect(44, h / 2 - 22, 44, 44);
  ctx.fillStyle = '#fefefe';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let size = 60;
  ctx.font = `${size}px ${PIXEL_FONT}`;
  while (ctx.measureText(name).width > w - 150 && size > 24) {
    size -= 4;
    ctx.font = `${size}px ${PIXEL_FONT}`;
  }
  ctx.fillText(name, 108, h / 2 + 4);
  return crisp(new THREE.CanvasTexture(c));
}

/** 캐릭터 얼굴 (눈 두 개 + 입) */
export function faceTexture(size = 64): THREE.CanvasTexture {
  const [c, ctx] = canvas(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#1d1d1d';
  ctx.fillRect(size * 0.22, size * 0.38, size * 0.14, size * 0.16);
  ctx.fillRect(size * 0.64, size * 0.38, size * 0.14, size * 0.16);
  ctx.fillStyle = '#c94a3e';
  ctx.fillRect(size * 0.42, size * 0.68, size * 0.16, size * 0.08);
  ctx.fillStyle = 'rgba(255,120,120,0.55)';
  ctx.fillRect(size * 0.1, size * 0.58, size * 0.14, size * 0.1);
  ctx.fillRect(size * 0.76, size * 0.58, size * 0.14, size * 0.1);
  return crisp(new THREE.CanvasTexture(c));
}

/** 부드러운 원형 파티클 스프라이트 */
export function glowSpriteTexture(size = 64): THREE.CanvasTexture {
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = '#ffffff';
  const u = size / 8;
  // 픽셀 별 모양
  ctx.fillRect(3 * u, 0, 2 * u, size);
  ctx.fillRect(0, 3 * u, size, 2 * u);
  ctx.fillRect(2 * u, 2 * u, 4 * u, 4 * u);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function readableInk(hex: string): string {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return lum > 0.5 ? '#1d1d1d' : '#ffffff';
}
