// custom:tablet-weather-card — current condition, today's high/low, a 4-day
// forecast, and an iOS-style "rain in the next hour" chart from DWD radar
// (via Bright Sky) that appears only when rain is coming or falling.
//
//   type: custom:tablet-weather-card
//   entity: weather.forecast_home
//   days: 4             daily forecast columns
//   hours: 5            hourly forecast columns
//   switch_seconds: 10  the forecast row alternates between days and hours

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
    this._config = { days: 4, hours: 5, switch_seconds: 10, ...config };
    this._view = "days";
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
    clearInterval(this._viewTimer);
    this._viewTimer = setInterval(() => {
      this._view = this._view === "days" ? "hours" : "days";
      this._render();
    }, Math.max(3, Number(this._config.switch_seconds)) * 1000);
    this._render();
  }

  disconnectedCallback() {
    clearInterval(this._radarTimer);
    clearInterval(this._viewTimer);
    for (const u of [this._unsub, this._unsubHourly]) u?.then((f) => f());
    this._unsub = this._unsubHourly = undefined;
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
    this._unsubHourly = this._hass.connection.subscribeMessage(
      (msg) => {
        this._hourly = msg.forecast ?? [];
        this._render();
      },
      { type: "weather/subscribe_forecast", forecast_type: "hourly", entity_id: this._config.entity },
    );
  }

  /** Forecast columns for the current view: days (high + low) or the next hours. */
  _columns() {
    if (this._view === "hours" && this._hourly?.length) {
      const now = Date.now();
      return this._hourly
        .filter((h) => Date.parse(h.datetime) > now - 30 * 60_000)
        .slice(0, Number(this._config.hours))
        .map((h, i) => ({
          name: i === 0 ? "Jetzt" : `${new Date(h.datetime).getHours()} Uhr`,
          condition: h.condition, hi: h.temperature,
        }));
    }
    return (this._forecast ?? []).slice(0, Number(this._config.days)).map((d, i) => ({
      name: i === 0 ? "Heute" : new Date(d.datetime).toLocaleDateString("de-DE", { weekday: "short" }).replace(".", ""),
      condition: d.condition, hi: d.temperature, lo: d.templow,
    }));
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

  /**
   * iOS-style next-hour precipitation chart: a smooth filled area over three
   * dashed intensity lines (light / moderate / heavy), clock times on the axis.
   */
  _rainHtml() {
    const rain = this._rain ?? [];
    const wet = rain.filter((r) => r.mmh >= 0.1);
    if (!wet.length) return "";
    const fmt = (t) => new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    let label;
    if (rain[0].mmh >= 0.1) {
      // End of the last rain in the window, so short breaks don't end it early.
      const last = wet[wet.length - 1];
      label = last !== rain[rain.length - 1] ? `Regen bis ${fmt(last.t + 5 * 60_000)}` : "Regen hält an";
    } else {
      label = `Regen ab ${fmt(wet[0].t)}`;
    }
    // Intensity → height, piecewise like iOS: light < 2.5 mm/h, moderate < 7.6, heavy above.
    // Light rain gets a visible minimum (iOS shows drizzle as a low hill, not a flat line).
    const level = (mmh) =>
      mmh < 0.1 ? 0
        : mmh < 2.5 ? Math.max(0.16, Math.sqrt(mmh / 2.5) / 3)
          : mmh < 7.6 ? 1 / 3 + ((mmh - 2.5) / 5.1) / 3
            : Math.min(1, 2 / 3 + ((mmh - 7.6) / 12) / 3);
    const W = 200, H = 64, top = 4;
    const t0 = rain[0].t;
    const span = Math.max(1, rain[rain.length - 1].t - t0);
    const pts = rain.map((r) => [((r.t - t0) / span) * W, H - level(r.mmh) * (H - top)]);
    // Catmull-Rom → cubic Bézier for a smooth curve.
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      // Clamp control points to the baseline so the curve never dips below zero.
      const pt = ([x, y]) => `${x.toFixed(1)} ${Math.min(H, y).toFixed(1)}`;
      d += ` C ${pt(c1)} ${pt(c2)} ${pt(p2)}`;
    }
    const grid = [1, 2, 3].map((k) => {
      const y = H - (k / 3) * (H - top);
      return `<line x1="0" x2="${W}" y1="${y}" y2="${y}" />`;
    }).join("");
    return `
      <div class="rain">
        <div class="rain-label">${esc(label)}</div>
        <div class="chart">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
            <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#5ab0ff" stop-opacity=".95"/><stop offset="1" stop-color="#2f80ed" stop-opacity=".35"/>
            </linearGradient></defs>
            <g class="grid">${grid}</g>
            <path class="area" d="${d} L ${W} ${H} L 0 ${H} Z"/>
            <path class="line" d="${d}"/>
          </svg>
        </div>
        <div class="axis">${[0, Math.floor((rain.length - 1) / 2), rain.length - 1].map((i) => `<span>${fmt(rain[i].t)}</span>`).join("")}</div>
      </div>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const st = this._hass.states[this._config.entity];
    const content = ensureShell(this.shadowRoot, `
      :host { display: block; height: 100%; }
      ha-card { height: 100%; box-sizing: border-box; padding: 15px 20px; color: #fff; }
      .content { height: 100%; display: flex; flex-direction: column; justify-content: space-between; }
      .now { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
      .cond { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .cond ha-icon { --mdc-icon-size: 34px; }
      .cond-text { font-size: 19px; font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; }
      .temps { flex: none; text-align: right; }
      .temp { font-size: 38px; font-weight: 300; line-height: 1; letter-spacing: -0.02em; }
      .hilo { display: flex; gap: 8px; justify-content: flex-end; font-size: 16px; font-weight: 500; opacity: .85;
        margin-top: 6px; --mdc-icon-size: 15px; }
      .hilo span { display: inline-flex; align-items: center; }
      .rain { flex: none; width: 158px; }
      .rain-label { font-size: 14px; line-height: 17px; font-weight: 700; white-space: nowrap; color: #fff; margin-bottom: 6px; }
      .chart { position: relative; height: 34px; }
      .chart svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
      .grid line { stroke: rgba(255,255,255,.28); stroke-width: 1; stroke-dasharray: 2 3; vector-effect: non-scaling-stroke; }
      .area { fill: url(#rg); }
      .line { fill: none; stroke: #8cc8ff; stroke-width: 2; vector-effect: non-scaling-stroke; }
      .axis { display: flex; justify-content: space-between; font-size: 12px; line-height: 14px; font-weight: 500; opacity: .7; margin-top: 4px; }
      .days { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; }
      .days.swap { animation: swap .6s ease-out; }
      @keyframes swap { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      .day { display: flex; flex-direction: column; align-items: center; gap: 1px; line-height: 1.15; }
      .day .dname { font-size: 14px; font-weight: 500; opacity: .75; }
      .day ha-icon { --mdc-icon-size: 26px; display: block; height: 26px; }
      .day .t { display: flex; gap: 8px; align-items: baseline; }
      .day .hi { font-size: 17px; font-weight: 600; }
      .day .lo { font-size: 15px; opacity: .55; }
    `);
    if (!st) return void (content.textContent = "Wetter nicht gefunden");
    const [label, icon, color] = cond(st.state);
    const days = (this._forecast ?? []).slice(0, Number(this._config.days));
    const today = days[0];
    const dayName = (iso, i) => (i === 0 ? "Heute" : new Date(iso).toLocaleDateString("de-DE", { weekday: "short" }).replace(".", ""));
    const html = `
      <div class="now">
        <div class="cond">
          <ha-icon icon="${icon}" style="color:${color}"></ha-icon>
          <div class="cond-text">${esc(label)}</div>
        </div>
        <div class="temps">
          <div class="temp">${deg(st.attributes.temperature)}</div>
          <div class="hilo">
            <span><ha-icon icon="mdi:arrow-up"></ha-icon>${deg(today?.temperature)}</span>
            <span><ha-icon icon="mdi:arrow-down"></ha-icon>${deg(today?.templow)}</span>
          </div>
        </div>
        ${this._rainHtml()}
      </div>
      <div class="days ${this._view}">${this._columns()
        .map((c) => {
          const [, dIcon, dColor] = cond(c.condition);
          return `<div class="day"><span class="dname">${esc(c.name)}</span>
            <ha-icon icon="${dIcon}" style="color:${dColor}"></ha-icon>
            <span class="t"><span class="hi">${deg(c.hi)}</span>${c.lo !== undefined ? `<span class="lo">${deg(c.lo)}</span>` : ""}</span></div>`;
        })
        .join("")}</div>`;
    if (html !== this._html) {
      this._html = html;
      content.innerHTML = html;
      // Fade the forecast row in when it switches between days and hours.
      if (this._shownView !== this._view) content.querySelector(".days")?.classList.add("swap");
      this._shownView = this._view;
    }
  }
}
