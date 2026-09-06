'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const DIRECTION_SLOP = 12; // px of movement before the gesture locks to an axis
const TRIGGER_FRACTION = 0.3; // fraction of the panel width that fires "back"
const TRIGGER_MIN_PX = 64; // floor for the trigger distance on narrow screens
const VELOCITY_TRIGGER = 0.45; // px/ms — a fast flick completes regardless of distance
const ANIM_MS = 240; // settle / complete animation duration
const PARALLAX = 0.25; // how far (× width) the destination sits to the left at rest

type Mode = 'idle' | 'watch' | 'horiz' | 'reject';

/**
 * Wraps the app's screens with an iOS/Slack-style "drag right to go back"
 * gesture. Touch handling is hand-rolled in the same style as {@link PullToRefresh}.
 *
 * While dragging, the current screen follows the finger and the destination
 * screen (`back`) is revealed underneath with a slight parallax and a dimming
 * overlay that lifts as the drag completes. Releasing past ~30% of the width (or
 * with a fast flick) animates the rest of the way and runs the screen's own back
 * handler; releasing short springs back.
 *
 * `enabled` is false on the bottom-nav tab roots, which have nowhere to go back to.
 */
export default function SwipeBack({
  enabled,
  onBack,
  back,
  screenKey,
  children,
}: {
  enabled: boolean;
  onBack: () => void;
  back: ReactNode;
  screenKey: string;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false); // transition on (release animation running)
  const [active, setActive] = useState(false); // gesture/animation in progress — mount the back layer
  const [renderedKey, setRenderedKey] = useState(screenKey);

  const dxRef = useRef(0);
  const firedRef = useRef(false);
  const g = useRef<{ x: number; y: number; mode: Mode; lastX: number; lastT: number; v: number }>({
    x: 0,
    y: 0,
    mode: 'idle',
    lastX: 0,
    lastT: 0,
    v: 0,
  });

  // Latest props reachable from the once-only listener effect.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const backPresentRef = useRef(back != null);
  backPresentRef.current = back != null;

  // The screen changed => navigation finished. Snap everything to rest during
  // this render, before paint, so the new screen never flashes mid-transition.
  if (screenKey !== renderedKey) {
    setRenderedKey(screenKey);
    setDx(0);
    setAnim(false);
    setActive(false);
    dxRef.current = 0;
    firedRef.current = false;
    g.current.mode = 'idle';
  }

  const setDxBoth = (v: number) => {
    dxRef.current = v;
    setDx(v);
  };
  const measure = () => wrapRef.current?.clientWidth || 320;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function start(e: TouchEvent) {
      if (!enabledRef.current || firedRef.current || !backPresentRef.current) {
        g.current.mode = 'reject';
        return;
      }
      // Let horizontal scrollers (the filter-chip strips) handle their own drags.
      if ((e.target as HTMLElement).closest('.overflow-x-auto')) {
        g.current.mode = 'reject';
        return;
      }
      const t = e.touches[0];
      g.current = { x: t.clientX, y: t.clientY, mode: 'watch', lastX: t.clientX, lastT: e.timeStamp, v: 0 };
    }

    function move(e: TouchEvent) {
      const gg = g.current;
      if (gg.mode === 'reject' || gg.mode === 'idle') return;
      const t = e.touches[0];
      const dX = t.clientX - gg.x;
      const dY = t.clientY - gg.y;

      if (gg.mode === 'watch') {
        if (Math.abs(dX) < DIRECTION_SLOP && Math.abs(dY) < DIRECTION_SLOP) return;
        if (dX > 0 && Math.abs(dX) > Math.abs(dY)) {
          gg.mode = 'horiz';
          if (timer) {
            clearTimeout(timer);
            timer = undefined;
          }
          setAnim(false);
          setActive(true);
        } else {
          gg.mode = 'reject';
          return;
        }
      }

      if (gg.mode === 'horiz') {
        e.preventDefault();
        const dt = e.timeStamp - gg.lastT;
        if (dt > 0) gg.v = (t.clientX - gg.lastX) / dt;
        gg.lastX = t.clientX;
        gg.lastT = e.timeStamp;
        setDxBoth(Math.max(0, Math.min(measure(), dX)));
      }
    }

    function end() {
      const gg = g.current;
      if (gg.mode !== 'horiz') {
        gg.mode = 'idle';
        return;
      }
      gg.mode = 'idle';
      const w = measure();
      const threshold = Math.max(TRIGGER_MIN_PX, w * TRIGGER_FRACTION);
      const complete = !firedRef.current && (dxRef.current >= threshold || gg.v >= VELOCITY_TRIGGER);
      setAnim(true);
      if (complete) {
        firedRef.current = true;
        setDxBoth(w);
        timer = setTimeout(() => onBackRef.current(), ANIM_MS);
      } else {
        setDxBoth(0);
        timer = setTimeout(() => {
          setAnim(false);
          setActive(false);
        }, ANIM_MS);
      }
    }

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const w = measure();
  const progress = w ? Math.min(1, Math.max(0, dx / w)) : 0;
  const transition = anim ? `transform ${ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none';

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      {active && back != null && (
        <div className="absolute inset-0" aria-hidden>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ transform: `translateX(${-PARALLAX * w * (1 - progress)}px)`, transition }}
          >
            {back}
          </div>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: '#000',
              opacity: 0.16 * (1 - progress),
              transition: anim ? `opacity ${ANIM_MS}ms ease` : 'none',
            }}
          />
        </div>
      )}
      <div
        className="absolute inset-0"
        style={{
          transform: `translateX(${dx}px)`,
          transition,
          willChange: 'transform',
          boxShadow: dx > 0 ? '-16px 0 40px rgba(42,20,16,0.18)' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
