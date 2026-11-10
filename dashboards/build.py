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
        "entities": ["light.wohnzimmer_wohnzimmer", "media_player.wohnzimmer_beam"],
        "names": {"light.wohnzimmer_wohnzimmer": "Licht", "media_player.wohnzimmer_beam": "Sonos Beam"},
        "scenes": [("scene.wohnzimmer_wohnzimmer_bright", "Hell", "mdi:brightness-7"),
                   ("scene.wohnzimmer_wohnzimmer_dimmed", "Gedimmt", "mdi:brightness-5"),
                   ("scene.wohnzimmer_wohnzimmer_nightlight", "Nachtlicht", "mdi:weather-night")],
    },
    {
        "key": "esstisch", "name": "Esstisch", "icon": "mdi:table-chair", "area": "r2",
        "entities": ["light.hue_esstisch", "light.hue_esstisch_pendellampe_oben", "light.hue_esstisch_pendellampe_unten"],
        "names": {"light.hue_esstisch": "Esstisch", "light.hue_esstisch_pendellampe_oben": "Pendel oben",
                  "light.hue_esstisch_pendellampe_unten": "Pendel unten"},
        "chips": {"light.hue_esstisch": "Tisch", "light.hue_esstisch_pendellampe_oben": "Oben",
                  "light.hue_esstisch_pendellampe_unten": "Unten"},
        "scenes": [("scene.esstisch_esstisch_relax", "Relax", "mdi:sofa-single-outline"),
                   ("scene.esstisch_esstisch_concentrate", "Konzentration", "mdi:lightbulb-on-outline"),
                   ("scene.esstisch_esstisch_nightlight", "Nachtlicht", "mdi:weather-night")],
    },
    {
        "key": "kueche", "name": "Küche", "icon": "mdi:stove", "area": "r3",
        "entities": ["light.kuche_licht", "switch.shellyplus2pm_c82e18065c2c_switch_0", "switch.spuli_power"],
        "names": {"light.kuche_licht": "Licht", "switch.shellyplus2pm_c82e18065c2c_switch_0": "Lüftung",
                  "switch.spuli_power": "Spülmaschine"},
        "scenes": [],
    },
    {
        "key": "schlafzimmer", "name": "Schlafzimmer", "icon": "mdi:bed-outline", "area": "r4",
        "entities": ["light.hue_schlafzimmer", "light.hue_schlafzimmer_spots", "media_player.schlafzimmer_one"],
        "names": {"light.hue_schlafzimmer": "Deckenlicht", "light.hue_schlafzimmer_spots": "Spots",
                  "media_player.schlafzimmer_one": "Sonos One"},
        "chips": {"light.hue_schlafzimmer": "Decke", "light.hue_schlafzimmer_spots": "Spots"},
        "scenes": [("scene.schlafzimmer_schlafzimmer_relax", "Relax", "mdi:sofa-single-outline"),
                   ("scene.schlafzimmer_schlafzimmer_read", "Lesen", "mdi:book-open-variant"),
                   ("scene.schlafzimmer_schlafzimmer_nightlight", "Nachtlicht", "mdi:weather-night")],
    },
    {
        "key": "bad", "name": "Bad", "icon": "mdi:shower-head", "area": "r5",
        "entities": ["vacuum.roborock_qrevo_s", "media_player.bad_roam"],
        "names": {"vacuum.roborock_qrevo_s": "Saugroboter", "media_player.bad_roam": "Sonos Roam"},
        "vacuum": [("vacuum.start", "Start", "mdi:play"),
                   ("vacuum.pause", "Pause", "mdi:pause"),
                   ("vacuum.return_to_base", "Zur Station", "mdi:home-import-outline")],
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
        {"type": "weather-forecast", "entity": "weather.forecast_home", "name": "München",
         "forecast_type": "daily", "forecast_slots": 4, "show_current": True, "show_forecast": True,
         "view_layout": {"grid-area": "weather"},
         "card_mod": glass("""
ha-card { padding: 14px 12px; display: flex; flex-direction: column; justify-content: center; }
ha-card, .name, .attribute, .temp-attribute, .forecast .templow { color: #fff !important; }
.forecast .templow { opacity: 0.6; }
""")},
        {"type": "custom:news-ticker-card", "interval_seconds": 12,
         "sources": [{"name": "ZDFheute", "prefix": "sensor.news_zdf_"},
                     {"name": "SZ München", "prefix": "sensor.news_sz_"}],
         "layout": "hero", "view_layout": {"grid-area": "news"}, "card_mod": glass()},
        {"type": "custom:mvg-departures-card",
         "stops": ["de:09162:126;BUS", "de:09162:51;TRAM", "de:09162:120;UBAHN", "de:09162:70;UBAHN"],
         "limit": 3, "per_page": 2, "cycle_seconds": 10, "refresh_seconds": 60, "font_size": "19px",
         "view_layout": {"grid-area": "mvg"}, "card_mod": glass("ha-card { padding: 20px 24px !important; }")},
        appliance_card(),
    ]

DISHWASHER_PROGRAMS = {
    "dishcare_dishwasher_program_eco_50": "Eco 50°",
    "dishcare_dishwasher_program_auto_2": "Auto",
    "dishcare_dishwasher_program_intensiv_70": "Intensiv 70°",
    "dishcare_dishwasher_program_quick_65": "Quick 65°",
    "dishcare_dishwasher_program_machine_care": "Maschinenpflege",
    "dishcare_dishwasher_program_pre_rinse": "Vorspülen",
}

WASHER_RUNNING = {"condition": "state", "entity": "binary_sensor.unnamed_room_waschmaschine_running", "state": "on"}
DISHWASHER_RUNNING = {"condition": "state", "entity": "sensor.spuli_operation_state",
                      "state": ["run", "delayedstart", "pause"]}

APPLIANCE_TEMPLATE = (
    "{% set w_on = is_state('binary_sensor.unnamed_room_waschmaschine_running', 'on') %}"
    "{% set d_on = states('sensor.spuli_operation_state') in ['run', 'delayedstart', 'pause'] %}"
    "{% set progs = " + json.dumps(DISHWASHER_PROGRAMS) + " %}"
    "{% if w_on %}<ha-icon icon=\"mdi:washing-machine\"></ha-icon>&nbsp; **Waschmaschine** · "
    "{{ states('sensor.unnamed_room_waschmaschine_program') }}"
    "{% set r = states('sensor.unnamed_room_waschmaschine_time_remaining') %}"
    "{% if r | is_number %} · noch {{ r | int }} min{% endif %}{% endif %}"
    "{% if w_on and d_on %}<br>{% endif %}"
    "{% if d_on %}<ha-icon icon=\"mdi:dishwasher\"></ha-icon>&nbsp; **Spülmaschine** · "
    "{{ progs.get(states('select.spuli_active_program'), 'Programm läuft') }}"
    "{% set f = states('sensor.spuli_program_finish_time') %}"
    "{% if is_state('sensor.spuli_operation_state', 'delayedstart') %} · Startzeitvorwahl"
    "{% elif as_datetime(f) %} · noch {{ ((as_datetime(f) - now()).total_seconds() / 60) | round(0) | int }} min"
    "{% endif %}{% endif %}"
)

def appliance_card():
    return {
        "type": "conditional",
        "conditions": [{"condition": "or", "conditions": [WASHER_RUNNING, DISHWASHER_RUNNING]}],
        "view_layout": {"grid-area": "apps"},
        "card": {
            "type": "markdown", "content": APPLIANCE_TEMPLATE,
            "card_mod": glass("ha-card { padding: 2px 22px; font-size: 19px; line-height: 2; --primary-text-color: #fff; }"),
        },
    }

def grid(rooms_rows, extra_cards):
    areas = '"clock weather" "news mvg" "apps apps" ' + rooms_rows
    return {
        "type": "custom:layout-card",
        "layout_type": "custom:grid-layout",
        "layout": {
            "grid-template-columns": "1fr 1fr",
            "grid-template-rows": "212px 352px auto 1fr",
            "grid-template-areas": areas,
            "grid-gap": "14px",
            # HA pads the view by the status-bar inset on the tablet (28 px); subtract it.
            "height": "calc(100vh - var(--safe-area-inset-top, 0px) - var(--safe-area-inset-bottom, 0px)"
                      " - max(8px, calc(18px - var(--safe-area-inset-top, 0px))) - 4px)",
            "padding": "max(8px, calc(18px - var(--safe-area-inset-top, 0px))) 18px 0",
            "margin": "0",
        },
        "cards": top_cards() + extra_cards,
    }

def room_config(room):
    names = room.get("names", {})
    cfg = {
        "name": room["name"], "icon": room["icon"],
        "main": [{"type": "custom:tablet-entity-card", "entity": e, **({"name": names[e]} if e in names else {})}
                 for e in room["entities"]],
    }
    colour = [e for e in room["entities"] if e in COLOR_LIGHTS]
    if colour:
        cfg["side"] = [{"type": "custom:light-color-card", "entities": colour, "names": room.get("chips", {})}]
    actions = action_cards(room)
    if actions:
        cfg["actions"] = actions
    return cfg

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
            "cards": [grid('"rooms rooms"', [wallpaper, rooms])],
        }],
    }

# ---------------------------------------------------------------- push

DASHBOARDS = {
    "dashboard-tablet": ("Tablet", "mdi:tablet", dashboard),
}
REMOVED = ["dashboard-tablet-bubble"]

async def main(preview_appliances=False):
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
            if preview_appliances:
                # Screenshot aid only: show the appliance strip with sample values.
                s = json.dumps(cfg)
                s = s.replace(json.dumps(WASHER_RUNNING), json.dumps(
                    {"condition": "state", "entity": "sensor.spuli_operation_state", "state_not": "__none__"}))
                for a, b in [("is_state('binary_sensor.unnamed_room_waschmaschine_running', 'on')", "true"),
                             ("states('sensor.spuli_operation_state') in ['run', 'delayedstart', 'pause']", "true"),
                             ("states('sensor.unnamed_room_waschmaschine_program')", "'Eco 40-60'"),
                             ("states('sensor.unnamed_room_waschmaschine_time_remaining')", "'47'"),
                             ("states('select.spuli_active_program')", "'dishcare_dishwasher_program_eco_50'"),
                             ("states('sensor.spuli_program_finish_time')", "(now() + timedelta(minutes=93)).isoformat()")]:
                    s = s.replace(json.dumps(a)[1:-1], json.dumps(b)[1:-1])
                cfg = json.loads(s)
            r = await call({"type": "lovelace/config/save", "url_path": path, "config": cfg})
            print("save", path, r.get("success"), r.get("error"))

if __name__ == "__main__":
    asyncio.run(main(preview_appliances="--preview-appliances" in sys.argv))
