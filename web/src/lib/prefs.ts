/** Per-browser preferences in localStorage. */
type Key = 'theme' | 'scale' | 'project';

export const prefs = {
  get(key: Key): string | null {
    try {
      return localStorage.getItem(`kanagare_${key}`);
    } catch {
      return null;
    }
  },
  set(key: Key, value: string): void {
    try {
      localStorage.setItem(`kanagare_${key}`, value);
    } catch {
      /* private mode: preferences just don't persist */
    }
  },
};
