import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addItemToInventory,
  checkBreakerSequence,
  checkCrestPedestal,
  checkPortraitPuzzle,
  combineInventorySlots,
  evaluateJumpscareTrigger,
  getVitalityStatus,
  isPointInFlashlightCone,
  reloadActiveWeapon,
  stepBreakerSwitch,
} from './rules';
import { InventorySlot, JumpscareTrigger } from './types';
import { MAX_INVENTORY_SLOTS } from './worldData';

test('vitality status thresholds follow classic survival horror states', () => {
  assert.equal(getVitalityStatus(95, 100).label, 'FINE');
  assert.equal(getVitalityStatus(45, 100).label, 'CAUTION');
  assert.equal(getVitalityStatus(18, 100).label, 'DANGER');
});

test('inventory adds stackable ammo and non-stackable herbs properly', () => {
  const emptySlots: (InventorySlot | null)[] = Array(MAX_INVENTORY_SLOTS).fill(null);
  const res1 = addItemToInventory(emptySlots, 'ammo_9mm', 12);
  assert.equal(res1.success, true);
  assert.equal(res1.updatedSlots[0]?.itemId, 'ammo_9mm');
  assert.equal(res1.updatedSlots[0]?.quantity, 12);

  // Stack additional 9mm ammo into slot 0
  const res2 = addItemToInventory(res1.updatedSlots, 'ammo_9mm', 15);
  assert.equal(res2.success, true);
  assert.equal(res2.updatedSlots[0]?.quantity, 27);
  assert.equal(res2.updatedSlots[1], null);
});

test('combining Green Herb and Red Herb creates Mixed Herb Compound', () => {
  const slots: (InventorySlot | null)[] = Array(MAX_INVENTORY_SLOTS).fill(null);
  slots[0] = { itemId: 'herb_green', quantity: 1 };
  slots[1] = { itemId: 'herb_red', quantity: 1 };

  const combined = combineInventorySlots(slots, 0, 1);
  assert.equal(combined.success, true);
  assert.equal(combined.updatedSlots[0]?.itemId, 'herb_mixed');
  assert.equal(combined.updatedSlots[1], null);
});

test('reloading handgun transfers rounds from 9mm ammo slot up to clip cap', () => {
  const slots: (InventorySlot | null)[] = Array(MAX_INVENTORY_SLOTS).fill(null);
  slots[0] = { itemId: 'handgun', quantity: 1, ammoInClip: 5 };
  slots[1] = { itemId: 'ammo_9mm', quantity: 14 };

  const reloadRes = reloadActiveWeapon(slots, 'handgun');
  assert.equal(reloadRes.reloaded, true);
  assert.equal(reloadRes.roundsLoaded, 10);
  assert.equal(reloadRes.updatedSlots[0]?.ammoInClip, 15);
  assert.equal(reloadRes.updatedSlots[1]?.quantity, 4);
});

test('all three puzzles validate exact clue sequences and reject wrong sequences', () => {
  // Puzzle 1: Portraits
  assert.equal(checkPortraitPuzzle(['founder', 'general', 'scholar', 'bride']), true);
  assert.equal(checkPortraitPuzzle(['general', 'founder', 'scholar', 'bride']), false);

  // Puzzle 2: Power Breakers [3, 1, 4, 2]
  let seq: number[] = [];
  let step = stepBreakerSwitch(seq, 3);
  assert.equal(step.overloaded, false);
  seq = step.nextSequence;

  // Wrong switch trips surge reset
  const wrongStep = stepBreakerSwitch(seq, 2);
  assert.equal(wrongStep.overloaded, true);
  assert.deepEqual(wrongStep.nextSequence, []);

  // Correct full sequence
  seq = stepBreakerSwitch([], 3).nextSequence;
  seq = stepBreakerSwitch(seq, 1).nextSequence;
  seq = stepBreakerSwitch(seq, 4).nextSequence;
  const finalStep = stepBreakerSwitch(seq, 2);
  assert.equal(finalStep.solved, true);
  assert.equal(checkBreakerSequence(finalStep.nextSequence), true);

  // Puzzle 3: Three Astral Crests
  assert.equal(checkCrestPedestal(['crest_sun', 'crest_moon', 'crest_star']), true);
  assert.equal(checkCrestPedestal(['crest_sun', 'crest_moon']), false);
});

test('flashlight cone and jumpscare trigger rules evaluate accurately', () => {
  // Flashlight pointing East (angle 0) hits target at (150, 100) from (100, 100)
  assert.equal(isPointInFlashlightCone(100, 100, 0, true, 80, 150, 100), true);
  // Target behind player (50, 100) is not in cone
  assert.equal(isPointInFlashlightCone(100, 100, 0, true, 80, 50, 100), false);

  const mockTrigger: JumpscareTrigger = {
    id: 'test_scare',
    roomId: 'west_corridor',
    category: 'ambush',
    visualId: 'window_zombie',
    x: 200,
    y: 100,
    radius: 40,
    minRoomVisits: 1,
    requiredFlag: 'got_bronze_key',
    oneTime: true,
    triggered: false,
    cooldownSec: 10,
    lastTriggeredTime: -999,
    title: 'Test',
    subtitle: 'Test',
    cinematicDuration: 0.7,
    preSilenceDuration: 0.2,
  };

  // Without required flag, does not trigger
  assert.equal(evaluateJumpscareTrigger(mockTrigger, 205, 100, 1, new Set(), 15), false);
  // With required flag and within radius, triggers
  assert.equal(
    evaluateJumpscareTrigger(mockTrigger, 205, 100, 1, new Set(['got_bronze_key']), 15),
    true
  );
});

import { projectPseudo3D, unprojectPseudo3D } from './rules';

test('pseudo-3D projection scales objects with depth and round-trips screen coordinates', () => {
  const farPt = projectPseudo3D(200, 24);
  const nearPt = projectPseudo3D(200, 190);
  // Near point has larger Y on screen and significantly larger perspective scale
  assert.equal(nearPt.sy > farPt.sy, true);
  assert.equal(nearPt.scale > farPt.scale, true);

  // Round-trip unprojectPseudo3D(projectPseudo3D(wx, wy))
  const orig = { wx: 265, wy: 132 };
  const proj = projectPseudo3D(orig.wx, orig.wy);
  const unproj = unprojectPseudo3D(proj.sx, proj.sy);
  assert.equal(Math.abs(unproj.wx - orig.wx) < 0.5, true);
  assert.equal(Math.abs(unproj.wy - orig.wy) < 0.5, true);
});

