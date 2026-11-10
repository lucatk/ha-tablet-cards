// custom:tablet-entity-card — one large tile per entity, in the room-button
// style (icon above name and state).
//   dimmable light: tap toggles, drag sideways sets brightness (fill = level)
//   light / switch: tap toggles
//   anything else:  state only
// `detail: color | members` adds an arrow on the right. Tapping it fires a
// `tablet-detail` event that tablet-rooms-card turns into a side panel
// (colour picker, or the member lights of a group). For a group light,
// `color_entities` / `color_names` give the picker one chip per member
// plus "Alle".
// custom:tablet-action-card — large button that calls a service
// (`pill: true` for a right-aligned round icon button with its label to the left).

import { press, ensureShell, esc } from "./shared.js";
import { dragHandler } from "./light-color-card.js";

const TILE_CSS = `
  :host { display: block; }
  ha-card { background: none; border: none; box-shadow: none; }
  .tile { position: relative; overflow: hidden; isolation: isolate; height: var(--tablet-tile-height, 128px); border-radius: 28px;
    background: rgba(255,255,255,0.09); color: #fff; display: flex; align-items: center;
    padding: 0 18px 0 26px; box-sizing: border-box; user-select: none; touch-action: pan-y; cursor: pointer; }
  .fill { position: absolute; inset: 0 auto 0 0; width: 0; border-radius: inherit; background: var(--fill, #f5b041); opacity: .85;
    transition: width .25s ease; }
  .tile.dragging .fill { transition: none; }
  .info { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .icon { width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.14);
    display: var(--tablet-tile-icon, grid); place-items: center; --mdc-icon-size: 26px; margin-bottom: 2px; }
  .tile.on .icon { background: rgba(255,255,255,0.92); color: #222; }
  .name { font-size: 23px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .state { font-size: 18px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile.on .name, .tile.on .state { text-shadow: 0 1px 3px rgba(0,0,0,.45); }
  .tile.static { cursor: default; }
  .arrow { position: relative; flex: none; width: 56px; height: 56px; border-radius: 50%; border: none;
    background: rgba(0,0,0,0.22); color: #fff; display: grid; place-items: center; --mdc-icon-size: 32px;
    cursor: pointer; margin-left: 8px; }
  .arrow.open { background: #fff; color: #161830; }
  ${press(".tile", 0.96)}
  ${press(".arrow", 0.88)}
`;

// The tablet's HA user is set to German, but other viewers may not be.
export const GERMAN = { on: "An", off: "Aus", unavailable: "Nicht verfügbar", unknown: "Unbekannt",
  idle: "Leerlauf", playing: "Spielt", paused: "Pausiert", standby: "Standby" };

export class TabletEntityCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("tablet-entity-card: `entity` required");
    this._config = config;
    this._builtKind = undefined;
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 2;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  /** Highlight the arrow while this tile's side panel is open. */
  set detailOpen(open) {
    this.shadowRoot?.querySelector(".arrow")?.classList.toggle("open", open);
  }

  _kind(st) {
    const domain = this._config.entity.split(".")[0];
    const modes = st?.attributes?.supported_color_modes ?? [];
    if (domain === "light" && modes.some((m) => m !== "onoff")) return "dimmer";
    if (["light", "switch", "fan", "input_boolean"].includes(domain)) return "toggle";
    return "static";
  }

  _build(content, kind) {
    const detail = this._config.detail;
    content.innerHTML = `
      <div class="tile ${kind}">
        <div class="fill"></div>
        <div class="info">
          <div class="icon"><ha-state-icon></ha-state-icon></div>
          <div class="name"></div><div class="state"></div>
        </div>
        ${detail ? `<button class="arrow"><ha-icon icon="mdi:chevron-right"></ha-icon></button>` : ""}
      </div>`;
    const tile = content.querySelector(".tile");
    const arrow = content.querySelector(".arrow");
    if (arrow) {
      // Keep the tile's own tap/drag handling out of the arrow.
      arrow.addEventListener("pointerdown", (e) => e.stopPropagation());
      arrow.addEventListener("click", (e) => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent("tablet-detail", {
          bubbles: true, composed: true,
          detail: {
            entity: this._config.entity, name: this._name(), kind: detail, card: this,
            entities: this._config.color_entities, names: this._config.color_names,
          },
        }));
      });
    }
    if (kind === "toggle") {
      tile.addEventListener("click", () => this._hass.callService("homeassistant", "toggle", { entity_id: this._config.entity }));
    }
    if (kind === "dimmer") {
      // Tap toggles; a horizontal drag sets the brightness.
      let startX = 0;
      let moved = false;
      tile.addEventListener("pointerdown", (e) => {
        startX = e.clientX;
        moved = false;
      });
      const level = (e) => {
        const r = tile.getBoundingClientRect();
        return Math.max(1, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
      };
      dragHandler(
        tile,
        (e) => {
          if (Math.abs(e.clientX - startX) > 10) moved = true;
          if (!moved) return;
          tile.classList.add("dragging");
          this._dragLevel = level(e);
          this._paint();
        },
        (e) => {
          tile.classList.remove("dragging");
          if (moved) {
            this._hass.callService("light", "turn_on", { entity_id: this._config.entity, brightness_pct: level(e) });
          } else {
            this._hass.callService("light", "toggle", { entity_id: this._config.entity });
          }
          this._dragLevel = undefined;
        },
      );
    }
  }

  _name() {
    const st = this._hass?.states[this._config.entity];
    return this._config.name ?? st?.attributes?.friendly_name ?? this._config.entity;
  }

  _stateText(st, kind) {
    if (!st) return "Nicht gefunden";
    if (this._dragLevel !== undefined) return `${this._dragLevel} %`;
    if (kind === "dimmer" && st.state === "on") {
      return `${Math.round(((st.attributes.brightness ?? 255) / 255) * 100)} %`;
    }
    return GERMAN[st.state] ?? (this._hass.formatEntityState ? this._hass.formatEntityState(st) : st.state);
  }

  _paint() {
    const st = this._hass.states[this._config.entity];
    const kind = this._kind(st);
    const tile = this.shadowRoot.querySelector(".tile");
    const on = st?.state === "on";
    const pct = this._dragLevel ?? (kind === "dimmer" && on ? ((st.attributes.brightness ?? 255) / 255) * 100 : on ? 100 : 0);
    const rgb = st?.attributes?.rgb_color;
    tile.style.setProperty("--fill", rgb ? `rgb(${rgb.join(",")})` : "#f5b041");
    tile.querySelector(".fill").style.width = kind === "static" ? "0" : `${pct}%`;
    tile.classList.toggle("on", on || this._dragLevel !== undefined);
    tile.querySelector(".state").textContent = this._stateText(st, kind);
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const st = this._hass.states[this._config.entity];
    const kind = this._kind(st);
    const content = ensureShell(this.shadowRoot, TILE_CSS);
    if (this._builtKind !== kind) {
      this._build(content, kind);
      this._builtKind = kind;
    }
    const icon = content.querySelector("ha-state-icon");
    icon.hass = this._hass;
    icon.stateObj = st;
    if (this._config.icon) icon.icon = this._config.icon;
    content.querySelector(".name").textContent = this._name();
    this._paint();
  }
}

export class TabletActionCard extends HTMLElement {
  setConfig(config) {
    if (!config.action) throw new Error("tablet-action-card: `action` required (domain.service)");
    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
  }

  getCardSize() {
    return 1;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const c = this._config;
    const content = ensureShell(this.shadowRoot, `
      :host { display: block; height: 100%; }
      ha-card { height: 100%; background: none; border: none; box-shadow: none; }
      button { width: 100%; height: 100%; min-height: var(--tablet-action-height, 104px); border: none; border-radius: 28px; cursor: pointer;
        background: rgba(255,255,255,0.09); color: #fff; font: inherit; font-size: 20px; font-weight: 600;
        display: flex; flex-direction: var(--tablet-action-dir, column); align-items: center; justify-content: center; gap: 8px;
        --mdc-icon-size: 30px; transition: background .2s; }
      button:active, button.done { background: rgba(255,255,255,0.28); }
      :host([pill]) { display: flex; justify-content: flex-end; align-items: center; }
      :host([pill]) ha-card { height: auto; }
      :host([pill]) .content { display: flex; align-items: center; gap: 14px; }
      :host([pill]) .label { font-size: 19px; font-weight: 600; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,.5);
        cursor: pointer; padding: 14px 0 14px 14px; user-select: none; }
      :host([pill]) button { width: 52px; height: 52px; min-height: 0; padding: 0; border-radius: 50%;
        --mdc-icon-size: 28px; background: rgba(16, 18, 40, 0.55);
        backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
      :host([pill]) button:active, :host([pill]) button.done { background: rgba(255,255,255,0.35); }
      ${press("button", 0.93)}
    `);
    this.toggleAttribute("pill", !!c.pill);
    const icon = c.icon ? `<ha-icon icon="${esc(c.icon)}"></ha-icon>` : "";
    content.innerHTML = c.pill
      ? `<span class="label">${esc(c.name ?? "")}</span><button aria-label="${esc(c.name ?? "")}">${icon}</button>`
      : `<button>${icon}<span>${esc(c.name ?? "")}</span></button>`;
    const btn = content.querySelector("button");
    // In pill mode the label is part of the tap target too.
    content.querySelector(".label")?.addEventListener("click", () => btn.click());
    btn.addEventListener("click", () => {
      const [domain, service] = c.action.split(".");
      this._hass.callService(domain, service, c.data ?? {}, c.target);
      btn.classList.add("done");
      setTimeout(() => btn.classList.remove("done"), 600);
    });
  }
}
