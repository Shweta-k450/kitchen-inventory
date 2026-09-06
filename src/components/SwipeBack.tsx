'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const DIRECTION_SLOP = 12; // px of movement before the gesture locks to an axis
const TRIGGER_FRACTION = 0.3; // fraction of the panel width that fires "back"
const TRIGGER_MIN_PX = 64; // floor for the trigger distance on narrow screens

type GestureMode = 'idle' | 'watch' | 'horiz' | 'reject';

/**
 * Wraps the app's screens with a "drag right to go back" gesture, mirroring the
 * hand-rolled touch handling in {@link PullToRefresh}.
 *
 * The gesture can start anywhere on the screen. On the first bit of movement it
 * locks to an axis: a rightward, horizontally-dominant drag follows the finger
 * (the whole screen slides) and, if released past ~30% of the screen width, runs
 * the current screen's own back handler. Anything else (vertical, leftward,
 * starting inside a horizontal scroller) is ignored so normal scrolling wins.
 *
 * `enabled` is false on the bottom-nav tab roots, which have nowhere to go back to.
 */
export default function SwipeBack({
  enabled,
  onBack,
  screenKey,
  children,
}: {
  enabled: boolean;
  onBack: () => void;
  screenKey: string;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dxRef = useRef(0);
  const firedRef = useRef(false);
  const gestureRef = useRef<{ startX: number; startY: number; mode: GestureMode }>({
    startX: 0,
    startY: 0,
    mode: 'idle',
  });

  // Keep the latest props reachable from the once-only listener effect below.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const setDxBoth = (v: number) => {
    dxRef.current = v;
    setDx(v);
  };

  // Any navigation (this swipe, a Back tap, a bottom-nav tap) changes screenKey —
  // snap the panel back to rest so the next screen doesn't start offset.
  useEffect(() => {
    firedRef.current = false;
    gestureRef.current.mode = 'idle';
    setDragging(false);
    setDxBoth(0);
  }, [screenKey]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (!enabledRef.current || firedRef.current) {
        gestureRef.current.mode = 'reject';
        return;
      }
      // Let horizontal scrollers (the filter-chip strips) handle their own drags.
      if ((e.target as HTMLElement).closest('.overflow-x-auto')) {
        gestureRef.current.mode = 'reject';
        return;
      }
      const t = e.touches[0];
      gestureRef.current = { startX: t.clientX, startY: t.clientY, mode: 'watch' };
    }

    function onTouchMove(e: TouchEvent) {
      const g = gestureRef.current;
      if (g.mode === 'reject' || g.mode === 'idle') return;
      const t = e.touches[0];
      const dX = t.clientX - g.startX;
      const dY = t.clientY - g.startY;

      if (g.mode === 'watch') {
        if (Math.abs(dX) < DIRECTION_SLOP && Math.abs(dY) < DIRECTION_SLOP) return;
        if (dX > 0 && Math.abs(dX) > Math.abs(dY)) {
          g.mode = 'horiz';
          setDragging(true);
        } else {
          g.mode = 'reject';
          return;
        }
      }

      if (g.mode === 'horiz') {
        e.preventDefault();
        const width = wrapRef.current?.clientWidth || 320;
        setDxBoth(Math.max(0, Math.min(width, dX)));
      }
    }

    function onTouchEnd() {
      const g = gestureRef.current;
      if (g.mode !== 'horiz') {
        g.mode = 'idle';
        return;
      }
      g.mode = 'idle';
      setDragging(false);
      const threshold = Math.max(TRIGGER_MIN_PX, (wrapRef.current?.clientWidth || 320) * TRIGGER_FRACTION);
      if (dxRef.current >= threshold && !firedRef.current) {
        firedRef.current = true;
        setDxBoth(0);
        onBackRef.current();
      } else {
        setDxBoth(0);
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
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform 220ms ease',
          willChange: 'transform',
          boxShadow: dx > 0 ? '-12px 0 24px rgba(42,20,16,0.12)' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
