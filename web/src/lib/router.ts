import { useEffect, useState } from 'react';

/**
 * Minimal router — this app has exactly two routes (board and /card/:id), so a
 * full routing library would be more code than the feature.
 *
 * `useRoute` reflects the current pathname and re-renders on back/forward.
 * Navigation helpers push/replace history and notify subscribers.
 */

export type Route = { name: 'board' } | { name: 'card'; id: number };

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function parseRoute(pathname = window.location.pathname): Route {
  const m = /^\/card\/(\d+)\/?$/.exec(pathname);
  if (m) return { name: 'card', id: Number(m[1]) };
  return { name: 'board' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  useEffect(() => {
    const update = () => setRoute(parseRoute());
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return route;
}

export function navigateToCard(id: number) {
  if (parseRoute().name === 'card') history.replaceState(null, '', `/card/${id}`);
  else history.pushState(null, '', `/card/${id}`);
  notify();
}

export function navigateToBoard() {
  // If we arrived by deep link there's nothing to go back to, so replace
  // instead of pushing another entry the user would have to escape twice.
  if (history.length > 1 && document.referrer) history.back();
  else {
    history.pushState(null, '', '/');
    notify();
  }
}

/** Absolute URL for sharing a card. */
export function cardUrl(id: number): string {
  return `${window.location.origin}/card/${id}`;
}
