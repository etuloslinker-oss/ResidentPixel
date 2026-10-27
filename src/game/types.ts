export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type RoomId =
  | 'courtyard'
  | 'foyer'
  | 'dining_room'
  | 'west_corridor'
  | 'study'
  | 'medical_ward'
  | 'east_corridor'
  | 'armory_storage'
  | 'greenhouse'
  | 'basement_stairs'
  | 'generator_room'
  | 'bio_lab';

export type FloorSurface = 'stone' | 'wood' | 'carpet' | 'metal' | 'grass' | 'tile';

export type Direction = 'N' | 'S' | 'E' | 'W';

export type WeaponType = 'knife' | 'handgun' | 'shotgun';

export type ItemCategory = 'weapon' | 'ammo' | 'healing' | 'key' | 'puzzle' | 'battery' | 'document';

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  examineClue?: string;
  stackable: boolean;
  maxStack: number;
  iconType:
    | 'knife'
    | 'handgun'
    | 'shotgun'
    | 'ammo_9mm'
    | 'ammo_shells'
    | 'herb_green'
    | 'herb_red'
    | 'herb_mixed'
    | 'herb_double'
    | 'first_aid'
    | 'battery'
    | 'key_bronze'
    | 'key_silver'
    | 'crest_sun'
    | 'crest_moon'
    | 'crest_star'
    | 'fuse'
    | 'sample_omega'
    | 'note';
  healAmount?: number;
  combinableWith?: Record<string, string>; // partnerItemId -> resultItemId
}

export interface InventorySlot {
  itemId: string;
  quantity: number;
  ammoInClip?: number; // For weapons
}

export type EnemyType = 'zombie' | 'crimson_stalker' | 'shadow_lurker' | 'tyrant_boss';

export type EnemyAIState =
  | 'dormant' // Lying motionless appearing dead
  | 'patrol'
  | 'alert'
  | 'pursue'
  | 'windup' // Telegraph before attack
  | 'attack'
  | 'recover'
  | 'stagger'
  | 'dying'
  | 'dead';

export interface Enemy {
  id: string;
  type: EnemyType;
  roomId: RoomId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  sightRange: number;
  state: EnemyAIState;
  stateTimer: number;
  attackCooldown: number;
  facingAngle: number;
  animFrame: number;
  animTimer: number;
  hitFlashTimer: number;
  patrolOriginX: number;
  patrolOriginY: number;
  patrolTargetX: number;
  patrolTargetY: number;
  feignsDeath?: boolean;
  hasRisen?: boolean;
  chargeTargetX?: number;
  chargeTargetY?: number;
}

export type JumpscareCategory = 'ambush' | 'environmental' | 'cinematic';

export type JumpscareVisualId =
  | 'window_zombie'
  | 'corpse_grab'
  | 'light_flicker_apparition'
  | 'mirror_reflection'
  | 'hanging_corpse_drop'
  | 'telephone_ring_shadow'
  | 'corridor_turn_stalker'
  | 'door_rattle_breach'
  | 'crest_pickup_ambush'
  | 'tyrant_awakening';

export interface JumpscareTrigger {
  id: string;
  roomId: RoomId;
  category: JumpscareCategory;
  visualId: JumpscareVisualId;
  x: number;
  y: number;
  radius: number;
  minRoomVisits: number;
  requiredFlag?: string;
  oneTime: boolean;
  triggered: boolean;
  cooldownSec: number;
  lastTriggeredTime: number;
  title: string;
  subtitle: string;
  cinematicDuration: number; // Freeze/camera control duration (e.g. 0.65s)
  preSilenceDuration: number; // Audio ducking silence before scare
  spawnEnemy?: {
    type: EnemyType;
    x: number;
    y: number;
    hp: number;
  };
}

export interface Door {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  wall: 'N' | 'S' | 'E' | 'W';
  targetRoom: RoomId;
  targetSpawnX: number;
  targetSpawnY: number;
  locked: boolean;
  requiredKeyId?: string;
  requiredFlag?: string;
  lockMessage: string;
  unlockMessage?: string;
  label: string;
}

export type PropType =
  | 'pillar'
  | 'table'
  | 'bookshelf'
  | 'bed_gurney'
  | 'desk'
  | 'clock'
  | 'typewriter'
  | 'portrait_wall'
  | 'breaker_panel'
  | 'crest_pedestal'
  | 'corpse_prop'
  | 'window_boarded'
  | 'mirror'
  | 'telephone_table'
  | 'crate'
  | 'cryo_tube'
  | 'generator'
  | 'bench'
  | 'blood_pool'
  | 'extraction_lift';

export interface RoomProp {
  id: string;
  type: PropType;
  x: number;
  y: number;
  width: number;
  height: number;
  solid: boolean;
  interactable?: boolean;
  interactType?: 'save' | 'puzzle_portraits' | 'puzzle_breakers' | 'puzzle_crests' | 'inspect' | 'extraction_escape';
  inspectText?: string;
  label?: string;
}

export interface WorldPickup {
  id: string;
  roomId: RoomId;
  itemId: string;
  quantity: number;
  x: number;
  y: number;
  collected: boolean;
  noteId?: string;
  setFlagOnPickup?: string;
}

export interface LightSource {
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
  flicker?: boolean;
}

export interface RoomDefinition {
  id: RoomId;
  name: string;
  sector: 'Exterior' | 'Main Hall' | 'West Wing' | 'East Wing' | 'Sub-Level';
  width: number; // Always 400 internal pixel width
  height: number; // Always 225 internal pixel height
  floorSurface: FloorSurface;
  ambientLight: number; // 0.05 (pitch dark) to 0.45 (dimly lit)
  wallColor: string;
  floorColor: string;
  floorAccentColor: string;
  cameraAngleLabel: string; // Fixed camera angle label e.g. "CAM 01-A // FOYER NORTH"
  musicMood: 'safe' | 'tension' | 'danger' | 'boss';
  doors: Door[];
  props: RoomProp[];
  lights: LightSource[];
  mapGridX: number;
  mapGridY: number;
}

export interface NoteDocument {
  id: string;
  title: string;
  author: string;
  date: string;
  locationFound: string;
  content: string[];
  highlightClue: string;
}

export type PlayerActionState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'aim'
  | 'shoot'
  | 'reload'
  | 'hurt'
  | 'interact'
  | 'grabbed'
  | 'dead';

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  trailingHp: number; // For delayed rally/damage bar
  stamina: number;
  maxStamina: number;
  flashlightOn: boolean;
  battery: number; // 0 to 100
  facingAngle: number;
  actionState: PlayerActionState;
  actionTimer: number;
  invulnerableTimer: number;
  equippedWeapon: WeaponType;
  isAiming: boolean;
  grabbedByEnemyId: string | null;
  grabEscapeProgress: number; // 0 to 100
  walkDistance: number;
}

export interface PuzzleStates {
  portraitsSolved: boolean;
  portraitOrder: string[]; // Target: ['founder', 'general', 'scholar', 'bride']
  breakerSolved: boolean;
  breakerSequence: number[]; // Target: [3, 1, 4, 2]
  crestsInserted: string[]; // Target: ['crest_sun', 'crest_moon', 'crest_star']
  crestsSolved: boolean;
}

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  muted: boolean;
  reducedFlash: boolean;
}

export interface RunStats {
  outcome: 'victory' | 'defeat' | null;
  elapsedSeconds: number;
  enemiesDefeated: number;
  filesCollected: number;
  totalFiles: number;
  savesUsed: number;
  damageTaken: number;
  causeOfDeath?: string;
}
