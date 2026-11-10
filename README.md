# ha-tablet-cards

Custom Lovelace cards for a wall tablet dashboard. Plain web components, no build step.

Install through the Home Assistant Marketplace (HACS) as a custom repository of type **Dashboard**.

## `custom:mvg-departures-card`

MVG departure board. Port of [magic-frame-mvg-widget](https://github.com/lucatk/magic-frame-mvg-widget) (station-board theme). Calls the MVG `bgw-pt/v3` API directly from the browser.

```yaml
type: custom:mvg-departures-card
stops:                       # <stop>[;<TYPE>,<TYPE>…] — name or global ID
  - de:09162:126;BUS         # Arcisstraße
  - de:09162:51;TRAM         # Pinakotheken
  - de:09162:120;UBAHN       # Theresienstraße
  - de:09162:70;UBAHN        # Universität
limit: 3                     # departures per stop
per_page: 2                  # stops per page; 0 = show all
cycle_seconds: 10            # page interval
refresh_seconds: 60          # API refresh (min 30)
offset_minutes: 0            # skip departures sooner than this
font_size: 20px
header_text: Abfahrt in Min.
```

Types: `UBAHN`, `SBAHN`, `TRAM`, `BUS`, `REGIONAL_BUS`, `BAHN`, `SCHIFF`.

## `custom:news-ticker-card`

Rotates through headlines stored in sensors (for example from the Scrape integration). For each source, item `N` reads `<prefix>N` (title), `<prefix>N_text` (teaser) and `<prefix>N_bild` (image URL). Sources are interleaved.

```yaml
type: custom:news-ticker-card
interval_seconds: 12
count: 4
sources:
  - name: ZDFheute
    prefix: sensor.news_zdf_
  - name: SZ München
    prefix: sensor.news_sz_
```

## `custom:tablet-clock-card`

Large clock with date and seconds.

```yaml
type: custom:tablet-clock-card
locale: de-DE
```

## Dashboards

`dashboards/build.py` generates the two tablet dashboards (`/dashboard-tablet` with browser_mod popups, `/dashboard-tablet-bubble` with Bubble Card pop-ups) and saves them through the Home Assistant websocket API. Requires `websockets` and an admin token in `HA_TOKEN`.

```sh
HA_TOKEN=… python dashboards/build.py
```
