import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOARD, EDGES, nodeById, type Dest, type NodeId } from '../game/board';
import type { GameEvent, GameState, MoveOption, Piece, Team } from '../game/engine';
import { faceTexture, glowSpriteTexture, signTexture } from './textures';

/**
 * 복셀(큐브) 스타일 윷판 장면.
 * 칸은 숫자 없이 색으로만 구분: 일반 = 밝은 돌, 퀴즈 = 노랑, 모서리/방 = 하늘색, 출발 = 파랑.
 */

const BOARD_SCALE = 2.6;
const NODE_SIZE = 0.62;
const NODE_H = 0.22;
const TILE = 0.5;
const CHAR_H = 0.62;
const STACK_DY = CHAR_H;
const TRAY_X = 5.9;
const SIGN_X = 4.5;
const HOP_MS = 280;

const C = {
  grassA: 0x8fbf4f,
  grassB: 0x7fae45,
  grassC: 0xa3c95a,
  plazaA: 0xd8d2c0,
  plazaB: 0xcbc5b2,
  sand: 0xe6d38f,
  sandB: 0xdcc77f,
  path: 0x8d8d86,
  pathB: 0x9c9c95,
  node: 0xf3efe2,
  quiz: 0xf7c02c,
  corner: 0x6fb7ec,
  start: 0x2f6fd6,
  trunk: 0x8b5a2b,
  leafA: 0x3fae3a,
  leafB: 0x56c44a,
  mapleA: 0xd9472b,
  mapleB: 0xe8663a,
  ginkgo: 0xf2c744,
  orangeLeaf: 0xf08a3c,
  persimmon: 0xf07a2a,
  pouch: 0xc0392b,
  pouchDark: 0x8e2a1f,
  gold: 0xe6b422,
  moon: 0xfff1b8,
  cloud: 0xfff7ea,
  hanbokWhite: 0xfbf3e4,
  hair: 0x2a1c1a,
  ribbon: 0xd9472b,
  water: 0x63b7f2,
  waterB: 0x7cc8f7,
  wall: 0xf1e2c6,
  roof: 0xd6543f,
  fence: 0xb98a55,
};

export type ViewPreset = 'default' | 'top' | 'low';

interface PieceView {
  group: THREE.Group;
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  hat: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  teamId: string;
  color: string;
}

interface TeamView {
  sign: THREE.Group;
  signMat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  pouch: THREE.Group;
  side: -1 | 1;
  rowZ: number;
  name: string;
  color: string;
}

interface Tween {
  start: number;
  dur: number;
  update: (t: number) => void;
  resolve: () => void;
}

export interface SceneCallbacks {
  onPieceClick?: (pieceId: string) => void;
  onNodeClick?: (nodeId: NodeId) => void;
  onOptionClick?: (index: number) => void;
  onHop?: () => void;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map<number, THREE.MeshStandardMaterial>();
function flat(color: number): THREE.MeshStandardMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
    matCache.set(color, m);
  }
  return m;
}
function cube(color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(BOX, flat(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export class BoardScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private clock = new THREE.Clock();
  private tweens: Tween[] = [];
  private pieces = new Map<string, PieceView>();
  private teams = new Map<string, TeamView>();
  private nodeMeshes = new Map<NodeId, THREE.Mesh>();
  private quizMaterial = new THREE.MeshStandardMaterial({ color: C.quiz, roughness: 0.9, emissive: 0xb07f10, emissiveIntensity: 0.25 });
  private highlightGroup = new THREE.Group();
  private particleGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDown: { x: number; y: number } | null = null;
  private glowTex = glowSpriteTexture();
  private faceTex = faceTexture();
  private selectable = new Set<string>();
  private selectedPiece: string | null = null;
  private currentTeamId: string | null = null;
  private lastState: GameState | null = null;
  private disposed = false;
  private animating = false;

  callbacks: SceneCallbacks = {};
  adminMode = false;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 11.5, 10.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 24;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.15;
    this.controls.target.set(0, 0, 0.3);

    this.scene.fog = new THREE.Fog(0xf3d9b8, 26, 50);
    this.buildLights();
    this.buildGround();
    this.buildBoard();
    this.buildScenery();
    this.scene.add(this.highlightGroup);
    this.scene.add(this.particleGroup);

    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (this.pointerDown = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => this.handleClick(e));
    el.addEventListener('pointermove', (e) => this.handleHover(e));

    this.renderer.setAnimationLoop(() => this.frame());
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }

  // ───────────── 구축 ─────────────

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xffe9cf, 0x8a9a4a, 0.9));
    const sun = new THREE.DirectionalLight(0xffe2b8, 1.9);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 45;
    sun.shadow.camera.left = -13;
    sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 13;
    sun.shadow.camera.bottom = -13;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe6ff, 0.35);
    fill.position.set(-8, 6, -6);
    this.scene.add(fill);
  }

  /** 잔디/광장/모래 바닥을 큐브 타일로 채운다 (InstancedMesh) */
  private buildGround(): void {
    const cols = 46;
    const rows = 30;
    const inst = new THREE.InstancedMesh(BOX, new THREE.MeshStandardMaterial({ roughness: 1 }), cols * rows);
    inst.receiveShadow = true;
    inst.castShadow = false;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    let seed = 11;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const plaza = BOARD_SCALE + 0.95;
    let i = 0;
    for (let cx = 0; cx < cols; cx++) {
      for (let cz = 0; cz < rows; cz++) {
        const x = (cx - (cols - 1) / 2) * TILE;
        const z = (cz - (rows - 1) / 2) * TILE;
        let c: number;
        let y = -TILE / 2;
        const inPlaza = Math.abs(x) <= plaza && Math.abs(z) <= plaza;
        const inTray = Math.abs(x) >= SIGN_X - 0.6 && Math.abs(x) <= TRAY_X + 2.3 && Math.abs(z) <= 4.6;
        const inPond = x < -8.2 && z < -3.2 && x > -11.5 && z > -6.4;
        if (inPlaza) c = (cx + cz) % 2 === 0 ? C.plazaA : C.plazaB;
        else if (inTray) c = (cx + cz) % 2 === 0 ? C.sand : C.sandB;
        else if (inPond) {
          c = rnd() < 0.5 ? C.water : C.waterB;
          y -= 0.18;
        } else {
          const r = rnd();
          c = r < 0.45 ? C.grassA : r < 0.8 ? C.grassB : C.grassC;
          if (rnd() < 0.06) y += 0.08; // 살짝 솟은 잔디 블록
        }
        m.makeTranslation(x, y, z);
        m.scale(new THREE.Vector3(TILE, TILE, TILE));
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, color.setHex(c));
        i++;
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.scene.add(inst);

    // 광장 테두리 돌 블록
    const edge = plaza + TILE / 2;
    for (let k = -edge; k <= edge + 0.01; k += TILE) {
      for (const [x, z] of [[k, -edge], [k, edge], [-edge, k], [edge, k]] as Array<[number, number]>) {
        const b = cube(Math.abs(k / TILE) % 2 < 1 ? C.path : C.pathB, x, 0.06, z, TILE, 0.12, TILE);
        this.scene.add(b);
      }
    }
  }

  private buildBoard(): void {
    // 칸 사이 길: 회색 돌 타일
    const tileGeo = new THREE.BoxGeometry(0.3, 0.06, 0.3);
    for (const [a, b] of EDGES) {
      const na = nodeById(a);
      const nb = nodeById(b);
      const ax = na.x * BOARD_SCALE, az = na.y * BOARD_SCALE;
      const bx = nb.x * BOARD_SCALE, bz = nb.y * BOARD_SCALE;
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(2, Math.round(len / 0.34));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const tile = new THREE.Mesh(tileGeo, flat(i % 2 ? C.path : C.pathB));
        tile.position.set(ax + (bx - ax) * t, 0.03, az + (bz - az) * t);
        tile.rotation.y = -Math.atan2(bz - az, bx - ax);
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }

    // 칸: 색으로만 구분되는 블록
    for (const n of BOARD.nodes) {
      const big = n.kind === 'corner' || n.kind === 'center' || n.kind === 'start';
      const s = big ? NODE_SIZE * 1.35 : NODE_SIZE;
      const h = big ? NODE_H * 1.25 : NODE_H;
      let mat: THREE.MeshStandardMaterial;
      if (n.kind === 'quiz') mat = this.quizMaterial;
      else if (n.kind === 'start') mat = flat(C.start);
      else if (big) mat = flat(C.corner);
      else mat = flat(C.node);
      const block = new THREE.Mesh(BOX, mat);
      block.scale.set(s, h, s);
      block.position.set(n.x * BOARD_SCALE, h / 2, n.y * BOARD_SCALE);
      block.castShadow = true;
      block.receiveShadow = true;
      block.userData.nodeId = n.id;
      this.scene.add(block);
      this.nodeMeshes.set(n.id, block);

      // 윗면 안쪽 작은 사각 (픽셀 느낌의 테두리)
      const inner = cube(n.kind === 'quiz' ? 0xffd75e : n.kind === 'start' ? 0x4f8ff0 : big ? 0x93cdf5 : 0xffffff, n.x * BOARD_SCALE, h + 0.012, n.y * BOARD_SCALE, s * 0.66, 0.024, s * 0.66, false);
      this.scene.add(inner);
    }
  }

  /** 단풍 나무: palette 0 = 빨강 단풍, 1 = 주황, 2 = 은행 노랑, 3 = 아직 푸른 잎 */
  private tree(x: number, z: number, scale = 1, palette = 0): void {
    const sets: Array<[number, number]> = [
      [C.mapleA, C.mapleB],
      [C.orangeLeaf, C.mapleB],
      [C.ginkgo, 0xf7d65a],
      [C.leafA, C.leafB],
    ];
    const [a, b] = sets[palette % sets.length];
    const g = new THREE.Group();
    g.add(cube(C.trunk, 0, 0.45 * scale, 0, 0.42 * scale, 0.9 * scale, 0.42 * scale));
    const leaf = (dx: number, dy: number, dz: number, sz: number, c: number) => g.add(cube(c, dx * scale, dy * scale, dz * scale, sz * scale, sz * scale, sz * scale));
    leaf(0, 1.35, 0, 1.15, a);
    leaf(0.55, 1.2, 0.2, 0.7, b);
    leaf(-0.5, 1.35, -0.25, 0.7, b);
    leaf(0.1, 2.05, -0.1, 0.75, b);
    leaf(-0.2, 1.3, 0.55, 0.6, a);
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  /** 감나무: 짙은 잎 + 주황 감 */
  private persimmonTree(x: number, z: number, scale = 1): void {
    const g = new THREE.Group();
    g.add(cube(C.trunk, 0, 0.5 * scale, 0, 0.4 * scale, 1.0 * scale, 0.4 * scale));
    const leaf = (dx: number, dy: number, dz: number, sz: number, c: number) => g.add(cube(c, dx * scale, dy * scale, dz * scale, sz * scale, sz * scale, sz * scale));
    leaf(0, 1.4, 0, 1.1, 0x5c8a3a);
    leaf(0.5, 1.3, 0.3, 0.65, 0x6f9c44);
    leaf(-0.5, 1.5, -0.2, 0.65, 0x6f9c44);
    const fruits: Array<[number, number, number]> = [[0.45, 1.05, 0.5], [-0.5, 1.2, 0.45], [0.2, 1.8, 0.5], [-0.15, 1.0, -0.55], [0.6, 1.6, -0.35]];
    for (const [fx, fy, fz] of fruits) g.add(cube(C.persimmon, fx * scale, fy * scale, fz * scale, 0.22 * scale, 0.22 * scale, 0.22 * scale, false));
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  /** 복주머니 소품 */
  private pouch(x: number, z: number, scale = 1): void {
    const g = new THREE.Group();
    this.pouchInto(g, scale);
    g.rotation.y = 0.2;
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  private pouchInto(g: THREE.Group, scale: number): void {
    g.add(cube(C.pouch, 0, 0.26 * scale, 0, 0.5 * scale, 0.42 * scale, 0.36 * scale));
    g.add(cube(C.pouchDark, 0, 0.06 * scale, 0, 0.42 * scale, 0.12 * scale, 0.3 * scale));
    g.add(cube(C.pouch, 0, 0.52 * scale, 0, 0.34 * scale, 0.14 * scale, 0.26 * scale));
    g.add(cube(C.gold, 0, 0.5 * scale, 0, 0.4 * scale, 0.06 * scale, 0.3 * scale, false));
    g.add(cube(C.gold, -0.14 * scale, 0.66 * scale, 0, 0.08 * scale, 0.22 * scale, 0.08 * scale, false));
    g.add(cube(C.gold, 0.14 * scale, 0.66 * scale, 0, 0.08 * scale, 0.22 * scale, 0.08 * scale, false));
    g.add(cube(C.gold, 0, 0.3 * scale, 0.19 * scale, 0.14 * scale, 0.14 * scale, 0.02 * scale, false));
  }

  private house(x: number, z: number, rotY: number): void {
    const g = new THREE.Group();
    g.add(cube(C.wall, 0, 0.7, 0, 1.6, 1.4, 1.3));
    g.add(cube(C.roof, 0, 1.55, 0, 1.9, 0.3, 1.6));
    g.add(cube(C.roof, 0, 1.85, 0, 1.3, 0.3, 1.1));
    g.add(cube(C.roof, 0, 2.15, 0, 0.7, 0.3, 0.6));
    g.add(cube(0x6b4a2b, 0, 0.45, 0.66, 0.4, 0.9, 0.04, false));
    g.add(cube(0x7cc8f7, 0.5, 0.85, 0.66, 0.35, 0.35, 0.04, false));
    g.add(cube(0x7cc8f7, -0.5, 0.85, 0.66, 0.35, 0.35, 0.04, false));
    g.rotation.y = rotY;
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  private buildScenery(): void {
    // 단풍 나무들 (카메라에 보이는 외곽)
    const trees: Array<[number, number, number, number]> = [
      [-9.6, 2.2, 1.1, 0], [-8.4, 4.6, 0.9, 2], [-10.4, -0.6, 1.0, 1], [9.8, 2.6, 1.1, 1], [8.6, 4.8, 0.9, 0], [10.6, -1.0, 1.0, 2],
      [-6.4, -6.2, 1.0, 2], [-2.2, -6.6, 1.1, 0], [3.0, -6.4, 0.9, 3], [6.8, -6.3, 1.0, 1], [-4.2, 6.4, 0.8, 1], [5.2, 6.5, 0.85, 0],
    ];
    for (const [x, z, sc, pal] of trees) this.tree(x, z, sc, pal);
    this.persimmonTree(-11.2, 3.6, 1.0);
    this.persimmonTree(11.4, 4.2, 1.0);
    // 집 두 채
    this.house(-9.2, -6.0, 0.3);
    this.house(9.4, -5.6, -0.4);
    // 울타리 (뒤쪽)
    for (let x = -5.5; x <= 5.5; x += 0.75) {
      this.scene.add(cube(C.fence, x, 0.3, -7.2, 0.14, 0.6, 0.14));
    }
    this.scene.add(cube(C.fence, 0, 0.42, -7.2, 11.4, 0.1, 0.08));
    this.scene.add(cube(C.fence, 0, 0.2, -7.2, 11.4, 0.1, 0.08));
    // 울타리 위 복주머니 장식
    for (const x of [-4.5, 0, 4.5]) this.pouch(x, -7.2, 0.9);

    // 한가위 보름달 + 구름 (멀리, 안개 영향 없음)
    const moon = new THREE.Mesh(new THREE.CircleGeometry(3.2, 8), new THREE.MeshBasicMaterial({ color: C.moon, fog: false }));
    moon.position.set(-6, 15, -34);
    this.scene.add(moon);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(4.2, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.35, fog: false }));
    glow.position.set(-6, 15, -34.2);
    this.scene.add(glow);
    for (const [cx, cy, cz, w] of [[4, 12.5, -33, 4.5], [-13, 11, -33, 3.5], [12, 14.5, -34, 3]] as Array<[number, number, number, number]>) {
      const c = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: C.cloud, fog: false }));
      c.position.set(cx, cy, cz);
      c.scale.set(w, 0.9, 0.5);
      this.scene.add(c);
      const c2 = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: C.cloud, fog: false }));
      c2.position.set(cx + w * 0.2, cy + 0.6, cz);
      c2.scale.set(w * 0.5, 0.8, 0.5);
      this.scene.add(c2);
    }

    // 낙엽 + 국화/들꽃 소품
    let seed = 5;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const leafColors = [C.mapleA, C.orangeLeaf, C.ginkgo, C.mapleB];
    for (let i = 0; i < 70; i++) {
      const x = (rnd() - 0.5) * 24;
      const z = (rnd() - 0.5) * 15;
      if (Math.abs(x) < 8.2 && Math.abs(z) < 5.0) continue;
      if (x < -8 && z < -3) continue;
      const leaf = cube(leafColors[i % leafColors.length], x, 0.04, z, 0.22, 0.06, 0.16, false);
      leaf.rotation.y = rnd() * Math.PI;
      this.scene.add(leaf);
    }
    const flowerColors = [0xf2c744, 0xffffff, 0xf08a3c, 0xd9472b];
    for (let i = 0; i < 24; i++) {
      const x = (rnd() - 0.5) * 22;
      const z = (rnd() - 0.5) * 14;
      if (Math.abs(x) < 8.2 && Math.abs(z) < 5.0) continue;
      if (x < -8 && z < -3) continue;
      this.scene.add(cube(0x5c8a3a, x, 0.1, z, 0.1, 0.2, 0.1, false));
      this.scene.add(cube(flowerColors[i % flowerColors.length], x, 0.24, z, 0.18, 0.12, 0.18, false));
    }
  }

  // ───────────── 팀 / 말 뷰 ─────────────

  private ensureTeams(teams: Team[]): void {
    const same =
      this.teams.size === teams.length &&
      teams.every((t) => {
        const v = this.teams.get(t.id);
        return v && v.name === t.name && v.color === t.color;
      });
    if (same) return;
    for (const v of this.teams.values()) {
      this.scene.remove(v.sign);
      this.scene.remove(v.ring);
      this.scene.remove(v.pouch);
    }
    this.teams.clear();

    const leftCount = Math.ceil(teams.length / 2);
    const perSide = Math.max(leftCount, teams.length - leftCount);
    const spacing = Math.min(1.7, 8.6 / Math.max(perSide, 1));
    teams.forEach((t, i) => {
      const side: -1 | 1 = i < leftCount ? -1 : 1;
      const idx = side === -1 ? i : i - leftCount;
      const count = side === -1 ? leftCount : teams.length - leftCount;
      const rowZ = (idx - (count - 1) / 2) * spacing;

      // 간판: 기둥 + 판 (판 안쪽 옆에 세워 앞줄 말을 가리지 않게)
      const sign = new THREE.Group();
      const signMat = new THREE.MeshBasicMaterial({ map: signTexture(t.name, t.color) });
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.48, 0.08), [flat(0x3a1f2e), flat(0x3a1f2e), flat(0x3a1f2e), flat(0x3a1f2e), signMat, flat(0x3a1f2e)]);
      board.position.set(0, 0.5, 0);
      board.castShadow = true;
      sign.add(board);
      sign.add(cube(C.trunk, -0.55, 0.14, -0.02, 0.09, 0.28, 0.09));
      sign.add(cube(C.trunk, 0.55, 0.14, -0.02, 0.09, 0.28, 0.09));
      sign.position.set(side * SIGN_X, 0, rowZ + 0.2);
      sign.rotation.x = -0.3;
      this.scene.add(sign);

      // 현재 팀 바닥 하이라이트
      const ring = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.03, 1.25),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(t.color), transparent: true, opacity: 0 }),
      );
      ring.position.set(side * (TRAY_X + 0.55), 0.015, rowZ + 0.25);
      this.scene.add(ring);
      const pouch = new THREE.Group();
      this.pouchInto(pouch, 0.8);
      pouch.position.set(side * (TRAY_X + 1.45), 0, rowZ - 0.4);
      this.scene.add(pouch);
      this.teams.set(t.id, { sign, signMat, ring, pouch, side, rowZ, name: t.name, color: t.color });
    });
  }

  /** 한복 차림 복셀 캐릭터 말: 흰 저고리 + 팀 색 치마/깃/고름, 검은 머리 + 댕기 */
  private makeCharacter(color: string): { group: THREE.Group; body: PieceView['body']; hat: PieceView['hat'] } {
    const g = new THREE.Group();
    const c = new THREE.Color(color);
    const dark = c.clone().multiplyScalar(0.72);
    const skirtMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
    const trimMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.9 });
    const jeogori = flat(C.hanbokWhite);
    const skin = flat(0xf7d6b0);
    const shoes = flat(0x2f2a3a);
    const box = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, shadow = true) => {
      const m = new THREE.Mesh(BOX, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = shadow;
      g.add(m);
      return m;
    };
    // 신발 (버선코)
    box(shoes, -0.09, 0.03, 0.04, 0.12, 0.06, 0.16);
    box(shoes, 0.09, 0.03, 0.04, 0.12, 0.06, 0.16);
    // 치마: 아래가 넓게 두 단
    const skirt = box(skirtMat, 0, 0.13, 0, 0.4, 0.16, 0.34) as PieceView['body'];
    box(skirtMat, 0, 0.27, 0, 0.34, 0.12, 0.28);
    // 저고리 (흰색) + 깃/고름 (팀 색)
    box(jeogori, 0, 0.4, 0, 0.32, 0.16, 0.26);
    box(trimMat, 0, 0.42, 0.135, 0.06, 0.14, 0.02, false); // 깃
    box(trimMat, 0.07, 0.36, 0.14, 0.05, 0.1, 0.02, false); // 고름
    // 팔 (흰 소매, 팀 색 끝동)
    box(jeogori, -0.21, 0.4, 0, 0.1, 0.16, 0.12);
    box(jeogori, 0.21, 0.4, 0, 0.1, 0.16, 0.12);
    box(trimMat, -0.21, 0.32, 0, 0.11, 0.04, 0.13, false);
    box(trimMat, 0.21, 0.32, 0, 0.04 + 0.07, 0.04, 0.13, false);
    // 머리
    box(skin, 0, 0.62, 0, 0.3, 0.26, 0.28);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.24), new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true }));
    face.position.set(0, 0.62, 0.145);
    g.add(face);
    // 검은 머리 + 댕기 (뒤로 늘어진 팀 색 리본)
    const hair = box(flat(C.hair), 0, 0.76, 0, 0.32, 0.1, 0.3) as PieceView['hat'];
    box(flat(C.hair), 0, 0.68, -0.13, 0.32, 0.12, 0.05, false);
    box(trimMat, 0, 0.5, -0.17, 0.08, 0.3, 0.03, false); // 댕기
    box(flat(C.gold), 0, 0.8, 0, 0.1, 0.05, 0.1, false); // 배씨댕기 장식
    return { group: g, body: skirt, hat: hair };
  }

  private ensurePieces(state: GameState): void {
    const ids = new Set(state.pieces.map((p) => p.id));
    for (const [id, v] of this.pieces) {
      if (!ids.has(id)) {
        this.scene.remove(v.group);
        this.pieces.delete(id);
      }
    }
    for (const p of state.pieces) {
      const team = state.teams.find((t) => t.id === p.teamId)!;
      const existing = this.pieces.get(p.id);
      if (existing) {
        if (existing.color !== team.color) {
          const c = new THREE.Color(team.color);
          existing.body.material.color.copy(c);
          existing.color = team.color;
        }
        continue;
      }
      const { group, body, hat } = this.makeCharacter(team.color);
      group.traverse((o) => (o.userData.pieceId = p.id));
      this.scene.add(group);
      this.pieces.set(p.id, { group, body, hat, teamId: p.teamId, color: team.color });
    }
  }

  // ───────────── 위치 계산 ─────────────

  private nodeTop(node: NodeId): number {
    const n = nodeById(node);
    const big = n.kind === 'corner' || n.kind === 'center' || n.kind === 'start';
    return big ? NODE_H * 1.25 : NODE_H;
  }

  private nodeWorld(node: NodeId): THREE.Vector3 {
    const n = nodeById(node);
    return new THREE.Vector3(n.x * BOARD_SCALE, this.nodeTop(node), n.y * BOARD_SCALE);
  }

  private boardPos(state: GameState, piece: Piece, node: NodeId): THREE.Vector3 {
    const here = state.pieces.filter((p) => p.node === node && !p.done);
    const teamsHere = [...new Set(here.map((p) => p.teamId))];
    const mine = here.filter((p) => p.teamId === piece.teamId).sort((a, b) => a.id.localeCompare(b.id));
    const level = mine.findIndex((p) => p.id === piece.id);
    const pos = this.nodeWorld(node);
    if (teamsHere.length > 1) {
      const k = teamsHere.indexOf(piece.teamId);
      const ang = (k / teamsHere.length) * Math.PI * 2;
      pos.x += Math.cos(ang) * 0.24;
      pos.z += Math.sin(ang) * 0.24;
    }
    pos.y += Math.max(0, level) * STACK_DY;
    return pos;
  }

  private homePos(state: GameState, piece: Piece): THREE.Vector3 {
    const tv = this.teams.get(piece.teamId)!;
    const home = state.pieces.filter((p) => p.teamId === piece.teamId && p.node === null && !p.done).sort((a, b) => a.id.localeCompare(b.id));
    const i = Math.max(0, home.indexOf(piece));
    const n = state.piecesPerTeam;
    const x = tv.side * TRAY_X + (i - (n - 1) / 2) * 0.5;
    return new THREE.Vector3(x, 0, tv.rowZ + 0.25);
  }

  private donePos(state: GameState, piece: Piece): THREE.Vector3 {
    const tv = this.teams.get(piece.teamId)!;
    const done = state.pieces.filter((p) => p.teamId === piece.teamId && p.done).sort((a, b) => a.id.localeCompare(b.id));
    const i = Math.max(0, done.indexOf(piece));
    return new THREE.Vector3(tv.side * (TRAY_X + 1.45), i * STACK_DY, tv.rowZ + 0.25);
  }

  private targetPos(state: GameState, piece: Piece): THREE.Vector3 {
    if (piece.done) return this.donePos(state, piece);
    if (piece.node === null) return this.homePos(state, piece);
    return this.boardPos(state, piece, piece.node);
  }

  // ───────────── 상태 동기화 ─────────────

  sync(state: GameState): void {
    this.lastState = state;
    this.ensureTeams(state.teams);
    this.ensurePieces(state);
    this.restYs.clear();
    for (const p of state.pieces) {
      const v = this.pieces.get(p.id)!;
      const pos = this.targetPos(state, p);
      v.group.position.copy(pos);
      v.group.rotation.set(0, 0, 0);
      this.restYs.set(p.id, pos.y);
    }
    this.setCurrentTeam(state.phase === 'finished' ? null : state.teams[state.turnIndex]?.id ?? null);
  }

  async playEvents(state: GameState, events: GameEvent[]): Promise<void> {
    this.ensureTeams(state.teams);
    this.ensurePieces(state);
    this.clearHighlights();
    this.animating = true;
    try {
      for (const ev of events) {
        if (ev.type === 'move') await this.animateMove(state, ev.pieceIds, ev.path);
        else if (ev.type === 'catch') await this.animateCatch(state, ev.pieceIds, ev.node);
        else if (ev.type === 'quiz') this.burst(this.nodeWorld(ev.node), 0xffd75e, 30);
        else if (ev.type === 'teamFinished') {
          const tv = this.teams.get(ev.teamId);
          if (tv) this.burst(new THREE.Vector3(tv.side * (TRAY_X + 1.45), 0.5, tv.rowZ), 0xffe08a, 70);
        }
      }
    } finally {
      this.animating = false;
      this.sync(state);
    }
  }

  get isAnimating(): boolean {
    return this.animating;
  }

  private async animateMove(state: GameState, pieceIds: string[], path: Dest[]): Promise<void> {
    const views = pieceIds.map((id) => this.pieces.get(id)!).filter(Boolean);
    if (!views.length) return;
    for (let i = 0; i < path.length; i++) {
      const step = path[i];
      const last = i === path.length - 1;
      const targets = views.map((_v, k) => {
        const piece = state.pieces.find((p) => p.id === pieceIds[k])!;
        if (step === 'DONE') return this.donePos(state, piece);
        if (last) return this.targetPos(state, { ...piece, node: step, done: false });
        const base = this.nodeWorld(step);
        base.y += k * STACK_DY;
        return base;
      });
      this.callbacks.onHop?.();
      await this.hop(views, targets, step === 'DONE' ? HOP_MS * 1.8 : HOP_MS, step === 'DONE' ? 1.8 : 0.7);
    }
  }

  private async animateCatch(state: GameState, pieceIds: string[], node: NodeId): Promise<void> {
    const views = pieceIds.map((id) => this.pieces.get(id)!).filter(Boolean);
    this.burst(this.nodeWorld(node), 0xff6b4a, 40);
    const targets = views.map((_, k) => this.homePos(state, state.pieces.find((p) => p.id === pieceIds[k])!));
    await this.hop(views, targets, 650, 2.4, true);
  }

  private hop(views: PieceView[], targets: THREE.Vector3[], dur: number, height: number, spin = false): Promise<void> {
    const starts = views.map((v) => v.group.position.clone());
    const facing = views.map((v, i) => Math.atan2(targets[i].x - v.group.position.x, targets[i].z - v.group.position.z));
    return this.tween(dur, (t) => {
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      views.forEach((v, i) => {
        const p = starts[i].clone().lerp(targets[i], e);
        p.y += Math.sin(Math.PI * t) * height;
        v.group.position.copy(p);
        if (spin) v.group.rotation.set(0, t * Math.PI * 4, 0);
        else v.group.rotation.set(0, facing[i], 0);
        const squash = 1 + Math.sin(Math.PI * t) * 0.12;
        v.group.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      });
    }).then(() => {
      views.forEach((v, i) => {
        v.group.position.copy(targets[i]);
        v.group.rotation.set(0, 0, 0);
        v.group.scale.set(1, 1, 1);
      });
    });
  }

  private tween(dur: number, update: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({ start: performance.now(), dur, update, resolve });
    });
  }

  // ───────────── 강조 / 선택 ─────────────

  showOptions(options: MoveOption[]): void {
    this.clearHighlights();
    this.selectable.clear();
    options.forEach((o, i) => {
      for (const id of o.pieceIds) this.selectable.add(id);
      if (o.dest === 'DONE') return;
      const target = this.nodeWorld(o.dest);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.62, 4),
        new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      ring.position.set(target.x, target.y + 0.03, target.z);
      ring.userData.optionIndex = i;
      this.highlightGroup.add(ring);
      // 위에서 튕기는 화살표 블록
      const arrow = cube(0x4ade80, target.x, target.y + 1.1, target.z, 0.18, 0.28, 0.18, false);
      arrow.userData.optionIndex = i;
      arrow.userData.bob = true;
      this.highlightGroup.add(arrow);
    });
  }

  clearHighlights(): void {
    for (const c of [...this.highlightGroup.children]) this.highlightGroup.remove(c);
    this.selectable.clear();
  }

  markSelected(pieceId: string | null): void {
    this.selectedPiece = pieceId;
  }

  setCurrentTeam(teamId: string | null): void {
    this.currentTeamId = teamId;
  }

  // ───────────── 카메라 ─────────────

  setView(preset: ViewPreset): void {
    const from = this.camera.position.clone();
    const to =
      preset === 'top' ? new THREE.Vector3(0, 18, 0.6) : preset === 'low' ? new THREE.Vector3(0, 6, 13) : new THREE.Vector3(0, 11.5, 10.5);
    this.tween(700, (t) => {
      const e = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(from, to, e);
      this.controls.update();
    });
  }

  // ───────────── 파티클 ─────────────

  private burst(at: THREE.Vector3, color: number, count: number): void {
    const sprites: Array<{ s: THREE.Sprite; v: THREE.Vector3 }> = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, depthWrite: false }));
      s.position.copy(at);
      s.scale.setScalar(0.16 + Math.random() * 0.2);
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2.2;
      sprites.push({ s, v: new THREE.Vector3(Math.cos(ang) * sp, 2.5 + Math.random() * 3, Math.sin(ang) * sp) });
      this.particleGroup.add(s);
    }
    const dur = 1000;
    this.tween(dur, (t) => {
      const dt = dur / 1000;
      for (const { s, v } of sprites) {
        s.position.set(at.x + v.x * t * dt, at.y + (v.y * t - 4.5 * t * t) * dt, at.z + v.z * t * dt);
        (s.material as THREE.SpriteMaterial).opacity = 1 - t;
      }
    }).then(() => {
      for (const { s } of sprites) {
        this.particleGroup.remove(s);
        (s.material as THREE.SpriteMaterial).dispose();
      }
    });
  }

  // ───────────── 입력 ─────────────

  private pick(e: PointerEvent): THREE.Intersection[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects: THREE.Object3D[] = [...this.highlightGroup.children, ...this.nodeMeshes.values()];
    for (const v of this.pieces.values()) objects.push(v.group);
    return this.raycaster.intersectObjects(objects, true);
  }

  private handleClick(e: PointerEvent): void {
    if (!this.pointerDown) return;
    const moved = Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y);
    this.pointerDown = null;
    if (moved > 6) return;
    for (const hit of this.pick(e)) {
      const d = hit.object.userData;
      if (typeof d.optionIndex === 'number') {
        this.callbacks.onOptionClick?.(d.optionIndex);
        return;
      }
      if (typeof d.pieceId === 'string') {
        this.callbacks.onPieceClick?.(d.pieceId);
        return;
      }
      if (typeof d.nodeId === 'string') {
        this.callbacks.onNodeClick?.(d.nodeId as NodeId);
        return;
      }
    }
  }

  private handleHover(e: PointerEvent): void {
    if (this.pointerDown) return;
    const hits = this.pick(e);
    const interactive = hits.some((h) => {
      const d = h.object.userData;
      return typeof d.optionIndex === 'number' || (typeof d.pieceId === 'string' && (this.selectable.has(d.pieceId) || this.adminMode)) || (this.adminMode && typeof d.nodeId === 'string');
    });
    this.renderer.domElement.style.cursor = interactive ? 'pointer' : 'grab';
  }

  // ───────────── 루프 ─────────────

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    if (this.disposed) return;
    const now = performance.now();
    const elapsed = this.clock.getElapsedTime();

    for (const tw of this.tweens) tw.update(Math.min(1, (now - tw.start) / tw.dur));
    const finished = this.tweens.filter((tw) => now - tw.start >= tw.dur);
    this.tweens = this.tweens.filter((tw) => now - tw.start < tw.dur);
    for (const tw of finished) tw.resolve();

    this.quizMaterial.emissiveIntensity = 0.25 + Math.sin(elapsed * 2.5) * 0.15;

    for (const [id, v] of this.pieces) {
      const mat = v.body.material;
      if (this.selectable.has(id) || id === this.selectedPiece) {
        mat.emissive.set(0xffffff);
        mat.emissiveIntensity = 0.3 + Math.sin(elapsed * 7) * 0.2;
        if (!this.animating) v.group.position.y = this.restY(id) + Math.abs(Math.sin(elapsed * 6)) * 0.12;
      } else {
        if (this.currentTeamId && v.teamId === this.currentTeamId) {
          mat.emissive.set(v.color);
          mat.emissiveIntensity = 0.2 + Math.sin(elapsed * 3) * 0.1;
        } else mat.emissiveIntensity = 0;
        if (!this.animating) v.group.position.y = this.restY(id);
      }
    }
    for (const [tid, tv] of this.teams) {
      tv.ring.material.opacity = tid === this.currentTeamId ? 0.45 + Math.sin(elapsed * 3) * 0.2 : 0;
    }
    for (const c of this.highlightGroup.children) {
      if (c.userData.bob) c.position.y = c.userData.baseY ?? (c.userData.baseY = c.position.y);
      if (c.userData.bob) c.position.y += Math.sin(elapsed * 5) * 0.12;
      else {
        const s = 1 + Math.sin(elapsed * 5) * 0.08;
        c.scale.set(s, s, 1);
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private restYs = new Map<string, number>();
  private restY(id: string): number {
    return this.restYs.get(id) ?? 0;
  }

  get state(): GameState | null {
    return this.lastState;
  }
}
