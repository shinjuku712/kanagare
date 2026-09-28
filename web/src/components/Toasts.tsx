import { dismissToast, useStore } from '../store.ts';

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="t-msg">{t.msg}</span>
          {t.actionLabel && t.onAction && (
            <button
              className="t-action"
              onClick={() => {
                dismissToast(t.id);
                t.onAction?.();
              }}
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
