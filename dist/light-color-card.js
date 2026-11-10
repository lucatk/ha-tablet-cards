// custom:light-color-card — colour wheel and colour-temperature slider for
// one or more lights, shown in place (no more-info dialog).

import { press, ensureShell, esc } from "./shared.js";

// The wheel is pure CSS: a conic hue gradient (0° = right, clockwise, matching
// atan2 in screen coordinates) under a radial white-to-transparent fade for
// saturation. Drawing it per pixel took ~0.4 s on the tablet.
const WHEEL_BG =
  "radial-gradient(circle closest-side, #fff, rgba(255,255,255,0) 100%)," +
  "conic-gradient(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

export function hsToRgb(h, s) {
  h = ((h % 360) + 360) % 360;
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return 255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [Math.round(f(5)), Math.round(f(3)), Math.round(f(1))];
}

const supportsColor = (st) =>
  (st?.attributes?.supported_color_modes ?? []).some((m) => ["hs", "xy", "rgb", "rgbw", "rgbww"].includes(m));
// Hue scene names as Home Assistant reports them, in German.
const SCENE_DE = { Relax: "Entspannen", Concentrate: "Konzentrieren", Energize: "Aktivieren", Read: "Lesen",
  Nightlight: "Nachtlicht", Rest: "Ruhe", "Natural light": "Natürliches Licht", Bright: "Hell",
  Dimmed: "Gedimmt", "All Bright": "Alles hell" };

const supportsTemp = (st) => (st?.attributes?.supported_color_modes ?? []).includes("color_temp");

export class LightColorCard extends HTMLElement {
  setConfig(config) {
    const entities = config.entities ?? (config.entity ? [config.entity] : []);
    if (!entities.length) throw new Error("light-color-card: `entities` required");
    this._config = { names: {}, ...config, entities };
    this._selected = "all";
    this._mode = "color";
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 6;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  /** Hue scenes of `scene_group` (scene entities whose group_name matches the group light). */
  _scenes() {
    const group = this._hass?.states[this._config.scene_group];
    if (!group) return [];
    const name = group.attributes.friendly_name;
    return Object.values(this._hass.states)
      .filter((st) => st.entity_id.startsWith("scene.") && st.attributes.group_name === name)
      .map((st) => ({ entity: st.entity_id, name: SCENE_DE[st.attributes.name] ?? st.attributes.name ?? st.entity_id }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  _targets() {
    return this._selected === "all" ? this._config.entities : [this._selected];
  }

  _call(data) {
    this._hass.callService("light", "turn_on", { entity_id: this._targets(), ...data });
  }

  _build(content) {
    const many = this._config.entities.length > 1;
    const scenes = this._scenes();
    this._sceneKey = JSON.stringify(scenes);
    const chips = many ? ["all", ...this._config.entities].map((e) => `<button class="chip" data-e="${esc(e)}"></button>`) : [];
    if (scenes.length) chips.push(`<button class="chip mode"><ha-icon icon="mdi:palette-swatch"></ha-icon>Szenen</button>`);
    content.innerHTML = `
      ${chips.length ? `<div class="chips">${chips.join("")}</div>` : ""}
      <div class="scenes">${scenes
        .map((sc) => `<button class="scene" data-s="${esc(sc.entity)}">${esc(sc.name)}</button>`).join("")}</div>
      <div class="pick">
        <div class="wheel"><div class="disc"></div><div class="dot"></div></div>
        <div class="temp"><div class="knob"></div></div>
        <div class="bright">
          <button class="power"><ha-icon icon="mdi:power"></ha-icon></button>
          <div class="bbar"><div class="blevel"></div></div>
        </div>
      </div>`;
    content.querySelectorAll(".chip[data-e]").forEach((b) =>
      b.addEventListener("click", () => {
        this._selected = b.dataset.e;
        this._mode = "color";
        this._render();
      }),
    );
    content.querySelector(".chip.mode")?.addEventListener("click", () => {
      this._mode = this._mode === "scenes" ? "color" : "scenes";
      this._render();
    });
    content.querySelectorAll(".scene").forEach((b) =>
      b.addEventListener("click", () => {
        this._hass.callService("scene", "turn_on", { entity_id: b.dataset.s });
        content.querySelectorAll(".scene").forEach((x) => x.classList.toggle("on", x === b));
      }),
    );
    const wheel = content.querySelector(".wheel");
    const pick = (ev, commit) => {
      const rect = wheel.getBoundingClientRect();
      const dx = ev.clientX - rect.left - rect.width / 2;
      const dy = ev.clientY - rect.top - rect.height / 2;
      const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const s = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (rect.width / 2));
      this._dragging = !commit;
      this._preview = { h, s };
      this._placeDot();
      if (commit) this._call({ hs_color: [Math.round(h), Math.round(s * 100)] });
    };
    dragHandler(wheel, (ev) => pick(ev, false), (ev) => pick(ev, true));
    const temp = content.querySelector(".temp");
    const pickTemp = (ev, commit) => {
      const rect = temp.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (rect.bottom - ev.clientY) / rect.height));
      this._dragging = !commit;
      this._tempPreview = t;
      this._placeKnob();
      if (commit) {
        const [min, max] = this._kelvinRange();
        this._call({ color_temp_kelvin: Math.round(min + t * (max - min)) });
      }
    };
    dragHandler(temp, (ev) => pickTemp(ev, false), (ev) => pickTemp(ev, true));
    // Power and brightness for a single selected member of a group.
    content.querySelector(".power").addEventListener("click", () =>
      this._hass.callService("light", "toggle", { entity_id: this._targets() }),
    );
    const bbar = content.querySelector(".bbar");
    const pickBright = (ev, commit) => {
      const rect = bbar.getBoundingClientRect();
      const pct = Math.max(1, Math.min(100, Math.round(((rect.bottom - ev.clientY) / rect.height) * 100)));
      this._dragging = !commit;
      this._brightPreview = commit ? undefined : pct;
      this._placeBright(pct);
      if (commit) this._call({ brightness_pct: pct });
    };
    dragHandler(bbar, (ev) => pickBright(ev, false), (ev) => pickBright(ev, true));
  }

  _placeBright(pct) {
    const st = this._primary();
    const on = st?.state === "on";
    const level = pct ?? (on ? Math.round(((st.attributes.brightness ?? 255) / 255) * 100) : 0);
    this.shadowRoot.querySelector(".blevel").style.height = `${level}%`;
    this.shadowRoot.querySelector(".power").classList.toggle("on", on || pct !== undefined);
  }

  _kelvinRange() {
    const st = this._targets().map((e) => this._hass.states[e]).find(supportsTemp);
    return [st?.attributes?.min_color_temp_kelvin ?? 2200, st?.attributes?.max_color_temp_kelvin ?? 6500];
  }

  _primary() {
    return this._hass?.states[this._targets()[0]];
  }

  _placeDot() {
    const dot = this.shadowRoot.querySelector(".dot");
    const st = this._primary();
    const hs = this._preview ?? (st?.attributes?.hs_color ? { h: st.attributes.hs_color[0], s: st.attributes.hs_color[1] / 100 } : null);
    if (!hs || (!this._preview && st?.state !== "on")) return void (dot.style.display = "none");
    const a = (hs.h * Math.PI) / 180;
    dot.style.display = "block";
    dot.style.left = `${50 + Math.cos(a) * hs.s * 50}%`;
    dot.style.top = `${50 + Math.sin(a) * hs.s * 50}%`;
    dot.style.background = `rgb(${hsToRgb(hs.h, hs.s).join(",")})`;
  }

  _placeKnob() {
    const knob = this.shadowRoot.querySelector(".knob");
    const st = this._primary();
    let t = this._tempPreview;
    if (t === undefined && st?.state === "on" && st.attributes.color_mode === "color_temp") {
      const [min, max] = this._kelvinRange();
      t = (st.attributes.color_temp_kelvin - min) / (max - min);
    }
    knob.style.display = t === undefined ? "none" : "block";
    if (t !== undefined) knob.style.top = `${(1 - t) * 100}%`;
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const content = ensureShell(this.shadowRoot, `
      :host { display: block; height: 100%; }
      ha-card { height: 100%; box-sizing: border-box; padding: 8px 4px 4px; background: none; border: none; box-shadow: none; }
      .content { height: 100%; display: flex; flex-direction: column; gap: 12px; }
      .chips { flex: none; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
      .chip { flex: none; font: inherit; font-size: 16px; color: #fff; border: none; border-radius: 999px; padding: 8px 14px;
        background: rgba(255,255,255,0.10); cursor: pointer; white-space: nowrap; }
      .pick { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; gap: 14px; }
      .chip.on { background: #fff; color: #161830; font-weight: 600; }
      .wheel { position: relative; height: 100%; max-height: 300px; aspect-ratio: 1; max-width: calc(100% - 124px); touch-action: none; }
      .disc { width: 100%; height: 100%; border-radius: 50%; background: ${WHEEL_BG}; }
      .dot { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
        border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.5); pointer-events: none; }
      .temp { position: relative; flex: none; width: 44px; height: 100%; max-height: 300px; border-radius: 22px; touch-action: none;
        background: linear-gradient(0deg, #ffa448, #fff1dc 55%, #cfe2ff); }
      .knob { position: absolute; left: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%;
        border: 3px solid #fff; background: transparent; box-shadow: 0 2px 8px rgba(0,0,0,.5); pointer-events: none; }
      .temp.off, .bright.off { display: none; }
      .chip.mode { display: flex; align-items: center; gap: 6px; --mdc-icon-size: 18px; margin-left: auto; }
      .scenes { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
        align-content: start; }
      .scene { font: inherit; font-size: 17px; font-weight: 600; color: #fff; border: none; border-radius: 20px;
        min-height: 56px; padding: 8px 12px; background: rgba(255,255,255,0.10); cursor: pointer; }
      .scene.on { background: #fff; color: #161830; }
      .bright { flex: none; height: 100%; max-height: 300px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .power { flex: none; width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
        background: rgba(255,255,255,0.14); color: #fff; display: grid; place-items: center; --mdc-icon-size: 24px; }
      .power.on { background: #fff; color: #161830; }
      .bbar { flex: 1; width: 44px; border-radius: 22px; background: rgba(255,255,255,0.14); overflow: hidden;
        touch-action: none; display: flex; flex-direction: column; justify-content: flex-end; cursor: pointer; }
      .blevel { width: 100%; background: #f5b041; border-radius: inherit; }
      ${press(".chip, .scene", 0.92)}
      ${press(".power", 0.88)}
    `);
    if (!content.firstChild || JSON.stringify(this._scenes()) !== this._sceneKey) this._build(content);
    const scenesMode = this._mode === "scenes";
    content.querySelector(".scenes").style.display = scenesMode ? "" : "none";
    content.querySelector(".pick").style.display = scenesMode ? "none" : "";
    content.querySelector(".chip.mode")?.classList.toggle("on", scenesMode);
    const names = this._config.names;
    content.querySelectorAll(".chip[data-e]").forEach((b) => {
      const e = b.dataset.e;
      b.textContent = e === "all" ? "Alle" : names[e] ?? this._hass.states[e]?.attributes.friendly_name ?? e;
      b.classList.toggle("on", !scenesMode && e === this._selected);
    });
    if (this._dragging) return;
    const st = this._primary();
    content.querySelector(".wheel").style.display = supportsColor(st) ? "" : "none";
    content.querySelector(".temp").classList.toggle("off", !supportsTemp(st));
    content.querySelector(".bright").classList.toggle("off", this._selected === "all");
    this._placeBright();
    this._preview = undefined;
    this._tempPreview = undefined;
    this._placeDot();
    this._placeKnob();
  }
}

/** Pointer drag: `move` while dragging, `end` once on release. */
export function dragHandler(el, move, end) {
  el.addEventListener("pointerdown", (ev) => {
    el.setPointerCapture(ev.pointerId);
    move(ev);
    const onMove = (e) => move(e);
    const onUp = (e) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      end(e);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });
}
