"""Build the two tablet dashboards and push them to Home Assistant.

  dashboard-tablet         native tiles, rooms open as browser_mod popups
  dashboard-tablet-bubble  Bubble Card buttons and pop-ups
"""
import asyncio, json, os, sys
import websockets

WALLPAPER = "http://192.168.2.111:8098/wallpapers/mf-19.jpg"
POPUP_TIMEOUT_MS = 120_000

GLASS = """
ha-card {
  background: rgba(16, 18, 40, 0.38);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: none;
  border-radius: 0;
  box-shadow: none;
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
        "scenes": [("scene.wohnzimmer_wohnzimmer_bright", "Hell", "mdi:brightness-7"),
                   ("scene.wohnzimmer_wohnzimmer_dimmed", "Gedimmt", "mdi:brightness-5"),
                   ("scene.wohnzimmer_wohnzimmer_nightlight", "Nachtlicht", "mdi:weather-night")],
    },
    {
        "key": "esstisch", "name": "Esstisch", "icon": "mdi:table-chair", "area": "r2",
        "entities": ["light.hue_esstisch", "light.hue_esstisch_pendellampe_oben", "light.hue_esstisch_pendellampe_unten"],
        "scenes": [("scene.esstisch_esstisch_relax", "Relax", "mdi:sofa-single-outline"),
                   ("scene.esstisch_esstisch_concentrate", "Konzentration", "mdi:lightbulb-on-outline"),
                   ("scene.esstisch_esstisch_nightlight", "Nachtlicht", "mdi:weather-night")],
    },
    {
        "key": "kueche", "name": "Küche", "icon": "mdi:stove", "area": "r3",
        "entities": ["light.kuche_licht", "switch.shellyplus2pm_c82e18065c2c_switch_0", "switch.spuli_power"],
        "names": {"switch.shellyplus2pm_c82e18065c2c_switch_0": "Lüftung", "switch.spuli_power": "Spülmaschine"},
        "scenes": [],
    },
    {
        "key": "schlafzimmer", "name": "Schlafzimmer", "icon": "mdi:bed-outline", "area": "r4",
        "entities": ["light.hue_schlafzimmer", "light.hue_schlafzimmer_spots", "media_player.schlafzimmer_one"],
        "scenes": [("scene.schlafzimmer_schlafzimmer_relax", "Relax", "mdi:sofa-single-outline"),
                   ("scene.schlafzimmer_schlafzimmer_read", "Lesen", "mdi:book-open-variant"),
                   ("scene.schlafzimmer_schlafzimmer_nightlight", "Nachtlicht", "mdi:weather-night")],
    },
    {
        "key": "bad", "name": "Bad", "icon": "mdi:shower-head", "area": "r5",
        "entities": ["vacuum.roborock_qrevo_s", "media_player.bad_roam"],
        "names": {"vacuum.roborock_qrevo_s": "Saugroboter"},
        "vacuum": [("vacuum.start", "Start", "mdi:play"),
                   ("vacuum.pause", "Pause", "mdi:pause"),
                   ("vacuum.return_to_base", "Zur Station", "mdi:home-import-outline")],
    },
]

COLOR_LIGHTS = {"light.hue_esstisch", "light.hue_esstisch_pendellampe_oben", "light.hue_esstisch_pendellampe_unten",
                "light.hue_schlafzimmer", "light.hue_schlafzimmer_spots"}
DIMMABLE = COLOR_LIGHTS | {"light.wohnzimmer_wohnzimmer"}

def action_buttons(room):
    """(name, icon, action-dict) for scene or vacuum buttons."""
    out = []
    for ent, name, icon in room.get("scenes", []):
        out.append((name, icon, {"action": "perform-action", "perform_action": "scene.turn_on",
                                 "target": {"entity_id": ent}}))
    for svc, name, icon in room.get("vacuum", []):
        out.append((name, icon, {"action": "perform-action", "perform_action": svc,
                                 "target": {"entity_id": "vacuum.roborock_qrevo_s"}}))
    return out

# ---------------------------------------------------------------- top half

def top_cards():
    return [
        {"type": "custom:tablet-clock-card", "view_layout": {"grid-area": "clock"},
         "card_mod": glass()},
        {"type": "weather-forecast", "entity": "weather.forecast_home", "name": "München",
         "forecast_type": "daily", "forecast_slots": 4, "show_current": True, "show_forecast": True,
         "view_layout": {"grid-area": "weather"},
         "card_mod": glass("""
ha-card { padding: 8px 4px; display: flex; flex-direction: column; justify-content: center; }
ha-card, .name, .attribute, .temp-attribute, .forecast .templow { color: #fff !important; }
.forecast .templow { opacity: 0.6; }
""")},
        {"type": "custom:news-ticker-card", "interval_seconds": 12,
         "sources": [{"name": "ZDFheute", "prefix": "sensor.news_zdf_"},
                     {"name": "SZ München", "prefix": "sensor.news_sz_"}],
         "view_layout": {"grid-area": "news"}, "card_mod": glass()},
        {"type": "custom:mvg-departures-card",
         "stops": ["de:09162:126;BUS", "de:09162:51;TRAM", "de:09162:120;UBAHN", "de:09162:70;UBAHN"],
         "limit": 3, "per_page": 2, "cycle_seconds": 10, "refresh_seconds": 60, "font_size": "19px",
         "view_layout": {"grid-area": "mvg"}, "card_mod": glass()},
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
            "grid-template-rows": "210px 370px auto 1fr",
            "grid-template-areas": areas,
            "grid-gap": "0px",
            "height": "100vh",
            "padding": "0",
            "margin": "0",
        },
        "cards": top_cards() + extra_cards,
    }

ROOM_TILE = """
ha-card {
  background: rgba(16, 18, 40, 0.30);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  color: #fff;
  height: 200px !important;
  --card-mod-icon-color: #fff;
}
ha-card span { font-size: 23px; color: #fff; }
"""

def room_grid_card(cards):
    return {
        "type": "custom:layout-card",
        "layout_type": "custom:grid-layout",
        "layout": {
            "grid-template-columns": "repeat(6, 1fr)",
            "grid-template-areas": '"r1 r1 r2 r2 r3 r3" ". r4 r4 r5 r5 ."',
            "grid-gap": "26px",
            "padding": "30px 24px",
        },
        "view_layout": {"grid-area": "rooms"},
        "cards": cards,
    }

# ---------------------------------------------------------------- native variant

POPUP_STYLE = """
ha-dialog {
  --ha-dialog-surface-background: rgba(22, 24, 48, 0.94);
  --mdc-theme-surface: rgba(22, 24, 48, 0.94);
  --dialog-backdrop-filter: blur(6px);
  --primary-text-color: #fff;
  --secondary-text-color: rgba(255, 255, 255, 0.65);
  --ha-card-background: rgba(255, 255, 255, 0.07);
  --card-background-color: rgba(255, 255, 255, 0.07);
  --ha-card-border-color: rgba(255, 255, 255, 0.08);
  --divider-color: rgba(255, 255, 255, 0.1);
  --state-icon-color: #fff;
  --paper-item-icon-color: #fff;
  color: #fff;
}
"""

def native_room_content(room):
    cards = []
    names = room.get("names", {})
    for ent in room["entities"]:
        tile = {"type": "tile", "entity": ent, "vertical": False, "features_position": "bottom"}
        if ent in names:
            tile["name"] = names[ent]
        domain = ent.split(".")[0]
        if domain in ("light", "switch"):
            tile["tap_action"] = {"action": "toggle"}
            tile["icon_tap_action"] = {"action": "more-info"}
            feats = []
            if ent in DIMMABLE:
                feats.append({"type": "light-brightness"})
            if ent in COLOR_LIGHTS:
                feats.append({"type": "light-color-temp"})
            if feats:
                tile["features"] = feats
        else:
            tile["tap_action"] = {"action": "none"}
            tile["icon_tap_action"] = {"action": "none"}
        cards.append(tile)
    buttons = action_buttons(room)
    if buttons:
        cards.append({
            "type": "grid", "columns": len(buttons), "square": False,
            "cards": [{"type": "button", "name": n, "icon": i, "icon_height": "40px",
                       "show_state": False, "tap_action": a} for n, i, a in buttons],
        })
    return {"type": "vertical-stack", "cards": cards}

def native_room_button(room):
    return {
        "type": "button", "name": room["name"], "icon": room["icon"], "icon_height": "72px",
        "show_state": False,
        "tap_action": {
            "action": "fire-dom-event",
            "browser_mod": {
                "service": "browser_mod.popup",
                "data": {
                    "title": room["name"],
                    "content": native_room_content(room),
                    "right_button": "Zurück",
                    "dismissable": True,
                    "timeout": POPUP_TIMEOUT_MS,
                    "initial_style": "wide",
                    "popup_styles": [{"style": "all", "styles": POPUP_STYLE}],
                },
            },
        },
        "view_layout": {"grid-area": room["area"]},
        "card_mod": {"style": ROOM_TILE},
    }

def native_dashboard():
    root = grid('"rooms rooms"', [room_grid_card([native_room_button(r) for r in ROOMS])])
    return {
        "kiosk_mode": {"kiosk": True},
        "views": [{
            "title": "Tablet", "path": "tablet", "type": "panel",
            "background": f"center / cover no-repeat url('{WALLPAPER}') fixed",
            "cards": [root],
        }],
    }

# ---------------------------------------------------------------- bubble variant

def bubble_room_content(room):
    names = room.get("names", {})
    cards = []
    for ent in room["entities"]:
        domain = ent.split(".")[0]
        c = {"type": "custom:bubble-card", "entity": ent}
        if ent in names:
            c["name"] = names[ent]
        if domain == "media_player":
            c.update({"card_type": "media-player", "hide": {"power_button": True},
                      "tap_action": {"action": "none"}, "button_action": {"tap_action": {"action": "none"}}})
        elif domain == "vacuum":
            c.update({"card_type": "button", "button_type": "state",
                      "tap_action": {"action": "none"}, "button_action": {"tap_action": {"action": "none"}}})
        elif ent in DIMMABLE:
            c.update({"card_type": "button", "button_type": "slider",
                      "tap_action": {"action": "toggle"}})
            if ent in COLOR_LIGHTS:
                c["sub_button"] = [{"name": "Farbe", "icon": "mdi:palette",
                                    "tap_action": {"action": "more-info"}}]
        else:
            c.update({"card_type": "button", "button_type": "switch"})
        cards.append(c)
    buttons = action_buttons(room)
    if buttons:
        cards.append({
            "type": "grid", "columns": len(buttons), "square": False,
            "cards": [{"type": "custom:bubble-card", "card_type": "button", "button_type": "name",
                       "name": n, "icon": i, "button_action": {"tap_action": a}, "tap_action": a}
                      for n, i, a in buttons],
        })
    back = {"action": "navigate", "navigation_path": "#"}
    cards.append({"type": "custom:bubble-card", "card_type": "button", "button_type": "name",
                  "name": "Zurück", "icon": "mdi:arrow-left",
                  "button_action": {"tap_action": back}, "tap_action": back})
    return {
        "type": "custom:bubble-card", "card_type": "pop-up", "hash": f"#{room['key']}",
        "name": room["name"], "icon": room["icon"], "auto_close": str(POPUP_TIMEOUT_MS),
        "close_by_clicking_outside": True, "bg_color": "#161830", "bg_opacity": "88", "bg_blur": "14",
        "cards": cards, "view_layout": {"grid-area": "pops"},
    }

BUBBLE_ROOM = """
.bubble-button-card-container { background: rgba(16, 18, 40, 0.38) !important;
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.bubble-name { font-size: 22px !important; color: #fff !important; }
.bubble-icon-container { background: rgba(255, 255, 255, 0.14) !important; }
.bubble-icon { --mdc-icon-size: 30px !important; color: #fff !important; opacity: 1 !important; }
"""

def bubble_room_button(room):
    nav = {"action": "navigate", "navigation_path": f"#{room['key']}"}
    return {
        "type": "custom:bubble-card", "card_type": "button", "button_type": "name",
        "name": room["name"], "icon": room["icon"], "card_layout": "large", "rows": 2,
        "tap_action": nav, "button_action": {"tap_action": nav},
        "styles": BUBBLE_ROOM,
        "view_layout": {"grid-area": room["area"]},
    }

def bubble_dashboard():
    rooms = room_grid_card([bubble_room_button(r) for r in ROOMS])
    rooms["layout"]["grid-template-areas"] = '"r1 r1 r1 r2 r2 r2" "r3 r3 r3 r4 r4 r4" "r5 r5 r5 . . ."'
    rooms["layout"]["grid-gap"] = "18px"
    rooms["layout"]["padding"] = "24px 24px"
    root = grid('"rooms rooms" "pops pops"', [rooms] + [bubble_room_content(r) for r in ROOMS])
    root["layout"]["grid-template-rows"] = "210px 370px auto 1fr 0px"
    return {
        "kiosk_mode": {"kiosk": True},
        "views": [{
            "title": "Tablet", "path": "tablet", "type": "panel",
            "background": f"center / cover no-repeat url('{WALLPAPER}') fixed",
            "cards": [root],
        }],
    }

# ---------------------------------------------------------------- push

DASHBOARDS = {
    "dashboard-tablet": ("Tablet", "mdi:tablet", native_dashboard),
    "dashboard-tablet-bubble": ("Tablet (Bubble)", "mdi:tablet-dashboard", bubble_dashboard),
}

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
        existing = {d["url_path"] for d in (await call({"type": "lovelace/dashboards/list"}))["result"]}
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
