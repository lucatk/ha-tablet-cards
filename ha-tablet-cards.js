// ha-tablet-cards — custom Lovelace cards for the home tablet dashboard.
//
//   custom:mvg-departures-card  MVG departure board (port of magic-frame-mvg-widget)
//   custom:news-ticker-card     rotating headlines from scrape sensors
//   custom:tablet-clock-card    large clock with date and seconds
//
// Plain web components, no build step and no dependencies.

const VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// MVG API (TypeScript original: magic-frame-mvg-widget/src/data/mvg.ts)
// ---------------------------------------------------------------------------

const FIB_BASE = "https://www.mvg.de/api/bgw-pt/v3";
const ZDM_BASE = "https://www.mvg.de/.rest/zdm";
const STATION_ID_RE = /^de:[0-9]{2,5}:[0-9]+$/;

const ALL_TRANSPORT_TYPES = ["BAHN", "SBAHN", "UBAHN", "TRAM", "BUS", "REGIONAL_BUS", "SCHIFF"];
const VALID_TRANSPORT_TYPES = new Set([...ALL_TRANSPORT_TYPES, "SEV"]);

async function apiGet(url, signal) {
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`MVG API ${resp.status}`);
  return resp.json();
}

async function findStation(query, signal) {
  const q = query.trim();
  if (STATION_ID_RE.test(q)) {
    const r = await apiGet(`${ZDM_BASE}/stations/${encodeURIComponent(q)}`, signal);
    return { id: r.id, name: r.name };
  }
  const url = new URL(`${FIB_BASE}/locations`);
  url.searchParams.set("query", q);
  url.searchParams.set("locationTypes", "STATION");
  const r = await apiGet(url, signal);
  if (!Array.isArray(r) || r.length === 0) return null;
  return { id: r[0].globalId, name: r[0].name };
}

async function fetchDepartures(stationId, { limit, offset, transportTypes }, signal) {
  // The API applies `limit` after the transport-type filter, so over-fetch
  // when the caller filtered and slice afterwards.
  const filtered = !!transportTypes;
  const url = new URL(`${FIB_BASE}/departures`);
  url.searchParams.set("globalId", stationId);
  url.searchParams.set("limit", String(filtered ? Math.min(100, limit * 3) : limit));
  url.searchParams.set("offsetInMinutes", String(offset));
  url.searchParams.set("transportTypes", (transportTypes ?? ALL_TRANSPORT_TYPES).join(","));
  const r = await apiGet(url, signal);
  if (!Array.isArray(r)) throw new Error("MVG API: expected list");
  return r
    .map((d) => ({
      time: Math.floor((d.realtimeDepartureTime ?? d.plannedDepartureTime) / 1000),
      delay: d.delayInMinutes ?? null,
      realtime: !!d.realtime,
      line: d.label,
      destination: d.destination,
      transportType: d.transportType,
      cancelled: !!d.cancelled,
      sev: !!d.sev,
    }))
    .slice(0, limit);
}

/** `<stop>[;<TYPE>,<TYPE>…]` — same syntax as the Magic Frame widget. */
function parseStop(raw) {
  const line = String(raw).trim();
  const semi = line.indexOf(";");
  if (semi === -1) return { stop: line };
  const types = line
    .slice(semi + 1)
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => VALID_TRANSPORT_TYPES.has(t));
  return { stop: line.slice(0, semi).trim(), transportTypes: types.length ? types : undefined };
}

// ---------------------------------------------------------------------------
// MVG display data (original: magic-frame-mvg-widget/src/helpers.ts)
// ---------------------------------------------------------------------------

const LINE_COLORS = {
  U1: ["#438136", "#fff"], U2: ["#C40C0C", "#fff"], U3: ["#EC6726", "#fff"],
  U4: ["#00A984", "#fff"], U5: ["#BC7A00", "#fff"], U6: ["#0065AE", "#fff"],
  U7: ["#438136", "#fff"], U8: ["#C40C0C", "#fff"],
  S1: ["#16B5EA", "#fff"], S2: ["#76B82A", "#fff"], S3: ["#951B81", "#fff"],
  S4: ["#E30613", "#fff"], S6: ["#04AE5C", "#fff"], S7: ["#8E1A66", "#fff"],
  S8: ["#000000", "#FECC00"], S20: ["#F45B68", "#fff"],
};

const SYSTEM_COLORS = {
  UBAHN: "#0c2c63", SBAHN: "#0a8a3f", TRAM: "#b91725", BUS: "#00586A",
  REGIONAL_BUS: "#00586A", BAHN: "#444", SCHIFF: "#0a6066", SEV: "#888",
};

function lineColor(line, type) {
  if (LINE_COLORS[line]) return LINE_COLORS[line];
  return [SYSTEM_COLORS[type] ?? "#444", "#fff"];
}

const svgUrl = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// Station-board variants of the MVG system icons (sharp U-Bahn square).
const SYSTEM_ICONS = {
  UBAHN: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#2A63A9" d="M0 0h16v16H0z"/><path fill="#fff" d="M8 13.5c-1.3 0-2.7-.3-3.5-1.5-.7-1-.9-2.1-.9-3.3V2.5h2.7v7c0 .7.2 1.5.9 1.8.6.2 1.5.1 1.9-.5.5-.9.4-1.9.4-2.8V2.5h2.7v7.3c0 1.3-.6 2.8-1.9 3.4-.6.2-1.4.3-2.3.3"/></svg>`),
  SBAHN: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle fill="#008d4f" cx="8" cy="8" r="8"/><path fill="#fff" d="M13.3 10.1c0 1.9-1.9 4.2-5.1 4.2-1.7 0-3.8-.8-4.9-1.8V10c1.1 1.5 3 2.7 4.9 2.7 1.2 0 2.1-.7 2.1-1.4 0-2.7-7.1-1.1-7.1-5.7 0-2.5 2.4-3.8 4.6-3.8 1.8 0 3.4.6 4.7 1.6v2.1c-1.1-1.2-2.8-2.3-4.7-2.3-1.2 0-1.8.5-1.8 1.3 0 2.9 7.3.8 7.3 5.6"/></svg>`),
  TRAM: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#D82020" d="M13 16H3c-1.7 0-3-1.3-3-3V3c0-1.7 1.3-3 3-3h10c1.7 0 3 1.3 3 3v10c0 1.7-1.3 3-3 3"/><path fill="#fff" fill-rule="evenodd" d="M4.4 6.1v-.7H1.7v.7h.9v3.7h.8V6.1M6.4 6.5c-.1 0-.2-.1-.3-.1-.3 0-.6.1-.8.5v-.4h-.6v3.2h.8V8c0-.4.1-.8.5-.8h.2M9.1 9.7c0-.2-.1-.4-.1-.6V7.3c0-.5-.4-.9-1.1-.9-.3 0-.7.1-1.1.2l.2.5c.2-.1.5-.2.7-.2.3 0 .5.1.5.5v.3h-.4c-.7 0-1.2.3-1.2 1 0 .6.3.9.9.9.3 0 .6-.1.8-.4l.1.4m-.1-.9c0 .3-.3.5-.5.5-.3 0-.4-.2-.4-.5s.1-.5.5-.5c.2 0 .3 0 .4.1v.4M13.9 9.7V7.4c0-.5-.3-1-.9-1-.4 0-.7.2-.8.5-.1-.2-.3-.5-.8-.5-.4 0-.7.2-.8.5l-.1-.4h-.6v3.2h.7v-2c0-.3.1-.7.5-.7.3 0 .4.2.4.5v2.2h.7v-2c0-.3.1-.7.5-.7.3 0 .4.2.4.5v2.2"/></svg>`),
  BUS: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#00586A" d="M8 16c4.4 0 8-3.6 8-8s-3.6-8-8-8-8 3.6-8 8 3.6 8 8 8"/><path fill="#fff" d="M5.3 9.2c0-.8-.6-1.2-1.3-1.3.6-.2 1-.6 1-1.3 0-1-.8-1.4-1.7-1.4H1.6v5.6h1.9c1 0 1.8-.6 1.8-1.6M4 6.7c0 .5-.3.8-.8.8h-.6V6h.6c.5 0 .8.2.8.7m.2 2.4c0 .5-.3.9-.8.9h-.8V8.3h.7c.5 0 .9.3.9.8M10.3 8.8V5.2h-1v3.5c0 .7-.2 1.3-1 1.3s-1-.6-1-1.3V5.2h-1v3.6c0 1.3.7 2.1 2 2.1s2-.8 2-2.1M14.7 9.2c0-1.9-2.3-1.3-2.3-2.5 0-.6.4-.8 1-.8.3 0 .6.1.9.2l.2-.8c-.4-.1-.8-.2-1.2-.2-1 0-2 .5-2 1.6 0 2 2.2 1.2 2.2 2.5 0 .7-.6.9-1.1.9-.4 0-.8-.1-1.1-.2v.9c.4.1.8.2 1.2.2 1.2-.1 2.2-.6 2.2-1.8"/></svg>`),
};
SYSTEM_ICONS.REGIONAL_BUS = SYSTEM_ICONS.BUS;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------------------------------------------------------------------------
// custom:mvg-departures-card
// ---------------------------------------------------------------------------

class MvgDeparturesCard extends HTMLElement {
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
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          height: 100%; box-sizing: border-box; padding: 16px 18px;
          font-size: ${c.font_size}; line-height: 1; color: #fff;
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
      </style>
      <ha-card>${sections}${dots}</ha-card>`;
  }
}

// ---------------------------------------------------------------------------
// custom:news-ticker-card
// ---------------------------------------------------------------------------

/**
 * Rotates through headlines held in plain sensors (e.g. from the Scrape
 * integration). Each source names an entity prefix; item N reads
 * `<prefix>N` (title), `<prefix>N_text` (teaser) and `<prefix>N_bild` (image).
 */
class NewsTickerCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config.sources) || config.sources.length === 0) {
      throw new Error("news-ticker-card: `sources` must be a non-empty list");
    }
    this._config = { interval_seconds: 12, count: 4, ...config };
    this._index = 0;
  }

  set hass(hass) {
    this._hass = hass;
    const items = this._items();
    const key = JSON.stringify(items);
    if (key === this._itemsKey) return;
    this._itemsKey = key;
    this._list = items;
    this._render();
  }

  getCardSize() {
    return 4;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      this._index++;
      this._render();
    }, Math.max(3, Number(this._config?.interval_seconds ?? 12)) * 1000);
    this._render();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _items() {
    const states = this._hass?.states ?? {};
    const ok = (id) => {
      const v = states[id]?.state;
      return v && v !== "unknown" && v !== "unavailable" ? v : "";
    };
    // Interleave the sources so the ticker alternates between them.
    const perSource = this._config.sources.map((src) => {
      const out = [];
      for (let i = 1; i <= (src.count ?? this._config.count); i++) {
        const title = ok(`${src.prefix}${i}`);
        if (title) out.push({ source: src.name, title, text: ok(`${src.prefix}${i}_text`), image: ok(`${src.prefix}${i}_bild`) });
      }
      return out;
    });
    const merged = [];
    for (let i = 0; i < Math.max(0, ...perSource.map((l) => l.length)); i++) {
      for (const l of perSource) if (l[i]) merged.push(l[i]);
    }
    return merged;
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const list = this._list ?? [];
    const item = list.length ? list[this._index % list.length] : null;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { height: 100%; box-sizing: border-box; padding: 18px; color: #fff; overflow: hidden;
          display: flex; align-items: center; gap: 16px; }
        img { width: 34%; aspect-ratio: 1; object-fit: cover; border-radius: 12px; flex: none; }
        .body { min-width: 0; animation: fade 600ms ease-out; }
        .src { color: #d4a24c; text-transform: uppercase; letter-spacing: 0.08em; font-size: 15px; margin-bottom: 8px; }
        .title { font-size: 22px; font-weight: 600; line-height: 1.25; margin-bottom: 8px;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .text { font-size: 17px; line-height: 1.35; opacity: 0.7;
          display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
        @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      </style>
      <ha-card>
        ${
          item
            ? `${item.image ? `<img src="${esc(item.image)}" alt="" referrerpolicy="no-referrer">` : ""}
               <div class="body">
                 <div class="src">${esc(item.source)}</div>
                 <div class="title">${esc(item.title)}</div>
                 ${item.text ? `<div class="text">${esc(item.text)}</div>` : ""}
               </div>`
            : `<div class="body text">Keine Nachrichten.</div>`
        }
      </ha-card>`;
  }
}

// ---------------------------------------------------------------------------
// custom:tablet-clock-card
// ---------------------------------------------------------------------------

class TabletClockCard extends HTMLElement {
  setConfig(config) {
    this._config = { locale: "de-DE", ...config };
  }

  set hass(_hass) {}

  getCardSize() {
    return 3;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    clearInterval(this._timer);
    this._timer = setInterval(() => this._render(), 1000);
    this._render();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _render() {
    if (!this.shadowRoot) return;
    const now = new Date();
    const loc = this._config?.locale ?? "de-DE";
    const date = now.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });
    const pad = (n) => String(n).padStart(2, "0");
    if (!this._built) {
      this.shadowRoot.innerHTML = `
        <style>
          ha-card { height: 100%; box-sizing: border-box; padding: 24px 28px; color: #fff;
            display: flex; flex-direction: column; justify-content: center; }
          .date { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
          .time { font-size: 88px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
          .sec { font-size: 34px; font-weight: 400; opacity: 0.7; margin-left: 6px; }
        </style>
        <ha-card><div class="date"></div><div><span class="time"></span><span class="sec"></span></div></ha-card>`;
      this._built = true;
    }
    this.shadowRoot.querySelector(".date").textContent = date;
    this.shadowRoot.querySelector(".time").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    this.shadowRoot.querySelector(".sec").textContent = pad(now.getSeconds());
  }
}

customElements.define("mvg-departures-card", MvgDeparturesCard);
customElements.define("news-ticker-card", NewsTickerCard);
customElements.define("tablet-clock-card", TabletClockCard);

window.customCards = window.customCards || [];
window.customCards.push(
  { type: "mvg-departures-card", name: "MVG Departures", description: "MVG departure board with station paging" },
  { type: "news-ticker-card", name: "News Ticker", description: "Rotating headlines from sensors" },
  { type: "tablet-clock-card", name: "Tablet Clock", description: "Large clock with date and seconds" },
);

console.info(`%c ha-tablet-cards ${VERSION} `, "background:#0065AE;color:#fff");
