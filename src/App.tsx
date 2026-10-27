import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AudioSettings,
  Door,
  Enemy,
  GameState,
  InventorySlot,
  JumpscareTrigger,
  JumpscareVisualId,
  PlayerState,
  PuzzleStates,
  RoomId,
  RoomProp,
  RunStats,
  WeaponType,
  WorldPickup,
} from './game/types';
import {
  ITEM_DEFINITIONS,
  MAX_INVENTORY_SLOTS,
  NOTE_DOCUMENTS,
  ROOM_DEFINITIONS,
  createInitialEnemies,
  createInitialJumpscares,
  createInitialWorldPickups,
} from './game/worldData';
import {
  addItemToInventory,
  checkCrestPedestal,
  checkPortraitPuzzle,
  combineInventorySlots,
  evaluateJumpscareTrigger,
  getVitalityStatus,
  getWeaponSpecs,
  reloadActiveWeapon,
  resolveRoomCollisions,
  stepBreakerSwitch,
  stepEnemyAI,
  unprojectPseudo3D,
} from './game/rules';
import {
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  renderPixelRoom,
  spawnParticles,
} from './game/pixelRenderer';
import { audioManager } from './game/audioManager';
import { BioCrestTitleEmblem, ItemIconSvg } from './components/SvgIcons';
import { CaseOverlayModal } from './components/CaseOverlayModal';
import { PuzzleModal } from './components/PuzzleModal';

const SAVE_STORAGE_KEY = 'blackwood_manor_save_v1';

interface HudSnapshot {
  hp: number;
  maxHp: number;
  trailingHp: number;
  battery: number;
  flashlightOn: boolean;
  equippedWeapon: WeaponType;
  ammoInClip: number;
  reserveAmmo: number;
  roomId: RoomId;
  roomName: string;
  cameraLabel: string;
  promptText: string | null;
  radioBanner: { speaker: string; text: string } | null;
  scareBanner: { title: string; subtitle: string } | null;
  bossHp: number | null;
  bossMaxHp: number | null;
  grabbed: boolean;
}

function createInitialInventory(): (InventorySlot | null)[] {
  const slots: (InventorySlot | null)[] = Array(MAX_INVENTORY_SLOTS).fill(null);
  slots[0] = { itemId: 'handgun', quantity: 1, ammoInClip: 15 };
  slots[1] = { itemId: 'knife', quantity: 1 };
  slots[2] = { itemId: 'ammo_9mm', quantity: 15 };
  slots[3] = { itemId: 'herb_green', quantity: 1 };
  return slots;
}

function createInitialPlayer(): PlayerState {
  return {
    x: 200,
    y: 165,
    vx: 0,
    vy: 0,
    radius: 8,
    hp: 100,
    maxHp: 100,
    trailingHp: 100,
    stamina: 100,
    maxStamina: 100,
    flashlightOn: true,
    battery: 100,
    facingAngle: -Math.PI / 2, // Facing North toward Grand Foyer doors
    actionState: 'idle',
    actionTimer: 0,
    invulnerableTimer: 0,
    equippedWeapon: 'handgun',
    isAiming: false,
    grabbedByEnemyId: null,
    grabEscapeProgress: 0,
    walkDistance: 0,
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Core High-Frequency Mutable Simulation State in Refs
  const gameStateRef = useRef<GameState>('title');
  const currentRoomRef = useRef<RoomId>('courtyard');
  const playerRef = useRef<PlayerState>(createInitialPlayer());
  const inventoryRef = useRef<(InventorySlot | null)[]>(createInitialInventory());
  const enemiesRef = useRef<Enemy[]>(createInitialEnemies());
  const pickupsRef = useRef<WorldPickup[]>(createInitialWorldPickups());
  const jumpscaresRef = useRef<JumpscareTrigger[]>(createInitialJumpscares());
  const visitedRoomsRef = useRef<Set<RoomId>>(new Set(['courtyard']));
  const roomVisitCountRef = useRef<Record<RoomId, number>>({
    courtyard: 1,
    foyer: 0,
    dining_room: 0,
    west_corridor: 0,
    study: 0,
    medical_ward: 0,
    east_corridor: 0,
    armory_storage: 0,
    greenhouse: 0,
    basement_stairs: 0,
    generator_room: 0,
    bio_lab: 0,
  });
  const unlockedDoorsRef = useRef<Set<string>>(new Set());
  const collectedNotesRef = useRef<Set<string>>(new Set(['note_01_radio']));
  const storyFlagsRef = useRef<Set<string>>(new Set());
  const puzzleStatesRef = useRef<PuzzleStates>({
    portraitsSolved: false,
    portraitOrder: ['general', 'founder', 'bride', 'scholar'], // Scrambled initially
    breakerSolved: false,
    breakerSequence: [],
    crestsInserted: [],
    crestsSolved: false,
  });

  // Simulation Juice & Effects Refs
  const hitstopTimerRef = useRef<number>(0);
  const traumaRef = useRef<number>(0);
  const muzzleFlashTimerRef = useRef<number>(0);
  const bulletTraceRef = useRef<{ x1: number; y1: number; x2: number; y2: number; timer: number } | null>(null);
  const roomFadeAlphaRef = useRef<number>(0);
  const activeJumpscareRef = useRef<{
    visualId: JumpscareVisualId;
    timer: number;
    duration: number;
    title: string;
    subtitle: string;
  } | null>(null);
  const radioBannerRef = useRef<{ speaker: string; text: string; timer: number } | null>({
    speaker: 'RADIO // CAPT. CROSS',
    text: 'Bravo Team signal traced inside Blackwood Manor. Enter the Grand Foyer ahead [WASD + E].',
    timer: 7.5,
  });
  const elapsedSecRef = useRef<number>(0);
  const enemiesDefeatedRef = useRef<number>(0);
  const savesUsedRef = useRef<number>(0);
  const damageTakenRef = useRef<number>(0);

  // Input Tracking Refs
  const keysHeldRef = useRef<Set<string>>(new Set());
  const mouseWorldRef = useRef<{ x: number; y: number; active: boolean }>({ x: 200, y: 100, active: false });

  // React UI State (Updated only on discrete events or throttled)
  const [gameState, setGameState] = useState<GameState>('title');
  const [caseTab, setCaseTab] = useState<'inventory' | 'map' | 'files' | null>(null);
  const [activePuzzleModal, setActivePuzzleModal] = useState<
    'puzzle_portraits' | 'puzzle_breakers' | 'puzzle_crests' | 'save' | null
  >(null);
  const [modalFeedback, setModalFeedback] = useState<string>('');
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(audioManager.settings);
  const [hasSavedGame, setHasSavedGame] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(SAVE_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [runStats, setRunStats] = useState<RunStats>({
    outcome: null,
    elapsedSeconds: 0,
    enemiesDefeated: 0,
    filesCollected: 1,
    totalFiles: NOTE_DOCUMENTS.length,
    savesUsed: 0,
    damageTaken: 0,
  });
  const [hud, setHud] = useState<HudSnapshot>({
    hp: 100,
    maxHp: 100,
    trailingHp: 100,
    battery: 100,
    flashlightOn: true,
    equippedWeapon: 'handgun',
    ammoInClip: 15,
    reserveAmmo: 15,
    roomId: 'courtyard',
    roomName: ROOM_DEFINITIONS.courtyard.name,
    cameraLabel: ROOM_DEFINITIONS.courtyard.cameraAngleLabel,
    promptText: null,
    radioBanner: {
      speaker: 'RADIO // CAPT. CROSS',
      text: 'Bravo Team signal traced inside Blackwood Manor. Enter the Grand Foyer ahead [WASD + E].',
    },
    scareBanner: null,
    bossHp: null,
    bossMaxHp: null,
    grabbed: false,
  });

  // Sync GameState to document.body.dataset.state
  const updateGameState = useCallback((nextState: GameState) => {
    gameStateRef.current = nextState;
    document.body.dataset.state = nextState;
    setGameState(nextState);
    if (nextState === 'playing') {
      keysHeldRef.current.clear();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      canvasRef.current?.focus();
    }
  }, []);

  const lastHudKeyRef = useRef<string>('');

  // Build HUD snapshot helper (only triggers React state update when discrete displayed values change)
  const syncHudSnapshot = useCallback((promptText: string | null = null) => {
    const p = playerRef.current;
    const inv = inventoryRef.current;
    const specs = getWeaponSpecs(p.equippedWeapon);
    const weaponSlot = inv.find((s) => s?.itemId === p.equippedWeapon);
    const ammoInClip = weaponSlot?.ammoInClip ?? 0;
    const reserveAmmo = specs.ammoItemId
      ? inv
          .filter((s) => s?.itemId === specs.ammoItemId)
          .reduce((acc, s) => acc + (s?.quantity ?? 0), 0)
      : 0;

    const room = ROOM_DEFINITIONS[currentRoomRef.current];
    const boss =
      currentRoomRef.current === 'bio_lab'
        ? enemiesRef.current.find((e) => e.type === 'tyrant_boss' && e.state !== 'dead')
        : undefined;

    const hpInt = Math.round(p.hp);
    const trailingInt = Math.round(p.trailingHp);
    const battInt = Math.round(p.battery);
    const bossHpInt = boss ? Math.round(boss.hp) : -1;
    const radioKey = radioBannerRef.current ? radioBannerRef.current.text : '';
    const scareKey = activeJumpscareRef.current ? activeJumpscareRef.current.title : '';

    const nextKey = `${hpInt}|${trailingInt}|${battInt}|${p.flashlightOn}|${p.equippedWeapon}|${ammoInClip}|${reserveAmmo}|${room.id}|${promptText ?? ''}|${radioKey}|${scareKey}|${bossHpInt}|${Boolean(p.grabbedByEnemyId)}`;
    if (nextKey === lastHudKeyRef.current) {
      return;
    }
    lastHudKeyRef.current = nextKey;

    setHud({
      hp: hpInt,
      maxHp: p.maxHp,
      trailingHp: trailingInt,
      battery: battInt,
      flashlightOn: p.flashlightOn,
      equippedWeapon: p.equippedWeapon,
      ammoInClip,
      reserveAmmo,
      roomId: room.id,
      roomName: room.name,
      cameraLabel: room.cameraAngleLabel,
      promptText,
      radioBanner: radioBannerRef.current
        ? { speaker: radioBannerRef.current.speaker, text: radioBannerRef.current.text }
        : null,
      scareBanner: activeJumpscareRef.current
        ? { title: activeJumpscareRef.current.title, subtitle: activeJumpscareRef.current.subtitle }
        : null,
      bossHp: boss ? bossHpInt : null,
      bossMaxHp: boss ? boss.maxHp : null,
      grabbed: Boolean(p.grabbedByEnemyId),
    });
  }, []);

  // Start New Game
  const startNewGame = useCallback(() => {
    audioManager.init();
    currentRoomRef.current = 'courtyard';
    playerRef.current = createInitialPlayer();
    inventoryRef.current = createInitialInventory();
    enemiesRef.current = createInitialEnemies();
    pickupsRef.current = createInitialWorldPickups();
    jumpscaresRef.current = createInitialJumpscares();
    visitedRoomsRef.current = new Set(['courtyard']);
    roomVisitCountRef.current = {
      courtyard: 1,
      foyer: 0,
      dining_room: 0,
      west_corridor: 0,
      study: 0,
      medical_ward: 0,
      east_corridor: 0,
      armory_storage: 0,
      greenhouse: 0,
      basement_stairs: 0,
      generator_room: 0,
      bio_lab: 0,
    };
    unlockedDoorsRef.current = new Set();
    collectedNotesRef.current = new Set(['note_01_radio']);
    storyFlagsRef.current = new Set();
    puzzleStatesRef.current = {
      portraitsSolved: false,
      portraitOrder: ['general', 'founder', 'bride', 'scholar'],
      breakerSolved: false,
      breakerSequence: [],
      crestsInserted: [],
      crestsSolved: false,
    };
    elapsedSecRef.current = 0;
    enemiesDefeatedRef.current = 0;
    savesUsedRef.current = 0;
    damageTakenRef.current = 0;
    activeJumpscareRef.current = null;
    radioBannerRef.current = {
      speaker: 'RADIO // CAPT. CROSS',
      text: 'Bravo Team signal traced inside Blackwood Manor. Enter the Grand Foyer ahead [WASD + E].',
      timer: 7.5,
    };
    setCaseTab(null);
    setActivePuzzleModal(null);
    audioManager.setMusicMood('tension');
    updateGameState('playing');
    syncHudSnapshot();
  }, [syncHudSnapshot, updateGameState]);

  // Save & Load Game to localStorage
  const saveGameToStorage = useCallback(() => {
    try {
      const payload = {
        currentRoom: currentRoomRef.current,
        player: playerRef.current,
        inventory: inventoryRef.current,
        enemies: enemiesRef.current,
        pickups: pickupsRef.current,
        jumpscares: jumpscaresRef.current,
        visitedRooms: Array.from(visitedRoomsRef.current),
        roomVisitCount: roomVisitCountRef.current,
        unlockedDoors: Array.from(unlockedDoorsRef.current),
        collectedNotes: Array.from(collectedNotesRef.current),
        storyFlags: Array.from(storyFlagsRef.current),
        puzzleStates: puzzleStatesRef.current,
        elapsedSec: elapsedSecRef.current,
        enemiesDefeated: enemiesDefeatedRef.current,
        savesUsed: savesUsedRef.current + 1,
        damageTaken: damageTakenRef.current,
      };
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
      savesUsedRef.current += 1;
      setHasSavedGame(true);
      audioManager.playUiSound('save_typewriter');
      setModalFeedback('INK RIBBON CONSUMED: Progress recorded to local storage.');
    } catch {
      setModalFeedback('Unable to write save data in current browser context.');
    }
  }, []);

  const loadGameFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      audioManager.init();
      currentRoomRef.current = data.currentRoom || 'foyer';
      playerRef.current = { ...createInitialPlayer(), ...data.player, grabbedByEnemyId: null };
      inventoryRef.current = data.inventory || createInitialInventory();
      enemiesRef.current = data.enemies || createInitialEnemies();
      pickupsRef.current = data.pickups || createInitialWorldPickups();
      jumpscaresRef.current = data.jumpscares || createInitialJumpscares();
      visitedRoomsRef.current = new Set(data.visitedRooms || ['courtyard', 'foyer']);
      roomVisitCountRef.current = data.roomVisitCount || roomVisitCountRef.current;
      unlockedDoorsRef.current = new Set(data.unlockedDoors || []);
      collectedNotesRef.current = new Set(data.collectedNotes || ['note_01_radio']);
      storyFlagsRef.current = new Set(data.storyFlags || []);
      puzzleStatesRef.current = data.puzzleStates || puzzleStatesRef.current;
      elapsedSecRef.current = data.elapsedSec || 0;
      enemiesDefeatedRef.current = data.enemiesDefeated || 0;
      savesUsedRef.current = data.savesUsed || 1;
      damageTakenRef.current = data.damageTaken || 0;

      setCaseTab(null);
      setActivePuzzleModal(null);
      audioManager.setMusicMood(ROOM_DEFINITIONS[currentRoomRef.current].musicMood);
      updateGameState('playing');
      syncHudSnapshot();
    } catch {
      // Ignore corrupt save
    }
  }, [syncHudSnapshot, updateGameState]);

  // Check ?autostart=1 on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startNewGame();
    } else {
      document.body.dataset.state = 'title';
    }
  }, [startNewGame]);

  // Weapon Fire Handler
  const triggerWeaponAttack = useCallback(() => {
    const p = playerRef.current;
    if (
      gameStateRef.current !== 'playing' ||
      caseTab !== null ||
      activePuzzleModal !== null ||
      (activeJumpscareRef.current && activeJumpscareRef.current.timer > 0.25) ||
      p.actionTimer > 0 ||
      p.grabbedByEnemyId
    ) {
      return;
    }

    const specs = getWeaponSpecs(p.equippedWeapon);
    const inv = inventoryRef.current;
    const weaponIdx = inv.findIndex((s) => s?.itemId === p.equippedWeapon);

    if (specs.ammoItemId) {
      const clip = weaponIdx !== -1 ? inv[weaponIdx]?.ammoInClip ?? 0 : 0;
      if (clip <= 0) {
        audioManager.playDryFire();
        // Auto-attempt reload if player has spare rounds
        const reloadRes = reloadActiveWeapon(inv, p.equippedWeapon);
        if (reloadRes.reloaded) {
          inventoryRef.current = reloadRes.updatedSlots;
          p.actionState = 'reload';
          p.actionTimer = 0.55;
          audioManager.playReload();
          syncHudSnapshot(reloadRes.message);
        } else {
          syncHudSnapshot('CLICK! Out of ammo — switch to Knife [1] or find ammo.');
        }
        return;
      }

      // Consume 1 round
      const nextInv = inv.map((s) => (s ? { ...s } : null));
      nextInv[weaponIdx] = {
        ...nextInv[weaponIdx]!,
        ammoInClip: clip - 1,
      };
      inventoryRef.current = nextInv;
    }

    audioManager.init();
    p.actionState = 'shoot';
    p.actionTimer = specs.fireCooldown;
    muzzleFlashTimerRef.current = p.equippedWeapon === 'knife' ? 0 : 0.11;
    traumaRef.current = Math.min(1, traumaRef.current + (p.equippedWeapon === 'shotgun' ? 0.35 : 0.16));
    audioManager.playWeaponFire(p.equippedWeapon);

    const room = ROOM_DEFINITIONS[currentRoomRef.current];
    const roomEnemies = enemiesRef.current.filter(
      (e) => e.roomId === currentRoomRef.current && e.state !== 'dead' && e.state !== 'dying'
    );

    let traceEndX = Math.max(18, Math.min(room.width - 18, p.x + Math.cos(p.facingAngle) * specs.range));
    let traceEndY = Math.max(18, Math.min(room.height - 18, p.y + Math.sin(p.facingAngle) * specs.range));
    let anyEnemyHit = false;

    for (let pellet = 0; pellet < specs.pellets; pellet++) {
      const spreadOffset = (Math.random() - 0.5) * specs.spreadAngle;
      const rayAngle = p.facingAngle + spreadOffset;
      const cos = Math.cos(rayAngle);
      const sin = Math.sin(rayAngle);

      // Find closest enemy intersected by ray
      let hitEnemy: Enemy | null = null;
      let closestDist = specs.range;

      for (const enemy of roomEnemies) {
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const proj = dx * cos + dy * sin;
        if (proj < 0 || proj > closestDist) continue;
        const perpDistSq = dx * dx + dy * dy - proj * proj;
        const hitRadius = enemy.radius + (p.equippedWeapon === 'knife' ? 12 : 9);
        if (perpDistSq <= hitRadius * hitRadius) {
          closestDist = proj;
          hitEnemy = enemy;
        }
      }

      if (hitEnemy) {
        anyEnemyHit = true;
        traceEndX = hitEnemy.x;
        traceEndY = hitEnemy.y;
        hitEnemy.hp -= specs.damage;
        hitEnemy.hitFlashTimer = 0.09;
        hitstopTimerRef.current = p.equippedWeapon === 'shotgun' ? 0.05 : 0.03;

        // Wake up dormant zombie if shot
        if (hitEnemy.state === 'dormant') {
          hitEnemy.state = 'pursue';
          hitEnemy.hasRisen = true;
        }

        // Blood burst particles
        spawnParticles(hitEnemy.x, hitEnemy.y, 10, '#991b1b', 75, 0.42, 2);

        if (hitEnemy.hp <= 0) {
          hitEnemy.state = 'dying';
          hitEnemy.stateTimer = 0.35;
          enemiesDefeatedRef.current += 1;
          spawnParticles(hitEnemy.x, hitEnemy.y, 22, '#7f1d1d', 95, 0.6, 3);

          // If Subject Omega Boss is defeated, drop the Chimera Sample & Master Override!
          if (hitEnemy.type === 'tyrant_boss') {
            storyFlagsRef.current.add('omega_defeated');
            pickupsRef.current.push({
              id: 'pickup_omega_sample',
              roomId: 'bio_lab',
              itemId: 'sample_omega',
              quantity: 1,
              x: hitEnemy.x,
              y: hitEnemy.y,
              collected: false,
              setFlagOnPickup: 'got_omega_sample',
            });
            radioBannerRef.current = {
              speaker: 'RADIO // CAPT. CROSS',
              text: 'SUBJECT OMEGA NEUTRALIZED! Grab the Chimera Sample and board the North Extraction Lift!',
              timer: 9.0,
            };
          }
        } else if (Math.random() < specs.staggerChance && hitEnemy.type !== 'tyrant_boss') {
          hitEnemy.state = 'stagger';
          hitEnemy.stateTimer = 0.32;
          hitEnemy.vx = cos * 65;
          hitEnemy.vy = sin * 65;
        }
      }
    }

    if (p.equippedWeapon !== 'knife') {
      bulletTraceRef.current = {
        x1: p.x + Math.cos(p.facingAngle) * 10,
        y1: p.y + Math.sin(p.facingAngle) * 10,
        x2: traceEndX,
        y2: traceEndY,
        timer: 0.1,
      };
      if (!anyEnemyHit) {
        spawnParticles(traceEndX, traceEndY, 6, '#fde047', 55, 0.25, 2);
      }
    }

    syncHudSnapshot();
  }, [activePuzzleModal, caseTab, syncHudSnapshot]);

  // Interact ('E') Handler
  const handleInteract = useCallback(() => {
    const p = playerRef.current;
    if (gameStateRef.current !== 'playing' || caseTab !== null || activePuzzleModal !== null) {
      return;
    }

    // If grabbed by a zombie, E struggles free faster
    if (p.grabbedByEnemyId) {
      p.grabEscapeProgress += 35;
      if (p.grabEscapeProgress >= 100) {
        const grabber = enemiesRef.current.find((e) => e.id === p.grabbedByEnemyId);
        if (grabber) {
          grabber.state = 'stagger';
          grabber.stateTimer = 0.7;
          grabber.vx = Math.cos(p.facingAngle) * 90;
          grabber.vy = Math.sin(p.facingAngle) * 90;
        }
        p.grabbedByEnemyId = null;
        p.grabEscapeProgress = 0;
        p.invulnerableTimer = 0.8;
        syncHudSnapshot('Shoved the creature back!');
      }
      return;
    }

    const room = ROOM_DEFINITIONS[currentRoomRef.current];

    // 1. Check nearby pickups first (within 28px)
    const nearbyPickup = pickupsRef.current.find(
      (item) =>
        !item.collected &&
        item.roomId === room.id &&
        Math.hypot(item.x - p.x, item.y - p.y) <= 28
    );

    if (nearbyPickup) {
      if (nearbyPickup.itemId === 'note' && nearbyPickup.noteId) {
        nearbyPickup.collected = true;
        collectedNotesRef.current.add(nearbyPickup.noteId);
        audioManager.playUiSound('pickup');
        const noteDoc = NOTE_DOCUMENTS.find((n) => n.id === nearbyPickup.noteId);
        radioBannerRef.current = {
          speaker: `FILE RECOVERED // ${noteDoc?.title ?? 'Journal'}`,
          text: noteDoc?.highlightClue ?? 'Added to Tactical Files [Tab].',
          timer: 7.5,
        };
        syncHudSnapshot(`Read ${noteDoc?.title}`);
        return;
      }

      const addRes = addItemToInventory(
        inventoryRef.current,
        nearbyPickup.itemId,
        nearbyPickup.quantity
      );
      if (addRes.success) {
        inventoryRef.current = addRes.updatedSlots;
        nearbyPickup.collected = true;
        if (nearbyPickup.setFlagOnPickup) {
          storyFlagsRef.current.add(nearbyPickup.setFlagOnPickup);
        }
        if (nearbyPickup.itemId === 'shotgun') {
          p.equippedWeapon = 'shotgun';
        }
        audioManager.playUiSound('pickup');
        radioBannerRef.current = {
          speaker: 'ITEM ACQUIRED',
          text: addRes.message,
          timer: 4.0,
        };
        syncHudSnapshot(addRes.message);
      } else {
        audioManager.playUiSound('locked');
        radioBannerRef.current = {
          speaker: 'ATTACHE CASE FULL',
          text: addRes.message,
          timer: 4.5,
        };
        syncHudSnapshot(addRes.message);
      }
      return;
    }

    // 2. Check nearby doors (within 32px of door center)
    const nearbyDoor: Door | undefined = room.doors.find((d) => {
      const cx = d.x + d.width / 2;
      const cy = d.y + d.height / 2;
      return Math.hypot(cx - p.x, cy - p.y) <= 34;
    });

    if (nearbyDoor) {
      const isLocked = nearbyDoor.locked && !unlockedDoorsRef.current.has(nearbyDoor.id);
      if (isLocked) {
        // Check if player has requiredKeyId or requiredFlag
        const hasKey =
          nearbyDoor.requiredKeyId &&
          inventoryRef.current.some((s) => s?.itemId === nearbyDoor.requiredKeyId);
        const hasFlag =
          nearbyDoor.requiredFlag && storyFlagsRef.current.has(nearbyDoor.requiredFlag);

        if (hasKey || hasFlag) {
          unlockedDoorsRef.current.add(nearbyDoor.id);
          nearbyDoor.locked = false;
          audioManager.playUiSound('puzzle_solve');
          radioBannerRef.current = {
            speaker: 'DOOR UNLOCKED',
            text: nearbyDoor.unlockMessage || `Unlocked ${nearbyDoor.label}.`,
            timer: 4.5,
          };
          syncHudSnapshot(nearbyDoor.unlockMessage || 'Unlocked!');
        } else {
          audioManager.playUiSound('locked');
          radioBannerRef.current = {
            speaker: 'LOCKED PASSAGE',
            text: nearbyDoor.lockMessage,
            timer: 5.0,
          };
          syncHudSnapshot(nearbyDoor.lockMessage);
          return;
        }
      }

      // Transition into target room!
      audioManager.playUiSound('door');
      roomFadeAlphaRef.current = 1.0;
      const nextRoomId = nearbyDoor.targetRoom;
      currentRoomRef.current = nextRoomId;
      visitedRoomsRef.current.add(nextRoomId);
      roomVisitCountRef.current[nextRoomId] = (roomVisitCountRef.current[nextRoomId] || 0) + 1;
      p.x = nearbyDoor.targetSpawnX;
      p.y = nearbyDoor.targetSpawnY;
      p.grabbedByEnemyId = null;
      audioManager.setMusicMood(ROOM_DEFINITIONS[nextRoomId].musicMood);
      syncHudSnapshot();
      return;
    }

    // 3. Check nearby interactable props (Typewriter, Puzzles, Extraction Lift, Inspection)
    const nearbyProp: RoomProp | undefined = room.props.find((pr) => {
      if (!pr.interactable) return false;
      const cx = pr.x + pr.width / 2;
      const cy = pr.y + pr.height / 2;
      return Math.hypot(cx - p.x, cy - p.y) <= Math.max(pr.width, pr.height) / 2 + 26;
    });

    if (nearbyProp) {
      if (nearbyProp.interactType === 'save') {
        setModalFeedback('Typewriter ready. Save your current run to browser storage.');
        setActivePuzzleModal('save');
      } else if (nearbyProp.interactType === 'puzzle_portraits') {
        setModalFeedback(
          puzzleStatesRef.current.portraitsSolved
            ? 'The ancestral vault is open. You already recovered the Silver Moon Crest.'
            : 'Click two portraits to swap their positions according to the Butler’s Lineage verse.'
        );
        setActivePuzzleModal('puzzle_portraits');
      } else if (nearbyProp.interactType === 'puzzle_breakers') {
        setModalFeedback(
          puzzleStatesRef.current.breakerSolved
            ? 'High-voltage generator online. You already recovered the Obsidian Star Crest.'
            : 'Engage the 4 switches in cold-start sequence (3 -> 1 -> 4 -> 2).'
        );
        setActivePuzzleModal('puzzle_breakers');
      } else if (nearbyProp.interactType === 'puzzle_crests') {
        setModalFeedback(
          puzzleStatesRef.current.crestsSolved
            ? 'All three Astral Crests are sealed. The Bio-Containment Lab bulkhead is unlocked!'
            : 'Insert the Golden Sun, Silver Moon, and Obsidian Star Crests to unseal the Bio-Lab.'
        );
        setActivePuzzleModal('puzzle_crests');
      } else if (nearbyProp.interactType === 'extraction_escape') {
        const hasSample =
          storyFlagsRef.current.has('got_omega_sample') ||
          inventoryRef.current.some((s) => s?.itemId === 'sample_omega');
        const bossAlive = enemiesRef.current.some(
          (e) => e.type === 'tyrant_boss' && e.state !== 'dead'
        );
        if (bossAlive) {
          audioManager.playUiSound('locked');
          radioBannerRef.current = {
            speaker: 'EMERGENCY LOCKDOWN',
            text: 'Cannot activate Extraction Lift while Subject Omega is still active in the chamber!',
            timer: 5.0,
          };
        } else if (!hasSample) {
          audioManager.playUiSound('locked');
          radioBannerRef.current = {
            speaker: 'OVERRIDE REQUIRED',
            text: 'Retrieve the Chimera Sample & Master Override dropped by Subject Omega first!',
            timer: 5.0,
          };
        } else {
          // VICTORY!
          audioManager.playUiSound('puzzle_solve');
          setRunStats({
            outcome: 'victory',
            elapsedSeconds: Math.round(elapsedSecRef.current),
            enemiesDefeated: enemiesDefeatedRef.current,
            filesCollected: collectedNotesRef.current.size,
            totalFiles: NOTE_DOCUMENTS.length,
            savesUsed: savesUsedRef.current,
            damageTaken: Math.round(damageTakenRef.current),
          });
          updateGameState('gameover');
        }
      } else if (nearbyProp.inspectText) {
        radioBannerRef.current = {
          speaker: `INSPECT // ${nearbyProp.label?.toUpperCase() || 'ENVIRONMENT'}`,
          text: nearbyProp.inspectText,
          timer: 5.5,
        };
        syncHudSnapshot(nearbyProp.inspectText);
      }
    }
  }, [activePuzzleModal, caseTab, syncHudSnapshot, updateGameState]);

  // Global Keyboard & Mouse Input Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;

      // Title Screen Start Handshake
      if (gameStateRef.current === 'title') {
        if (code === 'Enter' || code === 'Space') {
          e.preventDefault();
          startNewGame();
        }
        return;
      }

      if (gameStateRef.current === 'gameover') {
        if (code === 'Enter' || code === 'Space') {
          e.preventDefault();
          startNewGame();
        }
        return;
      }

      // Pause / Modal Close ('Escape' or 'KeyP')
      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault();
        if (activePuzzleModal !== null) {
          setActivePuzzleModal(null);
          return;
        }
        if (caseTab !== null) {
          setCaseTab(null);
          return;
        }
        if (gameStateRef.current === 'playing') {
          updateGameState('paused');
        } else if (gameStateRef.current === 'paused') {
          updateGameState('playing');
        }
        return;
      }

      if (gameStateRef.current !== 'playing') return;

      // Inventory ('Tab' or 'KeyI')
      if (code === 'Tab' || code === 'KeyI') {
        e.preventDefault();
        setActivePuzzleModal(null);
        setCaseTab((prev) => (prev === 'inventory' ? null : 'inventory'));
        return;
      }

      // Map ('KeyM')
      if (code === 'KeyM') {
        e.preventDefault();
        setActivePuzzleModal(null);
        setCaseTab((prev) => (prev === 'map' ? null : 'map'));
        return;
      }

      if (caseTab !== null || activePuzzleModal !== null) return;

      keysHeldRef.current.add(code);

      // Edge-triggered one-shot actions
      if (!e.repeat) {
        if (code === 'KeyE') {
          e.preventDefault();
          handleInteract();
        } else if (code === 'KeyF') {
          e.preventDefault();
          playerRef.current.flashlightOn = !playerRef.current.flashlightOn;
          audioManager.playDryFire();
          syncHudSnapshot();
        } else if (code === 'KeyJ') {
          e.preventDefault();
          triggerWeaponAttack();
        } else if (code === 'KeyR') {
          e.preventDefault();
          const res = reloadActiveWeapon(
            inventoryRef.current,
            playerRef.current.equippedWeapon
          );
          if (res.reloaded) {
            inventoryRef.current = res.updatedSlots;
            playerRef.current.actionState = 'reload';
            playerRef.current.actionTimer = 0.55;
            audioManager.playReload();
          } else {
            audioManager.playDryFire();
          }
          radioBannerRef.current = {
            speaker: 'WEAPON STATUS',
            text: res.message,
            timer: 3.2,
          };
          syncHudSnapshot(res.message);
        } else if (code === 'Digit1') {
          playerRef.current.equippedWeapon = 'knife';
          syncHudSnapshot();
        } else if (code === 'Digit2') {
          if (inventoryRef.current.some((s) => s?.itemId === 'handgun')) {
            playerRef.current.equippedWeapon = 'handgun';
            syncHudSnapshot();
          }
        } else if (code === 'Digit3') {
          if (inventoryRef.current.some((s) => s?.itemId === 'shotgun')) {
            playerRef.current.equippedWeapon = 'shotgun';
            syncHudSnapshot();
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
    };

    const onWindowBlur = () => {
      keysHeldRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [
    activePuzzleModal,
    caseTab,
    handleInteract,
    startNewGame,
    syncHudSnapshot,
    triggerWeaponAttack,
    updateGameState,
  ]);

  // Main 60Hz Canvas Simulation & Render Loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let hudSyncAccumulator = 0;

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      const isPlaying =
        gameStateRef.current === 'playing' &&
        caseTab === null &&
        activePuzzleModal === null;

      if (isPlaying) {
        elapsedSecRef.current += dt;

        // Tick timers that run during hitstop
        hitstopTimerRef.current = Math.max(0, hitstopTimerRef.current - dt);
        traumaRef.current = Math.max(0, traumaRef.current - dt * 1.8);
        muzzleFlashTimerRef.current = Math.max(0, muzzleFlashTimerRef.current - dt);
        roomFadeAlphaRef.current = Math.max(0, roomFadeAlphaRef.current - dt * 2.5);

        if (bulletTraceRef.current) {
          bulletTraceRef.current.timer -= dt;
          if (bulletTraceRef.current.timer <= 0) {
            bulletTraceRef.current = null;
          }
        }

        if (radioBannerRef.current) {
          radioBannerRef.current.timer -= dt;
          if (radioBannerRef.current.timer <= 0) {
            radioBannerRef.current = null;
          }
        }

        if (activeJumpscareRef.current) {
          activeJumpscareRef.current.timer -= dt;
          if (activeJumpscareRef.current.timer <= 0) {
            activeJumpscareRef.current = null;
          }
        }

        // Advance simulation physics when not frozen by hitstop or major cinematic scare peak
        const inCinematicFreeze =
          activeJumpscareRef.current !== null &&
          activeJumpscareRef.current.timer > activeJumpscareRef.current.duration * 0.45;

        const simDt = hitstopTimerRef.current > 0 || inCinematicFreeze ? 0 : dt;

        if (simDt > 0) {
          const p = playerRef.current;
          const room = ROOM_DEFINITIONS[currentRoomRef.current];
          const held = keysHeldRef.current;

          p.actionTimer = Math.max(0, p.actionTimer - simDt);
          p.invulnerableTimer = Math.max(0, p.invulnerableTimer - simDt);

          // Delayed trailing HP rally bar decay
          if (p.trailingHp > p.hp) {
            p.trailingHp = Math.max(p.hp, p.trailingHp - 28 * simDt);
          } else {
            p.trailingHp = p.hp;
          }

          // Flashlight battery drain
          if (p.flashlightOn && p.battery > 0) {
            p.battery = Math.max(0, p.battery - 0.85 * simDt);
            if (p.battery === 0) {
              p.flashlightOn = false;
            }
          }

          // Aim stance
          p.isAiming = held.has('Space');

          // Movement input
          let moveX = 0;
          let moveY = 0;
          if (held.has('KeyW') || held.has('ArrowUp')) moveY -= 1;
          if (held.has('KeyS') || held.has('ArrowDown')) moveY += 1;
          if (held.has('KeyA') || held.has('ArrowLeft')) moveX -= 1;
          if (held.has('KeyD') || held.has('ArrowRight')) moveX += 1;

          if (p.grabbedByEnemyId) {
            // Grabbed by zombie: slow bleed + escape struggle
            p.hp -= 4.5 * simDt;
            damageTakenRef.current += 4.5 * simDt;
            p.grabEscapeProgress += 22 * simDt;
            if (moveX !== 0 || moveY !== 0) {
              p.grabEscapeProgress += 28 * simDt;
            }
            if (p.grabEscapeProgress >= 100) {
              p.grabbedByEnemyId = null;
              p.grabEscapeProgress = 0;
              p.invulnerableTimer = 0.85;
            }
          } else if (moveX !== 0 || moveY !== 0) {
            const len = Math.hypot(moveX, moveY);
            moveX /= len;
            moveY /= len;

            const wantsRun = (held.has('ShiftLeft') || held.has('ShiftRight')) && !p.isAiming && p.stamina > 5;
            const baseSpeed = p.isAiming ? 38 : wantsRun ? 88 : 58;
            if (wantsRun) {
              p.stamina = Math.max(0, p.stamina - 18 * simDt);
              p.actionState = 'run';
            } else {
              p.stamina = Math.min(p.maxStamina, p.stamina + 14 * simDt);
              p.actionState = p.isAiming ? 'aim' : 'walk';
            }

            if (!mouseWorldRef.current.active) {
              p.facingAngle = Math.atan2(moveY, moveX);
            }

            const prevWalkStep = Math.floor(p.walkDistance / 18);
            p.walkDistance += baseSpeed * simDt;
            const nextWalkStep = Math.floor(p.walkDistance / 18);
            if (nextWalkStep > prevWalkStep) {
              audioManager.playFootstep(room.floorSurface, wantsRun);
            }

            const resolved = resolveRoomCollisions(
              p.x + moveX * baseSpeed * simDt,
              p.y + moveY * baseSpeed * simDt,
              p.radius,
              room
            );
            p.x = resolved.x;
            p.y = resolved.y;
          } else {
            p.stamina = Math.min(p.maxStamina, p.stamina + 20 * simDt);
            if (p.actionTimer <= 0) {
              p.actionState = p.isAiming ? 'aim' : 'idle';
            }
          }

          // Update Facing Angle toward mouse cursor if mouse moved recently
          if (mouseWorldRef.current.active) {
            p.facingAngle = Math.atan2(
              mouseWorldRef.current.y - p.y,
              mouseWorldRef.current.x - p.x
            );
          }

          // Evaluate Jumpscare Triggers in Current Room
          const roomVisits = roomVisitCountRef.current[room.id] || 1;
          for (const trig of jumpscaresRef.current) {
            if (trig.roomId !== room.id) continue;
            if (
              evaluateJumpscareTrigger(
                trig,
                p.x,
                p.y,
                roomVisits,
                storyFlagsRef.current,
                elapsedSecRef.current
              )
            ) {
              trig.triggered = true;
              trig.lastTriggeredTime = elapsedSecRef.current;
              traumaRef.current = 0.85;
              activeJumpscareRef.current = {
                visualId: trig.visualId,
                timer: trig.cinematicDuration,
                duration: trig.cinematicDuration,
                title: trig.title,
                subtitle: trig.subtitle,
              };
              audioManager.triggerJumpscareAudio(trig.preSilenceDuration, trig.visualId);

              // If the jumpscare includes an enemy ambush spawn, spawn it immediately!
              if (trig.spawnEnemy) {
                enemiesRef.current.push({
                  id: `ambush_${trig.id}_${ Math.round(elapsedSecRef.current) }`,
                  type: trig.spawnEnemy.type,
                  roomId: room.id,
                  x: trig.spawnEnemy.x,
                  y: trig.spawnEnemy.y,
                  vx: 0,
                  vy: 0,
                  radius: 10,
                  hp: trig.spawnEnemy.hp,
                  maxHp: trig.spawnEnemy.hp,
                  speed: trig.spawnEnemy.type === 'crimson_stalker' ? 56 : 34,
                  damage: trig.spawnEnemy.type === 'crimson_stalker' ? 20 : 16,
                  attackRange: 21,
                  sightRange: 220,
                  state: 'pursue',
                  stateTimer: 0,
                  attackCooldown: 0.65, // Fair grace window after jumpscare
                  facingAngle: Math.atan2(p.y - trig.spawnEnemy.y, p.x - trig.spawnEnemy.x),
                  animFrame: 0,
                  animTimer: 0,
                  hitFlashTimer: 0,
                  patrolOriginX: trig.spawnEnemy.x,
                  patrolOriginY: trig.spawnEnemy.y,
                  patrolTargetX: p.x,
                  patrolTargetY: p.y,
                });
                spawnParticles(trig.spawnEnemy.x, trig.spawnEnemy.y, 18, '#bae6fd', 90, 0.5, 2);
              }
              break;
            }
          }

          // Update Enemies in Current Room
          for (const enemy of enemiesRef.current) {
            if (enemy.roomId !== room.id) continue;
            const res = stepEnemyAI(enemy, p, room, simDt);
            if (res.soundCue) {
              audioManager.playEnemyCue(res.soundCue);
            }
            if (res.playerHitDamage > 0 && p.invulnerableTimer <= 0) {
              p.hp = Math.max(0, p.hp - res.playerHitDamage);
              damageTakenRef.current += res.playerHitDamage;
              p.invulnerableTimer = 0.85;
              p.actionState = 'hurt';
              p.actionTimer = 0.25;
              hitstopTimerRef.current = 0.06;
              traumaRef.current = Math.min(1, traumaRef.current + 0.55);
              audioManager.playUiSound('hurt');
              spawnParticles(p.x, p.y, 14, '#dc2626', 80, 0.45, 2);

              if (res.grabbedPlayer && !p.grabbedByEnemyId) {
                p.grabbedByEnemyId = enemy.id;
                p.grabEscapeProgress = 0;
              }
            }
          }

          // Check Player Defeat
          if (p.hp <= 0) {
            p.actionState = 'dead';
            setRunStats({
              outcome: 'defeat',
              elapsedSeconds: Math.round(elapsedSecRef.current),
              enemiesDefeated: enemiesDefeatedRef.current,
              filesCollected: collectedNotesRef.current.size,
              totalFiles: NOTE_DOCUMENTS.length,
              savesUsed: savesUsedRef.current,
              damageTaken: Math.round(damageTakenRef.current),
              causeOfDeath: `Killed in ${room.name}`,
            });
            updateGameState('gameover');
          }
        }
      }

      // Render Low-Res Pixel Art Scene
      if (ctx) {
        const room = ROOM_DEFINITIONS[currentRoomRef.current];
        const shakeMag = traumaRef.current * traumaRef.current * 6;
        const shakeX = shakeMag > 0.1 ? Math.round((Math.random() - 0.5) * shakeMag * 2) : 0;
        const shakeY = shakeMag > 0.1 ? Math.round((Math.random() - 0.5) * shakeMag * 2) : 0;

        ctx.save();
        ctx.translate(shakeX, shakeY);
        renderPixelRoom(
          ctx,
          room,
          playerRef.current,
          enemiesRef.current,
          pickupsRef.current,
          activeJumpscareRef.current,
          muzzleFlashTimerRef.current,
          bulletTraceRef.current,
          elapsedSecRef.current || now / 1000,
          audioSettings.reducedFlash,
          dt
        );
        ctx.restore();

        // Smooth room transition fade overlay
        if (roomFadeAlphaRef.current > 0) {
          ctx.fillStyle = `rgba(0, 0, 0, ${roomFadeAlphaRef.current})`;
          ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
        }
      }

      // Throttled HUD & Interaction Prompt Check (~10Hz)
      hudSyncAccumulator += dt;
      if (hudSyncAccumulator >= 0.1) {
        hudSyncAccumulator = 0;
        const p = playerRef.current;
        const room = ROOM_DEFINITIONS[currentRoomRef.current];
        let prompt: string | null = null;

        if (p.grabbedByEnemyId) {
          prompt = 'GRABBED! Mash [E] or [WASD] to break free!';
        } else {
          const item = pickupsRef.current.find(
            (it) =>
              !it.collected &&
              it.roomId === room.id &&
              Math.hypot(it.x - p.x, it.y - p.y) <= 28
          );
          if (item) {
            const name =
              item.itemId === 'note'
                ? NOTE_DOCUMENTS.find((n) => n.id === item.noteId)?.title || 'Document'
                : ITEM_DEFINITIONS[item.itemId]?.name || 'Item';
            prompt = `[E] Pick up ${name}`;
          } else {
            const door = room.doors.find(
              (d) => Math.hypot(d.x + d.width / 2 - p.x, d.y + d.height / 2 - p.y) <= 34
            );
            if (door) {
              prompt = `[E] Open ${door.label}`;
            } else {
              const prop = room.props.find(
                (pr) =>
                  pr.interactable &&
                  Math.hypot(pr.x + pr.width / 2 - p.x, pr.y + pr.height / 2 - p.y) <=
                    Math.max(pr.width, pr.height) / 2 + 26
              );
              if (prop) {
                prompt = `[E] Inspect ${prop.label || 'Object'}`;
              }
            }
          }
        }
        syncHudSnapshot(prompt);
      }

      timerId = window.setTimeout(() => {
        rafId = requestAnimationFrame(tick);
      }, 16);
    };

    let timerId = 0;
    rafId = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(timerId);
      cancelAnimationFrame(rafId);
    };
  }, [activePuzzleModal, audioSettings.reducedFlash, caseTab, syncHudSnapshot, updateGameState]);

  // Convert Mouse Viewport Coordinates to Internal Pseudo-3D World Space
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const sx = ((e.clientX - rect.left) / rect.width) * INTERNAL_WIDTH;
    const sy = ((e.clientY - rect.top) / rect.height) * INTERNAL_HEIGHT;
    // Offset sy by +10 so pointing at an enemy's chest/torso aims at its floor footprint
    const { wx, wy } = unprojectPseudo3D(sx, sy + 10);
    mouseWorldRef.current = { x: wx, y: wy, active: true };
    const p = playerRef.current;
    if (gameStateRef.current === 'playing' && !p.grabbedByEnemyId && p.actionState !== 'dead') {
      p.facingAngle = Math.atan2(wy - p.y, wx - p.x);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    handleCanvasMouseMove(e);
    triggerWeaponAttack();
  };

  // Inventory Actions
  const handleUseOrEquipSlot = (slotIdx: number) => {
    const slot = inventoryRef.current[slotIdx];
    if (!slot) return;
    const def = ITEM_DEFINITIONS[slot.itemId];
    if (!def) return;

    if (def.category === 'weapon') {
      playerRef.current.equippedWeapon = slot.itemId as WeaponType;
      audioManager.playReload();
      setModalFeedback(`Equipped ${def.name}.`);
      syncHudSnapshot();
      return;
    }

    if (def.category === 'healing' && def.healAmount) {
      if (playerRef.current.hp >= playerRef.current.maxHp) {
        setModalFeedback('Vitality is already at 100% FINE.');
        return;
      }
      playerRef.current.hp = Math.min(
        playerRef.current.maxHp,
        playerRef.current.hp + def.healAmount
      );
      const next = inventoryRef.current.map((s) => (s ? { ...s } : null));
      next[slotIdx] = null;
      inventoryRef.current = next;
      audioManager.playUiSound('heal');
      setModalFeedback(`Used ${def.name}. Restored +${def.healAmount}% Vitality.`);
      syncHudSnapshot();
      return;
    }

    if (def.category === 'battery') {
      playerRef.current.battery = Math.min(100, playerRef.current.battery + 65);
      playerRef.current.flashlightOn = true;
      const next = inventoryRef.current.map((s) => (s ? { ...s } : null));
      if (slot.quantity > 1) {
        next[slotIdx] = { ...slot, quantity: slot.quantity - 1 };
      } else {
        next[slotIdx] = null;
      }
      inventoryRef.current = next;
      audioManager.playUiSound('heal');
      setModalFeedback('Replaced Lithium Battery. Flashlight charged!');
      syncHudSnapshot();
    }
  };

  const handleCombineSlots = (idxA: number, idxB: number) => {
    const res = combineInventorySlots(inventoryRef.current, idxA, idxB);
    inventoryRef.current = res.updatedSlots;
    if (res.success) {
      audioManager.playUiSound('heal');
    } else {
      audioManager.playUiSound('locked');
    }
    setModalFeedback(res.message);
    syncHudSnapshot();
  };

  // Puzzle Handlers
  const handleSwapPortrait = (indexA: number, indexB: number) => {
    const order = [...puzzleStatesRef.current.portraitOrder];
    const temp = order[indexA];
    order[indexA] = order[indexB];
    order[indexB] = temp;
    const solved = checkPortraitPuzzle(order);
    puzzleStatesRef.current = {
      ...puzzleStatesRef.current,
      portraitOrder: order,
      portraitsSolved: solved,
    };

    if (solved) {
      audioManager.playUiSound('puzzle_solve');
      const addRes = addItemToInventory(inventoryRef.current, 'crest_moon', 1);
      if (addRes.success) {
        inventoryRef.current = addRes.updatedSlots;
      } else {
        pickupsRef.current.push({
          id: 'pickup_moon_crest_drop',
          roomId: 'dining_room',
          itemId: 'crest_moon',
          quantity: 1,
          x: 200,
          y: 52,
          collected: false,
        });
      }
      setModalFeedback('SECRET COMPARTMENT OPENED! Obtained the Silver Moon Crest!');
    } else {
      audioManager.playUiSound('door');
      setModalFeedback('Swapped portraits. Check the Butler’s verse: Founder -> General -> Scholar -> Bride.');
    }
    syncHudSnapshot();
  };

  const handleFlipBreaker = (switchNum: number) => {
    if (puzzleStatesRef.current.breakerSolved) return;
    const res = stepBreakerSwitch(puzzleStatesRef.current.breakerSequence, switchNum);
    puzzleStatesRef.current = {
      ...puzzleStatesRef.current,
      breakerSequence: res.nextSequence,
      breakerSolved: res.solved,
    };

    if (res.solved) {
      audioManager.playUiSound('puzzle_solve');
      const addRes = addItemToInventory(inventoryRef.current, 'crest_star', 1);
      if (addRes.success) {
        inventoryRef.current = addRes.updatedSlots;
      } else {
        pickupsRef.current.push({
          id: 'pickup_star_crest_drop',
          roomId: 'generator_room',
          itemId: 'crest_star',
          quantity: 1,
          x: 200,
          y: 52,
          collected: false,
        });
      }
    } else if (res.overloaded) {
      audioManager.playUiSound('locked');
    } else {
      audioManager.playReload();
    }
    setModalFeedback(res.message);
    syncHudSnapshot();
  };

  const handleInsertCrest = (crestId: string) => {
    const slotIdx = inventoryRef.current.findIndex((s) => s?.itemId === crestId);
    if (slotIdx === -1) return;

    const nextInv = inventoryRef.current.map((s) => (s ? { ...s } : null));
    nextInv[slotIdx] = null;
    inventoryRef.current = nextInv;

    const nextInserted = [...puzzleStatesRef.current.crestsInserted, crestId];
    const allSolved = checkCrestPedestal(nextInserted);
    puzzleStatesRef.current = {
      ...puzzleStatesRef.current,
      crestsInserted: nextInserted,
      crestsSolved: allSolved,
    };

    if (allSolved) {
      storyFlagsRef.current.add('crests_solved');
      unlockedDoorsRef.current.add('door_basement_to_biolab');
      audioManager.playUiSound('puzzle_solve');
      setModalFeedback('ASTRAL ECLIPSE COMPLETE! The Bio-Containment Lab bulkhead to the north is now UNLOCKED!');
    } else {
      audioManager.playUiSound('pickup');
      setModalFeedback(`Inserted ${ITEM_DEFINITIONS[crestId].name} (${nextInserted.length}/3).`);
    }
    syncHudSnapshot();
  };

  const vitality = getVitalityStatus(hud.hp, hud.maxHp);

  return (
    <main className="relative w-screen h-screen bg-[#07080a] overflow-hidden select-none flex items-center justify-center">
      {/* Low-Resolution Pixel-Art Viewport Canvas Scaled via Nearest-Neighbor */}
      <div
        onMouseMove={handleCanvasMouseMove}
        onMouseDown={handleCanvasMouseDown}
        className="relative w-full h-full flex items-center justify-center bg-[#050608] cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          width={INTERNAL_WIDTH}
          height={INTERNAL_HEIGHT}
          tabIndex={0}
          data-testid="survival-canvas"
          className="pixelated-canvas w-full h-full object-contain max-w-[1600px] max-h-[900px] shadow-[0_0_80px_rgba(0,0,0,0.95)] cursor-crosshair focus:outline-none"
        />

        {/* Subtle Critical Low-HP Peripheral Crimson Vignette */}
        {gameState === 'playing' && hud.hp <= 30 && (
          <div
            className="pointer-events-none fixed inset-0 z-10"
            style={{
              background:
                'radial-gradient(circle, transparent 52%, rgba(153, 27, 27, 0.42) 100%)',
            }}
          />
        )}
      </div>

      {/* =====================================================================
          1. TITLE SCREEN STAGE (Negative-space composition over live canvas)
         ===================================================================== */}
      {gameState === 'title' && (
        <div className="fixed inset-0 z-30 flex flex-col justify-between p-8 md:p-14 bg-gradient-to-r from-black/90 via-black/65 to-transparent pointer-events-auto">
          <div className="max-w-lg mt-4">
            <BioCrestTitleEmblem />

            <p className="mt-5 text-sm md:text-base text-[#cbd5e1] leading-relaxed max-w-[54ch]">
              October 24, 1998. Recon Team Bravo vanished inside the quarantined estate of Lord Alistair Blackwood. Conserve your ammunition, manage your attache case, and survive what stalks the dark corridors.
            </p>

            {/* Primary Menu Actions (<= 3 actions) */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                data-start="true"
                onClick={startNewGame}
                className="px-7 py-3.5 text-sm font-mono font-bold tracking-wider uppercase bg-[#8b1e1e] hover:bg-[#a82424] text-white border border-[#f87171]/40 shadow-[0_10px_30px_rgba(139,30,30,0.5)] transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                Enter Blackwood Manor
              </button>

              {hasSavedGame && (
                <button
                  type="button"
                  onClick={loadGameFromStorage}
                  className="px-6 py-3.5 text-sm font-mono font-semibold bg-[#141821] hover:bg-[#1f2633] text-[#e4e2dd] border border-[#475569] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Continue Ribbon Save
                </button>
              )}

              <button
                type="button"
                onClick={() => updateGameState('paused')}
                className="px-5 py-3.5 text-sm font-mono font-semibold bg-[#0f1117] hover:bg-[#1c202b] text-[#a1a1aa] hover:text-white border border-[#27272a] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Audio & Accessibility
              </button>
            </div>
          </div>

          {/* Flat Borderless Control Hint Line in Bottom Safe Margin */}
          <div className="text-xs font-mono text-[#9ca3af] tracking-wide">
            WASD Move · Shift Run · Click / J Fire · E Interact / Doors · F Flashlight · R Reload · Tab Inventory & Map · Esc Pause
          </div>
        </div>
      )}

      {/* =====================================================================
          2. PLAYING HUD (World-Matched Perimeter Clusters, >= 85% Clear Canvas)
         ===================================================================== */}
      {gameState === 'playing' && (
        <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-6">
          {/* Top Perimeter Row */}
          <div className="flex items-start justify-between gap-4">
            {/* Top-Left Cluster: ECG Vitality Monitor & Flashlight Battery */}
            <div className="bg-[#090b10]/90 border border-[#2e2323] px-4 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.85)] flex items-center gap-4">
              <div>
                <div className="text-[10px] font-mono tracking-wider text-[#9ca3af] uppercase">
                  VITALITY · {vitality.label}
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span
                    className="font-mono text-2xl font-bold hud-text-stroke"
                    style={{ color: vitality.color }}
                  >
                    {Math.round(hud.hp)}
                  </span>
                  <span className="text-xs font-mono text-[#71717a]">/ {hud.maxHp}</span>
                </div>
                {/* Continuous Health Bar with Delayed Trailing Damage Ghost Bar */}
                <div className="w-32 h-2 bg-[#18181b] border border-[#27272a] mt-1 relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-[#991b1b] transition-all duration-150"
                    style={{ width: `${Math.max(0, Math.min(100, hud.trailingHp))}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 transition-all duration-75"
                    style={{
                      width: `${Math.max(0, Math.min(100, hud.hp))}%`,
                      backgroundColor: vitality.color,
                    }}
                  />
                </div>
              </div>

              {/* Flashlight Battery Readout */}
              <div className="pl-3 border-l border-[#27272a]">
                <div className="text-[10px] font-mono tracking-wider text-[#9ca3af] uppercase">
                  LIGHT [F]
                </div>
                <div className="font-mono text-lg font-bold text-[#fde047] hud-text-stroke mt-0.5">
                  {Math.round(hud.battery)}%
                </div>
                <div className="text-[10px] font-mono text-[#a1a1aa]">
                  {hud.flashlightOn ? 'BEAM ON' : 'BEAM OFF'}
                </div>
              </div>
            </div>

            {/* Center-Top Boss Health Bar (When in Bio-Lab facing Subject Omega) */}
            {hud.bossHp !== null && hud.bossMaxHp !== null && (
              <div className="bg-[#14080a]/95 border border-[#7f1d1d] px-5 py-2 shadow-lg min-w-[260px]">
                <div className="flex items-center justify-between text-xs font-mono text-[#fca5a5] mb-1">
                  <span>SUBJECT OMEGA // T-CHIMERA</span>
                  <span>
                    {Math.round(hud.bossHp)} / {hud.bossMaxHp}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#1f1215] border border-[#450a0a]">
                  <div
                    className="h-full bg-[#dc2626] transition-all duration-100"
                    style={{
                      width: `${Math.max(0, Math.min(100, (hud.bossHp / hud.bossMaxHp) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Top-Right Cluster: Camera Angle Label + Compact Utility Icon Buttons */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <div className="hidden sm:block bg-[#090b10]/90 border border-[#27272a] px-3 py-2 text-right mr-1">
                <div className="text-[10px] font-mono text-[#d9b982]">{hud.cameraLabel}</div>
                <div className="text-xs font-semibold text-[#e4e2dd]">{hud.roomName}</div>
              </div>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Open Inventory Case"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setCaseTab((prev) => (prev === 'inventory' ? null : 'inventory'));
                }}
                className="px-3 py-2 bg-[#0d1017]/90 hover:bg-[#1c2230] border border-[#3f3f46] text-xs font-mono text-[#e4e2dd] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Case [Tab]
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Open Mansion Map"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setCaseTab((prev) => (prev === 'map' ? null : 'map'));
                }}
                className="px-3 py-2 bg-[#0d1017]/90 hover:bg-[#1c2230] border border-[#3f3f46] text-xs font-mono text-[#e4e2dd] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Map [M]
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Pause Game"
                onClick={(e) => {
                  e.currentTarget.blur();
                  updateGameState('paused');
                }}
                className="px-3 py-2 bg-[#0d1017]/90 hover:bg-[#1c2230] border border-[#3f3f46] text-xs font-mono text-[#e4e2dd] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Pause [Esc]
              </button>
            </div>
          </div>

          {/* Center / Lower Notification Prompts (Jumpscare Alert, Interaction Prompt, Radio Log) */}
          <div className="flex flex-col items-center gap-2 my-auto">
            {hud.scareBanner && (
              <div className="bg-[#2a080c]/95 border-2 border-[#ef4444] px-6 py-3 text-center shadow-[0_0_40px_rgba(239,68,68,0.5)]">
                <div className="font-display text-lg font-bold text-[#fca5a5] tracking-wider">
                  {hud.scareBanner.title}
                </div>
                <div className="text-xs font-mono text-[#fef2f2] mt-0.5">
                  {hud.scareBanner.subtitle}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Perimeter Row */}
          <div className="flex items-end justify-between gap-4">
            {/* Bottom-Left: Radio Transmission / Interactive Prompt */}
            <div className="max-w-lg space-y-2">
              {hud.promptText && (
                <div className="inline-block bg-[#141722]/95 border border-[#d9b982] px-4 py-2 text-xs font-mono font-semibold text-[#fef08a] shadow-lg">
                  {hud.promptText}
                </div>
              )}

              {hud.radioBanner && (
                <div className="bg-[#090b10]/92 border border-[#27272a] px-4 py-2.5 shadow-lg">
                  <div className="text-[10px] font-mono font-bold text-[#d9b982] tracking-wider">
                    {hud.radioBanner.speaker}
                  </div>
                  <div className="text-xs text-[#e4e2dd] mt-0.5 leading-snug">
                    {hud.radioBanner.text}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom-Right Cluster: Equipped Weapon Silhouette & Tabular Ammo Counter */}
            <div className="bg-[#090b10]/90 border border-[#2e2323] px-4 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.85)] flex items-center gap-4 pointer-events-auto">
              <ItemIconSvg iconType={hud.equippedWeapon} className="w-9 h-9" />
              <div>
                <div className="text-[10px] font-mono tracking-wider text-[#9ca3af] uppercase">
                  {hud.equippedWeapon === 'knife'
                    ? 'COMBAT BLADE [1]'
                    : hud.equippedWeapon === 'handgun'
                      ? '9MM HANDGUN [2]'
                      : 'M870 SHOTGUN [3]'}
                </div>
                {hud.equippedWeapon === 'knife' ? (
                  <div className="font-mono text-xl font-bold text-[#e2e8f0] hud-text-stroke">
                    MELEE READY
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-bold text-[#facc15] hud-text-stroke">
                      {hud.ammoInClip}
                    </span>
                    <span className="text-xs font-mono text-[#9ca3af]">
                      / {hud.reserveAmmo} [R]
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. ATTACHE CASE / INVENTORY / MAP / FILES OVERLAY
         ===================================================================== */}
      {gameState === 'playing' && caseTab !== null && (
        <CaseOverlayModal
          activeTab={caseTab}
          onTabChange={setCaseTab}
          onClose={() => setCaseTab(null)}
          inventory={inventoryRef.current}
          equippedWeapon={playerRef.current.equippedWeapon}
          hp={playerRef.current.hp}
          maxHp={playerRef.current.maxHp}
          currentRoom={currentRoomRef.current}
          visitedRooms={visitedRoomsRef.current}
          unlockedDoors={unlockedDoorsRef.current}
          collectedNotes={collectedNotesRef.current}
          onUseOrEquipSlot={handleUseOrEquipSlot}
          onCombineSlots={handleCombineSlots}
          statusMessage={modalFeedback}
        />
      )}

      {/* =====================================================================
          4. DIEGETIC PUZZLE & TYPEWRITER SAVE MODAL
         ===================================================================== */}
      {gameState === 'playing' && activePuzzleModal !== null && (
        <PuzzleModal
          modalType={activePuzzleModal}
          puzzleStates={puzzleStatesRef.current}
          inventory={inventoryRef.current}
          onClose={() => setActivePuzzleModal(null)}
          onSwapPortrait={handleSwapPortrait}
          onFlipBreaker={handleFlipBreaker}
          onInsertCrest={handleInsertCrest}
          onSaveGame={saveGameToStorage}
          onLoadGame={loadGameFromStorage}
          hasSavedGame={hasSavedGame}
          feedbackMessage={modalFeedback}
        />
      )}

      {/* =====================================================================
          5. PAUSE & AUDIO / ACCESSIBILITY OPTIONS MODAL
         ===================================================================== */}
      {gameState === 'paused' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Pause and Options Menu"
        >
          <div className="w-full max-w-md bg-[#0e1015] border border-[#3a2d28] p-6 shadow-2xl text-[#e4e2dd]">
            <h2 className="font-display text-2xl font-bold text-[#d9b982] mb-1">
              INCIDENT PAUSED
            </h2>
            <p className="text-xs font-mono text-[#9ca3af] mb-5 pb-3 border-b border-[#27272a]">
              Audio Mixer & Accessibility Configuration
            </p>

            {/* Volume & Accessibility Controls */}
            <div className="space-y-4 mb-6">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <label htmlFor="vol-master">Master Volume</label>
                  <span>{Math.round(audioSettings.master * 100)}%</span>
                </div>
                <input
                  id="vol-master"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioSettings.master}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    audioManager.updateSettings({ master: val });
                    setAudioSettings({ ...audioManager.settings });
                  }}
                  className="w-full accent-[#8b1e1e]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <label htmlFor="vol-sfx">Horror SFX & Weapons</label>
                  <span>{Math.round(audioSettings.sfx * 100)}%</span>
                </div>
                <input
                  id="vol-sfx"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioSettings.sfx}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    audioManager.updateSettings({ sfx: val });
                    setAudioSettings({ ...audioManager.settings });
                  }}
                  className="w-full accent-[#8b1e1e]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <label htmlFor="vol-music">Music & Ambient Drone</label>
                  <span>{Math.round(audioSettings.music * 100)}%</span>
                </div>
                <input
                  id="vol-music"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioSettings.music}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    audioManager.updateSettings({ music: val, ambience: val });
                    setAudioSettings({ ...audioManager.settings });
                  }}
                  className="w-full accent-[#8b1e1e]"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label htmlFor="reduced-flash" className="text-xs font-mono text-[#cbd5e1]">
                  Reduced Jumpscare Flash Intensity
                </label>
                <input
                  id="reduced-flash"
                  type="checkbox"
                  checked={audioSettings.reducedFlash}
                  onChange={(e) => {
                    audioManager.updateSettings({ reducedFlash: e.target.checked });
                    setAudioSettings({ ...audioManager.settings });
                  }}
                  className="w-4 h-4 accent-[#8b1e1e]"
                />
              </div>
            </div>

            {/* Pause Modal Action Buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => updateGameState('playing')}
                className="w-full py-2.5 text-xs font-mono font-bold uppercase bg-[#8b1e1e] hover:bg-[#a82424] text-white transition-colors whitespace-nowrap shrink-0"
              >
                Resume Investigation
              </button>
              <button
                type="button"
                onClick={startNewGame}
                className="w-full py-2.5 text-xs font-mono font-semibold bg-[#181b24] hover:bg-[#252a38] text-[#e4e2dd] border border-[#3f3f46] transition-colors whitespace-nowrap shrink-0"
              >
                Restart Mission
              </button>
              <button
                type="button"
                onClick={() => updateGameState('title')}
                className="w-full py-2.5 text-xs font-mono font-semibold bg-[#090a0d] hover:bg-[#141720] text-[#a1a1aa] border border-[#27272a] transition-colors whitespace-nowrap shrink-0"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          6. VICTORY / GAME OVER MODAL (Single Focused Status Card)
         ===================================================================== */}
      {gameState === 'gameover' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label={runStats.outcome === 'victory' ? 'Mission Complete' : 'You Are Dead'}
        >
          <div className="w-full max-w-lg bg-[#0e1015] border-2 border-[#7f1d1d] p-8 shadow-2xl text-center">
            <h2
              className={`font-display text-3xl font-bold tracking-widest mb-2 ${
                runStats.outcome === 'victory' ? 'text-[#34d399]' : 'text-[#ef4444]'
              }`}
            >
              {runStats.outcome === 'victory'
                ? 'SURVIVED BLACKWOOD MANOR'
                : 'YOU ARE DEAD'}
            </h2>
            <p className="text-sm text-[#cbd5e1] mb-6">
              {runStats.outcome === 'victory'
                ? 'You neutralized Subject Omega, secured the Chimera pathogen sample, and escaped aboard the emergency extraction lift before dawn.'
                : runStats.causeOfDeath || 'Your vitality was claimed by the horrors of Blackwood Manor.'}
            </p>

            {/* 3 Tabular Stat Tiles */}
            <div className="grid grid-cols-3 gap-3 mb-7 text-left">
              <div className="bg-[#141720] border border-[#27272a] p-3">
                <div className="text-[10px] font-mono text-[#9ca3af] uppercase">CLEAR TIME</div>
                <div className="font-mono text-xl font-bold text-white mt-1">
                  {Math.floor(runStats.elapsedSeconds / 60)}m {runStats.elapsedSeconds % 60}s
                </div>
              </div>
              <div className="bg-[#141720] border border-[#27272a] p-3">
                <div className="text-[10px] font-mono text-[#9ca3af] uppercase">HOSTILES SLAIN</div>
                <div className="font-mono text-xl font-bold text-[#facc15] mt-1">
                  {runStats.enemiesDefeated}
                </div>
              </div>
              <div className="bg-[#141720] border border-[#27272a] p-3">
                <div className="text-[10px] font-mono text-[#9ca3af] uppercase">FILES FOUND</div>
                <div className="font-mono text-xl font-bold text-[#34d399] mt-1">
                  {runStats.filesCollected} / {runStats.totalFiles}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                data-start="true"
                onClick={startNewGame}
                className="px-7 py-3 text-xs font-mono font-bold uppercase bg-[#8b1e1e] hover:bg-[#a82424] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {runStats.outcome === 'victory' ? 'Play Again' : 'Try Again'}
              </button>

              {hasSavedGame && (
                <button
                  type="button"
                  onClick={loadGameFromStorage}
                  className="px-6 py-3 text-xs font-mono font-semibold bg-[#1e293b] hover:bg-[#334155] text-white border border-[#475569] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Load Typewriter Save
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
