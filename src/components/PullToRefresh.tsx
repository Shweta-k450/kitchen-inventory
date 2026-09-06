'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const PULL_MAX = 96;
const PULL_THRESHOLD = 64;
const REST_DURING_REFRESH = 56;
const MIN_REFRESH_MS = 500;

/**
 * Wraps the app's screens with a touch-driven pull-to-refresh gesture.
 *
 * Firestore's onSnapshot listeners already push updates in real time (e.g. when
 * someone else adds an item), so this isn't the only way data stays current — but a
 * phone that's been asleep or lost signal for a while can end up with a stalled
 * connection, and a manual "pull down to sync" is a familiar, reassuring fallback.
 *
 * Detects the currently-visible screen's own scrollable container (each screen has
 * a `.noscroll` element with `overflow-y-auto`) and only starts the gesture when
 * that container is already scrolled to the top, so it never fights normal scrolling.
 */
export default function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const gestureRef = useRef<{ startY: number; active: boolean; scrollEl: HTMLElement | null }>({
    startY: 0,
    active: false,
    scrollEl: null,
  });

  const setPullBoth = (v: number) => {
    pullRef.current = v;
    setPull(v);
  };

  const triggerRefresh = useCallback(async () => {
    refreshingRef.current = true;
    setRefreshing(true);
    setPullBoth(REST_DURING_REFRESH);
    const started = Date.now();
    try {
      await onRefresh();
    } catch {
      // the data hook already reflects failure in its own status; nothing more to do here
    }
    const elapsed = Date.now() - started;
    if (elapsed < MIN_REFRESH_MS) {
      await new Promise((r) => setTimeout(r, MIN_REFRESH_MS - elapsed));
    }
    refreshingRef.current = false;
    setRefreshing(false);
    setPullBoth(0);
  }, [onRefresh]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      const touch = e.touches[0];
      const scrollEl = (e.target as HTMLElement).closest('.noscroll') as HTMLElement | null;
      gestureRef.current = { startY: touch.clientY, active: !!scrollEl && scrollEl.scrollTop <= 0, scrollEl };
    }

    function onTouchMove(e: TouchEvent) {
      const g = gestureRef.current;
      if (!g.active || refreshingRef.current) return;
      if (g.scrollEl && g.scrollEl.scrollTop > 0) {
        g.active = false;
        setDragging(false);
        setPullBoth(0);
        return;
      }
      const touch = e.touches[0];
      const delta = touch.clientY - g.startY;
      if (delta <= 0) {
        setDragging(false);
        setPullBoth(0);
        return;
      }
      e.preventDefault();
      setDragging(true);
      setPullBoth(Math.min(PULL_MAX, delta * 0.5));
    }

    function onTouchEnd() {
      const g = gestureRef.current;
      if (!g.active) return;
      g.active = false;
      setDragging(false);
      if (pullRef.current >= PULL_THRESHOLD) {
        void triggerRefresh();
      } else {
        setPullBoth(0);
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [triggerRefresh]);

  const ready = pull >= PULL_THRESHOLD;

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <div
        aria-hidden
        className="absolute left-0 right-0 top-0 flex justify-center pointer-events-none"
        style={{
          zIndex: 50,
          transform: `translateY(${Math.max(pull - 40, -40)}px)`,
          opacity: pull > 4 || refreshing ? 1 : 0,
          transition: dragging ? 'none' : 'transform 220ms ease, opacity 220ms ease',
        }}
      >
        <div
          className="mt-3 flex items-center justify-center rounded-full"
          style={{ width: 36, height: 36, background: '#f9f6f3', border: '1.5px solid #e3d8c8', boxShadow: '0 2px 8px rgba(42,20,16,0.18)' }}
        >
          {refreshing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#621117" strokeWidth="2.5" strokeLinecap="round" className="pi-spin">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#621117"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: `rotate(${ready ? 180 : 0}deg)`, transition: 'transform 150ms ease' }}
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
