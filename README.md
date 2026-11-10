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
show_system_icons: true      # U/S/Tram/Bus icon before the line badge
per_page: 2                  # stops per page; 0 = show all
cycle_seconds: 10            # page interval
refresh_seconds: 60          # API refresh (min 30)
offset_minutes: 0            # skip departures sooner than this
font_size: 20px
header_text: Abfahrt in Min.
```

Types: `UBAHN`, `SBAHN`, `TRAM`, `BUS`, `REGIONAL_BUS`, `BAHN`, `SCHIFF`.

## `custom:news-ticker-card`

Headlines from sensors (for example from the Scrape integration). For each source, item `N` reads `<prefix>N` (title), `<prefix>N_text` (teaser) and `<prefix>N_bild` (image URL). Sources are interleaved. Each item shows image and title first; after `title_seconds` the image folds away and the teaser pages in, one view every `page_seconds`, before the next item. `exclude` drops titles matching any of the case-insensitive regexes.

```yaml
type: custom:news-ticker-card
count: 8
title_seconds: 5
page_seconds: 5
sources:
  - name: Tagesschau
    prefix: sensor.news_ts_
  - name: SZ München
    prefix: sensor.news_sz_
exclude: ["news-überblick", "^livestream", ", ARD [A-ZÄÖÜ]"]
```

## `custom:tablet-clock-card`

Large clock with date and seconds.

```yaml
type: custom:tablet-clock-card
locale: de-DE
```

## `custom:tablet-rooms-card`

Room grid (big tiles, icon above name) that swaps in place for the room's controls — no popups. Per browser; returns to the grid after `timeout_seconds` without a touch.

```yaml
type: custom:tablet-rooms-card
timeout_seconds: 120
columns: 3
rooms:
  - name: Esstisch
    icon: mdi:table-chair
    sections:        # titled groups of tiles, two columns each
      - title: Licht
        cards:
      - type: custom:tablet-entity-card
        entity: light.hue_esstisch
        detail: color
    actions:         # optional bottom row
      - type: custom:tablet-action-card
        name: Relax
        icon: mdi:sofa-single-outline
        action: scene.turn_on
        target: { entity_id: scene.esstisch_esstisch_relax }
```

- `custom:tablet-entity-card` — large tile (icon, name, state). Dimmable lights: tap toggles, drag sideways sets brightness. Lights/switches: tap toggles. Other entities: state only. `detail: color` adds an arrow that opens a colour picker next to the tiles; `detail: members` opens the member lights of a group (each with its own colour arrow).
- `custom:tablet-media-card` — media player tile; while playing/paused it spans the row with artwork, title, previous/play-pause/next and a volume bar.
- `custom:tablet-action-card` — large button calling `action` (`domain.service`) with optional `data` / `target`.
- `custom:light-color-card` — colour wheel and colour-temperature slider for one or more lights (`names` maps entity → chip label). With a single member selected it adds power and brightness. `scene_group: light.<hue group>` adds a "Szenen" chip listing that group's Hue scenes.

## `custom:tablet-appliances-card`

Row of appliance tiles (washer, dishwasher, vacuum) with status, a progress bar while running and round control buttons. See `dashboards/build.py` for the entity keys of each `kind`.

## `custom:tablet-weather-card`

Current condition (bold), temperature with today's high/low, a 4-day forecast, and — only when rain is falling or expected within the hour — an iOS-style rain chart from DWD radar via [Bright Sky](https://brightsky.dev) for HA's home location.

```yaml
type: custom:tablet-weather-card
entity: weather.forecast_home
days: 4             # daily columns
hours: 5            # hourly columns
switch_seconds: 10  # alternate between days and hours
```

## `custom:bing-wallpaper-card`

Full-screen Bing image of the day as background (via [bing-wallpaper](https://github.com/TimothyYe/bing-wallpaper)); takes no space.

```yaml
type: custom:bing-wallpaper-card
mkt: de-DE
resolution: 1080x1920
count: 8              # rotate through the last N days
rotate_minutes: 10    # 0 = today's image only
dim: 0.2
```

## Dashboards

`dashboards/build.py` generates the tablet dashboard (`/dashboard-tablet`) and saves them through the Home Assistant websocket API. Requires `websockets` and an admin token in `HA_TOKEN`.

```sh
HA_TOKEN=… python dashboards/build.py
```
