// custom:tablet-media-card — media player tile. Idle/off: a normal tile with
// the state. Playing or paused: spans the full row and shows artwork, title,
// artist, previous / play-pause / next and a volume bar (drag to set).

import { ensureShell, esc } from "./shared.js";
import { dragHandler } from "./light-color-card.js";

const ACTIVE = ["playing", "paused", "buffering"];

export class TabletMediaCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("tablet-media-card: `entity` required");
    this._config = config;
    this._mode = undefined;
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  _call(service, data = {}) {
    this._hass.callService("media_player", service, { entity_id: this._config.entity, ...data });
  }

  _build(content, mode) {
    if (mode === "idle") {
      content.innerHTML = `
        <div class="tile">
          <div class="icon"><ha-state-icon></ha-state-icon></div>
          <div class="name"></div><div class="state"></div>
        </div>`;
      return;
    }
    content.innerHTML = `
      <div class="player">
        <div class="art"></div>
        <div class="meta">
          <div class="name"></div>
          <div class="title"></div>
          <div class="artist"></div>
          <div class="controls">
            <button data-s="media_previous_track"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
            <button class="main" data-s="media_play_pause"><ha-icon></ha-icon></button>
            <button data-s="media_next_track"><ha-icon icon="mdi:skip-next"></ha-icon></button>
            <div class="volume"><ha-icon icon="mdi:volume-high"></ha-icon><div class="bar"><div class="level"></div></div></div>
          </div>
        </div>
      </div>`;
    content.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => this._call(b.dataset.s)));
    const bar = content.querySelector(".bar");
    const level = (e) => {
      const r = bar.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    dragHandler(
      bar,
      (e) => {
        this._dragVolume = level(e);
        this._paint();
      },
      (e) => {
        this._call("volume_set", { volume_level: Math.round(level(e) * 100) / 100 });
        this._dragVolume = undefined;
      },
    );
  }

  _paint() {
    const st = this._hass.states[this._config.entity];
    const root = this.shadowRoot;
    const name = this._config.name ?? st?.attributes?.friendly_name ?? this._config.entity;
    root.querySelector(".name").textContent = name;
    if (this._mode === "idle") {
      const icon = root.querySelector("ha-state-icon");
      icon.hass = this._hass;
      icon.stateObj = st;
      root.querySelector(".state").textContent = st ? this._hass.formatEntityState?.(st) ?? st.state : "Nicht gefunden";
      return;
    }
    const a = st.attributes;
    root.querySelector(".title").textContent = a.media_title ?? "";
    root.querySelector(".artist").textContent = [a.media_artist, a.media_album_name].filter(Boolean).join(" · ");
    const art = root.querySelector(".art");
    const pic = a.entity_picture ?? "";
    if (art.dataset.src !== pic) {
      art.dataset.src = pic;
      art.innerHTML = pic ? `<img src="${esc(pic)}" alt="">` : `<ha-icon icon="mdi:music"></ha-icon>`;
    }
    root.querySelector(".main ha-icon").icon = st.state === "playing" ? "mdi:pause" : "mdi:play";
    const vol = this._dragVolume ?? a.volume_level ?? 0;
    root.querySelector(".level").style.width = `${vol * 100}%`;
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const st = this._hass.states[this._config.entity];
    const mode = st && ACTIVE.includes(st.state) ? "active" : "idle";
    // Take the whole row of the room's two-column grid while playing.
    this.style.gridColumn = mode === "active" ? "1 / -1" : "";
    const content = ensureShell(this.shadowRoot, `
      :host { display: block; }
      ha-card { background: none; border: none; box-shadow: none; color: #fff; }
      .tile { height: var(--tablet-tile-height, 128px); border-radius: 28px; background: rgba(255,255,255,0.09);
        padding: 0 22px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
      .icon { width: 50px; height: 50px; border-radius: 50%; background: rgba(255,255,255,0.14);
        display: grid; place-items: center; --mdc-icon-size: 30px; margin-bottom: 4px; }
      .name { font-size: 23px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .state, .artist { font-size: 18px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .player { border-radius: 28px; background: rgba(255,255,255,0.09); padding: 16px; box-sizing: border-box;
        display: flex; gap: 22px; align-items: center; }
      .art { flex: none; width: var(--tablet-media-art, 176px); height: var(--tablet-media-art, 176px); border-radius: 20px; overflow: hidden;
        background: rgba(255,255,255,0.1); display: grid; place-items: center; --mdc-icon-size: 64px; }
      .art img { width: 100%; height: 100%; object-fit: cover; }
      .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
      .player .name { font-size: 16px; font-weight: 500; opacity: .7; text-transform: uppercase; letter-spacing: .06em; }
      .title { font-size: 24px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .controls { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
      .controls button { width: 52px; height: 52px; border-radius: 50%; border: none; cursor: pointer;
        background: rgba(255,255,255,0.14); color: #fff; display: grid; place-items: center; --mdc-icon-size: 32px; }
      .controls button.main { background: #fff; color: #161830; }
      .volume { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; margin-left: 8px; --mdc-icon-size: 24px; }
      .bar { flex: 1; height: 28px; border-radius: 14px; background: rgba(255,255,255,0.14); overflow: hidden; touch-action: none; }
      .level { height: 100%; background: rgba(255,255,255,0.85); }
    `);
    if (this._mode !== mode) {
      this._mode = mode;
      this._build(content, mode);
    }
    this._paint();
  }
}
