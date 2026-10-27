import React, { useState } from 'react';
import {
  InventorySlot,
  RoomId,
  WeaponType,
} from '../game/types';
import {
  ITEM_DEFINITIONS,
  NOTE_DOCUMENTS,
  ROOM_DEFINITIONS,
} from '../game/worldData';
import { getVitalityStatus } from '../game/rules';
import { ItemIconSvg } from './SvgIcons';

interface CaseOverlayModalProps {
  activeTab: 'inventory' | 'map' | 'files';
  onTabChange: (tab: 'inventory' | 'map' | 'files') => void;
  onClose: () => void;
  inventory: (InventorySlot | null)[];
  equippedWeapon: WeaponType;
  hp: number;
  maxHp: number;
  currentRoom: RoomId;
  visitedRooms: Set<RoomId>;
  unlockedDoors: Set<string>;
  collectedNotes: Set<string>;
  onUseOrEquipSlot: (slotIndex: number) => void;
  onCombineSlots: (slotA: number, slotB: number) => void;
  statusMessage: string;
}

export const CaseOverlayModal: React.FC<CaseOverlayModalProps> = ({
  activeTab,
  onTabChange,
  onClose,
  inventory,
  equippedWeapon,
  hp,
  maxHp,
  currentRoom,
  visitedRooms,
  unlockedDoors,
  collectedNotes,
  onUseOrEquipSlot,
  onCombineSlots,
  statusMessage,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(0);
  const [combineSourceSlot, setCombineSourceSlot] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string>(
    Array.from(collectedNotes)[0] || NOTE_DOCUMENTS[0].id
  );

  const vitality = getVitalityStatus(hp, maxHp);
  const inspectedSlot = selectedSlot !== null ? inventory[selectedSlot] : null;
  const inspectedDef = inspectedSlot ? ITEM_DEFINITIONS[inspectedSlot.itemId] : null;

  const handleSlotClick = (idx: number) => {
    if (combineSourceSlot !== null) {
      onCombineSlots(combineSourceSlot, idx);
      setCombineSourceSlot(null);
      setSelectedSlot(idx);
      return;
    }
    setSelectedSlot(idx);
  };

  const allRooms = Object.values(ROOM_DEFINITIONS);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Tactical Attache Case and Map"
    >
      <div className="w-full max-w-4xl bg-[#0e1015] border border-[#3a2d28] shadow-[0_24px_60px_rgba(0,0,0,0.95)] text-[#e4e2dd] flex flex-col max-h-[90vh]">
        {/* Top Attache Case Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#292322] bg-[#14151c]">
          <div className="flex items-center gap-6">
            <h2 className="font-display text-lg font-bold tracking-wider text-[#d9b982]">
              S.T.A.R. TACTICAL ATTACHE CASE
            </h2>
            <div className="flex items-center gap-1 bg-[#090a0d] p-1 border border-[#27272a]">
              <button
                type="button"
                onClick={() => onTabChange('inventory')}
                className={`px-3.5 py-1.5 text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'inventory'
                    ? 'bg-[#7f1d1d] text-white'
                    : 'text-[#a1a1aa] hover:text-white'
                }`}
              >
                INVENTORY [{inventory.filter(Boolean).length}/8]
              </button>
              <button
                type="button"
                onClick={() => onTabChange('map')}
                className={`px-3.5 py-1.5 text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'map'
                    ? 'bg-[#7f1d1d] text-white'
                    : 'text-[#a1a1aa] hover:text-white'
                }`}
              >
                MANOR MAP [{visitedRooms.size}/12]
              </button>
              <button
                type="button"
                onClick={() => onTabChange('files')}
                className={`px-3.5 py-1.5 text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'files'
                    ? 'bg-[#7f1d1d] text-white'
                    : 'text-[#a1a1aa] hover:text-white'
                }`}
              >
                FILES [{collectedNotes.size}/{NOTE_DOCUMENTS.length}]
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-mono font-semibold bg-[#1f222d] hover:bg-[#2e3242] text-[#e4e2dd] border border-[#3f3f46] transition-colors whitespace-nowrap shrink-0"
          >
            Resume Game [Tab / Esc]
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Column: ECG Condition & Equipped Weapon */}
              <div className="md:col-span-4 flex flex-col justify-between bg-[#090a0d] border border-[#27272a] p-4">
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-[#a1a1aa] mb-2">
                    <span>VITALITY MONITOR</span>
                    <span className="font-bold" style={{ color: vitality.color }}>
                      {vitality.label} ({Math.round(hp)}/{maxHp})
                    </span>
                  </div>
                  {/* ECG Oscilloscope Display */}
                  <div className="h-20 bg-[#050709] border border-[#1f2937] flex items-center justify-center p-2 mb-4 relative overflow-hidden">
                    <svg viewBox="0 0 200 50" className="w-full h-full">
                      <polyline
                        fill="none"
                        stroke={vitality.color}
                        strokeWidth="2"
                        points="0,25 35,25 45,12 55,40 65,6 75,44 85,20 95,25 140,25 150,14 160,36 170,25 200,25"
                      />
                    </svg>
                  </div>

                  <div className="border-t border-[#27272a] pt-3 mt-2">
                    <div className="text-xs font-mono text-[#a1a1aa] mb-1">EQUIPPED WEAPON</div>
                    <div className="flex items-center gap-3 bg-[#12141c] p-2.5 border border-[#2e3240]">
                      <ItemIconSvg iconType={equippedWeapon} className="w-9 h-9 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-[#f3f4f6]">
                          {ITEM_DEFINITIONS[equippedWeapon]?.name}
                        </div>
                        <div className="text-xs font-mono text-[#9ca3af]">
                          Active Combat Stance [Space + J]
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#27272a] text-xs font-mono text-[#d9b982]">
                  {statusMessage || 'Select a slot to Use, Equip, Examine, or Combine.'}
                </div>
              </div>

              {/* Right Column: 8-Slot Grid + Item Inspection Panel */}
              <div className="md:col-span-8 flex flex-col gap-4">
                <div className="grid grid-cols-4 gap-3">
                  {inventory.map((slot, idx) => {
                    const def = slot ? ITEM_DEFINITIONS[slot.itemId] : null;
                    const isSelected = selectedSlot === idx;
                    const isCombineSource = combineSourceSlot === idx;
                    const isEquipped = slot?.itemId === equippedWeapon;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSlotClick(idx)}
                        aria-label={def ? `Slot ${idx + 1}: ${def.name}` : `Slot ${idx + 1}: Empty`}
                        className={`h-24 p-2.5 flex flex-col justify-between items-center border transition-all relative ${
                          isCombineSource
                            ? 'bg-[#451a03] border-[#f59e0b]'
                            : isSelected
                              ? 'bg-[#1f161b] border-[#d9b982]'
                              : 'bg-[#12141a] border-[#27272a] hover:border-[#52525b]'
                        }`}
                      >
                        <div className="w-full flex items-center justify-between text-[11px] font-mono text-[#71717a]">
                          <span>0{idx + 1}</span>
                          {isEquipped && (
                            <span className="text-[#22c55e] font-bold">EQUIP</span>
                          )}
                        </div>

                        {slot && def ? (
                          <>
                            <ItemIconSvg iconType={def.iconType} className="w-9 h-9" />
                            <div className="w-full flex items-center justify-between text-xs font-mono">
                              <span className="truncate text-[#e4e2dd] text-[11px] max-w-[85px]">
                                {def.name.split(' ')[0]}
                              </span>
                              {slot.ammoInClip !== undefined ? (
                                <span className="text-[#facc15] font-bold">{slot.ammoInClip}</span>
                              ) : slot.quantity > 1 ? (
                                <span className="text-[#60a5fa] font-bold">x{slot.quantity}</span>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs font-mono text-[#3f3f46] my-auto">EMPTY</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Item Examiner & Action Controls */}
                <div className="bg-[#090a0d] border border-[#27272a] p-4 flex flex-col justify-between min-h-[148px]">
                  {inspectedSlot && inspectedDef ? (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-display text-base font-bold text-[#f3f4f6]">
                            {inspectedDef.name}
                          </h3>
                          <span className="text-xs font-mono text-[#9ca3af]">
                            {inspectedDef.category.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-[#cbd5e1] leading-relaxed">
                          {inspectedDef.description}
                        </p>
                        {inspectedDef.examineClue && (
                          <p className="text-xs font-mono text-[#d9b982] mt-1.5">
                            EXAMINE CLUE: {inspectedDef.examineClue}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[#1f242d]">
                        {(inspectedDef.category === 'weapon' ||
                          inspectedDef.category === 'healing' ||
                          inspectedDef.category === 'battery') && (
                          <button
                            type="button"
                            onClick={() => selectedSlot !== null && onUseOrEquipSlot(selectedSlot)}
                            className="px-4 py-1.5 text-xs font-mono font-semibold bg-[#7f1d1d] hover:bg-[#991b1b] text-white transition-colors whitespace-nowrap shrink-0"
                          >
                            {inspectedDef.category === 'weapon' ? 'Equip Weapon' : 'Use Item'}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setCombineSourceSlot(
                              combineSourceSlot === selectedSlot ? null : selectedSlot
                            )
                          }
                          className="px-4 py-1.5 text-xs font-mono font-semibold bg-[#1e293b] hover:bg-[#334155] text-[#e2e8f0] border border-[#475569] transition-colors whitespace-nowrap shrink-0"
                        >
                          {combineSourceSlot === selectedSlot
                            ? 'Cancel Combine'
                            : 'Combine With...'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm font-mono text-[#71717a] my-auto text-center">
                      Select an occupied slot above to inspect, equip, use, or combine items.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'map' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between text-xs font-mono text-[#a1a1aa]">
                <span>ARCHITECTURAL BLUEPRINT // BLACKWOOD MANOR & SUB-LEVEL</span>
                <span>
                  CURRENT ROOM:{' '}
                  <strong className="text-[#facc15]">{ROOM_DEFINITIONS[currentRoom].name}</strong>
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3 bg-[#080b10] border border-[#1e293b] p-5">
                {[0, 1, 2, 3].map((rowY) =>
                  [0, 1, 2, 3].map((colX) => {
                    const room = allRooms.find(
                      (r) => r.mapGridX === colX && r.mapGridY === rowY
                    );
                    if (!room) {
                      return (
                        <div
                          key={`${colX}-${rowY}`}
                          className="h-24 border border-dashed border-[#161e29] bg-[#06080c]/50"
                        />
                      );
                    }

                    const isVisited = visitedRooms.has(room.id);
                    const isCurrent = currentRoom === room.id;
                    const hasLockedDoor = room.doors.some(
                      (d) => d.locked && !unlockedDoors.has(d.id)
                    );
                    const hasSaveTypewriter = room.props.some(
                      (p) => p.interactType === 'save'
                    );

                    return (
                      <div
                        key={room.id}
                        className={`h-24 p-2.5 border flex flex-col justify-between transition-colors ${
                          isCurrent
                            ? 'bg-[#3b1219] border-[#facc15]'
                            : isVisited
                              ? 'bg-[#111924] border-[#334155]'
                              : 'bg-[#090c10] border-[#1e293b] opacity-55'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-[#94a3b8]">{room.sector.toUpperCase()}</span>
                          {isCurrent && (
                            <span className="text-[#facc15] font-bold">YOU ARE HERE</span>
                          )}
                        </div>

                        <div className="text-xs font-semibold text-[#f1f5f9] leading-tight">
                          {isVisited ? room.name : 'Unexplored Room'}
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono text-[#94a3b8]">
                          <span>
                            {hasSaveTypewriter ? 'Typewriter Save' : `${room.doors.length} Exits`}
                          </span>
                          {isVisited && hasLockedDoor && (
                            <span className="text-[#f87171]">Locked Door</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-5 flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-1">
                {NOTE_DOCUMENTS.map((doc) => {
                  const isFound = collectedNotes.has(doc.id);
                  const isActive = selectedNoteId === doc.id;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setSelectedNoteId(doc.id)}
                      className={`text-left px-3.5 py-2.5 border text-xs font-mono transition-colors ${
                        isActive
                          ? 'bg-[#2a1519] border-[#d9b982] text-white'
                          : isFound
                            ? 'bg-[#12141c] border-[#27272a] text-[#cbd5e1] hover:border-[#52525b]'
                            : 'bg-[#090a0d] border-[#18181b] text-[#71717a]'
                      }`}
                    >
                      <div className="font-semibold truncate">{doc.title}</div>
                      <div className="text-[11px] text-[#9ca3af] mt-0.5">
                        {isFound ? `Found · ${doc.locationFound}` : `Archive Clue · ${doc.locationFound}`}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="md:col-span-7 bg-[#090a0d] border border-[#27272a] p-5 flex flex-col justify-between">
                {(() => {
                  const doc =
                    NOTE_DOCUMENTS.find((d) => d.id === selectedNoteId) || NOTE_DOCUMENTS[0];
                  return (
                    <>
                      <div>
                        <h3 className="font-display text-lg font-bold text-[#d9b982] mb-1">
                          {doc.title}
                        </h3>
                        <div className="text-xs font-mono text-[#9ca3af] mb-4 pb-2 border-b border-[#1f242d]">
                          Author: {doc.author} · {doc.date}
                        </div>
                        <div className="space-y-3 text-sm text-[#e2e8f0] leading-relaxed">
                          {doc.content.map((para, i) => (
                            <p key={i}>{para}</p>
                          ))}
                        </div>
                      </div>
                      <div className="mt-5 pt-3 border-t border-[#27272a] text-xs font-mono text-[#facc15]">
                        KEY CLUE: {doc.highlightClue}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
