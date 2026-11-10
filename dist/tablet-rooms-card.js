// custom:tablet-rooms-card — room grid that swaps in place for the room's
// controls (no popups). State is per browser; returns to the grid after
// `timeout_seconds` without a touch. Every room is built once, right after
// the grid, and stays mounted; opening a room only toggles visibility.
//
//   rooms:
//     - name: Esstisch
//       icon: mdi:table-chair
//       main: [<card>, …]      left column (or full width without `side`)
//       side: [<card>, …]      optional right column, e.g. light-color-card
//       actions: [<card>, …]   optional bottom row, equal-width columns

import { ensureShell, esc } from "./shared.js";

let helpersPromise;
const cardHelpers = () => (helpersPromise ??= window.loadCardHelpers());

export class TabletRoomsCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config.rooms) || !config.rooms.length) {
      throw new Error("tablet-rooms-card: `rooms` must be a non-empty list");
    }
    this._config = { timeout_seconds: 120, columns: 3, ...config };
    this._room = null;
    this._cards = [];
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    for (const c of this._cards) c.hass = hass;
  }

  getCardSize() {
    return 8;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  disconnectedCallback() {
    clearTimeout(this._timer);
  }

  _armTimeout() {
    clearTimeout(this._timer);
    if (this._room === null) return;
    this._timer = setTimeout(() => this._open(null), Number(this._config.timeout_seconds) * 1000);
  }

  _open(index) {
    this._room = index;
    this._show();
    this._armTimeout();
  }

  _show() {
    const content = this.shadowRoot?.querySelector(".content");
    if (!content) return;
    content.querySelector(".grid").hidden = this._room !== null;
    content.querySelectorAll(".room").forEach((el, i) => (el.hidden = i !== this._room));
  }

  async _makeCards(configs) {
    const helpers = await cardHelpers();
    return (configs ?? []).map((cfg) => {
      const el = helpers.createCardElement(cfg);
      el.hass = this._hass;
      this._cards.push(el);
      return el;
    });
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const content = ensureShell(this.shadowRoot, `
      :host { display: block; height: 100%; }
      ha-card { height: 100%; box-sizing: border-box; background: none; border: none; box-shadow: none; color: #fff; }
      .content { height: 100%; box-sizing: border-box; padding: var(--tablet-rooms-padding, 28px 24px); }
      .grid { height: 100%; display: grid; gap: 22px; grid-auto-rows: 1fr; }
      .tile { border: none; font: inherit; color: #fff; cursor: pointer; border-radius: 32px;
        background: rgba(16, 18, 40, 0.38); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
        font-size: 26px; font-weight: 500; --mdc-icon-size: 76px; min-height: 0; }
      .tile:active { background: rgba(255,255,255,0.2); }
      .room { height: 100%; display: flex; flex-direction: column; gap: 18px; border-radius: 32px; padding: 20px;
        box-sizing: border-box; background: rgba(16, 18, 40, 0.45); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
      [hidden] { display: none !important; }
      .head { display: flex; align-items: center; gap: 18px; flex: none; }
      .back { border: none; font: inherit; font-size: 20px; font-weight: 600; color: #161830; background: #fff;
        border-radius: 999px; height: 60px; padding: 0 26px 0 16px; display: flex; align-items: center; gap: 8px;
        --mdc-icon-size: 28px; cursor: pointer; }
      .title { font-size: 30px; font-weight: 600; display: flex; align-items: center; gap: 12px; --mdc-icon-size: 34px; }
      .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr; gap: 20px; }
      .body.split { grid-template-columns: 1.15fr 1fr; }
      .main { display: flex; flex-direction: column; gap: 14px; overflow: auto; }
      .side { min-height: 0; border-radius: 28px; background: rgba(255,255,255,0.05); }
      .actions { flex: none; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 14px; }
    `);
    if (content.firstChild) return this._show();
    this._cards = [];
    const rooms = this._config.rooms;
    const cols = Number(this._config.columns);
    const grid = `<div class="grid" style="grid-template-columns: repeat(${cols * 2}, 1fr)">${rooms
      .map((r, i) => {
        // Centre an incomplete last row, like the Magic Frame layout.
        const lastRow = Math.floor(i / cols) === Math.floor((rooms.length - 1) / cols);
        const inLast = rooms.length % cols;
        const offset = lastRow && inLast && i % cols === 0 ? cols - inLast + 1 : "auto";
        return `<button class="tile" data-i="${i}" style="grid-column: ${offset} / span 2">
          <ha-icon icon="${esc(r.icon)}"></ha-icon><span>${esc(r.name)}</span></button>`;
      })
      .join("")}</div>`;
    const panels = rooms
      .map(
        (room) => `
      <div class="room" hidden>
        <div class="head">
          <button class="back"><ha-icon icon="mdi:chevron-left"></ha-icon>Zurück</button>
          <div class="title"><ha-icon icon="${esc(room.icon)}"></ha-icon>${esc(room.name)}</div>
        </div>
        <div class="body${room.side ? " split" : ""}">
          <div class="main"></div>
          ${room.side ? `<div class="side"></div>` : ""}
        </div>
        ${room.actions ? `<div class="actions"></div>` : ""}
      </div>`,
      )
      .join("");
    content.innerHTML = grid + panels;
    content.querySelectorAll(".tile").forEach((t) => t.addEventListener("click", () => this._open(Number(t.dataset.i))));
    content.querySelectorAll(".back").forEach((b) => b.addEventListener("click", () => this._open(null)));
    // Any touch inside a room restarts the auto-return timer.
    content.querySelectorAll(".room").forEach((el) => el.addEventListener("pointerdown", () => this._armTimeout()));
    this._show();
    // Mount the room cards in the background so a tap only switches visibility.
    content.querySelectorAll(".room").forEach(async (el, i) => {
      const room = rooms[i];
      for (const [sel, configs] of [[".main", room.main], [".side", room.side], [".actions", room.actions]]) {
        const host = el.querySelector(sel);
        if (host) for (const card of await this._makeCards(configs)) host.append(card);
      }
    });
  }
}
