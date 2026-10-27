import React from 'react';
import { InventorySlot, PuzzleStates } from '../game/types';

interface PuzzleModalProps {
  modalType: 'puzzle_portraits' | 'puzzle_breakers' | 'puzzle_crests' | 'save';
  puzzleStates: PuzzleStates;
  inventory: (InventorySlot | null)[];
  onClose: () => void;
  onSwapPortrait: (indexA: number, indexB: number) => void;
  onFlipBreaker: (switchNum: number) => void;
  onInsertCrest: (crestId: string) => void;
  onSaveGame: () => void;
  onLoadGame: () => void;
  hasSavedGame: boolean;
  feedbackMessage: string;
}

const PORTRAIT_METADATA: Record<string, { title: string; subtitle: string; verse: string }> = {
  founder: {
    title: 'Lord William (The Founder)',
    subtitle: 'Chronicle I: Raised the Stone at Dawn',
    verse: 'Holds a mason’s trowel above the rising sun.',
  },
  general: {
    title: 'General Vance (The General)',
    subtitle: 'Chronicle II: Bled for the Iron Crown',
    verse: 'Clad in crimson cavalry plate with a broadsword.',
  },
  scholar: {
    title: 'Lady Celeste (The Scholar)',
    subtitle: 'Chronicle III: Charted the Midnight Stars',
    verse: 'Studies a celestial astrolabe by candlelight.',
  },
  bride: {
    title: 'Eleanor Blackwood (The Bride)',
    subtitle: 'Chronicle IV: Wept Behind Velvet Bars',
    verse: 'Wears a torn mourning veil in a locked tower.',
  },
};

export const PuzzleModal: React.FC<PuzzleModalProps> = ({
  modalType,
  puzzleStates,
  inventory,
  onClose,
  onSwapPortrait,
  onFlipBreaker,
  onInsertCrest,
  onSaveGame,
  onLoadGame,
  hasSavedGame,
  feedbackMessage,
}) => {
  const [selectedPortraitIdx, setSelectedPortraitIdx] = React.useState<number | null>(null);

  const handlePortraitClick = (idx: number) => {
    if (puzzleStates.portraitsSolved) return;
    if (selectedPortraitIdx === null) {
      setSelectedPortraitIdx(idx);
    } else {
      onSwapPortrait(selectedPortraitIdx, idx);
      setSelectedPortraitIdx(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Interactive Mechanism"
    >
      <div className="w-full max-w-2xl bg-[#0e1015] border border-[#3a2d28] shadow-[0_24px_60px_rgba(0,0,0,0.95)] p-6 text-[#e4e2dd]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#27272a]">
          <h2 className="font-display text-xl font-bold text-[#d9b982]">
            {modalType === 'puzzle_portraits' && 'ANCESTRAL LINEAGE GALLERY'}
            {modalType === 'puzzle_breakers' && 'SUB-LEVEL HIGH-VOLTAGE BREAKER'}
            {modalType === 'puzzle_crests' && 'ASTRAL ECLIPSE CONTAINMENT PEDESTAL'}
            {modalType === 'save' && 'UNDERWOOD RIBBON TYPEWRITER'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs font-mono font-semibold bg-[#1f222d] hover:bg-[#2e3242] border border-[#3f3f46] whitespace-nowrap shrink-0"
          >
            Step Back [Esc]
          </button>
        </div>

        {/* 1. Portrait Order Puzzle */}
        {modalType === 'puzzle_portraits' && (
          <div className="space-y-4">
            <p className="text-sm text-[#cbd5e1]">
              Inscrybed on the brass plaque beneath the four portraits:{' '}
              <em className="text-[#d9b982]">
                “First the Founder at Dawn, second the General of War, third the Scholar of Stars, fourth the weeping Bride.”
              </em>
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {puzzleStates.portraitOrder.map((pId, idx) => {
                const info = PORTRAIT_METADATA[pId];
                const isSelected = selectedPortraitIdx === idx;
                return (
                  <button
                    key={pId}
                    type="button"
                    onClick={() => handlePortraitClick(idx)}
                    className={`p-3 border text-left flex flex-col justify-between h-36 transition-all ${
                      puzzleStates.portraitsSolved
                        ? 'bg-[#0f291e] border-[#22c55e]'
                        : isSelected
                          ? 'bg-[#3b1d11] border-[#facc15]'
                          : 'bg-[#141720] border-[#334155] hover:border-[#d9b982]'
                    }`}
                  >
                    <div className="text-xs font-mono text-[#94a3b8]">POSITION 0{idx + 1}</div>
                    <div>
                      <div className="font-display text-sm font-bold text-white leading-snug">
                        {info.title}
                      </div>
                      <div className="text-[11px] text-[#a1a1aa] mt-1">{info.verse}</div>
                    </div>
                    <div className="text-[10px] font-mono text-[#d9b982]">
                      {puzzleStates.portraitsSolved
                        ? 'LOCKED IN PLACE'
                        : isSelected
                          ? 'SELECT TARGET TO SWAP'
                          : 'CLICK TO SWAP'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. Power Breaker Sequence Puzzle */}
        {modalType === 'puzzle_breakers' && (
          <div className="space-y-4">
            <p className="text-sm text-[#cbd5e1]">
              Chief Engineer’s Cold-Start Schematic:{' '}
              <span className="font-mono text-[#facc15]">
                Engage Switch 3 (Auxiliary) → Switch 1 (Primary Turbine) → Switch 4 (Coolant Pump) → Switch 2 (Main Bus).
              </span>
            </p>

            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((num) => {
                const isEngaged = puzzleStates.breakerSequence.includes(num);
                const labels = ['Primary Turbine', 'Main Bus', 'Auxiliary Relay', 'Coolant Pump'];
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => onFlipBreaker(num)}
                    className={`p-4 border flex flex-col items-center justify-between h-36 transition-all ${
                      isEngaged
                        ? 'bg-[#0f291e] border-[#22c55e] text-white'
                        : 'bg-[#141720] border-[#334155] hover:border-[#f59e0b]'
                    }`}
                  >
                    <span className="text-xs font-mono text-[#94a3b8]">SWITCH #{num}</span>
                    <span className="font-mono text-2xl font-bold">
                      {isEngaged ? 'ON' : 'OFF'}
                    </span>
                    <span className="text-[11px] text-center text-[#cbd5e1]">
                      {labels[num - 1]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Three Astral Crests Pedestal */}
        {modalType === 'puzzle_crests' && (
          <div className="space-y-4">
            <p className="text-sm text-[#cbd5e1]">
              Three hexagonal sockets guard the Underground Bio-Lab bulkhead:{' '}
              <span className="text-[#d9b982]">
                Golden Sun Crest (Armory), Silver Moon Crest (Dining Hall Portraits), and Obsidian Star Crest (Power Station).
              </span>
            </p>

            <div className="grid grid-cols-3 gap-4">
              {[
                { id: 'crest_sun', name: 'Golden Sun Socket' },
                { id: 'crest_moon', name: 'Silver Moon Socket' },
                { id: 'crest_star', name: 'Obsidian Star Socket' },
              ].map((socket) => {
                const isInserted = puzzleStates.crestsInserted.includes(socket.id);
                const inInventory = inventory.some((s) => s?.itemId === socket.id);

                return (
                  <div
                    key={socket.id}
                    className={`p-4 border flex flex-col items-center justify-between h-36 ${
                      isInserted
                        ? 'bg-[#0f291e] border-[#22c55e]'
                        : 'bg-[#12141c] border-[#27272a]'
                    }`}
                  >
                    <span className="text-xs font-mono text-[#94a3b8] text-center">
                      {socket.name}
                    </span>
                    <span className="text-sm font-bold font-mono">
                      {isInserted ? 'SEALED' : 'EMPTY SOCKET'}
                    </span>
                    {!isInserted && (
                      <button
                        type="button"
                        disabled={!inInventory}
                        onClick={() => onInsertCrest(socket.id)}
                        className={`w-full py-1.5 text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          inInventory
                            ? 'bg-[#7f1d1d] hover:bg-[#991b1b] text-white'
                            : 'bg-[#1f242d] text-[#52525b] cursor-not-allowed'
                        }`}
                      >
                        {inInventory ? 'Insert Crest' : 'Missing Crest'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Typewriter Save / Load */}
        {modalType === 'save' && (
          <div className="space-y-4">
            <p className="text-sm text-[#cbd5e1]">
              An ink ribbon is threaded into the vintage Underwood typewriter. Would you like to record your current progress in Blackwood Manor?
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={onSaveGame}
                className="px-5 py-2.5 text-xs font-mono font-semibold bg-[#0f5132] hover:bg-[#157347] text-white border border-[#22c55e] transition-colors whitespace-nowrap shrink-0"
              >
                Save Progress to Ink Ribbon
              </button>

              {hasSavedGame && (
                <button
                  type="button"
                  onClick={onLoadGame}
                  className="px-5 py-2.5 text-xs font-mono font-semibold bg-[#1e293b] hover:bg-[#334155] text-white border border-[#64748b] transition-colors whitespace-nowrap shrink-0"
                >
                  Load Last Saved Ribbon
                </button>
              )}
            </div>
          </div>
        )}

        {/* Status Feedback Line */}
        <div className="mt-5 pt-3 border-t border-[#27272a] text-xs font-mono text-[#facc15]">
          {feedbackMessage || 'Inspect mechanism carefully.'}
        </div>
      </div>
    </div>
  );
};
