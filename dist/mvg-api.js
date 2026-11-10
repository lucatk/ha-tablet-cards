// MVG API client. TypeScript original: magic-frame-mvg-widget/src/data/mvg.ts

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

export async function findStation(query, signal) {
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

export async function fetchDepartures(stationId, { limit, offset, transportTypes }, signal) {
  // With a transport-type filter the API can return fewer than `limit`
  // matches (at Universität, 12 requested U-Bahn departures came back as 3
  // because of the many buses), so over-fetch generously and slice afterwards.
  const filtered = !!transportTypes;
  const url = new URL(`${FIB_BASE}/departures`);
  url.searchParams.set("globalId", stationId);
  url.searchParams.set("limit", String(filtered ? Math.min(100, limit * 10) : limit));
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
export function parseStop(raw) {
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
