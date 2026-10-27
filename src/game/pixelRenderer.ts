import {
  Door,
  Enemy,
  JumpscareVisualId,
  PlayerState,
  RoomDefinition,
  RoomProp,
  WorldPickup,
} from './types';
import { isPointInFlashlightCone, projectPseudo3D } from './rules';

export const INTERNAL_WIDTH = 400;
export const INTERNAL_HEIGHT = 225;

// Pseudo-3D Room Box Geometry Constants
const BACK_WALL_TOP = 24;
const BACK_WALL_BOTTOM = 74;
const BACK_WALL_LEFT = 88;
const BACK_WALL_RIGHT = 312;

const FRONT_FLOOR_BOTTOM = 215;
const FRONT_LEFT = 8;
const FRONT_RIGHT = 392;

// Zero-GC Pooled Particle Ring Buffer (in World Coordinates, projected to Pseudo-3D on draw)
interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  zHeight: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const PARTICLE_POOL_SIZE = 96;
const particlePool: PooledParticle[] = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
  active: false,
  x: 0,
  y: 0,
  zHeight: 8,
  vx: 0,
  vy: 0,
  vz: 0,
  life: 0,
  maxLife: 1,
  color: '#991b1b',
  size: 2,
}));
let poolCursor = 0;

export function spawnParticles(
  x: number,
  y: number,
  count: number,
  color: string,
  speedRange: number,
  lifeSec = 0.45,
  size = 2
): void {
  for (let i = 0; i < count; i++) {
    const p = particlePool[poolCursor];
    poolCursor = (poolCursor + 1) % PARTICLE_POOL_SIZE;
    const angle = Math.random() * Math.PI * 2;
    const spd = (0.25 + Math.random() * 0.75) * speedRange;
    p.active = true;
    p.x = x;
    p.y = y;
    p.zHeight = 10 + Math.random() * 10;
    p.vx = Math.cos(angle) * spd;
    p.vy = Math.sin(angle) * spd;
    p.vz = 15 + Math.random() * 25;
    p.life = lifeSec * (0.7 + Math.random() * 0.4);
    p.maxLife = p.life;
    p.color = color;
    p.size = size;
  }
}

export function stepAndRenderParticles(ctx: CanvasRenderingContext2D, dt: number): void {
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    const p = particlePool[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.zHeight = Math.max(0, p.zHeight + p.vz * dt);
    p.vz -= 90 * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;

    const proj = projectPseudo3D(p.x, p.y);
    const sz = Math.max(1, Math.round(p.size * proj.scale));
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillRect(
      Math.round(proj.sx - sz / 2),
      Math.round(proj.sy - p.zHeight * proj.scale),
      sz,
      sz
    );
  }
  ctx.globalAlpha = 1;
}

// Offscreen lighting canvas for atmospheric darkness & pseudo-3D flashlight cone
let lightCanvas: HTMLCanvasElement | null = null;
let lightCtx: CanvasRenderingContext2D | null = null;

function ensureLightCanvas(): CanvasRenderingContext2D | null {
  if (!lightCanvas && typeof document !== 'undefined') {
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = INTERNAL_WIDTH;
    lightCanvas.height = INTERNAL_HEIGHT;
    lightCtx = lightCanvas.getContext('2d');
  }
  return lightCtx;
}

export function renderPixelRoom(
  ctx: CanvasRenderingContext2D,
  room: RoomDefinition,
  player: PlayerState,
  enemies: Enemy[],
  pickups: WorldPickup[],
  activeJumpscare: { visualId: JumpscareVisualId; timer: number; duration: number } | null,
  muzzleFlashTimer: number,
  bulletTrace: { x1: number; y1: number; x2: number; y2: number; timer: number } | null,
  timeSec: number,
  reducedFlash: boolean,
  dt: number
): void {
  ctx.save();

  // Camera Subtle Horizontal Parallax Shift based on Player X (-10px to +10px)
  const camParallaxX = Math.round(((200 - player.x) / 180) * 8);
  ctx.translate(camParallaxX, 0);

  // 1. 16-Bit Pseudo-3D Ceiling / Night Sky & Perspective Rafters
  drawPseudo3DCeiling(ctx, room, timeSec);

  // 2. 16-Bit Scanline Perspective Checkered / Textured Floor (Mode-7 style)
  drawPseudo3DScanlineFloor(ctx, room, timeSec);

  // 3. 3D Perspective Back Wall & Angled Left/Right Side Walls with Wainscoting & Pillars
  drawPseudo3DWalls(ctx, room, timeSec);

  // 4. Doors Projected onto North Back Wall, West/East Side Walls, and South Foreground Threshold
  for (const door of room.doors) {
    drawPseudo3DDoor(ctx, door);
  }

  // 5. Perspective Floor Decals (Bloodstains, Bio-fluid, Rugs)
  drawPseudo3DDecals(ctx, room);

  // 6. Painter's Algorithm Depth Sort for All 3D Entities (Props, Pickups, Enemies, Player)
  type Renderable3D =
    | { kind: 'prop'; depthY: number; prop: RoomProp }
    | { kind: 'pickup'; depthY: number; pickup: WorldPickup }
    | { kind: 'enemy'; depthY: number; enemy: Enemy }
    | { kind: 'player'; depthY: number };

  const renderQueue: Renderable3D[] = [];

  for (const prop of room.props) {
    renderQueue.push({
      kind: 'prop',
      depthY: prop.y + prop.height * 0.65,
      prop,
    });
  }

  for (const pickup of pickups) {
    if (!pickup.collected && pickup.roomId === room.id) {
      renderQueue.push({
        kind: 'pickup',
        depthY: pickup.y,
        pickup,
      });
    }
  }

  for (const enemy of enemies) {
    if (enemy.roomId === room.id) {
      renderQueue.push({
        kind: 'enemy',
        depthY: enemy.y,
        enemy,
      });
    }
  }

  renderQueue.push({
    kind: 'player',
    depthY: player.y,
  });

  // Sort strictly far-to-near (ascending depthY)
  renderQueue.sort((a, b) => a.depthY - b.depthY);

  for (const item of renderQueue) {
    if (item.kind === 'prop') {
      drawPseudo3DProp(ctx, item.prop, timeSec);
    } else if (item.kind === 'pickup') {
      drawPseudo3DPickup(ctx, item.pickup, timeSec);
    } else if (item.kind === 'enemy') {
      drawPseudo3DEnemy(ctx, item.enemy, player);
    } else if (item.kind === 'player') {
      drawPseudo3DPlayer(ctx, player, muzzleFlashTimer);
    }
  }

  // 7. Projected 3D Bullet Trace
  if (bulletTrace && bulletTrace.timer > 0) {
    const p1 = projectPseudo3D(bulletTrace.x1, bulletTrace.y1);
    const p2 = projectPseudo3D(bulletTrace.x2, bulletTrace.y2);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.round(p1.sx), Math.round(p1.sy - 14 * p1.scale));
    ctx.lineTo(Math.round(p2.sx), Math.round(p2.sy - 14 * p2.scale));
    ctx.stroke();
  }

  // 8. Pooled 3D Particles
  stepAndRenderParticles(ctx, dt);

  // 9. Atmospheric Rain / Spores / Dust in 3D Depth
  drawAtmosphericParticles3D(ctx, room, timeSec);

  ctx.restore();

  // 10. Dynamic Pseudo-3D Darkness, Sconces & Perspective Flashlight Cone
  renderPseudo3DLightingPass(ctx, room, player, muzzleFlashTimer, timeSec, camParallaxX);

  // 11. Fixed-Camera Viewfinder Overlay
  drawCameraCornerOverlay(ctx, room, timeSec);

  // 12. Scripted Cinematic Jumpscare Overlay
  if (activeJumpscare && activeJumpscare.timer > 0) {
    drawCinematicJumpscare(
      ctx,
      activeJumpscare.visualId,
      activeJumpscare.timer,
      activeJumpscare.duration,
      reducedFlash
    );
  }
}

function drawPseudo3DCeiling(ctx: CanvasRenderingContext2D, room: RoomDefinition, timeSec: number): void {
  // Fill upper backdrop
  ctx.fillStyle = '#07080d';
  ctx.fillRect(-16, 0, INTERNAL_WIDTH + 32, BACK_WALL_BOTTOM);

  if (room.id === 'courtyard') {
    // Stormy 16-bit night sky with distant moon & gothic battlements
    for (let y = 0; y < BACK_WALL_TOP + 8; y += 2) {
      const t = y / (BACK_WALL_TOP + 8);
      ctx.fillStyle = t < 0.5 ? '#0b1324' : '#152238';
      ctx.fillRect(-16, y, INTERNAL_WIDTH + 32, 2);
    }
    // Glowing pixel moon behind clouds
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(285, 6, 14, 14);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(280, 12, 24, 4);
    return;
  }

  // Indoor Vaulted Ceiling Trapezoid receding from top screen edge to back wall top
  for (let y = 0; y <= BACK_WALL_TOP; y += 2) {
    const t = y / BACK_WALL_TOP; // 0 at foreground ceiling, 1 at back wall top
    const leftX = FRONT_LEFT + t * (BACK_WALL_LEFT - FRONT_LEFT);
    const rightX = FRONT_RIGHT - t * (FRONT_RIGHT - BACK_WALL_RIGHT);
    const isBeam = y % 6 === 0;
    ctx.fillStyle = isBeam ? '#120e12' : '#1a151b';
    ctx.fillRect(Math.round(leftX), y, Math.round(rightX - leftX), 2);
  }

  // Perspective ceiling rafters converging toward vanishing point (200, BACK_WALL_BOTTOM)
  ctx.strokeStyle = '#0d0a0e';
  ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i++) {
    const farX = 200 + i * 32;
    const nearX = 200 + i * 62;
    ctx.beginPath();
    ctx.moveTo(farX, BACK_WALL_TOP);
    ctx.lineTo(nearX, 0);
    ctx.stroke();
  }

  // Hanging Gothic Chandelier in Foyer & Dining Room
  if (room.id === 'foyer' || room.id === 'dining_room') {
    const sway = Math.sin(timeSec * 2) * 1.5;
    const cx = Math.round(200 + sway);
    ctx.fillStyle = '#ca8a04';
    ctx.fillRect(cx - 1, 0, 2, 18);
    ctx.fillRect(cx - 18, 16, 36, 4);
    // Candle flames
    ctx.fillStyle = '#fef08a';
    for (let ox = -14; ox <= 14; ox += 7) {
      ctx.fillRect(cx + ox, 12, 2, 4);
    }
  }
}

// 16-Bit Mode-7 Style Scanline Perspective Floor
function drawPseudo3DScanlineFloor(
  ctx: CanvasRenderingContext2D,
  room: RoomDefinition,
  timeSec: number
): void {
  const spanY = FRONT_FLOOR_BOTTOM - BACK_WALL_BOTTOM;
  const numCols = 10;

  // Draw 2px horizontal scanlines with true perspective foreshortening
  for (let sy = BACK_WALL_BOTTOM; sy < FRONT_FLOOR_BOTTOM; sy += 2) {
    const screenT = (sy - BACK_WALL_BOTTOM) / spanY; // 0 at back wall, 1 at foreground
    // Perspective Z depth for classic 16-bit checkerboard / tile banding
    const perspZ = Math.floor(18 / (0.18 + screenT * 0.85));
    const tileRow = perspZ % 2;

    const leftX = BACK_WALL_LEFT - screenT * (BACK_WALL_LEFT - FRONT_LEFT);
    const rightX = BACK_WALL_RIGHT + screenT * (FRONT_RIGHT - BACK_WALL_RIGHT);
    const rowWidth = rightX - leftX;
    const colWidth = rowWidth / numCols;

    for (let col = 0; col < numCols; col++) {
      const colX = leftX + col * colWidth;
      const isChecker = (col + tileRow) % 2 === 0;

      if (room.floorSurface === 'carpet') {
        // Ornate Grand Foyer / Study Carpet in center columns (cols 2..7), marble border on sides
        if (col >= 2 && col <= 7) {
          ctx.fillStyle =
            col === 2 || col === 7
              ? '#ca8a04' // Gold trim border
              : isChecker
                ? '#5c1620'
                : '#471018';
        } else {
          ctx.fillStyle = isChecker ? '#292226' : '#1c171a';
        }
      } else if (room.floorSurface === 'tile' || room.floorSurface === 'stone') {
        // High-contrast 16-bit checkered tile floor
        ctx.fillStyle = isChecker ? room.floorAccentColor : room.floorColor;
      } else if (room.floorSurface === 'wood') {
        // Perspective wooden planks with dark grain seams
        ctx.fillStyle = col % 2 === 0 ? room.floorAccentColor : room.floorColor;
      } else if (room.floorSurface === 'metal') {
        // Industrial steel grating with hazard stripe border
        ctx.fillStyle = isChecker ? '#232d36' : '#161d24';
      } else {
        // Greenhouse / overgrown stone & moss
        ctx.fillStyle = isChecker ? '#1c3625' : '#122418';
      }

      ctx.fillRect(Math.floor(colX), sy, Math.ceil(colWidth) + 1, 2);
    }

    // Horizontal perspective tile seam line when perspZ steps
    if (sy % 8 === 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fillRect(Math.floor(leftX), sy, Math.ceil(rowWidth), 1);
    }
  }

  // Courtyard animated rain puddles in perspective
  if (room.id === 'courtyard') {
    const p1 = projectPseudo3D(130, 140);
    const p2 = projectPseudo3D(270, 115);
    const ripple = Math.floor(timeSec * 6) % 3;
    ctx.fillStyle = 'rgba(96, 165, 250, 0.28)';
    ctx.fillRect(Math.round(p1.sx - 18 - ripple), Math.round(p1.sy - 4), 36 + ripple * 2, 8);
    ctx.fillRect(Math.round(p2.sx - 14), Math.round(p2.sy - 3), 28, 6);
  }
}

function drawPseudo3DWalls(ctx: CanvasRenderingContext2D, room: RoomDefinition, timeSec: number): void {
  // 1. North Back Wall (Rectangle from BACK_WALL_LEFT to BACK_WALL_RIGHT, BACK_WALL_TOP to BACK_WALL_BOTTOM)
  const bwWidth = BACK_WALL_RIGHT - BACK_WALL_LEFT;
  const bwHeight = BACK_WALL_BOTTOM - BACK_WALL_TOP;

  ctx.fillStyle = room.wallColor;
  ctx.fillRect(BACK_WALL_LEFT, BACK_WALL_TOP, bwWidth, bwHeight);

  // 16-bit architectural paneling & wainscoting on back wall
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  for (let x = BACK_WALL_LEFT + 12; x < BACK_WALL_RIGHT - 16; x += 28) {
    ctx.fillRect(x, BACK_WALL_TOP + 6, 20, bwHeight - 18);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(x + 2, BACK_WALL_TOP + 8, 16, bwHeight - 22);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  }

  // Dark wood/steel baseboard along bottom of back wall
  ctx.fillStyle = '#0e0c10';
  ctx.fillRect(BACK_WALL_LEFT, BACK_WALL_BOTTOM - 6, bwWidth, 6);

  // 2. Left (West) Angled 3D Wall Polygon
  ctx.fillStyle = room.wallColor;
  ctx.beginPath();
  ctx.moveTo(FRONT_LEFT, 0);
  ctx.lineTo(BACK_WALL_LEFT, BACK_WALL_TOP);
  ctx.lineTo(BACK_WALL_LEFT, BACK_WALL_BOTTOM);
  ctx.lineTo(FRONT_LEFT, FRONT_FLOOR_BOTTOM);
  ctx.closePath();
  ctx.fill();

  // Shade left wall slightly darker for 3D depth contrast
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.fill();

  // 3. Right (East) Angled 3D Wall Polygon
  ctx.fillStyle = room.wallColor;
  ctx.beginPath();
  ctx.moveTo(FRONT_RIGHT, 0);
  ctx.lineTo(BACK_WALL_RIGHT, BACK_WALL_TOP);
  ctx.lineTo(BACK_WALL_RIGHT, BACK_WALL_BOTTOM);
  ctx.lineTo(FRONT_RIGHT, FRONT_FLOOR_BOTTOM);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fill();

  // Perspective Vertical Wall Ribs & Sconces along Left & Right 3D Walls
  for (const depthT of [0.25, 0.55, 0.82]) {
    const leftX = Math.round(BACK_WALL_LEFT - depthT * (BACK_WALL_LEFT - FRONT_LEFT));
    const rightX = Math.round(BACK_WALL_RIGHT + depthT * (FRONT_RIGHT - BACK_WALL_RIGHT));
    const topY = Math.round(BACK_WALL_TOP * (1 - depthT));
    const botY = Math.round(BACK_WALL_BOTTOM + depthT * (FRONT_FLOOR_BOTTOM - BACK_WALL_BOTTOM));

    // Structural 3D pilaster columns on side walls
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(leftX - 2, topY, 4, botY - topY);
    ctx.fillRect(rightX - 2, topY, 4, botY - topY);

    // Flickering wall sconces at mid-height
    const sconceY = Math.round(topY + (botY - topY) * 0.42);
    const flicker = Math.floor(timeSec * 8) % 2 === 0;
    ctx.fillStyle = '#78350f';
    ctx.fillRect(leftX + 1, sconceY, 3, 6);
    ctx.fillRect(rightX - 4, sconceY, 3, 6);
    ctx.fillStyle = flicker ? '#fde047' : '#f97316';
    ctx.fillRect(leftX + 1, sconceY - 3, 3, 3);
    ctx.fillRect(rightX - 4, sconceY - 3, 3, 3);
  }

  // Corner edges where back wall meets side walls and floor
  ctx.strokeStyle = '#09090d';
  ctx.lineWidth = 2;
  ctx.strokeRect(BACK_WALL_LEFT, BACK_WALL_TOP, bwWidth, bwHeight);
}

function drawPseudo3DDoor(ctx: CanvasRenderingContext2D, door: Door): void {
  const ledColor = door.locked ? '#ef4444' : '#22c55e';

  if (door.wall === 'N') {
    // Projected onto the North Back Wall!
    const pCenter = projectPseudo3D(door.x + door.width / 2, 16);
    const dw = Math.round(door.width * 0.68);
    const dh = 38;
    const dx = Math.round(pCenter.sx - dw / 2);
    const dy = BACK_WALL_BOTTOM - dh;

    // Heavy Gothic / Lab Door Frame
    ctx.fillStyle = '#271710';
    ctx.fillRect(dx - 3, dy - 3, dw + 6, dh + 3);
    ctx.fillStyle = door.locked ? '#4c1d24' : '#6b4226';
    ctx.fillRect(dx, dy, dw, dh);
    // Double door seam & recessed panels
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(dx + 3, dy + 4, dw / 2 - 5, dh - 8);
    ctx.fillRect(dx + dw / 2 + 2, dy + 4, dw / 2 - 5, dh - 8);
    // Lock Emblem / Status LED above door arch
    ctx.fillStyle = ledColor;
    ctx.fillRect(Math.round(pCenter.sx - 3), dy - 6, 6, 4);
  } else if (door.wall === 'S') {
    // Foreground Exit Threshold Mat & Glowing Direction Arrow at Bottom Edge
    const pCenter = projectPseudo3D(door.x + door.width / 2, 206);
    const dw = Math.round(door.width * 1.35);
    const dx = Math.round(pCenter.sx - dw / 2);
    const dy = FRONT_FLOOR_BOTTOM - 8;

    ctx.fillStyle = '#271710';
    ctx.fillRect(dx - 4, dy, dw + 8, 10);
    ctx.fillStyle = door.locked ? '#7f1d1d' : '#b45309';
    ctx.fillRect(dx, dy + 2, dw, 6);
    ctx.fillStyle = ledColor;
    ctx.fillRect(Math.round(pCenter.sx - 4), dy + 3, 8, 3);
  } else if (door.wall === 'W') {
    // Angled 3D Door on Left Wall
    const pTop = projectPseudo3D(16, door.y);
    const pBot = projectPseudo3D(16, door.y + door.height);
    const wallTopY = Math.round(pTop.sy - 46 * pTop.scale);
    const wallBotY = Math.round(pBot.sy - 46 * pBot.scale);

    ctx.fillStyle = '#271710';
    ctx.beginPath();
    ctx.moveTo(pTop.sx - 2, pTop.sy);
    ctx.lineTo(pTop.sx - 2, wallTopY);
    ctx.lineTo(pBot.sx + 2, wallBotY);
    ctx.lineTo(pBot.sx + 2, pBot.sy);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = door.locked ? '#581c24' : '#6b4226';
    ctx.beginPath();
    ctx.moveTo(pTop.sx, pTop.sy - 2);
    ctx.lineTo(pTop.sx, wallTopY + 3);
    ctx.lineTo(pBot.sx, wallBotY + 3);
    ctx.lineTo(pBot.sx, pBot.sy - 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ledColor;
    ctx.fillRect(Math.round((pTop.sx + pBot.sx) / 2), Math.round((wallTopY + wallBotY) / 2 - 4), 4, 4);
  } else if (door.wall === 'E') {
    // Angled 3D Door on Right Wall
    const pTop = projectPseudo3D(384, door.y);
    const pBot = projectPseudo3D(384, door.y + door.height);
    const wallTopY = Math.round(pTop.sy - 46 * pTop.scale);
    const wallBotY = Math.round(pBot.sy - 46 * pBot.scale);

    ctx.fillStyle = '#271710';
    ctx.beginPath();
    ctx.moveTo(pTop.sx + 2, pTop.sy);
    ctx.lineTo(pTop.sx + 2, wallTopY);
    ctx.lineTo(pBot.sx - 2, wallBotY);
    ctx.lineTo(pBot.sx - 2, pBot.sy);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = door.locked ? '#581c24' : '#6b4226';
    ctx.beginPath();
    ctx.moveTo(pTop.sx, pTop.sy - 2);
    ctx.lineTo(pTop.sx, wallTopY + 3);
    ctx.lineTo(pBot.sx, wallBotY + 3);
    ctx.lineTo(pBot.sx, pBot.sy - 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ledColor;
    ctx.fillRect(Math.round((pTop.sx + pBot.sx) / 2 - 4), Math.round((wallTopY + wallBotY) / 2 - 4), 4, 4);
  }
}

function drawPseudo3DDecals(ctx: CanvasRenderingContext2D, room: RoomDefinition): void {
  const drawFloorPool = (wx: number, wy: number, w: number, h: number, color: string) => {
    const p = projectPseudo3D(wx, wy);
    const pw = Math.round(w * p.scale);
    const ph = Math.max(3, Math.round(h * p.scale * 0.55));
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(p.sx - pw / 2), Math.round(p.sy - ph / 2), pw, ph);
  };

  if (room.id === 'dining_room') {
    drawFloorPool(160, 148, 28, 14, 'rgba(127, 29, 29, 0.65)');
  } else if (room.id === 'medical_ward') {
    drawFloorPool(118, 98, 34, 16, 'rgba(127, 29, 29, 0.7)');
    drawFloorPool(168, 114, 28, 16, 'rgba(127, 29, 29, 0.7)');
  } else if (room.id === 'bio_lab') {
    drawFloorPool(78, 98, 36, 18, 'rgba(16, 185, 129, 0.35)');
    drawFloorPool(200, 98, 44, 22, 'rgba(16, 185, 129, 0.38)');
  }
}

// 3D Extruded Props with Top Surface + Front Vertical Face + 16-Bit Highlights
function drawPseudo3DProp(ctx: CanvasRenderingContext2D, prop: RoomProp, timeSec: number): void {
  const pCenter = projectPseudo3D(prop.x + prop.width / 2, prop.y + prop.height / 2);
  const s = pCenter.scale;
  const pw = Math.round(prop.width * s);
  const pd = Math.max(6, Math.round(prop.height * s * 0.55)); // Projected floor depth
  const sx = Math.round(pCenter.sx - pw / 2);
  const sy = Math.round(pCenter.sy); // Base front contact line on floor

  // Wall-mounted props on the North Back Wall
  if (prop.type === 'portrait_wall') {
    const wx = Math.round(pCenter.sx - pw / 2);
    const wy = BACK_WALL_TOP + 8;
    const frameW = Math.floor((pw - 12) / 4);
    for (let i = 0; i < 4; i++) {
      const fx = wx + 4 + i * (frameW + 2);
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(fx, wy, frameW, 24);
      ctx.fillStyle = i === 0 ? '#1e3a8a' : i === 1 ? '#7f1d1d' : i === 2 ? '#312e81' : '#3f3f46';
      ctx.fillRect(fx + 2, wy + 2, frameW - 4, 20);
      // Tiny portrait bust silhouette
      ctx.fillStyle = '#e4e2dd';
      ctx.fillRect(fx + Math.floor(frameW / 2) - 2, wy + 6, 4, 5);
    }
    return;
  }

  if (prop.type === 'window_boarded') {
    const wx = Math.round(pCenter.sx - pw / 2);
    const wy = BACK_WALL_TOP + 6;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(wx, wy, pw, 32);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(wx + 3, wy + 3, pw - 6, 26);
    // Wooden barricade planks across window
    ctx.fillStyle = '#78350f';
    ctx.fillRect(wx - 2, wy + 8, pw + 4, 5);
    ctx.fillRect(wx - 2, wy + 20, pw + 4, 5);
    return;
  }

  if (prop.type === 'breaker_panel') {
    const wx = Math.round(pCenter.sx - pw / 2);
    const wy = BACK_WALL_TOP + 10;
    ctx.fillStyle = '#334155';
    ctx.fillRect(wx, wy, pw, 28);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, pw, 28);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = Math.floor(timeSec * 4 + i) % 2 === 0 ? '#ef4444' : '#22c55e';
      ctx.fillRect(wx + 5 + i * Math.floor((pw - 8) / 4), wy + 8, 5, 12);
    }
    return;
  }

  if (prop.type === 'extraction_lift') {
    const wx = Math.round(pCenter.sx - pw / 2);
    const wy = BACK_WALL_TOP + 4;
    const lh = BACK_WALL_BOTTOM - wy;
    ctx.fillStyle = '#27272a';
    ctx.fillRect(wx, wy, pw, lh);
    // Yellow/black industrial hazard stripes
    ctx.fillStyle = '#facc15';
    for (let hx = wx + 2; hx < wx + pw - 4; hx += 8) {
      ctx.fillRect(hx, wy + lh - 6, 4, 6);
    }
    return;
  }

  // Floor shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(sx - 2, sy - pd + 2, pw + 4, pd + 3);

  // Extrude 3D height based on prop type
  const extrudeH = Math.round(
    (prop.type === 'pillar' || prop.type === 'bookshelf' || prop.type === 'cryo_tube' || prop.type === 'clock'
      ? 38
      : prop.type === 'generator'
        ? 26
        : 18) * s
  );

  const topY = sy - pd - extrudeH;

  if (prop.type === 'pillar') {
    // 3D Fluted Stone Column / Gargoyle Monument
    ctx.fillStyle = '#52525b'; // Top cap
    ctx.fillRect(sx - 2, topY, pw + 4, pd);
    ctx.fillStyle = '#3f3f46'; // Front vertical shaft
    ctx.fillRect(sx, topY + pd, pw, extrudeH);
    // 16-bit vertical highlight & shadow fluting
    ctx.fillStyle = '#71717a';
    ctx.fillRect(sx + 2, topY + pd, Math.max(2, Math.floor(pw * 0.2)), extrudeH);
    ctx.fillStyle = '#18181b';
    ctx.fillRect(sx + pw - Math.max(2, Math.floor(pw * 0.22)), topY + pd, Math.max(2, Math.floor(pw * 0.22)), extrudeH);
  } else if (prop.type === 'typewriter') {
    // 3D Desk + Underwood Typewriter with glowing save ribbon
    ctx.fillStyle = '#78350f'; // Desk top
    ctx.fillRect(sx, topY, pw, pd);
    ctx.fillStyle = '#451a03'; // Desk front face
    ctx.fillRect(sx, topY + pd, pw, extrudeH);
    // Typewriter chassis on top of desk
    const twW = Math.round(18 * s);
    const twH = Math.round(11 * s);
    const twX = Math.round(pCenter.sx - twW / 2);
    const twY = Math.round(topY + pd * 0.5 - twH);
    ctx.fillStyle = '#18181b';
    ctx.fillRect(twX, twY, twW, twH);
    // White paper scroll sticking up
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(twX + Math.round(twW * 0.25), twY - Math.round(5 * s), Math.round(twW * 0.5), Math.round(6 * s));
    // Pulsing emerald save beacon
    if (Math.floor(timeSec * 3) % 2 === 0) {
      ctx.fillStyle = '#34d399';
      ctx.fillRect(twX + Math.round(twW * 0.4), twY + Math.round(3 * s), 4, 3);
    }
  } else if (prop.type === 'cryo_tube') {
    // 3D Cylindrical Glass Bio-Stasis Pod
    ctx.fillStyle = '#334155';
    ctx.fillRect(sx, topY, pw, pd);
    ctx.fillStyle = '#065f46';
    ctx.fillRect(sx + 2, topY + pd, pw - 4, extrudeH - 4);
    ctx.fillStyle = '#34d399';
    ctx.fillRect(sx + Math.round(pw * 0.25), topY + pd + 2, Math.round(pw * 0.2), extrudeH - 8);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(sx, sy - 4, pw, 4);
  } else if (prop.type === 'crest_pedestal') {
    // 3D Stone Altar with 3 Glowing Astral Sockets
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(sx, topY, pw, pd);
    ctx.fillStyle = '#27272a';
    ctx.fillRect(sx, topY + pd, pw, extrudeH);
    const colors = ['#facc15', '#e2e8f0', '#a855f7'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = colors[i];
      ctx.fillRect(
        sx + Math.round(((i + 0.5) * pw) / 3 - 3 * s),
        topY + Math.round(pd * 0.35),
        Math.max(4, Math.round(6 * s)),
        Math.max(4, Math.round(6 * s))
      );
    }
  } else if (prop.type === 'bed_gurney') {
    // 3D Surgical Operating Table
    ctx.fillStyle = '#e2e8f0'; // Top sheet
    ctx.fillRect(sx, topY, pw, pd);
    ctx.fillStyle = '#991b1b'; // Bloodstain on mattress
    ctx.fillRect(sx + Math.round(pw * 0.3), topY + 2, Math.round(pw * 0.4), Math.max(3, pd - 4));
    ctx.fillStyle = '#64748b'; // Side frame & legs
    ctx.fillRect(sx, topY + pd, pw, Math.round(5 * s));
    ctx.fillRect(sx + 2, topY + pd, 3, extrudeH);
    ctx.fillRect(sx + pw - 5, topY + pd, 3, extrudeH);
  } else {
    // Generic 3D Extruded Table, Bookshelf, Generator, Crate
    ctx.fillStyle = prop.type === 'generator' ? '#3b82f6' : '#63331e'; // Top plane (lighter)
    ctx.fillRect(sx, topY, pw, pd);
    ctx.fillStyle = prop.type === 'generator' ? '#1e3a8a' : '#3b1d11'; // Front vertical plane (darker)
    ctx.fillRect(sx, topY + pd, pw, extrudeH);
    // 16-bit bevel edge highlight between top and front face
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(sx, topY + pd - 1, pw, 1);
  }
}

function drawPseudo3DPickup(ctx: CanvasRenderingContext2D, pickup: WorldPickup, timeSec: number): void {
  const p = projectPseudo3D(pickup.x, pickup.y);
  const s = p.scale;
  const x = Math.round(p.sx);
  const y = Math.round(p.sy);
  const w = Math.max(5, Math.round(10 * s));
  const h = Math.max(4, Math.round(7 * s));

  // Floor shadow
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - Math.round(w / 2), y - 1, w, Math.max(2, Math.round(3 * s)));

  if (pickup.itemId === 'note') {
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x - Math.round(w / 2), y - h, w, h);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(x - Math.round(w / 2) + 1, y - h + 2, w - 2, 1);
  } else if (pickup.itemId.startsWith('herb_')) {
    ctx.fillStyle = pickup.itemId === 'herb_red' ? '#ef4444' : '#22c55e';
    ctx.fillRect(x - Math.round(w / 2), y - h - 2, w, h);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x - 2, y - 3, 4, 3);
  } else if (pickup.itemId.startsWith('ammo_')) {
    ctx.fillStyle = pickup.itemId === 'ammo_shells' ? '#b91c1c' : '#1d4ed8';
    ctx.fillRect(x - Math.round(w / 2), y - h, w, h);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x - Math.round(w / 2) + 1, y - h + 1, w - 2, 2);
  } else {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x - Math.round(w / 2), y - h, w, h);
  }

  // 16-bit sparkle cross
  if (Math.floor(timeSec * 5 + pickup.x) % 5 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - h - 5, 2, 5);
    ctx.fillRect(x - 3, y - h - 3, 6, 1);
  }
}

function drawPseudo3DEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, player: PlayerState): void {
  const p = projectPseudo3D(enemy.x, enemy.y);
  const s = p.scale;
  const x = Math.round(p.sx);
  const y = Math.round(p.sy);

  if (enemy.state === 'dead') {
    const pw = Math.round(22 * s);
    const ph = Math.max(4, Math.round(7 * s));
    ctx.fillStyle = '#450a0a';
    ctx.fillRect(x - Math.round(pw / 2), y - Math.round(ph / 2), pw, ph);
    ctx.fillStyle = '#27272a';
    ctx.fillRect(x - Math.round(pw * 0.35), y - Math.round(ph * 0.4), Math.round(pw * 0.7), Math.max(3, ph - 2));
    return;
  }

  ctx.save();

  if (enemy.type === 'shadow_lurker') {
    const lit = isPointInFlashlightCone(
      player.x,
      player.y,
      player.facingAngle,
      player.flashlightOn,
      player.battery,
      enemy.x,
      enemy.y
    );
    ctx.globalAlpha = lit ? 0.95 : 0.35;
  }

  if (enemy.state === 'dormant') {
    const pw = Math.round(20 * s);
    const ph = Math.max(4, Math.round(6 * s));
    ctx.fillStyle = '#3f4d3b';
    ctx.fillRect(x - Math.round(pw / 2), y - ph, pw, ph);
    ctx.restore();
    return;
  }

  // Windup Telegraph Ring Projected on the 3D Floor!
  if (enemy.state === 'windup') {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      Math.round((enemy.radius + 7) * s),
      Math.max(4, Math.round((enemy.radius + 7) * s * 0.5)),
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    if (enemy.type === 'tyrant_boss' && enemy.chargeTargetX !== undefined && enemy.chargeTargetY !== undefined) {
      const targetProj = projectPseudo3D(enemy.chargeTargetX, enemy.chargeTargetY);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.round(targetProj.sx), Math.round(targetProj.sy));
      ctx.stroke();
    }
  }

  // 3D Perspective Ground Shadow
  const shadowW = Math.round(enemy.radius * 2.1 * s);
  const shadowH = Math.max(3, Math.round(enemy.radius * 0.75 * s));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
  ctx.fillRect(x - Math.round(shadowW / 2), y - Math.round(shadowH / 2), shadowW, shadowH);

  const bob =
    enemy.state === 'pursue' || enemy.state === 'patrol'
      ? Math.round(Math.sin(enemy.animTimer * 8) * 2 * s)
      : 0;
  const isHitFlash = enemy.hitFlashTimer > 0;

  if (enemy.type === 'tyrant_boss') {
    // Subject Omega: Towering 3D Scaled Bio-Weapon Sprite
    const w = Math.round(28 * s);
    const h = Math.round(38 * s);
    const topY = y - h + bob;

    // Legs
    ctx.fillStyle = isHitFlash ? '#ffffff' : '#27272a';
    ctx.fillRect(x - Math.round(w * 0.35), y - Math.round(h * 0.3), Math.round(w * 0.28), Math.round(h * 0.3));
    ctx.fillRect(x + Math.round(w * 0.08), y - Math.round(h * 0.3), Math.round(w * 0.28), Math.round(h * 0.3));

    // Muscular Armored Torso
    ctx.fillStyle = isHitFlash ? '#ffffff' : '#3f3f46';
    ctx.fillRect(x - Math.round(w / 2), topY + Math.round(h * 0.2), w, Math.round(h * 0.52));

    // Mutated Crimson Claw Arm & Glowing Bio-Heart
    ctx.fillStyle = isHitFlash ? '#ffffff' : '#991b1b';
    ctx.fillRect(x - Math.round(w * 0.65), topY + Math.round(h * 0.22), Math.round(w * 0.3), Math.round(h * 0.48));
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(x - Math.round(3 * s), topY + Math.round(h * 0.35), Math.max(4, Math.round(6 * s)), Math.max(4, Math.round(6 * s)));

    // Head & Glowing Eyes
    ctx.fillStyle = isHitFlash ? '#ffffff' : '#d4d4d8';
    ctx.fillRect(x - Math.round(w * 0.22), topY, Math.round(w * 0.44), Math.round(h * 0.22));
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x - Math.round(3 * s), topY + Math.round(3 * s), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
    ctx.fillRect(x + Math.round(1 * s), topY + Math.round(3 * s), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
  } else {
    // Depth-Scaled 16-Bit Zombie / Crimson Stalker / Shadow Lurker
    const w = Math.round(14 * s);
    const h = Math.round(24 * s);
    const topY = y - h + bob;

    const coatColor = isHitFlash
      ? '#ffffff'
      : enemy.type === 'crimson_stalker'
        ? '#7f1d1d'
        : enemy.type === 'shadow_lurker'
          ? '#18181b'
          : '#334155';

    const skinColor = isHitFlash
      ? '#ffffff'
      : enemy.type === 'crimson_stalker'
        ? '#dc2626'
        : enemy.type === 'shadow_lurker'
          ? '#09090b'
          : '#658061';

    // Legs
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - Math.round(w * 0.38), y - Math.round(h * 0.32), Math.max(2, Math.round(w * 0.3)), Math.round(h * 0.32));
    ctx.fillRect(x + Math.round(w * 0.08), y - Math.round(h * 0.32), Math.max(2, Math.round(w * 0.3)), Math.round(h * 0.32));

    // Torso with 16-bit shading highlight
    ctx.fillStyle = coatColor;
    ctx.fillRect(x - Math.round(w / 2), topY + Math.round(h * 0.28), w, Math.round(h * 0.42));
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(x - Math.round(w * 0.2), topY + Math.round(h * 0.36), Math.max(2, Math.round(w * 0.35)), Math.max(3, Math.round(h * 0.22)));

    // Head
    ctx.fillStyle = skinColor;
    ctx.fillRect(x - Math.round(w * 0.38), topY, Math.round(w * 0.76), Math.round(h * 0.28));

    // Glowing Eyes
    ctx.fillStyle = enemy.type === 'shadow_lurker' ? '#38bdf8' : '#ef4444';
    ctx.fillRect(x - Math.round(3 * s), topY + Math.round(3 * s), Math.max(1, Math.round(2 * s)), Math.max(1, Math.round(2 * s)));
    ctx.fillRect(x + Math.round(1 * s), topY + Math.round(3 * s), Math.max(1, Math.round(2 * s)), Math.max(1, Math.round(2 * s)));
  }

  ctx.restore();
}

function drawPseudo3DPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  muzzleFlashTimer: number
): void {
  const p = projectPseudo3D(player.x, player.y);
  const s = p.scale;
  const x = Math.round(p.sx);
  const y = Math.round(p.sy);

  if (player.actionState === 'dead') {
    const pw = Math.round(22 * s);
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(x - Math.round(pw / 2), y - 4, pw, 8);
    return;
  }

  ctx.save();
  if (player.invulnerableTimer > 0 && Math.floor(player.invulnerableTimer * 16) % 2 === 0) {
    ctx.globalAlpha = 0.55;
  }

  const walkCycle = Math.sin(player.walkDistance * 0.28);
  const bob =
    player.actionState === 'walk' || player.actionState === 'run'
      ? Math.round(Math.abs(walkCycle) * 2.5 * s)
      : 0;

  const w = Math.round(14 * s);
  const h = Math.round(25 * s);
  const topY = y - h - bob;

  // Ground Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(x - Math.round(w * 0.55), y - 2, Math.round(w * 1.1), Math.max(3, Math.round(4 * s)));

  // Tactical Boots & Stride Animation
  const legStride =
    player.actionState === 'walk' || player.actionState === 'run'
      ? Math.round(walkCycle * 3 * s)
      : 0;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x - Math.round(w * 0.36), y - Math.round(h * 0.32) + legStride, Math.max(2, Math.round(w * 0.28)), Math.round(h * 0.32));
  ctx.fillRect(x + Math.round(w * 0.08), y - Math.round(h * 0.32) - legStride, Math.max(2, Math.round(w * 0.28)), Math.round(h * 0.32));

  // S.T.A.R. Tactical Vest & Shoulder Pads (16-bit multi-shade pixel art)
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(x - Math.round(w / 2), topY + Math.round(h * 0.28), w, Math.round(h * 0.42));
  ctx.fillStyle = '#60a5fa'; // Left shoulder & collar highlight
  ctx.fillRect(x - Math.round(w / 2), topY + Math.round(h * 0.28), Math.max(2, Math.round(3 * s)), Math.round(h * 0.35));
  ctx.fillStyle = '#0f172a'; // Armored chest rig
  ctx.fillRect(x - Math.round(w * 0.35), topY + Math.round(h * 0.32), Math.round(w * 0.7), Math.round(h * 0.28));
  // Tactical utility belt with brass buckle
  ctx.fillStyle = '#451a03';
  ctx.fillRect(x - Math.round(w * 0.45), topY + Math.round(h * 0.62), Math.round(w * 0.9), Math.max(2, Math.round(3 * s)));
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - Math.round(1.5 * s), topY + Math.round(h * 0.62), Math.max(2, Math.round(3 * s)), Math.max(2, Math.round(3 * s)));

  // Head & Beret with 16-bit shading
  ctx.fillStyle = '#d9a07e';
  ctx.fillRect(x - Math.round(w * 0.34), topY + Math.round(2 * s), Math.round(w * 0.68), Math.round(h * 0.25));
  ctx.fillStyle = '#f5d0b5';
  ctx.fillRect(x - Math.round(w * 0.28), topY + Math.round(3 * s), Math.round(w * 0.52), Math.round(h * 0.2));
  ctx.fillStyle = '#172554';
  ctx.fillRect(x - Math.round(w * 0.42), topY, Math.round(w * 0.84), Math.max(2, Math.round(4 * s)));
  ctx.fillStyle = '#ef4444'; // Beret badge
  ctx.fillRect(x - 1, topY + 1, 2, 2);

  // Projected Aiming Laser Sight & Target Reticle in 3D Space
  const aimEndWx = Math.max(20, Math.min(380, player.x + Math.cos(player.facingAngle) * 115));
  const aimEndWy = Math.max(20, Math.min(206, player.y + Math.sin(player.facingAngle) * 115));
  const pAimEnd = projectPseudo3D(aimEndWx, aimEndWy);
  const shoulderY = Math.round(y - h * 0.55);
  const targetX = Math.round(pAimEnd.sx);
  const targetY = Math.round(pAimEnd.sy - 12 * pAimEnd.scale);

  ctx.strokeStyle =
    player.isAiming || muzzleFlashTimer > 0
      ? 'rgba(239, 68, 68, 0.72)'
      : 'rgba(239, 68, 68, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, shoulderY);
  ctx.lineTo(targetX, targetY);
  ctx.stroke();

  // Tactical 16-bit laser dot at aim endpoint
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(targetX - 1, targetY - 1, 3, 3);

  // Gun barrel extending toward facing direction
  const gunWx = player.x + Math.cos(player.facingAngle) * 10;
  const gunWy = player.y + Math.sin(player.facingAngle) * 10;
  const pGun = projectPseudo3D(gunWx, gunWy);
  const gx = Math.round(pGun.sx);
  const gy = Math.round(pGun.sy - h * 0.55);

  ctx.fillStyle = player.equippedWeapon === 'shotgun' ? '#b45309' : '#cbd5e1';
  ctx.fillRect(gx - 2, gy - 2, Math.max(4, Math.round(5 * s)), Math.max(3, Math.round(3 * s)));

  if (muzzleFlashTimer > 0) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(gx - 4, gy - 4, Math.round(8 * s), Math.round(8 * s));
  }

  ctx.restore();
}

function drawAtmosphericParticles3D(ctx: CanvasRenderingContext2D, room: RoomDefinition, timeSec: number): void {
  if (room.id === 'courtyard') {
    ctx.fillStyle = 'rgba(186, 230, 253, 0.38)';
    for (let i = 0; i < 28; i++) {
      const rx = (i * 53 + Math.floor(timeSec * 140)) % INTERNAL_WIDTH;
      const ry = (i * 37 + Math.floor(timeSec * 220)) % INTERNAL_HEIGHT;
      ctx.fillRect(rx, ry, 1, 6);
    }
  } else {
    ctx.fillStyle = room.id === 'greenhouse' ? 'rgba(134, 239, 172, 0.28)' : 'rgba(228, 226, 221, 0.18)';
    for (let i = 0; i < 16; i++) {
      const wx = ((i * 67 + Math.floor(timeSec * 8 + i)) % 340) + 30;
      const wy = ((i * 43 + Math.floor(Math.sin(timeSec + i) * 12)) % 170) + 30;
      const proj = projectPseudo3D(wx, wy);
      ctx.fillRect(Math.round(proj.sx), Math.round(proj.sy - 18 * proj.scale), 2, 2);
    }
  }
}

function renderPseudo3DLightingPass(
  ctx: CanvasRenderingContext2D,
  room: RoomDefinition,
  player: PlayerState,
  muzzleFlashTimer: number,
  timeSec: number,
  camParallaxX: number
): void {
  const lCtx = ensureLightCanvas();
  if (!lCtx || !lightCanvas) return;

  lCtx.save();
  lCtx.globalCompositeOperation = 'source-over';
  const darknessAlpha = Math.max(0.24, Math.min(0.62, 0.78 - room.ambientLight));
  lCtx.fillStyle = `rgba(5, 6, 10, ${darknessAlpha})`;
  lCtx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

  lCtx.globalCompositeOperation = 'destination-out';

  // Subtle side-wall sconce glow pools so angled 3D side walls and West/East doors read clearly
  for (const sideX of [36, 364]) {
    const sGrad = lCtx.createRadialGradient(sideX + camParallaxX, 110, 4, sideX + camParallaxX, 110, 68);
    sGrad.addColorStop(0, 'rgba(0,0,0,0.65)');
    sGrad.addColorStop(1, 'rgba(0,0,0,0)');
    lCtx.fillStyle = sGrad;
    lCtx.beginPath();
    lCtx.arc(sideX + camParallaxX, 110, 68, 0, Math.PI * 2);
    lCtx.fill();
  }

  const pPlayer = projectPseudo3D(player.x, player.y);
  const px = pPlayer.sx + camParallaxX;
  const py = pPlayer.sy - 12 * pPlayer.scale;

  // 1. Player immediate aura
  const playerRadius = (muzzleFlashTimer > 0 ? 135 : 58) * pPlayer.scale;
  const pGrad = lCtx.createRadialGradient(px, py, 6, px, py, playerRadius);
  pGrad.addColorStop(0, 'rgba(0,0,0,0.95)');
  pGrad.addColorStop(1, 'rgba(0,0,0,0)');
  lCtx.fillStyle = pGrad;
  lCtx.beginPath();
  lCtx.arc(px, py, playerRadius, 0, Math.PI * 2);
  lCtx.fill();

  // 2. Player Directional Flashlight Cone in Pseudo-3D Perspective
  if (player.flashlightOn && player.battery > 0) {
    const spread = 0.52;
    const coneDist = 175;
    const leftTip = projectPseudo3D(
      player.x + Math.cos(player.facingAngle - spread) * coneDist,
      player.y + Math.sin(player.facingAngle - spread) * coneDist
    );
    const rightTip = projectPseudo3D(
      player.x + Math.cos(player.facingAngle + spread) * coneDist,
      player.y + Math.sin(player.facingAngle + spread) * coneDist
    );
    const centerTip = projectPseudo3D(
      player.x + Math.cos(player.facingAngle) * coneDist,
      player.y + Math.sin(player.facingAngle) * coneDist
    );

    const maxR = Math.max(
      60,
      Math.hypot(centerTip.sx + camParallaxX - px, centerTip.sy - py)
    );
    const fGrad = lCtx.createRadialGradient(px, py, 6, px, py, maxR);
    fGrad.addColorStop(0, 'rgba(0,0,0,0.98)');
    fGrad.addColorStop(0.75, 'rgba(0,0,0,0.82)');
    fGrad.addColorStop(1, 'rgba(0,0,0,0)');

    lCtx.fillStyle = fGrad;
    lCtx.beginPath();
    lCtx.moveTo(px, py);
    lCtx.lineTo(leftTip.sx + camParallaxX, leftTip.sy - 10 * leftTip.scale);
    lCtx.lineTo(centerTip.sx + camParallaxX, centerTip.sy - 10 * centerTip.scale);
    lCtx.lineTo(rightTip.sx + camParallaxX, rightTip.sy - 10 * rightTip.scale);
    lCtx.closePath();
    lCtx.fill();
  }

  // 3. Room Sconces & Lamps Projected in 3D
  for (let i = 0; i < room.lights.length; i++) {
    const light = room.lights[i];
    const pLight = projectPseudo3D(light.x, light.y);
    const lx = pLight.sx + camParallaxX;
    const ly = pLight.sy - 18 * pLight.scale;
    const flickerMul = light.flicker
      ? 0.9 + Math.sin(timeSec * 14 + i * 3.1) * 0.08
      : 1;
    const rad = light.radius * flickerMul * Math.max(0.75, pLight.scale);
    const grad = lCtx.createRadialGradient(lx, ly, 4, lx, ly, rad);
    grad.addColorStop(0, `rgba(0,0,0,${light.intensity})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    lCtx.fillStyle = grad;
    lCtx.beginPath();
    lCtx.arc(lx, ly, rad, 0, Math.PI * 2);
    lCtx.fill();
  }

  lCtx.restore();
  ctx.drawImage(lightCanvas, 0, 0);
}

function drawCameraCornerOverlay(
  ctx: CanvasRenderingContext2D,
  room: RoomDefinition,
  timeSec: number
): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, 14);
  ctx.lineTo(6, 6);
  ctx.lineTo(14, 6);
  ctx.moveTo(6, INTERNAL_HEIGHT - 14);
  ctx.lineTo(6, INTERNAL_HEIGHT - 6);
  ctx.lineTo(14, INTERNAL_HEIGHT - 6);
  ctx.stroke();

  const scanY = Math.floor(timeSec * 35) % INTERNAL_HEIGHT;
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.fillRect(0, scanY, INTERNAL_WIDTH, 2);
}

function drawCinematicJumpscare(
  ctx: CanvasRenderingContext2D,
  visualId: JumpscareVisualId,
  timer: number,
  duration: number,
  reducedFlash: boolean
): void {
  const progress = 1 - timer / duration;

  if (progress < 0.18 && !reducedFlash) {
    ctx.fillStyle = 'rgba(255, 240, 240, 0.55)';
    ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  }

  ctx.fillStyle = 'rgba(6, 4, 8, 0.72)';
  ctx.fillRect(0, 0, INTERNAL_WIDTH, 32);
  ctx.fillRect(0, INTERNAL_HEIGHT - 32, INTERNAL_WIDTH, 32);

  const cx = INTERNAL_WIDTH / 2;
  const cy = INTERNAL_HEIGHT / 2;
  const shakeX = Math.round((Math.random() - 0.5) * 8);
  const shakeY = Math.round((Math.random() - 0.5) * 8);

  // Pseudo-3D Zooming Scale as Monster Lunges Forward at Camera!
  const zoomScale = 0.85 + Math.min(0.45, progress * 0.9);

  ctx.save();
  ctx.translate(cx + shakeX, cy + shakeY);
  ctx.scale(zoomScale, zoomScale);

  ctx.fillStyle = 'rgba(24, 6, 10, 0.92)';
  ctx.fillRect(-75, -52, 150, 104);
  ctx.strokeStyle = '#991b1b';
  ctx.lineWidth = 2;
  ctx.strokeRect(-75, -52, 150, 104);

  ctx.fillStyle = visualId === 'tyrant_awakening' ? '#3f3f46' : '#4d5e47';
  ctx.fillRect(-32, -36, 64, 68);

  ctx.fillStyle = '#09090b';
  ctx.fillRect(-22, -18, 16, 12);
  ctx.fillRect(6, -18, 16, 12);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-16, -14, 6, 6);
  ctx.fillRect(10, -14, 6, 6);

  ctx.fillStyle = '#450a0a';
  ctx.fillRect(-20, 4, 40, 22);
  ctx.fillStyle = '#e5e5e5';
  for (let tx = -16; tx <= 12; tx += 7) {
    ctx.fillRect(tx, 4, 4, 6);
    ctx.fillRect(tx, 20, 4, 6);
  }

  if (visualId === 'window_zombie') {
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(-60, -35, 10, 8);
    ctx.fillRect(48, -20, 12, 9);
    ctx.fillRect(-45, 25, 14, 7);
  }

  ctx.restore();
}
