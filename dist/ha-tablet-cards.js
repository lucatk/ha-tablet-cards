// ha-tablet-cards — custom Lovelace cards for the home tablet dashboard.
//
//   custom:mvg-departures-card  MVG departure board (port of magic-frame-mvg-widget)
//   custom:news-ticker-card     rotating headlines from scrape sensors
//   custom:tablet-clock-card    large clock with date and seconds
//   custom:tablet-rooms-card    room grid that opens rooms in place
//   custom:tablet-entity-card   large pill row per entity
//   custom:tablet-action-card   large service button
//   custom:light-color-card     colour wheel + colour temperature
//   custom:bing-wallpaper-card  Bing image of the day as background
//
// Plain web components (ES modules), no build step and no dependencies.

import { MvgDeparturesCard } from "./mvg-departures-card.js";
import { NewsTickerCard } from "./news-ticker-card.js";
import { TabletClockCard } from "./tablet-clock-card.js";
import { LightColorCard } from "./light-color-card.js";
import { TabletActionCard, TabletEntityCard } from "./tablet-entity-card.js";
import { TabletRoomsCard } from "./tablet-rooms-card.js";
import { BingWallpaperCard } from "./bing-wallpaper-card.js";

const VERSION = "1.2.1";

customElements.define("mvg-departures-card", MvgDeparturesCard);
customElements.define("news-ticker-card", NewsTickerCard);
customElements.define("tablet-clock-card", TabletClockCard);
customElements.define("light-color-card", LightColorCard);
customElements.define("tablet-entity-card", TabletEntityCard);
customElements.define("tablet-action-card", TabletActionCard);
customElements.define("tablet-rooms-card", TabletRoomsCard);
customElements.define("bing-wallpaper-card", BingWallpaperCard);

window.customCards = window.customCards || [];
window.customCards.push(
  { type: "mvg-departures-card", name: "MVG Departures", description: "MVG departure board with station paging" },
  { type: "news-ticker-card", name: "News Ticker", description: "Rotating headlines from sensors" },
  { type: "tablet-clock-card", name: "Tablet Clock", description: "Large clock with date and seconds" },
  { type: "light-color-card", name: "Light Colour", description: "Colour wheel and colour temperature in place" },
  { type: "tablet-entity-card", name: "Tablet Entity Row", description: "Large pill row: toggle, dim by dragging" },
  { type: "tablet-action-card", name: "Tablet Action Button", description: "Large button that calls a service" },
  { type: "tablet-rooms-card", name: "Tablet Rooms", description: "Room grid that opens rooms in place" },
  { type: "bing-wallpaper-card", name: "Bing Wallpaper", description: "Full-screen Bing image of the day as background" },
);

console.info(`%c ha-tablet-cards ${VERSION} `, "background:#0065AE;color:#fff");
