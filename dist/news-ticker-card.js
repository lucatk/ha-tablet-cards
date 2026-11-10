// custom:news-ticker-card — rotating headlines from sensors.

import { ensureShell, esc } from "./shared.js";

/**
 * Rotates through headlines held in plain sensors (e.g. from the Scrape
 * integration). Each source names an entity prefix; item N reads
 * `<prefix>N` (title), `<prefix>N_text` (teaser) and `<prefix>N_bild` (image).
 */
export class NewsTickerCard extends HTMLElement {
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
    ensureShell(this.shadowRoot, `
        :host { display: block; }
        ha-card { height: 100%; box-sizing: border-box; padding: 18px; color: #fff; overflow: hidden; }
        .content { height: 100%; display: flex; align-items: center; gap: 16px; }
        img { width: 34%; aspect-ratio: 1; object-fit: cover; border-radius: 12px; flex: none; }
        .body { min-width: 0; animation: fade 600ms ease-out; }
        .src { color: #d4a24c; text-transform: uppercase; letter-spacing: 0.08em; font-size: 15px; margin-bottom: 8px; }
        .title { font-size: 22px; font-weight: 600; line-height: 1.25; margin-bottom: 8px;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .text { font-size: 17px; line-height: 1.35; opacity: 0.7;
          display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
        @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    `).innerHTML = `
        ${
          item
            ? `${item.image ? `<img src="${esc(item.image)}" alt="" referrerpolicy="no-referrer">` : ""}
               <div class="body">
                 <div class="src">${esc(item.source)}</div>
                 <div class="title">${esc(item.title)}</div>
                 ${item.text ? `<div class="text">${esc(item.text)}</div>` : ""}
               </div>`
            : `<div class="body text">Keine Nachrichten.</div>`
        }`;
  }
}
