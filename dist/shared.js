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
