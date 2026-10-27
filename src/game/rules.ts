import {
  Enemy,
  InventorySlot,
  JumpscareTrigger,
  PlayerState,
  RoomDefinition,
  WeaponType,
} from './types';
import { ITEM_DEFINITIONS, MAX_INVENTORY_SLOTS } from './worldData';

export type VitalityLabel = 'FINE' | 'CAUTION' | 'DANGER';

export function getVitalityStatus(hp: number, maxHp: number): {
  label: VitalityLabel;
  color: string;
  ecgSpeed: number;
} {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  if (ratio > 0.6) {
    return { label: 'FINE', color: '#22c55e', ecgSpeed: 1.0 };
  }
  if (ratio > 0.25) {
    return { label: 'CAUTION', color: '#f59e0b', ecgSpeed: 1.45 };
  }
  return { label: 'DANGER', color: '#ef4444', ecgSpeed: 2.1 };
}

export function getWeaponSpecs(weapon: WeaponType): {
  clipSize: number;
  ammoItemId: string | null;
  damage: number;
  fireCooldown: number;
  range: number;
  spreadAngle: number;
  pellets: number;
  staggerChance: number;
} {
  switch (weapon) {
    case 'knife':
      return {
        clipSize: 0,
        ammoItemId: null,
        damage: 14,
        fireCooldown: 0.42,
        range: 28,
        spreadAngle: 0.5,
        pellets: 1,
        staggerChance: 0.35,
      };
    case 'handgun':
      return {
        clipSize: 15,
        ammoItemId: 'ammo_9mm',
        damage: 20,
        fireCooldown: 0.34,
        range: 240,
        spreadAngle: 0.04,
        pellets: 1,
        staggerChance: 0.45,
      };
    case 'shotgun':
      return {
        clipSize: 7,
        ammoItemId: 'ammo_shells',
        damage: 16, // x 4 pellets = 64 max close damage
        fireCooldown: 0.78,
        range: 155,
        spreadAngle: 0.22,
        pellets: 4,
        staggerChance: 0.92,
      };
  }
}

export function addItemToInventory(
  slots: (InventorySlot | null)[],
  itemId: string,
  quantity: number,
  initialAmmoInClip?: number
): { updatedSlots: (InventorySlot | null)[]; success: boolean; message: string } {
  const def = ITEM_DEFINITIONS[itemId];
  if (!def) {
    return { updatedSlots: slots, success: false, message: 'Unknown item.' };
  }

  const next = slots.map((s) => (s ? { ...s } : null));

  // Try stacking first if stackable
  if (def.stackable) {
    for (let i = 0; i < next.length; i++) {
      const slot = next[i];
      if (slot && slot.itemId === itemId && slot.quantity < def.maxStack) {
        const space = def.maxStack - slot.quantity;
        const add = Math.min(space, quantity);
        slot.quantity += add;
        quantity -= add;
        if (quantity <= 0) {
          return {
            updatedSlots: next,
            success: true,
            message: `Collected ${def.name}.`,
          };
        }
      }
    }
  }

  // Place into empty slot(s)
  for (let i = 0; i < MAX_INVENTORY_SLOTS; i++) {
    if (!next[i]) {
      const add = def.stackable ? Math.min(def.maxStack, quantity) : 1;
      next[i] = {
        itemId,
        quantity: add,
        ammoInClip:
          initialAmmoInClip !== undefined
            ? initialAmmoInClip
            : itemId === 'handgun'
              ? 15
              : itemId === 'shotgun'
                ? 6
                : undefined,
      };
      quantity -= add;
      if (quantity <= 0) {
        return {
          updatedSlots: next,
          success: true,
          message: `Picked up ${def.name}.`,
        };
      }
    }
  }

  return {
    updatedSlots: slots,
    success: false,
    message: 'Inventory is full! Combine or use items to free up space.',
  };
}

export function combineInventorySlots(
  slots: (InventorySlot | null)[],
  indexA: number,
  indexB: number
): { updatedSlots: (InventorySlot | null)[]; success: boolean; message: string } {
  if (indexA === indexB) {
    return { updatedSlots: slots, success: false, message: 'Cannot combine an item with itself.' };
  }
  const slotA = slots[indexA];
  const slotB = slots[indexB];
  if (!slotA || !slotB) {
    return { updatedSlots: slots, success: false, message: 'Select two valid items to combine.' };
  }

  const defA = ITEM_DEFINITIONS[slotA.itemId];
  const defB = ITEM_DEFINITIONS[slotB.itemId];

  // Check if combining weapon + matching ammo reloads the weapon
  if (defA?.category === 'weapon' && defB?.category === 'ammo') {
    return reloadWeaponFromSlot(slots, indexA, indexB);
  }
  if (defB?.category === 'weapon' && defA?.category === 'ammo') {
    return reloadWeaponFromSlot(slots, indexB, indexA);
  }

  // Check herb or puzzle combinations
  const resultId =
    defA?.combinableWith?.[slotB.itemId] ?? defB?.combinableWith?.[slotA.itemId];

  if (!resultId) {
    return {
      updatedSlots: slots,
      success: false,
      message: `${defA?.name ?? 'Item'} and ${defB?.name ?? 'Item'} cannot be combined.`,
    };
  }

  const resultDef = ITEM_DEFINITIONS[resultId];
  const next = slots.map((s) => (s ? { ...s } : null));
  next[indexA] = { itemId: resultId, quantity: 1 };
  next[indexB] = null;

  return {
    updatedSlots: next,
    success: true,
    message: `Combined into ${resultDef.name}!`,
  };
}

export function reloadWeaponFromSlot(
  slots: (InventorySlot | null)[],
  weaponIdx: number,
  ammoIdx: number
): { updatedSlots: (InventorySlot | null)[]; success: boolean; message: string } {
  const weaponSlot = slots[weaponIdx];
  const ammoSlot = slots[ammoIdx];
  if (!weaponSlot || !ammoSlot) {
    return { updatedSlots: slots, success: false, message: 'Invalid slots.' };
  }
  const specs = getWeaponSpecs(weaponSlot.itemId as WeaponType);
  if (specs.ammoItemId !== ammoSlot.itemId) {
    return {
      updatedSlots: slots,
      success: false,
      message: 'Incompatible ammunition type for this firearm.',
    };
  }
  const currentClip = weaponSlot.ammoInClip ?? 0;
  if (currentClip >= specs.clipSize) {
    return {
      updatedSlots: slots,
      success: false,
      message: 'Weapon magazine is already full.',
    };
  }

  const needed = specs.clipSize - currentClip;
  const transfer = Math.min(needed, ammoSlot.quantity);
  const next = slots.map((s) => (s ? { ...s } : null));
  next[weaponIdx] = {
    ...weaponSlot,
    ammoInClip: currentClip + transfer,
  };
  if (ammoSlot.quantity - transfer <= 0) {
    next[ammoIdx] = null;
  } else {
    next[ammoIdx] = {
      ...ammoSlot,
      quantity: ammoSlot.quantity - transfer,
    };
  }

  return {
    updatedSlots: next,
    success: true,
    message: `Loaded ${transfer} rounds into ${ITEM_DEFINITIONS[weaponSlot.itemId].name}.`,
  };
}

export function reloadActiveWeapon(
  slots: (InventorySlot | null)[],
  weapon: WeaponType
): { updatedSlots: (InventorySlot | null)[]; reloaded: boolean; roundsLoaded: number; message: string } {
  const specs = getWeaponSpecs(weapon);
  if (!specs.ammoItemId) {
    return { updatedSlots: slots, reloaded: false, roundsLoaded: 0, message: 'Knife does not require ammunition.' };
  }
  const weaponIdx = slots.findIndex((s) => s?.itemId === weapon);
  if (weaponIdx === -1) {
    return { updatedSlots: slots, reloaded: false, roundsLoaded: 0, message: 'Weapon not in inventory.' };
  }
  const weaponSlot = slots[weaponIdx]!;
  const currentClip = weaponSlot.ammoInClip ?? 0;
  if (currentClip >= specs.clipSize) {
    return { updatedSlots: slots, reloaded: false, roundsLoaded: 0, message: 'Magazine already full.' };
  }

  const ammoIdx = slots.findIndex((s) => s?.itemId === specs.ammoItemId && s.quantity > 0);
  if (ammoIdx === -1) {
    return { updatedSlots: slots, reloaded: false, roundsLoaded: 0, message: 'No spare ammunition in inventory!' };
  }

  const res = reloadWeaponFromSlot(slots, weaponIdx, ammoIdx);
  const newClip = res.updatedSlots[weaponIdx]?.ammoInClip ?? currentClip;
  return {
    updatedSlots: res.updatedSlots,
    reloaded: res.success,
    roundsLoaded: newClip - currentClip,
    message: res.message,
  };
}

// Puzzle #1: Ancestral Portraits Order
export const TARGET_PORTRAIT_ORDER = ['founder', 'general', 'scholar', 'bride'];

export function checkPortraitPuzzle(order: string[]): boolean {
  if (order.length !== TARGET_PORTRAIT_ORDER.length) return false;
  return order.every((id, idx) => id === TARGET_PORTRAIT_ORDER[idx]);
}

// Puzzle #2: Power Breaker Sequence [3, 1, 4, 2]
export const TARGET_BREAKER_SEQUENCE = [3, 1, 4, 2];

export function stepBreakerSwitch(
  currentSequence: number[],
  switchNum: number
): { nextSequence: number[]; solved: boolean; overloaded: boolean; message: string } {
  if (currentSequence.includes(switchNum)) {
    return {
      nextSequence: currentSequence,
      solved: checkBreakerSequence(currentSequence),
      overloaded: false,
      message: `Switch #${switchNum} is already engaged.`,
    };
  }
  const next = [...currentSequence, switchNum];
  // Check prefix validity
  const idx = next.length - 1;
  if (TARGET_BREAKER_SEQUENCE[idx] !== switchNum) {
    return {
      nextSequence: [],
      solved: false,
      overloaded: true,
      message: `VOLTAGE SURGE! Incorrect breaker order tripped the relay. Resetting switches (Hint: 3 -> 1 -> 4 -> 2).`,
    };
  }

  if (next.length === TARGET_BREAKER_SEQUENCE.length) {
    return {
      nextSequence: next,
      solved: true,
      overloaded: false,
      message: 'SUB-LEVEL POWER RESTORED! The Obsidian Star Crest vault unlocks!',
    };
  }

  return {
    nextSequence: next,
    solved: false,
    overloaded: false,
    message: `Breaker Switch #${switchNum} locked in (${next.length}/4). Voltage stable.`,
  };
}

export function checkBreakerSequence(seq: number[]): boolean {
  if (seq.length !== TARGET_BREAKER_SEQUENCE.length) return false;
  return seq.every((v, i) => v === TARGET_BREAKER_SEQUENCE[i]);
}

// Puzzle #3: Astral Eclipse Pedestal ['crest_sun', 'crest_moon', 'crest_star']
export const TARGET_CREST_ORDER = ['crest_sun', 'crest_moon', 'crest_star'];

export function checkCrestPedestal(crestsPlaced: string[]): boolean {
  if (crestsPlaced.length !== TARGET_CREST_ORDER.length) return false;
  return TARGET_CREST_ORDER.every((c) => crestsPlaced.includes(c));
}

// Pseudo-3D Perspective Projection Math (Mode-7 / 16-bit Scanline Corridor Perspective)
export interface Pseudo3DPoint {
  sx: number;
  sy: number;
  scale: number;
  depthT: number; // 0 (far horizon) to 1 (near foreground)
}

const WORLD_W = 400;
const WORLD_MIN_Y = 16;
const WORLD_MAX_Y = 209;
const HORIZON_Y = 74;
const FLOOR_FRONT_Y = 215;
const FAR_HALF_WIDTH = 112; // Back wall spans [200 - 112, 200 + 112] = [88, 312]
const NEAR_HALF_WIDTH = 192; // Foreground spans [200 - 192, 200 + 192] = [8, 392]

export function projectPseudo3D(wx: number, wy: number): Pseudo3DPoint {
  const linearT = Math.max(0, Math.min(1, (wy - WORLD_MIN_Y) / (WORLD_MAX_Y - WORLD_MIN_Y)));
  // Non-linear perspective curve so near objects scale up with authentic 16-bit foreshortening
  const depthT = Math.pow(linearT, 1.28);
  const scale = 0.56 + depthT * 0.74; // 0.56x at far wall, 1.30x at foreground
  const halfSpan = FAR_HALF_WIDTH + depthT * (NEAR_HALF_WIDTH - FAR_HALF_WIDTH);
  const normX = (wx - WORLD_W / 2) / ( (WORLD_W - 32) / 2 ); // -1 at left wall (16), +1 at right wall (384)
  const sx = WORLD_W / 2 + normX * halfSpan;
  const sy = HORIZON_Y + depthT * (FLOOR_FRONT_Y - HORIZON_Y);
  return { sx, sy, scale, depthT };
}

export function unprojectPseudo3D(sx: number, sy: number): { wx: number; wy: number } {
  const clampedSy = Math.max(HORIZON_Y, Math.min(FLOOR_FRONT_Y, sy));
  const depthT = (clampedSy - HORIZON_Y) / (FLOOR_FRONT_Y - HORIZON_Y);
  const linearT = Math.pow(depthT, 1 / 1.28);
  const wy = WORLD_MIN_Y + linearT * (WORLD_MAX_Y - WORLD_MIN_Y);
  const halfSpan = FAR_HALF_WIDTH + depthT * (NEAR_HALF_WIDTH - FAR_HALF_WIDTH);
  const normX = Math.max(-1.05, Math.min(1.05, (sx - WORLD_W / 2) / (halfSpan || 1)));
  const wx = WORLD_W / 2 + normX * ((WORLD_W - 32) / 2);
  return { wx, wy };
}

// Geometry & Collision Helpers
export function circleRectCollide(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

export function resolveRoomCollisions(
  x: number,
  y: number,
  radius: number,
  room: RoomDefinition
): { x: number; y: number } {
  const wallMargin = 18;
  let nx = Math.max(wallMargin + radius, Math.min(room.width - wallMargin - radius, x));
  let ny = Math.max(wallMargin + radius, Math.min(room.height - wallMargin - radius, y));

  for (const prop of room.props) {
    if (!prop.solid) continue;
    const closestX = Math.max(prop.x, Math.min(nx, prop.x + prop.width));
    const closestY = Math.max(prop.y, Math.min(ny, prop.y + prop.height));
    const dx = nx - closestX;
    const dy = ny - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq) || 0.001;
      const overlap = radius - dist;
      nx += (dx / dist) * overlap;
      ny += (dy / dist) * overlap;
    }
  }

  return { x: nx, y: ny };
}

export function isPointInFlashlightCone(
  px: number,
  py: number,
  facingAngle: number,
  flashlightOn: boolean,
  battery: number,
  tx: number,
  ty: number,
  coneRange = 155,
  halfAngleRad = 0.52
): boolean {
  if (!flashlightOn || battery <= 0) return false;
  const dx = tx - px;
  const dy = ty - py;
  const distSq = dx * dx + dy * dy;
  if (distSq > coneRange * coneRange) return false;
  const angleToTarget = Math.atan2(dy, dx);
  let diff = angleToTarget - facingAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= halfAngleRad;
}

export function evaluateJumpscareTrigger(
  trigger: JumpscareTrigger,
  playerX: number,
  playerY: number,
  roomVisits: number,
  flags: Set<string>,
  elapsedSeconds: number
): boolean {
  if (trigger.oneTime && trigger.triggered) return false;
  if (roomVisits < trigger.minRoomVisits) return false;
  if (trigger.requiredFlag && !flags.has(trigger.requiredFlag)) return false;
  if (elapsedSeconds - trigger.lastTriggeredTime < trigger.cooldownSec) return false;

  const dx = playerX - trigger.x;
  const dy = playerY - trigger.y;
  return dx * dx + dy * dy <= trigger.radius * trigger.radius;
}

// Distinct Enemy AI Update
export function stepEnemyAI(
  enemy: Enemy,
  player: PlayerState,
  room: RoomDefinition,
  dt: number
): {
  playerHitDamage: number;
  grabbedPlayer: boolean;
  soundCue: 'groan' | 'stalker_hiss' | 'lurker_whisper' | 'boss_roar' | 'attack_bite' | null;
} {
  let playerHitDamage = 0;
  let grabbedPlayer = false;
  let soundCue: 'groan' | 'stalker_hiss' | 'lurker_whisper' | 'boss_roar' | 'attack_bite' | null = null;

  if (enemy.state === 'dead') {
    return { playerHitDamage: 0, grabbedPlayer: false, soundCue: null };
  }

  enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
  enemy.stateTimer = Math.max(0, enemy.stateTimer - dt);
  enemy.animTimer += dt;

  if (enemy.state === 'dying') {
    if (enemy.stateTimer <= 0) {
      enemy.state = 'dead';
    }
    return { playerHitDamage: 0, grabbedPlayer: false, soundCue: null };
  }

  if (enemy.state === 'stagger') {
    // Push back slightly
    const pos = resolveRoomCollisions(
      enemy.x + enemy.vx * dt,
      enemy.y + enemy.vy * dt,
      enemy.radius,
      room
    );
    enemy.x = pos.x;
    enemy.y = pos.y;
    enemy.vx *= 0.85;
    enemy.vy *= 0.85;
    if (enemy.stateTimer <= 0) {
      enemy.state = 'pursue';
    }
    return { playerHitDamage: 0, grabbedPlayer: false, soundCue: null };
  }

  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const angleToPlayer = Math.atan2(dy, dx);

  // 1. Dormant / Feigning Death Zombie
  if (enemy.state === 'dormant') {
    if (dist <= enemy.sightRange) {
      enemy.state = 'alert';
      enemy.stateTimer = 0.45;
      enemy.hasRisen = true;
      soundCue = 'groan';
    }
    return { playerHitDamage: 0, grabbedPlayer: false, soundCue };
  }

  if (enemy.state === 'alert') {
    enemy.facingAngle = angleToPlayer;
    if (enemy.stateTimer <= 0) {
      enemy.state = 'pursue';
    }
    return { playerHitDamage: 0, grabbedPlayer: false, soundCue };
  }

  // 2. Windup Telegraph Phase (Fair warning animation before attack)
  if (enemy.state === 'windup') {
    if (enemy.type !== 'tyrant_boss') {
      enemy.facingAngle = angleToPlayer;
    }
    if (enemy.stateTimer <= 0) {
      enemy.state = 'attack';
      enemy.stateTimer = enemy.type === 'tyrant_boss' ? 0.38 : 0.22;
      soundCue = enemy.type === 'tyrant_boss' ? 'boss_roar' : 'attack_bite';
    }
    return { playerHitDamage: 0, grabbedPlayer: false, soundCue };
  }

  // 3. Active Attack Phase
  if (enemy.state === 'attack') {
    const lungeSpeed =
      enemy.type === 'tyrant_boss'
        ? 135
        : enemy.type === 'crimson_stalker'
          ? 95
          : 55;
    const moveAngle = enemy.facingAngle;
    const nextPos = resolveRoomCollisions(
      enemy.x + Math.cos(moveAngle) * lungeSpeed * dt,
      enemy.y + Math.sin(moveAngle) * lungeSpeed * dt,
      enemy.radius,
      room
    );
    enemy.x = nextPos.x;
    enemy.y = nextPos.y;

    const currentDist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (currentDist <= enemy.attackRange + player.radius && player.invulnerableTimer <= 0) {
      playerHitDamage = enemy.damage;
      if (enemy.type === 'zombie' && !player.grabbedByEnemyId && Math.random() < 0.35) {
        grabbedPlayer = true;
      }
      enemy.state = 'recover';
      enemy.stateTimer = enemy.type === 'tyrant_boss' ? 0.85 : 0.65;
      enemy.attackCooldown = 1.25;
      return { playerHitDamage, grabbedPlayer, soundCue };
    }

    if (enemy.stateTimer <= 0) {
      enemy.state = 'recover';
      enemy.stateTimer = enemy.type === 'tyrant_boss' ? 0.8 : 0.55;
      enemy.attackCooldown = 1.1;
    }
    return { playerHitDamage, grabbedPlayer, soundCue };
  }

  // 4. Recovery Phase (vulnerable window after attack)
  if (enemy.state === 'recover') {
    if (enemy.stateTimer <= 0) {
      enemy.state = 'pursue';
    }
    return { playerHitDamage: 0, grabbedPlayer: false, soundCue };
  }

  // 5. Patrol vs Pursue Decision Policy by Archetype
  const playerMakingNoise = player.actionState === 'run' || player.actionState === 'shoot';
  const effectiveSight = playerMakingNoise ? enemy.sightRange * 1.35 : enemy.sightRange;

  if (enemy.state === 'patrol') {
    if (dist <= effectiveSight) {
      enemy.state = 'pursue';
      soundCue =
        enemy.type === 'crimson_stalker'
          ? 'stalker_hiss'
          : enemy.type === 'shadow_lurker'
            ? 'lurker_whisper'
            : enemy.type === 'tyrant_boss'
              ? 'boss_roar'
              : 'groan';
    } else {
      // Move between patrolOrigin and patrolTarget
      const pdx = enemy.patrolTargetX - enemy.x;
      const pdy = enemy.patrolTargetY - enemy.y;
      const pdist = Math.hypot(pdx, pdy);
      if (pdist < 8) {
        // Swap origin and target
        const tx = enemy.patrolOriginX;
        const ty = enemy.patrolOriginY;
        enemy.patrolOriginX = enemy.patrolTargetX;
        enemy.patrolOriginY = enemy.patrolTargetY;
        enemy.patrolTargetX = tx;
        enemy.patrolTargetY = ty;
      } else {
        const pAngle = Math.atan2(pdy, pdx);
        enemy.facingAngle = pAngle;
        const patrolSpeed = enemy.speed * 0.55;
        const nextPos = resolveRoomCollisions(
          enemy.x + Math.cos(pAngle) * patrolSpeed * dt,
          enemy.y + Math.sin(pAngle) * patrolSpeed * dt,
          enemy.radius,
          room
        );
        enemy.x = nextPos.x;
        enemy.y = nextPos.y;
      }
      return { playerHitDamage: 0, grabbedPlayer: false, soundCue };
    }
  }

  // 6. Pursue Behavior (Distinct per Enemy Type!)
  if (enemy.state === 'pursue') {
    // Check if within attack trigger distance
    const triggerDist =
      enemy.type === 'tyrant_boss'
        ? enemy.attackRange * 2.1
        : enemy.type === 'crimson_stalker'
          ? enemy.attackRange * 1.4
          : enemy.attackRange * 1.15;

    if (dist <= triggerDist && enemy.attackCooldown <= 0) {
      enemy.state = 'windup';
      // Fair visual & audio telegraph windup duration (0.35s - 0.65s)
      enemy.stateTimer =
        enemy.type === 'tyrant_boss'
          ? 0.62
          : enemy.type === 'crimson_stalker'
            ? 0.36
            : 0.45;
      enemy.facingAngle = angleToPlayer;
      enemy.chargeTargetX = player.x;
      enemy.chargeTargetY = player.y;
      return { playerHitDamage: 0, grabbedPlayer: false, soundCue };
    }

    let moveAngle = angleToPlayer;
    let currentSpeed = enemy.speed;

    if (enemy.type === 'crimson_stalker') {
      // Policy 2: Weaving / flanking hunter that zig-zags as it closes distance
      const weaveOffset = Math.sin(enemy.animTimer * 5.5) * 0.55;
      moveAngle = angleToPlayer + weaveOffset;
    } else if (enemy.type === 'shadow_lurker') {
      // Policy 3: Light-sensitive ambusher — slows down and flinches when hit by player's flashlight beam, sprints when dark!
      const inBeam = isPointInFlashlightCone(
        player.x,
        player.y,
        player.facingAngle,
        player.flashlightOn,
        player.battery,
        enemy.x,
        enemy.y
      );
      if (inBeam) {
        currentSpeed = enemy.speed * 0.32;
        // Slight lateral sidestep to try escaping the beam
        moveAngle = angleToPlayer + Math.PI * 0.35;
      } else {
        currentSpeed = enemy.speed * 1.2;
      }
    } else if (enemy.type === 'tyrant_boss') {
      // Policy 4: Subject Omega Enrages below 50% HP
      if (enemy.hp < enemy.maxHp * 0.5) {
        currentSpeed = enemy.speed * 1.32;
      }
    }

    enemy.facingAngle = angleToPlayer;
    const nextPos = resolveRoomCollisions(
      enemy.x + Math.cos(moveAngle) * currentSpeed * dt,
      enemy.y + Math.sin(moveAngle) * currentSpeed * dt,
      enemy.radius,
      room
    );
    enemy.x = nextPos.x;
    enemy.y = nextPos.y;
  }

  return { playerHitDamage, grabbedPlayer, soundCue };
}
