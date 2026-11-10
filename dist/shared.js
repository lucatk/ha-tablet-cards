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
