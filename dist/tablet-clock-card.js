// custom:tablet-clock-card — large clock with date and seconds.

import { ensureShell } from "./shared.js";

export class TabletClockCard extends HTMLElement {
  setConfig(config) {
    this._config = { locale: "de-DE", ...config };
  }

  set hass(_hass) {}

  getCardSize() {
    return 3;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    clearInterval(this._timer);
    this._timer = setInterval(() => this._render(), 1000);
    this._render();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _render() {
    if (!this.shadowRoot) return;
    const now = new Date();
    const loc = this._config?.locale ?? "de-DE";
    const date = now.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });
    const pad = (n) => String(n).padStart(2, "0");
    if (!this._built) {
      ensureShell(this.shadowRoot, `
          :host { display: block; height: 100%; }
          ha-card { height: 100%; box-sizing: border-box; padding: 24px 28px; color: #fff; }
          .content { height: 100%; display: flex; flex-direction: column; justify-content: center; }
          .date { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
          .time { font-size: 88px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
          .sec { font-size: 34px; font-weight: 400; opacity: 0.7; margin-left: 6px; }
      `).innerHTML = `<div class="date"></div><div><span class="time"></span><span class="sec"></span></div>`;
      this._built = true;
    }
    this.shadowRoot.querySelector(".date").textContent = date;
    this.shadowRoot.querySelector(".time").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    this.shadowRoot.querySelector(".sec").textContent = pad(now.getSeconds());
  }
}
