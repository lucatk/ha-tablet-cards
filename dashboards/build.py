"""Build the tablet dashboard (/dashboard-tablet) and push it to Home Assistant.

Rooms open in place of the room grid (custom:tablet-rooms-card), no popups.
"""
import asyncio, json, os, sys
import websockets

ROOM_TIMEOUT_S = 120

GLASS = """
ha-card {
  background: rgba(16, 18, 40, 0.46);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: none;
  border-radius: 28px;
  box-shadow: none;
  overflow: hidden;
  color: #fff;
  height: 100%;
}
"""

def glass(extra=""):
    return {"style": GLASS + extra}

# ---------------------------------------------------------------- rooms

ROOMS = [
    {
        "key": "wohnzimmer", "name": "Wohnzimmer", "icon": "mdi:sofa-outline", "area": "r1",
        "entities": ["light.hue_filament_bulb_1", "media_player.wohnzimmer_beam"],
        "names": {"light.hue_filament_bulb_1": "TV Filament", "media_player.wohnzimmer_beam": "Sonos Beam"},
        "scenes": [("scene.wohnzimmer_wohnzimmer_bright", "Hell", "mdi:brightness-7"),
                   ("scene.wohnzimmer_wohnzimmer_dimmed", "Gedimmt", "mdi:brightness-5"),
                   ("scene.wohnzimmer_wohnzimmer_nightlight", "Nachtlicht", "mdi:weather-night")],
    },
    {
        "key": "kueche", "name": "Küche / Essen", "icon": "mdi:silverware-fork-knife", "area": "r2",
        # The fan is driven by the "Küche Lüftung Puls-Steuerung" automation via
        # this target boolean, not by switching the Shelly relay directly.
        "entities": ["light.kuche_licht", "input_boolean.kuche_luftung_soll", "light.hue_esstisch"],
        "names": {"light.kuche_licht": "Küche", "input_boolean.kuche_luftung_soll": "Lüftung",
                  "light.hue_esstisch": "Esstisch"},
        "scenes": [("scene.esstisch_esstisch_relax", "Relax", "mdi:sofa-single-outline"),
                   ("scene.esstisch_esstisch_concentrate", "Konzentration", "mdi:lightbulb-on-outline"),
                   ("scene.esstisch_esstisch_nightlight", "Nachtlicht", "mdi:weather-night")],
    },
    {
        "key": "schlafzimmer", "name": "Schlafzimmer", "icon": "mdi:bed-outline", "area": "r4",
        "entities": ["light.hue_tv_filament", "light.hue_schlafzimmer_spots", "media_player.schlafzimmer_one"],
        "names": {"light.hue_tv_filament": "Stehlampe", "light.hue_schlafzimmer_spots": "Spots",
                  "media_player.schlafzimmer_one": "Sonos One"},
        "scenes": [("scene.schlafzimmer_schlafzimmer_relax", "Relax", "mdi:sofa-single-outline"),
                   ("scene.schlafzimmer_schlafzimmer_read", "Lesen", "mdi:book-open-variant"),
                   ("scene.schlafzimmer_schlafzimmer_nightlight", "Nachtlicht", "mdi:weather-night")],
    },
]

COLOR_LIGHTS = {"light.hue_esstisch", "light.hue_esstisch_pendellampe_oben", "light.hue_esstisch_pendellampe_unten",
                "light.hue_schlafzimmer", "light.hue_schlafzimmer_spots"}
DIMMABLE = COLOR_LIGHTS | {"light.wohnzimmer_wohnzimmer"}

def action_cards(room):
    """Scene or vacuum buttons for the room's bottom row."""
    out = []
    for ent, name, icon in room.get("scenes", []):
        out.append({"type": "custom:tablet-action-card", "name": name, "icon": icon,
                    "action": "scene.turn_on", "target": {"entity_id": ent}})
    for svc, name, icon in room.get("vacuum", []):
        out.append({"type": "custom:tablet-action-card", "name": name, "icon": icon,
                    "action": svc, "target": {"entity_id": "vacuum.roborock_qrevo_s"}})
    return out

# ---------------------------------------------------------------- top half

def top_cards():
    return [
        {"type": "custom:tablet-clock-card", "view_layout": {"grid-area": "clock"},
         "card_mod": glass("ha-card { padding: 26px 30px !important; }")},
        {"type": "custom:tablet-weather-card", "entity": "weather.forecast_home", "days": 4,
         "view_layout": {"grid-area": "weather"}, "card_mod": glass()},
        {"type": "custom:news-ticker-card", "count": 8, "title_seconds": 5, "page_seconds": 5,
         "sources": [{"name": "Tagesschau", "prefix": "sensor.news_ts_"},
                     {"name": "SZ München", "prefix": "sensor.news_sz_"}],
         # Drop round-ups, livestreams, programme items and correspondent clips.
         "exclude": ["news-überblick", "tagesschau", "tagesthemen", "^livestream", "^schlagzeilen",
                     "^heute( journal|-show)?\\b", "zdfheute live", ", ARD [A-ZÄÖÜ]", "\\bzur sendung\\b"],
         "view_layout": {"grid-area": "news"}, "card_mod": glass()},
        {"type": "custom:mvg-departures-card",
         "stops": ["de:09162:126;BUS", "de:09162:51;TRAM", "de:09162:120;UBAHN", "de:09162:70;UBAHN"],
         "limit": 4, "per_page": 2, "show_system_icons": False, "cycle_seconds": 10, "refresh_seconds": 60, "font_size": "17px",
         "view_layout": {"grid-area": "mvg"}, "card_mod": glass("ha-card { padding: 20px 24px !important; }")},
    ]

DISHWASHER_PROGRAMS = {
    "dishcare_dishwasher_program_eco_50": "Eco 50°",
    "dishcare_dishwasher_program_auto_2": "Auto",
    "dishcare_dishwasher_program_intensiv_70": "Intensiv 70°",
    "dishcare_dishwasher_program_quick_65": "Quick 65°",
    "dishcare_dishwasher_program_machine_care": "Maschinenpflege",
    "dishcare_dishwasher_program_pre_rinse": "Vorspülen",
}

# 20-column grid so the top row can split 9:11 (weather gets the wider half)
# while news and MVG stay 10:10.
def area_row(*parts):
    return '"' + " ".join(" ".join([name] * span) for name, span in parts) + '"'

def grid(rooms_rows, extra_cards):
    areas = " ".join([
        area_row(("clock", 9), ("weather", 11)),
        area_row(("news", 10), ("mvg", 10)),
        area_row(("apps", 20)),
        area_row(("rooms", 20)),
        area_row(("footer", 20)),
    ])
    return {
        "type": "custom:layout-card",
        "layout_type": "custom:grid-layout",
        "layout": {
            "grid-template-columns": "repeat(20, minmax(0, 1fr))",
            "grid-template-rows": "192px 294px 142px minmax(0, 1fr) 52px",
            "grid-template-areas": areas,
            "grid-gap": "14px",
            # HA pads the view by the status-bar inset (28 px on the tablet, which runs
            # full-screen anyway); pull the grid up over it and pad all sides evenly.
            "height": "calc(100vh - 32px)",
            "margin-top": "calc(-1 * var(--safe-area-inset-top, 0px))",
            "padding": "14px 18px 14px",
            "margin": "0",
        },
        "cards": top_cards() + extra_cards,
    }

# Group lights: the colour arrow gets one chip per member plus "Alle".
GROUP_COLOUR = {
    "light.hue_esstisch": {"light.hue_esstisch_pendellampe_oben": "Oben",
                           "light.hue_esstisch_pendellampe_unten": "Unten"},
    "light.hue_schlafzimmer_spots": {f"light.hue_schlafzimmer_spot_{i}": f"Spot {i}" for i in range(1, 5)},
}

ICONS = {"input_boolean.kuche_luftung_soll": "mdi:fan"}

def tile(entity, names, room_entities):
    if entity.startswith("media_player."):
        cfg = {"type": "custom:tablet-media-card", "entity": entity}
    else:
        cfg = {"type": "custom:tablet-entity-card", "entity": entity}
        if entity in GROUP_COLOUR:
            members = GROUP_COLOUR[entity]
            cfg.update({"detail": "color", "color_entities": list(members), "color_names": members})
        elif entity in COLOR_LIGHTS:
            cfg["detail"] = "color"
    if entity in names:
        cfg["name"] = names[entity]
    if entity in ICONS:
        cfg["icon"] = ICONS[entity]
    return cfg

def room_config(room):
    names = room.get("names", {})
    # Lights first, then other devices, then media — each under its own heading.
    groups = [("Licht", lambda e: e.startswith("light.")),
              ("Geräte", lambda e: not e.startswith(("light.", "media_player."))),
              ("Medien", lambda e: e.startswith("media_player."))]
    sections = []
    for title, match in groups:
        cards = [tile(e, names, room["entities"]) for e in room["entities"] if match(e)]
        if cards:
            sections.append({"title": title, "cards": cards})
    cfg = {"name": room["name"], "icon": room["icon"], "sections": sections}
    if room.get("columns"):
        cfg["columns"] = room["columns"]
    actions = action_cards(room)
    if actions:
        cfg["actions"] = actions
    return cfg

# Bottom-right pill: every light in the house off.
ALL_OFF = {"type": "custom:tablet-action-card", "pill": True, "name": "Alles aus", "icon": "mdi:power",
           "action": "light.turn_off", "target": {"entity_id": "all"}, "view_layout": {"grid-area": "footer"}}

APPLIANCES = {
    "type": "custom:tablet-appliances-card",
    "view_layout": {"grid-area": "apps"},
    "items": [
        {"kind": "washer", "name": "Waschmaschine", "icon": "mdi:washing-machine",
         "running": "binary_sensor.unnamed_room_waschmaschine_running",
         "state": "sensor.unnamed_room_waschmaschine_state",
         "program": "sensor.unnamed_room_waschmaschine_program",
         "remaining": "sensor.unnamed_room_waschmaschine_time_remaining",
         "progress": "sensor.unnamed_room_waschmaschine_progress"},
        {"kind": "dishwasher", "name": "Spülmaschine", "icon": "mdi:dishwasher",
         "quiet": "switch.kuche_spuli_silence_on_demand", "operation": "sensor.spuli_operation_state",
         "program": "select.spuli_active_program", "programs": DISHWASHER_PROGRAMS,
         "finish": "sensor.spuli_program_finish_time", "progress": "sensor.spuli_program_progress",
         "door": "sensor.spuli_door"},
        {"kind": "vacuum", "name": "Saugroboter", "icon": "mdi:robot-vacuum",
         "entity": "vacuum.roborock_qrevo_s", "cleaning": "binary_sensor.roborock_qrevo_s_cleaning",
         "status": "sensor.roborock_qrevo_s_status",
         "battery": "sensor.roborock_qrevo_s_battery", "progress": "sensor.roborock_qrevo_s_cleaning_progress"},
    ],
}

def dashboard():
    wallpaper = {"type": "custom:bing-wallpaper-card", "mkt": "de-DE", "resolution": "1080x1920",
                 "count": 8, "rotate_minutes": 10, "dim": 0.2, "view_layout": {"grid-area": "clock"}}
    rooms = {"type": "custom:tablet-rooms-card", "timeout_seconds": ROOM_TIMEOUT_S, "columns": 3,
             "rooms": [room_config(r) for r in ROOMS], "view_layout": {"grid-area": "rooms"},
             "card_mod": {"style": "ha-card { --tablet-rooms-padding: 4px 0 18px; }"}}
    return {
        "kiosk_mode": {"kiosk": True},
        "views": [{
            "title": "Tablet", "path": "tablet", "type": "panel",
            "background": "transparent",
            "cards": [grid('"rooms rooms"', [wallpaper, APPLIANCES, rooms, ALL_OFF])],
        }],
    }

# ---------------------------------------------------------------- push

DASHBOARDS = {
    "dashboard-tablet": ("Tablet", "mdi:tablet", dashboard),
}
REMOVED = ["dashboard-tablet-bubble"]

async def main():
    async with websockets.connect("ws://192.168.2.111/api/websocket", max_size=2**25) as w:
        await w.recv()
        await w.send(json.dumps({"type": "auth", "access_token": os.environ["HA_TOKEN"]}))
        await w.recv()
        n = 0
        async def call(msg):
            nonlocal n
            n += 1
            msg["id"] = n
            await w.send(json.dumps(msg))
            while True:
                r = json.loads(await w.recv())
                if r.get("id") == n:
                    return r
        listed = (await call({"type": "lovelace/dashboards/list"}))["result"]
        existing = {d["url_path"] for d in listed}
        for d in listed:
            if d["url_path"] in REMOVED:
                r = await call({"type": "lovelace/dashboards/delete", "dashboard_id": d["id"]})
                print("delete", d["url_path"], r.get("success"), r.get("error"))
        for path, (title, icon, build) in DASHBOARDS.items():
            if path not in existing:
                r = await call({"type": "lovelace/dashboards/create", "url_path": path, "title": title,
                                "icon": icon, "show_in_sidebar": True, "require_admin": False, "mode": "storage"})
                print("create", path, r.get("success"), r.get("error"))
            cfg = build()
            r = await call({"type": "lovelace/config/save", "url_path": path, "config": cfg})
            print("save", path, r.get("success"), r.get("error"))

if __name__ == "__main__":
    asyncio.run(main())
