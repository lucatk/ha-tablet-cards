// custom:bing-wallpaper-card — full-screen Bing image of the day behind the
// dashboard, via https://github.com/TimothyYe/bing-wallpaper. Rotates through
// the last `count` days every `rotate_minutes` (0 = today's image only).
// The card itself takes no space.

const API = "https://bing.biturl.top/";

export class BingWallpaperCard extends HTMLElement {
  setConfig(config) {
    this._config = { mkt: "de-DE", resolution: "1080x1920", count: 8, rotate_minutes: 10, dim: 0.15, ...config };
    this._index = 0;
  }

  set hass(_hass) {}

  getCardSize() {
    return 0;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" }).innerHTML = `
        <style>
          :host { display: block; height: 0; overflow: visible; }
          .bg { position: fixed; inset: 0; z-index: -1; background: #111 center / cover no-repeat;
            transition: opacity 1.5s ease; }
          .bg.next { opacity: 0; }
          .shade { position: fixed; inset: 0; z-index: -1; pointer-events: none; }
        </style>
        <div class="bg"></div><div class="bg next"></div><div class="shade"></div>`;
    }
    this.shadowRoot.querySelector(".shade").style.background = `rgba(0,0,0,${Number(this._config.dim)})`;
    this._show();
    clearInterval(this._timer);
    const minutes = Number(this._config.rotate_minutes);
    // Without rotation, still reload hourly so the image follows the day.
    this._timer = setInterval(() => {
      if (minutes > 0) this._index = (this._index + 1) % Math.max(1, Number(this._config.count));
      this._show();
    }, (minutes > 0 ? minutes : 60) * 60_000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _url() {
    const c = this._config;
    const u = new URL(API);
    u.searchParams.set("format", "image");
    u.searchParams.set("resolution", c.resolution);
    u.searchParams.set("mkt", c.mkt);
    u.searchParams.set("index", String(this._index));
    u.searchParams.set("d", new Date().toISOString().slice(0, 10)); // new image each day
    return u.toString();
  }

  _show() {
    const url = this._url();
    const img = new Image();
    img.onload = () => {
      // Crossfade: paint the hidden layer, fade it in, then swap roles.
      const layers = this.shadowRoot.querySelectorAll(".bg");
      const [front, back] = layers[0].classList.contains("next") ? [layers[1], layers[0]] : [layers[0], layers[1]];
      back.style.backgroundImage = `url("${url}")`;
      back.classList.remove("next");
      front.classList.add("next");
    };
    img.src = url;
  }
}
