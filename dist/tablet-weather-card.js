// custom:tablet-weather-card — current condition, today's high/low, a 4-day
// forecast, and an iOS-style "rain in the next hour" chart from DWD radar
// (via Bright Sky) that appears only when rain is coming or falling.
//
//   type: custom:tablet-weather-card
//   entity: weather.forecast_home
//   days: 4

import { ensureShell, esc } from "./shared.js";

const CONDITIONS = {
  "clear-night": ["Klar", "mdi:weather-night", "#c9d6ff"],
  cloudy: ["Bewölkt", "mdi:weather-cloudy", "#e3e8ef"],
  exceptional: ["Unwetter", "mdi:alert-circle-outline", "#ff8a65"],
  fog: ["Nebel", "mdi:weather-fog", "#cfd8dc"],
  hail: ["Hagel", "mdi:weather-hail", "#b3e5fc"],
  lightning: ["Gewitter", "mdi:weather-lightning", "#ffe082"],
  "lightning-rainy": ["Gewitter", "mdi:weather-lightning-rainy", "#ffe082"],
  partlycloudy: ["Teils bewölkt", "mdi:weather-partly-cloudy", "#ffe08a"],
  pouring: ["Starkregen", "mdi:weather-pouring", "#7fb8ff"],
  rainy: ["Regnerisch", "mdi:weather-rainy", "#8ec5ff"],
  snowy: ["Schnee", "mdi:weather-snowy", "#ffffff"],
  "snowy-rainy": ["Schneeregen", "mdi:weather-snowy-rainy", "#d6ecff"],
  sunny: ["Sonnig", "mdi:weather-sunny", "#ffd23f"],
  windy: ["Windig", "mdi:weather-windy", "#e3e8ef"],
  "windy-variant": ["Windig", "mdi:weather-windy-variant", "#e3e8ef"],
};
const cond = (c) => CONDITIONS[c] ?? [c ?? "", "mdi:weather-cloudy", "#e3e8ef"];
const deg = (t) => (t === undefined || t === null ? "–" : `${Math.round(t)}°`);
const RADAR = "https://api.brightsky.dev/radar";
const RADAR_MINUTES = 60;

export class TabletWeatherCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("tablet-weather-card: `entity` required");
    this._config = { days: 4, ...config };
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._subscribe();
    this._render();
  }

  getCardSize() {
    return 3;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    clearInterval(this._radarTimer);
    this._loadRadar();
    this._radarTimer = setInterval(() => this._loadRadar(), 5 * 60_000);
    this._render();
  }

  disconnectedCallback() {
    clearInterval(this._radarTimer);
    this._unsub?.then((u) => u());
    this._unsub = undefined;
  }

  _subscribe() {
    if (this._unsub || !this._hass) return;
    this._unsub = this._hass.connection.subscribeMessage(
      (msg) => {
        this._forecast = msg.forecast ?? [];
        this._render();
      },
      { type: "weather/subscribe_forecast", forecast_type: "daily", entity_id: this._config.entity },
    );
  }

  /** Next hour of DWD radar precipitation (mm/h per 5 min) for HA's home location. */
  async _loadRadar() {
    const c = this._hass?.config;
    if (!c) return void setTimeout(() => this._loadRadar(), 2000);
    try {
      const url = `${RADAR}?lat=${c.latitude}&lon=${c.longitude}&distance=0&format=plain`;
      const data = await (await fetch(url)).json();
      const now = Date.now();
      this._rain = (data.radar ?? [])
        .map((r) => ({ t: Date.parse(r.timestamp), mmh: (r.precipitation_5?.[0]?.[0] ?? 0) * 0.01 * 12 }))
        .filter((r) => r.t >= now - 5 * 60_000 && r.t <= now + RADAR_MINUTES * 60_000)
        .sort((a, b) => a.t - b.t);
    } catch {
      this._rain = [];
    }
    this._render();
  }

  _rainHtml() {
    const rain = this._rain ?? [];
    const wet = rain.filter((r) => r.mmh >= 0.1);
    if (!wet.length) return "";
    const fmt = (t) => new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const raining = rain[0]?.mmh >= 0.1;
    let label;
    if (raining) {
      // End of the last rain in the window, so short breaks don't end it early.
      const last = wet[wet.length - 1];
      const ends = last !== rain[rain.length - 1] ? last.t + 5 * 60_000 : null;
      label = ends ? `Regen bis ${fmt(ends)}` : "Regen hält an";
    } else {
      label = `Regen ab ${fmt(wet[0].t)}`;
    }
    // Bar height: light < 1 mm/h, moderate < 4, heavy above (log-ish scale like iOS).
    const h = (mmh) => (mmh < 0.1 ? 4 : Math.min(100, 25 + Math.log2(1 + mmh) * 25));
    const bars = rain.map((r) => `<span style="height:${h(r.mmh)}%" class="${r.mmh >= 0.1 ? "wet" : ""}"></span>`).join("");
    return `
      <div class="rain">
        <div class="rain-label"><ha-icon icon="mdi:umbrella"></ha-icon>${esc(label)}</div>
        <div class="bars">${bars}</div>
        <div class="axis"><span>Jetzt</span><span>30</span><span>60 Min</span></div>
      </div>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const st = this._hass.states[this._config.entity];
    const content = ensureShell(this.shadowRoot, `
      :host { display: block; height: 100%; }
      ha-card { height: 100%; box-sizing: border-box; padding: 16px 18px 12px; color: #fff; }
      .content { height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; }
      .now { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .now > ha-icon { --mdc-icon-size: 46px; flex: none; }
      .cond { flex: 1; min-width: 0; font-size: 24px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .temps { flex: none; text-align: right; }
      .temp { font-size: 30px; font-weight: 300; line-height: 1; }
      .hilo { display: flex; gap: 6px; justify-content: flex-end; font-size: 16px; opacity: .85; margin-top: 4px;
        --mdc-icon-size: 16px; }
      .hilo span { display: inline-flex; align-items: center; }
      .rain { flex: none; width: 128px; margin-left: 6px; }
      .rain-label { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; white-space: nowrap;
        --mdc-icon-size: 14px; color: #9fd0ff; }
      .bars { height: 34px; display: flex; align-items: flex-end; gap: 2px; margin-top: 4px;
        border-bottom: 1px solid rgba(255,255,255,0.3); }
      .bars span { flex: 1; border-radius: 2px 2px 0 0; background: rgba(255,255,255,0.25); }
      .bars span.wet { background: #5aa9ff; }
      .axis { display: flex; justify-content: space-between; font-size: 11px; opacity: .7; margin-top: 2px; }
      .days { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; text-align: center; }
      .day { display: flex; flex-direction: column; align-items: center; gap: 2px; }
      .day .dname { font-size: 15px; opacity: .75; }
      .day ha-icon { --mdc-icon-size: 34px; margin: 2px 0; }
      .day .t { display: flex; gap: 8px; align-items: baseline; }
      .day .hi { font-size: 19px; font-weight: 600; }
      .day .lo { font-size: 17px; opacity: .6; }
    `);
    if (!st) return void (content.textContent = "Wetter nicht gefunden");
    const [label, icon, color] = cond(st.state);
    const days = (this._forecast ?? []).slice(0, Number(this._config.days));
    const today = days[0];
    const dayName = (iso, i) => (i === 0 ? "Heute" : new Date(iso).toLocaleDateString("de-DE", { weekday: "short" }).replace(".", ""));
    const html = `
      <div class="now">
        <ha-icon icon="${icon}" style="color:${color}"></ha-icon>
        <div class="cond">${esc(label)}</div>
        <div class="temps">
          <div class="temp">${deg(st.attributes.temperature)}</div>
          <div class="hilo">
            <span><ha-icon icon="mdi:arrow-up-thin"></ha-icon>${deg(today?.temperature)}</span>
            <span><ha-icon icon="mdi:arrow-down-thin"></ha-icon>${deg(today?.templow)}</span>
          </div>
        </div>
        ${this._rainHtml()}
      </div>
      <div class="days">${days
        .map((d, i) => {
          const [, dIcon, dColor] = cond(d.condition);
          return `<div class="day"><span class="dname">${esc(dayName(d.datetime, i))}</span>
            <ha-icon icon="${dIcon}" style="color:${dColor}"></ha-icon>
            <span class="t"><span class="hi">${deg(d.temperature)}</span><span class="lo">${deg(d.templow)}</span></span></div>`;
        })
        .join("")}</div>`;
    if (html !== this._html) {
      this._html = html;
      content.innerHTML = html;
    }
  }
}
