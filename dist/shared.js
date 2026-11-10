// Shared helpers for the tablet cards.

/**
 * Render `css` + `<ha-card>` once and return the content element inside it.
 * The ha-card itself must survive re-renders: card-mod attaches its styles
 * to that element.
 */
export function ensureShell(root, css) {
  if (!root.querySelector("ha-card")) {
    root.innerHTML = `<style>${css}</style><ha-card><div class="content"></div></ha-card>`;
  }
  return root.querySelector(".content");
}

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Apple-Home-style press feedback: shrink while pressed, spring back with a slight overshoot. */
export const SPRING = "cubic-bezier(.34, 1.56, .64, 1)";
export function press(selectors, scale = 0.94) {
  const list = selectors.split(",").map((s) => s.trim());
  return `
    ${list.join(", ")} { transition: transform .45s ${SPRING}, background-color .2s, color .2s; }
    ${list.map((s) => `${s}:active`).join(", ")} { transform: scale(${scale}); transition-duration: .12s, .2s, .2s; }`;
}

/** Spring "pop" when a panel appears. */
export const POP = `@keyframes pop { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }`;

/** "noch 1:33 h" from minutes. */
export function remaining(minutes) {
  const m = Math.max(0, Math.round(minutes));
  return `noch ${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
}

/**
 * Text that doesn't fit its box scrolls sideways and back (ping-pong), with a
 * pause at each end. Call after the elements are in the DOM.
 */
export const MARQUEE_CSS = `
  .mq { display: inline-block; white-space: nowrap; }
  .mq.run { animation: mq var(--mq-time, 8s) ease-in-out infinite alternate; }
  @keyframes mq { 0%, 15% { transform: none; } 85%, 100% { transform: translateX(var(--mq-dist)); } }
`;
export function marquee(elements) {
  for (const box of elements) {
    if (!box.firstElementChild?.classList.contains("mq")) {
      box.innerHTML = `<span class="mq">${box.innerHTML}</span>`;
    }
    const span = box.firstElementChild;
    span.classList.remove("run");
    const over = span.scrollWidth - box.clientWidth;
    if (over > 2) {
      span.style.setProperty("--mq-dist", `-${over + 4}px`);
      span.style.setProperty("--mq-time", `${(4 + over / 25).toFixed(1)}s`);
      span.classList.add("run");
    }
  }
}
