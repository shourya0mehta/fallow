/**
 * FLIP-style flights for the intro's last beat: an element flies, on a small
 * arc, from where it is to a box on the page (a plant's bed, the pet's spot in
 * the garden), scaling to match. Uses the Web Animations API, so it never
 * fights the element's own layout.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
}

export function fly(el: HTMLElement, to: Box, opts: { delay?: number; duration?: number; arc?: number } = {}): Animation {
  const from = el.getBoundingClientRect();
  const dx = to.x - from.left;
  const dy = to.y - from.top;
  const k = from.width > 0 ? to.w / from.width : 1;
  const arc = opts.arc ?? Math.min(140, 40 + Math.abs(dx) * 0.18);
  el.style.transformOrigin = "0 0";
  el.style.willChange = "transform";
  return el.animate(
    [
      { transform: "translate(0px, 0px) scale(1)" },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arc}px) scale(${(1 + k) / 2})`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${k})` },
    ],
    { duration: opts.duration ?? 900, delay: opts.delay ?? 0, easing: "cubic-bezier(0.45, 0.05, 0.3, 1)", fill: "forwards" },
  );
}

export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
