'use client';

import type { CSSProperties } from 'react';

export function Chip({
  label, style, onClick,
}: { label: string; style: CSSProperties; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={style}
      className="px-3.5 py-1.5 rounded-full text-[13px] cursor-pointer select-none whitespace-nowrap"
    >
      {label}
    </div>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div onClick={onClick} className="flex items-center gap-1 text-sm font-semibold cursor-pointer" style={{ color: 'var(--color-accent)' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      {label}
    </div>
  );
}
