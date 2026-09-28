import type React from 'react';

/** djb2 hash, so a person's avatar colour is the same everywhere. */
export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarInitials(email: string | null | undefined): string {
  if (!email) return '?';
  const local = String(email).split('@')[0]!.replace(/[^a-zA-Z0-9]/g, ' ').trim();
  if (!local) return String(email)[0]!.toUpperCase();
  const parts = local.split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export function avatarColor(email: string | null | undefined): string {
  if (!email) return 'hsl(0 0% 40%)';
  const hue = hashStr(email) % 360;
  return `hsl(${hue} 55% 42%)`;
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

export function dueState(dueDate: string | null | undefined): DueState | null {
  if (!dueDate) return null;
  const d = new Date(dueDate.slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'soon';
  return 'later';
}

export function formatDue(dueDate: string): string {
  const d = new Date(dueDate.slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateTime(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Compact relative time for comment timestamps ("just now", "2h", "3d").
 * Falls back to an absolute date past a week — "37d ago" helps nobody.
 */
export function timeAgo(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return s;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d ago`;
  return formatDateTime(s);
}

/** Human file size — 1 decimal below 10 units so "9.4 MB" stays precise. */
export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // Local date, not toISOString(): that's UTC and can be a day off.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `- [ ]` / `- [x]` task counts in markdown, for the progress shown on cards. */
export function taskProgress(s: string): { done: number; total: number } {
  const tasks = s.match(/^\s*[-*+]\s+\[[ xX]\]\s+/gm) ?? [];
  return { done: tasks.filter((t) => /\[[xX]\]/.test(t)).length, total: tasks.length };
}

/** Strip markdown syntax for card previews. Task items are left out; cards show their progress instead. */
export function markdownStripped(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+.*$/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\n+/g, ' · ')
    .replace(/^( · )+|( · )+$/g, '')
    .replace(/( · ){2,}/g, ' · ')
    .trim();
}

/** Readable tinted label text color for a hex color on the current theme. */
export function labelTextColor(hex: string, theme: 'dark' | 'light'): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'inherit';
  const v = parseInt(m[1]!, 16);
  let r = (v >> 16) & 0xff, g = (v >> 8) & 0xff, b = v & 0xff;
  // mix toward white (dark theme) or black (light theme)
  const t = theme === 'dark' ? 0.4 : 0.3;
  const target = theme === 'dark' ? 255 : 0;
  r = Math.round(r + (target - r) * t);
  g = Math.round(g + (target - g) * t);
  b = Math.round(b + (target - b) * t);
  return `rgb(${r} ${g} ${b})`;
}

export const CARD_COLORS = ['', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
export const PROJ_COLORS = ['#7c6ef6', '#e5534b', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#06b6d4', '#8b5cf6', '#64748b'];
export const COL_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#64748b'];

export function randomLabelColor(): string {
  const colors = CARD_COLORS.slice(1);
  return colors[Math.floor(Math.random() * colors.length)]!;
}

/** Subtle card background tint from its color. */
export function cardTint(color: string | null | undefined): React.CSSProperties | undefined {
  if (!color) return undefined;
  return {
    ['--card-tint' as string]: `color-mix(in oklab, var(--surface) 82%, ${color})`,
    ['--card-tint-hover' as string]: `color-mix(in oklab, var(--surface2) 78%, ${color})`,
  };
}
