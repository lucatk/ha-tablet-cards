// custom:mvg-departures-card — MVG departure board with station paging.

import { ensureShell, esc } from "./shared.js";
import { fetchDepartures, findStation, parseStop } from "./mvg-api.js";
import { SYSTEM_COLORS, SYSTEM_ICONS, lineColor } from "./mvg-display.js";

export class MvgDeparturesCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config.stops) || config.stops.length === 0) {
      throw new Error("mvg-departures-card: `stops` must be a non-empty list");
    }
    this._config = {
      limit: 3,
      offset_minutes: 0,
      refresh_seconds: 60,
      per_page: 0,
      cycle_seconds: 10,
      font_size: "20px",
      header_text: "Abfahrt in Min.",
      ...config,
    };
    this._stops = config.stops.map((s) => ({ ...parseStop(s), station: null, deps: [], error: null, loading: true }));
    this._page = 0;
    // font_size is baked into the shell CSS; rebuild it on config changes.
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
    if (this.isConnected) this._restart();
  }

  set hass(_hass) {
    // Data comes straight from the MVG API; nothing to read from HA.
  }

  getCardSize() {
    return 4;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._restart();
  }

  disconnectedCallback() {
    this._stop();
  }

  _stop() {
    clearInterval(this._refreshTimer);
    clearInterval(this._cycleTimer);
    clearInterval(this._tickTimer);
    this._abort?.abort();
  }

  _restart() {
    if (!this._config || !this.shadowRoot) return;
    this._stop();
    this._abort = new AbortController();
    const c = this._config;
    this._refreshTimer = setInterval(() => this._refresh(), Math.max(30, Number(c.refresh_seconds)) * 1000);
    this._tickTimer = setInterval(() => this._render(), 15000);
    if (this._pageCount() > 1) {
      this._cycleTimer = setInterval(() => {
        this._page = (this._page + 1) % this._pageCount();
        this._render();
      }, Math.max(3, Number(c.cycle_seconds)) * 1000);
    }
    this._render();
    this._refresh();
  }

  _pageCount() {
    const per = Number(this._config.per_page) || 0;
    return per > 0 && per < this._stops.length ? Math.ceil(this._stops.length / per) : 1;
  }

  async _refresh() {
    const signal = this._abort.signal;
    const c = this._config;
    // Every stop keeps refreshing so off-page stops are already filled in
    // when their page comes up.
    await Promise.all(
      this._stops.map(async (s) => {
        try {
          if (!s.station) {
            s.station = await findStation(s.stop, signal);
            if (!s.station) throw new Error(`Haltestelle "${s.stop}" nicht gefunden.`);
          }
          s.deps = await fetchDepartures(
            s.station.id,
            { limit: Number(c.limit), offset: Number(c.offset_minutes), transportTypes: s.transportTypes },
            signal,
          );
          s.error = null;
        } catch (e) {
          if (signal.aborted) return;
          s.error = e instanceof Error ? e.message : String(e);
        }
        s.loading = false;
      }),
    );
    if (!signal.aborted) this._render();
  }

  _renderRow(d, now) {
    const mins = Math.max(0, Math.round((d.time * 1000 - now) / 60000));
    const late = d.cancelled || (d.realtime && (d.delay ?? 0) > 0);
    const type = d.sev ? "SEV" : d.transportType;
    const icon = SYSTEM_ICONS[type];
    const [bg, fg] = lineColor(d.line, d.transportType);
    return `
      <div class="row${d.cancelled ? " cancelled" : ""}">
        ${icon ? `<img class="sys" src="${icon}" alt="">` : `<span class="badge" style="background:${SYSTEM_COLORS[type] ?? "#444"}">${esc(type[0])}</span>`}
        <span class="badge" style="background:${bg};color:${fg}">${esc(d.line)}</span>
        <span class="dest">${esc(d.destination)}</span>
        <span class="min${late ? " late" : ""}">${d.cancelled ? "—" : mins}</span>
      </div>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const c = this._config;
    const now = Date.now();
    const per = Number(c.per_page) || 0;
    const visible = this._pageCount() > 1 ? this._stops.slice(this._page * per, this._page * per + per) : this._stops;
    const sections = visible
      .map((s) => {
        let body;
        if (s.error) body = `<div class="msg err">⚠ ${esc(s.error)}</div>`;
        else if (s.loading) body = `<div class="msg">Lade…</div>`;
        else if (s.deps.length === 0) body = `<div class="msg">Keine Abfahrten verfügbar.</div>`;
        else body = s.deps.map((d) => this._renderRow(d, now)).join("");
        return `
          <section>
            <div class="head"><span>${esc(s.station?.name ?? s.stop)}</span><span>${esc(c.header_text)}</span></div>
            ${body}
          </section>`;
      })
      .join("");
    const dots =
      this._pageCount() > 1
        ? `<div class="dots">${Array.from({ length: this._pageCount() }, (_, i) => `<span class="${i === this._page ? "on" : ""}"></span>`).join("")}</div>`
        : "";
    ensureShell(this.shadowRoot, `
        :host { display: block; height: 100%; }
        ha-card { height: 100%; box-sizing: border-box; padding: 16px 18px; color: #fff; }
        .content {
          height: 100%; font-size: ${c.font_size}; line-height: 1;
          display: flex; flex-direction: column; justify-content: center; gap: 0.9em;
        }
        section { display: grid; row-gap: 0.45em; }
        .head {
          display: flex; justify-content: space-between; gap: 1em; font-weight: 600;
          border-bottom: 1px solid #fff; padding-bottom: 0.15em; margin-bottom: 0.1em;
        }
        .row { display: grid; grid-template-columns: 1em 2.2em 1fr auto; align-items: center; column-gap: 0.35em; }
        .row.cancelled { opacity: 0.45; }
        .row.cancelled .dest { text-decoration: line-through; }
        .sys { width: 1em; height: 1em; display: block;
          filter: drop-shadow(1px 0 0 #fff) drop-shadow(-1px 0 0 #fff) drop-shadow(0 1px 0 #fff) drop-shadow(0 -1px 0 #fff); }
        .badge {
          display: inline-flex; align-items: center; justify-content: center; height: 1em; min-width: 1.7em;
          padding: 0 0.2em; border: 1px solid #fff; box-sizing: border-box; font-weight: 700; color: #fff;
          letter-spacing: 0.02em; justify-self: start;
        }
        .dest { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
        .min { font-weight: 600; text-align: right; padding-left: 0.5em; }
        .late { color: #ff6b6b; }
        .msg { opacity: 0.6; text-align: center; padding: 0.4em; }
        .err { color: #ff6b6b; opacity: 1; }
        .dots { display: flex; justify-content: center; gap: 6px; }
        .dots span { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.3); }
        .dots span.on { background: #fff; }
    `).innerHTML = sections + dots;
  }
}
