const commonProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon({ className }: { className?: string }) {
  return (
    <svg {...commonProps} className={className}>
      <polyline points="4 11 12 4 20 11" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <rect x="10" y="14" width="4" height="6" />
    </svg>
  );
}

export function TagIcon({ className }: { className?: string }) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M11 4L5 4L4 5L4 11L13 20L20 13L11 4Z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </svg>
  );
}

export function CycleIcon({ className }: { className?: string }) {
  return (
    <svg {...commonProps} className={className}>
      <circle cx="9" cy="9" r="5" />
      <circle cx="15" cy="15" r="5" />
    </svg>
  );
}

export function PawIcon({ className }: { className?: string }) {
  return (
    <svg {...commonProps} className={className}>
      <ellipse cx="12" cy="16" rx="4" ry="3" />
      <circle cx="6" cy="10" r="1.7" />
      <circle cx="10.5" cy="6.5" r="1.7" />
      <circle cx="15.5" cy="6.5" r="1.7" />
      <circle cx="19" cy="10" r="1.7" />
    </svg>
  );
}

export function MoneyIcon({ className }: { className?: string }) {
  return (
    <svg {...commonProps} className={className}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function MilkIcon({ className }: { className?: string }) {
  return (
    <svg {...commonProps} className={className}>
      <rect x="7" y="8" width="10" height="13" />
      <polyline points="7 8 9 4 15 4 17 8" />
      <line x1="12" y1="4" x2="12" y2="2" />
    </svg>
  );
}

export function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5.5A2.5 2.5 0 0 0 8 8.5" />
      <path d="M16 5h2.5A2.5 2.5 0 0 1 16 8.5" />
      <line x1="12" y1="13" x2="12" y2="17" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="17" x2="12" y2="20" />
    </svg>
  );
}

export function AlertIcon({ className }: { className?: string }) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M12 4 L21 19 L3 19 Z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChatIcon({ className }: { className?: string }) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M4 5h16v10H9l-4 4V5Z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="12" x2="13" y2="12" />
    </svg>
  );
}
