import React from 'react';
import { ItemDefinition } from '../game/types';

export const BioCrestTitleEmblem: React.FC = () => (
  <svg viewBox="0 0 430 112" className="w-full max-w-[430px] h-auto drop-shadow-[0_6px_16px_rgba(0,0,0,0.95)]" aria-hidden="true">
    <defs>
      <linearGradient id="crestBrass" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#f5e6c8" />
        <stop offset="55%" stopColor="#b88644" />
        <stop offset="100%" stopColor="#5a3918" />
      </linearGradient>
      <linearGradient id="crimsonSteel" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="60%" stopColor="#991b1b" />
        <stop offset="100%" stopColor="#450a0a" />
      </linearGradient>
    </defs>
    {/* Outer Gothic Shield Frame */}
    <path
      d="M22 12 L408 12 L420 24 L420 88 L408 100 L22 100 L10 88 L10 24 Z"
      fill="#0d0e12"
      stroke="url(#crestBrass)"
      strokeWidth="2.5"
    />
    <path
      d="M28 18 L402 18 L412 28 L412 84 L402 94 L28 94 L18 84 L18 28 Z"
      fill="none"
      stroke="#7f1d1d"
      strokeWidth="1"
      strokeDasharray="6 3"
    />
    {/* Bio-Hazard / Astral Eclipse Medallion Left */}
    <g transform="translate(54, 56)">
      <circle cx="0" cy="0" r="24" fill="#181214" stroke="url(#crestBrass)" strokeWidth="2" />
      <polygon points="0,-20 5,-6 19,-6 8,3 12,17 0,9 -12,17 -8,3 -19,-6 -5,-6" fill="url(#crimsonSteel)" />
      <circle cx="0" cy="0" r="6" fill="#0d0e12" stroke="#f5e6c8" strokeWidth="1.5" />
    </g>
    {/* Typography Lockup */}
    <text
      x="94"
      y="50"
      fill="url(#crestBrass)"
      fontFamily="Cinzel, Georgia, serif"
      fontWeight="700"
      fontSize="22"
      letterSpacing="2"
    >
      BLACKWOOD MANOR
    </text>
    <line x1="94" y1="60" x2="394" y2="60" stroke="#991b1b" strokeWidth="1.5" />
    <text
      x="95"
      y="78"
      fill="#e4e2dd"
      fontFamily="JetBrains Mono, monospace"
      fontWeight="600"
      fontSize="11"
      letterSpacing="3"
    >
      BIO-HAZARD INCIDENT // OCT 1998
    </text>
  </svg>
);

export const ItemIconSvg: React.FC<{ iconType: ItemDefinition['iconType']; className?: string }> = ({
  iconType,
  className = 'w-8 h-8',
}) => {
  switch (iconType) {
    case 'handgun':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M3 7h15v5h-8l-2 7H4l2-7H3V7z" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.5" />
          <rect x="5" y="8" width="11" height="2" fill="#cbd5e1" />
          <rect x="5" y="13" width="3" height="5" fill="#78350f" />
        </svg>
      );
    case 'shotgun':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M2 9h20v3H10l-3 5H2l2-5V9z" fill="#334155" stroke="#cbd5e1" strokeWidth="1.4" />
          <path d="M2 12l4 5H2v-5z" fill="#92400e" />
          <rect x="11" y="11" width="6" height="2" fill="#78350f" />
        </svg>
      );
    case 'knife':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M19 4L9 14l2 2 10-10-2-2z" fill="#e2e8f0" stroke="#475569" strokeWidth="1.2" />
          <path d="M8 13l3 3-5 5-3-3 5-5z" fill="#78350f" stroke="#d97706" strokeWidth="1.2" />
        </svg>
      );
    case 'ammo_9mm':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="8" width="16" height="11" rx="1" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="1.5" />
          <rect x="7" y="4" width="2" height="4" fill="#facc15" />
          <rect x="11" y="4" width="2" height="4" fill="#facc15" />
          <rect x="15" y="4" width="2" height="4" fill="#facc15" />
        </svg>
      );
    case 'ammo_shells':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="7" width="16" height="12" rx="1" fill="#7f1d1d" stroke="#f87171" strokeWidth="1.5" />
          <rect x="7" y="4" width="3" height="3" fill="#eab308" />
          <rect x="14" y="4" width="3" height="3" fill="#eab308" />
        </svg>
      );
    case 'herb_green':
    case 'herb_double':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M12 3c-3 4-4 8-1 13h2c3-5 2-9-1-13z" fill="#22c55e" stroke="#14532d" strokeWidth="1.4" />
          <path d="M6 8c1 4 3 6 6 8-1-4-3-6-6-8z" fill="#4ade80" />
          <path d="M18 8c-1 4-3 6-6 8 1-4 3-6 6-8z" fill="#4ade80" />
          <rect x="9" y="16" width="6" height="5" fill="#78350f" />
        </svg>
      );
    case 'herb_red':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M12 3c-3 4-4 8-1 13h2c3-5 2-9-1-13z" fill="#ef4444" stroke="#7f1d1d" strokeWidth="1.4" />
          <path d="M6 8c1 4 3 6 6 8-1-4-3-6-6-8z" fill="#f87171" />
          <path d="M18 8c-1 4-3 6-6 8 1-4 3-6 6-8z" fill="#f87171" />
          <rect x="9" y="16" width="6" height="5" fill="#78350f" />
        </svg>
      );
    case 'herb_mixed':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="6" y="10" width="12" height="9" rx="2" fill="#fef3c7" stroke="#b45309" strokeWidth="1.5" />
          <path d="M8 13h8v4H8z" fill="#10b981" />
          <circle cx="12" cy="7" r="3" fill="#ef4444" />
        </svg>
      );
    case 'first_aid':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="7" y="6" width="10" height="15" rx="2" fill="#f8fafc" stroke="#16a34a" strokeWidth="1.5" />
          <rect x="9" y="3" width="6" height="3" fill="#16a34a" />
          <path d="M11 10h2v6h-2zM9 12h6v2H9z" fill="#dc2626" />
        </svg>
      );
    case 'battery':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="6" y="6" width="12" height="14" rx="1" fill="#1e293b" stroke="#eab308" strokeWidth="1.5" />
          <rect x="9" y="3" width="6" height="3" fill="#eab308" />
          <path d="M13 9l-3 5h3l-1 4 4-5h-3l1-4z" fill="#fde047" />
        </svg>
      );
    case 'key_bronze':
    case 'key_silver':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle
            cx="8"
            cy="12"
            r="4"
            fill="none"
            stroke={iconType === 'key_bronze' ? '#d97706' : '#cbd5e1'}
            strokeWidth="2.2"
          />
          <path
            d="M12 12h9v3h-2v-3h-2v2h-2v-2"
            fill="none"
            stroke={iconType === 'key_bronze' ? '#f59e0b' : '#f8fafc'}
            strokeWidth="2"
          />
        </svg>
      );
    case 'crest_sun':
    case 'crest_moon':
    case 'crest_star':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <polygon
            points="12,2 20,7 20,17 12,22 4,17 4,7"
            fill="#18181b"
            stroke={
              iconType === 'crest_sun'
                ? '#facc15'
                : iconType === 'crest_moon'
                  ? '#94a3b8'
                  : '#c084fc'
            }
            strokeWidth="2"
          />
          <circle
            cx="12"
            cy="12"
            r="4"
            fill={
              iconType === 'crest_sun'
                ? '#eab308'
                : iconType === 'crest_moon'
                  ? '#e2e8f0'
                  : '#a855f7'
            }
          />
        </svg>
      );
    case 'sample_omega':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="7" y="3" width="10" height="18" rx="2" fill="#064e3b" stroke="#34d399" strokeWidth="1.8" />
          <path d="M9 8h6v8H9z" fill="#10b981" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="5" y="3" width="14" height="18" rx="1" fill="#fef3c7" stroke="#92400e" strokeWidth="1.5" />
          <line x1="8" y1="8" x2="16" y2="8" stroke="#78350f" strokeWidth="1.5" />
          <line x1="8" y1="12" x2="16" y2="12" stroke="#78350f" strokeWidth="1.5" />
          <line x1="8" y1="16" x2="13" y2="16" stroke="#78350f" strokeWidth="1.5" />
        </svg>
      );
  }
};
