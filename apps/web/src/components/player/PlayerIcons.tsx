import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PlayIcon() {
  return (
    <Icon>
      <path d="M7 5v14l12-7z" fill="currentColor" />
    </Icon>
  );
}

export function PauseIcon() {
  return (
    <Icon>
      <rect x="6" y="5" width="4" height="14" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" fill="currentColor" />
    </Icon>
  );
}

const SPEAKER = <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />;

export function VolumeIcon({ level }: { level: 'muted' | 'low' | 'high' }) {
  return (
    <Icon>
      {SPEAKER}
      {level === 'muted' && <path d="M16 9l5 6M21 9l-5 6" />}
      {level !== 'muted' && <path d="M16 9.5a3.5 3.5 0 0 1 0 5" />}
      {level === 'high' && <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />}
    </Icon>
  );
}

export function FullscreenIcon({ exit }: { exit: boolean }) {
  return (
    <Icon>
      {exit ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </Icon>
  );
}
