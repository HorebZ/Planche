import { commands } from "@/ipc/bindings";

/** Measures drops and drags for the phase 5 budget. On in dev, and in VITE_PERF or VITE_MOCK builds. */
const enabled = Boolean(
  import.meta.env.DEV || import.meta.env.VITE_PERF || import.meta.env.VITE_MOCK,
);

export const dragPerf = {
  /** Milliseconds from the drop to the first frame that shows the card in its new column. */
  drops: [] as number[],
  /** Frame durations while a card is lifted. */
  frames: [] as number[],
};

if (enabled) {
  Object.assign(window, { __plancheDragPerf: dragPerf });
}

let raf = 0;

export function startFrames() {
  if (!enabled) {
    return;
  }
  let last = performance.now();
  const tick = (now: number) => {
    dragPerf.frames.push(now - last);
    last = now;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

export function stopFrames() {
  cancelAnimationFrame(raf);
}

/** Call after the commit that moves the card: the next frame is the one that shows it. */
export function markDropFrame(droppedAt: number) {
  if (!enabled) {
    return;
  }
  requestAnimationFrame((now) => {
    const ms = now - droppedAt;
    dragPerf.drops.push(ms);
    commands.perfMark("drop-frame", ms).catch(() => {});
  });
}
