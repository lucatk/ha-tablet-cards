// custom:light-color-card — colour wheel and colour-temperature slider for
// one or more lights, shown in place (no more-info dialog).

import { ensureShell, esc } from "./shared.js";

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
const supportsTemp = (st) => (st?.attributes?.supported_color_modes ?? []).includes("color_temp");

export class LightColorCard extends HTMLElement {
  setConfig(config) {
    const entities = config.entities ?? (config.entity ? [config.entity] : []);
    if (!entities.length) throw new Error("light-color-card: `entities` required");
    this._config = { names: {}, ...config, entities };
    this._selected = "all";
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

  _targets() {
    return this._selected === "all" ? this._config.entities : [this._selected];
  }

  _call(data) {
    this._hass.callService("light", "turn_on", { entity_id: this._targets(), ...data });
  }

  _build(content) {
    const many = this._config.entities.length > 1;
    content.innerHTML = `
      ${many ? `<div class="chips">${["all", ...this._config.entities]
        .map((e) => `<button class="chip" data-e="${esc(e)}"></button>`).join("")}</div>` : ""}
      <div class="pick">
        <div class="wheel"><div class="disc"></div><div class="dot"></div></div>
        <div class="temp"><div class="knob"></div></div>
      </div>`;
    content.querySelectorAll(".chip").forEach((b) =>
      b.addEventListener("click", () => {
        this._selected = b.dataset.e;
        this._render();
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
      .pick { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; gap: 18px; }
      .chip.on { background: #fff; color: #161830; font-weight: 600; }
      .wheel { position: relative; height: 100%; max-height: 300px; aspect-ratio: 1; max-width: calc(100% - 62px); touch-action: none; }
      .disc { width: 100%; height: 100%; border-radius: 50%; background: ${WHEEL_BG}; }
      .dot { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
        border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.5); pointer-events: none; }
      .temp { position: relative; flex: none; width: 44px; height: 100%; max-height: 300px; border-radius: 22px; touch-action: none;
        background: linear-gradient(0deg, #ffa448, #fff1dc 55%, #cfe2ff); }
      .knob { position: absolute; left: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%;
        border: 3px solid #fff; background: transparent; box-shadow: 0 2px 8px rgba(0,0,0,.5); pointer-events: none; }
      .temp.off { display: none; }
    `);
    if (!content.firstChild) this._build(content);
    const names = this._config.names;
    content.querySelectorAll(".chip").forEach((b) => {
      const e = b.dataset.e;
      b.textContent = e === "all" ? "Alle" : names[e] ?? this._hass.states[e]?.attributes.friendly_name ?? e;
      b.classList.toggle("on", e === this._selected);
    });
    if (this._dragging) return;
    const st = this._primary();
    content.querySelector(".wheel").style.display = supportsColor(st) ? "" : "none";
    content.querySelector(".temp").classList.toggle("off", !supportsTemp(st));
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
