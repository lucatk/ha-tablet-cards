// custom:tablet-entity-card — one large pill row per entity.
//   dimmable light: tap toggles, drag sets brightness (the fill is the level)
//   light / switch: tap toggles
//   anything else:  state only
// custom:tablet-action-card — large button that calls a service.

import { ensureShell, esc } from "./shared.js";
import { dragHandler } from "./light-color-card.js";

const PILL_CSS = `
  :host { display: block; }
  ha-card { background: none; border: none; box-shadow: none; }
  .pill { position: relative; overflow: hidden; height: var(--tablet-row-height, 76px); border-radius: 999px;
    background: rgba(255,255,255,0.09); color: #fff; display: flex; align-items: center; gap: 16px;
    padding: 0 26px 0 10px; box-sizing: border-box; user-select: none; touch-action: pan-y; cursor: pointer; }
  .fill { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--fill, #f5b041); opacity: .9;
    transition: width .25s ease; }
  .pill.dragging .fill { transition: none; }
  .icon { position: relative; flex: none; width: 56px; height: 56px; border-radius: 50%;
    background: rgba(255,255,255,0.14); display: grid; place-items: center; --mdc-icon-size: 30px; }
  .pill.on .icon { background: rgba(255,255,255,0.9); color: #222; }
  .text { position: relative; min-width: 0; flex: 1; }
  .name { font-size: 22px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .state { font-size: 17px; opacity: .75; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pill.on.dim .name, .pill.on.dim .state { text-shadow: 0 1px 3px rgba(0,0,0,.45); }
  .pill.static { cursor: default; }
`;

export class TabletEntityCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("tablet-entity-card: `entity` required");
    this._config = config;
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 1;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  _kind(st) {
    const domain = this._config.entity.split(".")[0];
    const modes = st?.attributes?.supported_color_modes ?? [];
    if (domain === "light" && modes.some((m) => m !== "onoff")) return "dimmer";
    if (domain === "light" || domain === "switch" || domain === "fan" || domain === "input_boolean") return "toggle";
    return "static";
  }

  _build(content, kind) {
    content.innerHTML = `
      <div class="pill ${kind}">
        <div class="fill"></div>
        <div class="icon"><ha-state-icon></ha-state-icon></div>
        <div class="text"><div class="name"></div><div class="state"></div></div>
      </div>`;
    const pill = content.querySelector(".pill");
    if (kind === "toggle") {
      pill.addEventListener("click", () => this._hass.callService("homeassistant", "toggle", { entity_id: this._config.entity }));
    }
    if (kind === "dimmer") {
      // Tap toggles; a horizontal drag sets the brightness.
      let startX = 0;
      let moved = false;
      pill.addEventListener("pointerdown", (e) => {
        startX = e.clientX;
        moved = false;
      });
      const level = (e) => {
        const r = pill.getBoundingClientRect();
        return Math.max(1, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
      };
      dragHandler(
        pill,
        (e) => {
          if (Math.abs(e.clientX - startX) > 10) moved = true;
          if (!moved) return;
          pill.classList.add("dragging");
          this._dragLevel = level(e);
          this._paint();
        },
        (e) => {
          pill.classList.remove("dragging");
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

  _stateText(st, kind) {
    if (!st) return "Nicht gefunden";
    if (this._dragLevel !== undefined) return `${this._dragLevel} %`;
    if (kind === "dimmer" && st.state === "on") {
      return `${Math.round(((st.attributes.brightness ?? 255) / 255) * 100)} %`;
    }
    const media = st.attributes.media_title;
    const text = this._hass.formatEntityState ? this._hass.formatEntityState(st) : st.state;
    return st.entity_id.startsWith("media_player.") && media && st.state === "playing" ? `${text} · ${media}` : text;
  }

  _paint() {
    const st = this._hass.states[this._config.entity];
    const kind = this._kind(st);
    const pill = this.shadowRoot.querySelector(".pill");
    const on = st?.state === "on";
    const pct = this._dragLevel ?? (kind === "dimmer" && on ? ((st.attributes.brightness ?? 255) / 255) * 100 : on ? 100 : 0);
    const rgb = st?.attributes?.rgb_color;
    pill.style.setProperty("--fill", rgb ? `rgb(${rgb.join(",")})` : "#f5b041");
    pill.querySelector(".fill").style.width = kind === "static" ? "0" : `${pct}%`;
    pill.classList.toggle("on", on || this._dragLevel !== undefined);
    pill.classList.toggle("dim", kind !== "static");
    pill.querySelector(".state").textContent = this._stateText(st, kind);
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const st = this._hass.states[this._config.entity];
    const kind = this._kind(st);
    const content = ensureShell(this.shadowRoot, PILL_CSS);
    if (this._builtKind !== kind) {
      this._build(content, kind);
      this._builtKind = kind;
    }
    const icon = content.querySelector("ha-state-icon");
    icon.hass = this._hass;
    icon.stateObj = st;
    if (this._config.icon) icon.icon = this._config.icon;
    content.querySelector(".name").textContent = this._config.name ?? st?.attributes?.friendly_name ?? this._config.entity;
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
      button { width: 100%; height: 100%; min-height: 96px; border: none; border-radius: 28px; cursor: pointer;
        background: rgba(255,255,255,0.09); color: #fff; font: inherit; font-size: 19px; font-weight: 600;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
        --mdc-icon-size: 34px; transition: background .2s; }
      button:active, button.done { background: rgba(255,255,255,0.28); }
    `);
    content.innerHTML = `<button>${c.icon ? `<ha-icon icon="${esc(c.icon)}"></ha-icon>` : ""}<span>${esc(c.name ?? "")}</span></button>`;
    const btn = content.querySelector("button");
    btn.addEventListener("click", () => {
      const [domain, service] = c.action.split(".");
      this._hass.callService(domain, service, c.data ?? {}, c.target);
      btn.classList.add("done");
      setTimeout(() => btn.classList.remove("done"), 600);
    });
  }
}
