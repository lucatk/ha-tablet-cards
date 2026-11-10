// MVG line colours and system icons. Original: magic-frame-mvg-widget/src/helpers.ts

const LINE_COLORS = {
  U1: ["#438136", "#fff"], U2: ["#C40C0C", "#fff"], U3: ["#EC6726", "#fff"],
  U4: ["#00A984", "#fff"], U5: ["#BC7A00", "#fff"], U6: ["#0065AE", "#fff"],
  U7: ["#438136", "#fff"], U8: ["#C40C0C", "#fff"],
  S1: ["#16B5EA", "#fff"], S2: ["#76B82A", "#fff"], S3: ["#951B81", "#fff"],
  S4: ["#E30613", "#fff"], S6: ["#04AE5C", "#fff"], S7: ["#8E1A66", "#fff"],
  S8: ["#000000", "#FECC00"], S20: ["#F45B68", "#fff"],
};

export const SYSTEM_COLORS = {
  UBAHN: "#0c2c63", SBAHN: "#0a8a3f", TRAM: "#b91725", BUS: "#00586A",
  REGIONAL_BUS: "#00586A", BAHN: "#444", SCHIFF: "#0a6066", SEV: "#888",
};

export function lineColor(line, type) {
  if (LINE_COLORS[line]) return LINE_COLORS[line];
  return [SYSTEM_COLORS[type] ?? "#444", "#fff"];
}

const svgUrl = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// Station-board variants of the MVG system icons (sharp U-Bahn square).
export const SYSTEM_ICONS = {
  UBAHN: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#2A63A9" d="M0 0h16v16H0z"/><path fill="#fff" d="M8 13.5c-1.3 0-2.7-.3-3.5-1.5-.7-1-.9-2.1-.9-3.3V2.5h2.7v7c0 .7.2 1.5.9 1.8.6.2 1.5.1 1.9-.5.5-.9.4-1.9.4-2.8V2.5h2.7v7.3c0 1.3-.6 2.8-1.9 3.4-.6.2-1.4.3-2.3.3"/></svg>`),
  SBAHN: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle fill="#008d4f" cx="8" cy="8" r="8"/><path fill="#fff" d="M13.3 10.1c0 1.9-1.9 4.2-5.1 4.2-1.7 0-3.8-.8-4.9-1.8V10c1.1 1.5 3 2.7 4.9 2.7 1.2 0 2.1-.7 2.1-1.4 0-2.7-7.1-1.1-7.1-5.7 0-2.5 2.4-3.8 4.6-3.8 1.8 0 3.4.6 4.7 1.6v2.1c-1.1-1.2-2.8-2.3-4.7-2.3-1.2 0-1.8.5-1.8 1.3 0 2.9 7.3.8 7.3 5.6"/></svg>`),
  TRAM: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#D82020" d="M13 16H3c-1.7 0-3-1.3-3-3V3c0-1.7 1.3-3 3-3h10c1.7 0 3 1.3 3 3v10c0 1.7-1.3 3-3 3"/><path fill="#fff" fill-rule="evenodd" d="M4.4 6.1v-.7H1.7v.7h.9v3.7h.8V6.1M6.4 6.5c-.1 0-.2-.1-.3-.1-.3 0-.6.1-.8.5v-.4h-.6v3.2h.8V8c0-.4.1-.8.5-.8h.2M9.1 9.7c0-.2-.1-.4-.1-.6V7.3c0-.5-.4-.9-1.1-.9-.3 0-.7.1-1.1.2l.2.5c.2-.1.5-.2.7-.2.3 0 .5.1.5.5v.3h-.4c-.7 0-1.2.3-1.2 1 0 .6.3.9.9.9.3 0 .6-.1.8-.4l.1.4m-.1-.9c0 .3-.3.5-.5.5-.3 0-.4-.2-.4-.5s.1-.5.5-.5c.2 0 .3 0 .4.1v.4M13.9 9.7V7.4c0-.5-.3-1-.9-1-.4 0-.7.2-.8.5-.1-.2-.3-.5-.8-.5-.4 0-.7.2-.8.5l-.1-.4h-.6v3.2h.7v-2c0-.3.1-.7.5-.7.3 0 .4.2.4.5v2.2h.7v-2c0-.3.1-.7.5-.7.3 0 .4.2.4.5v2.2"/></svg>`),
  BUS: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#00586A" d="M8 16c4.4 0 8-3.6 8-8s-3.6-8-8-8-8 3.6-8 8 3.6 8 8 8"/><path fill="#fff" d="M5.3 9.2c0-.8-.6-1.2-1.3-1.3.6-.2 1-.6 1-1.3 0-1-.8-1.4-1.7-1.4H1.6v5.6h1.9c1 0 1.8-.6 1.8-1.6M4 6.7c0 .5-.3.8-.8.8h-.6V6h.6c.5 0 .8.2.8.7m.2 2.4c0 .5-.3.9-.8.9h-.8V8.3h.7c.5 0 .9.3.9.8M10.3 8.8V5.2h-1v3.5c0 .7-.2 1.3-1 1.3s-1-.6-1-1.3V5.2h-1v3.6c0 1.3.7 2.1 2 2.1s2-.8 2-2.1M14.7 9.2c0-1.9-2.3-1.3-2.3-2.5 0-.6.4-.8 1-.8.3 0 .6.1.9.2l.2-.8c-.4-.1-.8-.2-1.2-.2-1 0-2 .5-2 1.6 0 2 2.2 1.2 2.2 2.5 0 .7-.6.9-1.1.9-.4 0-.8-.1-1.1-.2v.9c.4.1.8.2 1.2.2 1.2-.1 2.2-.6 2.2-1.8"/></svg>`),
};
SYSTEM_ICONS.REGIONAL_BUS = SYSTEM_ICONS.BUS;
