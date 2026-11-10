// custom:news-ticker-card — rotating headlines from sensors.

import { ensureShell, esc } from "./shared.js";

/**
 * Rotates through headlines held in plain sensors (e.g. from the Scrape
 * integration). Each source names an entity prefix; item N reads
 * `<prefix>N` (title), `<prefix>N_text` (teaser) and `<prefix>N_bild` (image).
 *
 * Each item first shows image and title for `title_seconds`. Then the image
 * folds away and the teaser appears below the title; if it doesn't fit, it
 * pages down every `page_seconds` until it has all been shown, then the next
 * item follows. `exclude` is a list of case-insensitive regexes matched
 * against titles (to drop livestreams, daily round-ups and the like).
 */
export class NewsTickerCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config.sources) || config.sources.length === 0) {
      throw new Error("news-ticker-card: `sources` must be a non-empty list");
    }
    this._config = { count: 8, title_seconds: 5, page_seconds: 5, exclude: [], ...config };
    this._exclude = this._config.exclude.map((p) => new RegExp(p, "i"));
    this._index = 0;
  }

  set hass(hass) {
    this._hass = hass;
    const items = this._items();
    const key = JSON.stringify(items);
    if (key === this._itemsKey) return;
    this._itemsKey = key;
    this._list = items;
    if (!this._current) this._show();
  }

  getCardSize() {
    return 4;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._show();
  }

  disconnectedCallback() {
    clearTimeout(this._timer);
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
        if (!title || this._exclude.some((re) => re.test(title))) continue;
        const text = ok(`${src.prefix}${i}_text`);
        // Video items repeat the title as their teaser; drop the duplicate.
        out.push({ source: src.name, title, text: text === title ? "" : text, image: ok(`${src.prefix}${i}_bild`) });
      }
      return out;
    });
    const merged = [];
    for (let i = 0; i < Math.max(0, ...perSource.map((l) => l.length)); i++) {
      for (const l of perSource) if (l[i]) merged.push(l[i]);
    }
    return merged;
  }

  _css() {
    return `
      :host { display: block; height: 100%; }
      ha-card { height: 100%; box-sizing: border-box; padding: 0; color: #fff; overflow: hidden; }
      .content { height: 100%; display: flex; flex-direction: column; }
      .img { flex: none; height: 46%; overflow: hidden; transition: height .7s cubic-bezier(.4, 0, .2, 1); }
      .img img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .detail .img { height: 0; }
      .body { flex: 1; min-height: 0; padding: 16px 22px 18px; display: flex; flex-direction: column; }
      .src { flex: none; color: #d4a24c; text-transform: uppercase; letter-spacing: 0.08em; font-size: 14px; margin-bottom: 8px; }
      .view { flex: 1; min-height: 0; overflow: hidden; position: relative; }
      .scroll { transition: transform .8s cubic-bezier(.4, 0, .2, 1); }
      .title { font-size: 22px; font-weight: 700; line-height: 1.25; }
      .text { font-size: 18px; line-height: 1.4; opacity: 0; margin-top: 10px; transition: opacity .6s .3s; }
      .detail .text { opacity: .8; }
      .fade-in { animation: fade 600ms ease-out; }
      @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    `;
  }

  /** Show the current item and schedule its title → detail → pages sequence. */
  _show() {
    if (!this.shadowRoot || !this._config) return;
    clearTimeout(this._timer);
    const content = ensureShell(this.shadowRoot, this._css());
    const card = this.shadowRoot.querySelector("ha-card");
    const list = this._list ?? [];
    const item = list.length ? list[this._index % list.length] : null;
    this._current = item;
    card.classList.remove("detail");
    if (!item) {
      content.innerHTML = `<div class="body"><div class="text" style="opacity:.7">Keine Nachrichten.</div></div>`;
      return;
    }
    content.innerHTML = `
      ${item.image ? `<div class="img fade-in"><img src="${esc(item.image)}" alt="" referrerpolicy="no-referrer"></div>` : ""}
      <div class="body fade-in">
        <div class="src">${esc(item.source)}</div>
        <div class="view"><div class="scroll">
          <div class="title">${esc(item.title)}</div>
          ${item.text ? `<div class="text">${esc(item.text)}</div>` : ""}
        </div></div>
      </div>`;
    const sec = (k) => Math.max(2, Number(this._config[k])) * 1000;
    const next = () => {
      this._index++;
      this._show();
    };
    if (!item.text) return void (this._timer = setTimeout(next, sec("title_seconds") + sec("page_seconds")));
    this._timer = setTimeout(() => {
      card.classList.add("detail");
      // Once the image has folded away, page through the text if it overflows.
      this._timer = setTimeout(() => {
        const view = content.querySelector(".view");
        const scroll = content.querySelector(".scroll");
        const step = Math.max(40, view.clientHeight - 28); // keep one line of context
        const pages = Math.max(1, Math.ceil((scroll.scrollHeight - view.clientHeight) / step) + 1);
        let page = 0;
        const turn = () => {
          page++;
          if (page >= pages) return next();
          const offset = Math.min(page * step, scroll.scrollHeight - view.clientHeight);
          scroll.style.transform = `translateY(-${offset}px)`;
          this._timer = setTimeout(turn, sec("page_seconds"));
        };
        this._timer = setTimeout(turn, sec("page_seconds"));
      }, 800);
    }, sec("title_seconds"));
  }
}
