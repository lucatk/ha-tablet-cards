// custom:tablet-rooms-card — room grid that swaps in place for the room's
// controls (no popups). State is per browser; returns to the grid after
// `timeout_seconds` without a touch. Every room is built once, right after
// the grid, and stays mounted; opening a room only toggles visibility.
//
//
//   rooms:
//     - name: Esstisch
//       icon: mdi:table-chair
//       sections:              titled groups of device tiles, two columns each
//         - title: Licht
//           cards: [<card>, …]
//       main: [<card>, …]      alternative: one untitled group
//       actions: [<card>, …]   optional bottom row, equal-width columns
//
// A tile's arrow (tablet-detail event) opens a side panel next to the tiles,
// which then drop to one column: a colour picker for a light, or the member
// lights of a group (each with its own colour arrow).

import { POP, SPRING, press, ensureShell, esc } from "./shared.js";
import "./light-color-card.js";
import "./tablet-entity-card.js";

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
    this._closeDetail();
    this._room = index;
    this._show();
    this._armTimeout();
  }

  _track(el) {
    el.hass = this._hass;
    this._cards.push(el);
    return el;
  }

  _closeDetail() {
    const room = this._detailRoom;
    if (!room) return;
    const side = room.querySelector(".side");
    side.querySelectorAll(".card > *").forEach((el) => (this._cards = this._cards.filter((c) => c !== el)));
    side.remove();
    room.querySelector(".body").classList.remove("split");
    this._detailOwner && (this._detailOwner.detailOpen = false);
    this._detailRoom = this._detailOwner = undefined;
  }

  /** Side panel for a tile's arrow: colour picker or group members. */
  _openDetail(room, d, back) {
    const sameOwner = this._detailOwner === d.card && !back && this._detailRoom === room;
    this._closeDetail();
    if (sameOwner) return; // second tap on the same arrow closes it
    const side = document.createElement("div");
    side.className = "side";
    side.innerHTML = `
      <div class="side-head">
        ${back ? `<button class="side-back"><ha-icon icon="mdi:chevron-left"></ha-icon></button>` : ""}
        <span>${esc(d.name)}</span>
        <button class="side-close"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <div class="card"></div>`;
    const host = side.querySelector(".card");
    if (d.kind === "members") {
      host.classList.add("members");
      const st = this._hass.states[d.entity];
      for (const member of st?.attributes?.entity_id ?? []) {
        const tile = document.createElement("tablet-entity-card");
        const modes = this._hass.states[member]?.attributes?.supported_color_modes ?? [];
        const colour = modes.some((m) => ["hs", "xy", "rgb", "rgbw", "rgbww", "color_temp"].includes(m));
        tile.setConfig({ entity: member, ...(colour ? { detail: "color" } : {}) });
        tile.style.setProperty("--tablet-tile-height", "80px");
        tile.style.setProperty("--tablet-tile-icon", "none");
        host.append(this._track(tile));
      }
      // Member arrows open that member's colour picker, with a way back here.
      host.addEventListener("tablet-detail", (e) => {
        e.stopPropagation();
        this._openDetail(room, e.detail, d);
      });
    } else {
      const picker = document.createElement("light-color-card");
      // The tile's own light is the Hue group whose scenes the picker offers.
      picker.setConfig({ entities: d.entities ?? [d.entity], names: d.names ?? {}, scene_group: d.entity });
      host.append(this._track(picker));
    }
    side.querySelector(".side-close").addEventListener("click", () => this._closeDetail());
    side.querySelector(".side-back")?.addEventListener("click", () => {
      this._closeDetail();
      this._openDetail(room, back);
    });
    room.querySelector(".body").append(side);
    room.querySelector(".body").classList.add("split");
    this._detailRoom = room;
    this._detailOwner = back?.card ?? d.card;
    this._detailOwner.detailOpen = true;
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
      .room { height: 100%; display: flex; flex-direction: column; gap: 10px; border-radius: 32px; padding: 14px 16px;
        box-sizing: border-box; background: rgba(16, 18, 40, 0.45); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
      [hidden] { display: none !important; }
      .head { display: flex; align-items: center; gap: 18px; flex: none; }
      .back { border: none; font: inherit; font-size: 20px; font-weight: 600; color: #161830; background: #fff;
        border-radius: 999px; height: 44px; padding: 0 20px 0 12px; display: flex; align-items: center; gap: 8px;
        --mdc-icon-size: 28px; cursor: pointer; }
      .title { font-size: 26px; font-weight: 600; display: flex; align-items: center; gap: 12px; --mdc-icon-size: 34px; }
      .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr); gap: 12px; }
      .body.split { grid-template-columns: 1fr 1fr; }
      .main { min-height: 0; display: flex; flex-direction: column; gap: 8px; overflow: auto;
        --tablet-tile-height: 136px; --tablet-media-art: 88px; }
      .sec-title { font-size: 14px; line-height: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em;
        opacity: .7; padding-left: 8px; }
      .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .split .tiles, .one .tiles { grid-template-columns: 1fr; }
      .side { min-height: 0; border-radius: 28px; background: rgba(255,255,255,0.07); display: flex;
        flex-direction: column; padding: 14px; box-sizing: border-box; animation: slide .4s ${SPRING}; }
      .side-head { flex: none; display: flex; align-items: center; gap: 10px; font-size: 21px; font-weight: 600; }
      .side-head span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 6px; }
      .side-head button { width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
        background: rgba(255,255,255,0.14); color: #fff; display: grid; place-items: center; --mdc-icon-size: 28px; }
      .side .card { flex: 1; min-height: 0; }
      .side .card.members { display: flex; flex-direction: column; gap: 10px; overflow: auto; padding-top: 12px; }
      ${press(".tile", 0.95)}
      ${press(".back, .side-head button", 0.9)}
      ${POP}
      .grid:not([hidden]) { animation: pop .45s ${SPRING}; }
      .room:not([hidden]) { animation: pop .45s ${SPRING}; }
      @keyframes slide { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
      .actions { flex: none; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 12px;
        --tablet-action-height: 56px; --tablet-action-dir: row; }
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
      <div class="room${room.columns === 1 ? " one" : ""}" hidden>
        <div class="head">
          <button class="back"><ha-icon icon="mdi:chevron-left"></ha-icon>Zurück</button>
          <div class="title"><ha-icon icon="${esc(room.icon)}"></ha-icon>${esc(room.name)}</div>
        </div>
        <div class="body"><div class="main"></div></div>
        ${room.actions ? `<div class="actions"></div>` : ""}
      </div>`,
      )
      .join("");
    content.innerHTML = grid + panels;
    content.querySelectorAll(".tile").forEach((t) => t.addEventListener("click", () => this._open(Number(t.dataset.i))));
    content.querySelectorAll(".back").forEach((b) => b.addEventListener("click", () => this._open(null)));
    // Any touch inside a room restarts the auto-return timer.
    content.querySelectorAll(".room").forEach((el) => {
      el.addEventListener("pointerdown", () => this._armTimeout());
      el.addEventListener("tablet-detail", (e) => this._openDetail(el, e.detail));
    });
    this._show();
    // Mount the room cards in the background so a tap only switches visibility.
    content.querySelectorAll(".room").forEach(async (el, i) => {
      const room = rooms[i];
      const main = el.querySelector(".main");
      for (const sec of room.sections ?? [{ cards: room.main }]) {
        if (sec.title) main.insertAdjacentHTML("beforeend", `<div class="sec-title">${esc(sec.title)}</div>`);
        const tiles = document.createElement("div");
        tiles.className = "tiles";
        main.append(tiles);
        for (const card of await this._makeCards(sec.cards)) tiles.append(card);
      }
      const actions = el.querySelector(".actions");
      if (actions) for (const card of await this._makeCards(room.actions)) actions.append(card);
    });
  }
}
