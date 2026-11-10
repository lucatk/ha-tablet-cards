// ha-tablet-cards — custom Lovelace cards for the home tablet dashboard.
//
//   custom:mvg-departures-card  MVG departure board (port of magic-frame-mvg-widget)
//   custom:news-ticker-card     rotating headlines from scrape sensors
//   custom:tablet-clock-card    large clock with date and seconds
//
// Plain web components (ES modules), no build step and no dependencies.

import { MvgDeparturesCard } from "./mvg-departures-card.js";
import { NewsTickerCard } from "./news-ticker-card.js";
import { TabletClockCard } from "./tablet-clock-card.js";

const VERSION = "1.0.1";

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
