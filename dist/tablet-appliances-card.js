// custom:tablet-appliances-card — one row of appliance tiles in the room-button
// style: icon, name, status line, a horizontal progress fill while running
// (blue washer, yellow dishwasher, green vacuum) and round action buttons
// where the appliance can be controlled. Status texts are German regardless
// of the viewer's HA language.
//
//   items:
//     - kind: washer       running, state, program, remaining (min), progress (%)
//     - kind: dishwasher   quiet (switch), operation, program, programs (id → label), finish, progress, door
//     - kind: vacuum       entity, cleaning (binary_sensor), status, battery, progress

import { MARQUEE_CSS, marquee, press, remaining, ensureShell, esc } from "./shared.js";

const STATES = {
  washer: { off: "Aus", idle: "Bereit", starting: "Startet", running: "Läuft", paused: "Pausiert",
    user_paused: "Pausiert", ending: "Endet", finished: "Fertig", anti_wrinkle: "Knitterschutz",
    delay_wait: "Startzeitvorwahl", interrupted: "Unterbrochen", force_stopped: "Abgebrochen", clean: "Sauber" },
  dishwasher: { inactive: "Aus", ready: "Bereit", delayedstart: "Startzeitvorwahl", run: "Läuft", pause: "Pausiert",
    actionrequired: "Aktion nötig", finished: "Fertig", error: "Fehler", aborting: "Bricht ab" },
  vacuum: { charging: "Lädt", charging_complete: "Geladen", cleaning: "Saugt", segment_cleaning: "Saugt Räume",
    zoned_cleaning: "Saugt Bereich", spot_cleaning: "Spot-Reinigung", returning_home: "Fährt zur Station",
    docking: "Dockt an", idle: "Bereit", paused: "Pausiert", error: "Fehler", emptying_the_bin: "Leert Behälter",
    washing_the_mop: "Wäscht Mopp", going_to_wash_the_mop: "Fährt zum Moppwaschen", mapping: "Kartiert",
    air_drying_stopping: "Trocknet", robot_status_mopping: "Wischt", segment_mopping: "Wischt Räume",
    zoned_mopping: "Wischt Bereich", device_offline: "Offline", docked: "Angedockt", returning: "Fährt zur Station" },
};
const FILL = { washer: "#3b82f6", dishwasher: "#eab308", vacuum: "#22c55e" };
const UNAVAILABLE = { unavailable: "Nicht verfügbar", unknown: "Unbekannt" };

const OK = (v) => v !== undefined && v !== null && v !== "unknown" && v !== "unavailable" && v !== "";

export class TabletAppliancesCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config.items) || !config.items.length) {
      throw new Error("tablet-appliances-card: `items` must be a non-empty list");
    }
    this._config = config;
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 2;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  _s(id) {
    return id ? this._hass.states[id] : undefined;
  }

  _fmt(id, kind) {
    const st = this._s(id);
    if (!st) return "";
    return STATES[kind]?.[st.state] ?? UNAVAILABLE[st.state] ?? this._hass.formatEntityState?.(st) ?? st.state;
  }

  /** { status, active, progress (0–100 | null), buttons: [{icon, on, call}] } */
  _view(item) {
    const v = (id) => this._s(id)?.state;
    if (item.kind === "washer") {
      const active = v(item.running) === "on";
      const rem = Number(v(item.remaining));
      const status = active
        ? [Number.isFinite(rem) && OK(v(item.remaining)) ? remaining(rem) : "", v(item.program)].filter(OK).join(" · ")
        : this._fmt(item.state, "washer");
      return { status, active, progress: active ? Number(v(item.progress)) || 0 : null, buttons: [] };
    }
    if (item.kind === "dishwasher") {
      const op = v(item.operation);
      const active = ["run", "delayedstart", "pause"].includes(op);
      let status = this._fmt(item.operation, "dishwasher");
      if (active) {
        const prog = item.programs?.[v(item.program)] ?? "Programm läuft";
        const finish = Date.parse(v(item.finish));
        const rem = Number.isFinite(finish) ? remaining((finish - Date.now()) / 60000) : "";
        status = [op === "delayedstart" ? "Startzeitvorwahl" : rem, prog].filter(OK).join(" · ");
      } else if (v(item.door) === "open") {
        status = [status, "Tür offen"].filter(OK).join(" · ");
      }
      // Only control: quiet mode ("silence on demand"), and only while a program runs.
      const quiet = v(item.quiet);
      const canQuiet = op === "run" && item.quiet && quiet !== "unavailable";
      return {
        status, active, progress: active ? Number(v(item.progress)) || 0 : null,
        buttons: canQuiet ? [{ icon: "mdi:volume-off", on: quiet === "on", call: ["switch", "toggle", { entity_id: item.quiet }] }] : [],
      };
    }
    // vacuum — the vacuum entity stays "docked" while a job starts (mop
    // washing etc.), so a job counts as running when `cleaning` is on too.
    const vac = v(item.entity);
    const job = v(item.cleaning) === "on" || ["cleaning", "returning"].includes(vac);
    const paused = vac === "paused" || v(item.status) === "paused";
    const active = job && !paused;
    const battery = v(item.battery);
    const statusState = v(item.status);
    const docked = vac === "docked" || ["charging", "charging_complete", "idle"].includes(statusState);
    // Sitting in the dock without a job is "Bereit"; battery only while below 100 % or on the move.
    const label = !job && !paused && docked ? "Bereit" : this._fmt(item.status, "vacuum") || this._fmt(item.entity, "vacuum");
    const showBattery = OK(battery) && (job || Number(battery) < 100);
    const status = [label, showBattery ? `Akku ${battery} %` : ""].filter(OK).join(" · ");
    const call = (service) => ["vacuum", service, { entity_id: item.entity }];
    const buttons = active
      ? [{ icon: "mdi:pause", on: true, call: call("pause") }, { icon: "mdi:stop", on: false, call: call("stop") }]
      : paused
        ? [{ icon: "mdi:play", on: false, call: call("start") }, { icon: "mdi:stop", on: false, call: call("stop") }]
        : [{ icon: "mdi:play", on: false, call: call("start") }];
    buttons.push({ icon: "mdi:home-import-outline", on: false, call: call("return_to_base") });
    return { status, active: job, progress: job ? Number(v(item.progress)) || 0 : null, buttons };
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const content = ensureShell(this.shadowRoot, `
      :host { display: block; height: 100%; }
      ha-card { height: 100%; background: none; border: none; box-shadow: none; color: #fff; }
      .content { height: 100%; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 14px; }
      .tile { position: relative; overflow: hidden; border-radius: 28px; padding: 16px 20px; box-sizing: border-box;
        background: rgba(16, 18, 40, 0.46); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
        display: flex; flex-direction: column; justify-content: center; gap: 4px; min-width: 0; }
      .tile > :not(.progress) { position: relative; }
      .top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
      .icon { width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.14);
        display: grid; place-items: center; --mdc-icon-size: 28px; flex: none; }
      .active .icon { background: rgba(255,255,255,0.92); color: #161830; }
      .buttons { margin-left: auto; display: flex; gap: 8px; }
      .buttons button { width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
        background: rgba(255,255,255,0.14); color: #fff; display: grid; place-items: center; --mdc-icon-size: 26px; }
      .buttons button.on { background: #fff; color: #161830; }
      .name { font-size: 21px; font-weight: 600; white-space: nowrap; overflow: hidden; }
      .status { font-size: 17px; opacity: .85; white-space: nowrap; overflow: hidden; }
      ${MARQUEE_CSS}
      .progress { position: absolute; inset: 0 auto 0 0; border-radius: inherit; opacity: .6; transition: width .5s; }
      ${press(".buttons button", 0.88)}
    `);
    const views = this._config.items.map((item) => ({ item, ...this._view(item) }));
    const key = JSON.stringify(views.map(({ item, buttons, ...rest }) => [rest, buttons.map((b) => [b.icon, b.on])]));
    if (key === this._key) return;
    this._key = key;
    content.innerHTML = views
      .map(({ item, status, active, progress, buttons }, i) => `
        <div class="tile${active ? " active" : ""}">
          ${progress !== null ? `<div class="progress" style="width:${Math.max(3, Math.min(100, progress))}%;background:${FILL[item.kind]}"></div>` : ""}
          <div class="top">
            <div class="icon"><ha-icon icon="${esc(item.icon)}"></ha-icon></div>
            <div class="buttons">${buttons
              .map((b, j) => `<button class="${b.on ? "on" : ""}" data-i="${i}" data-j="${j}"><ha-icon icon="${esc(b.icon)}"></ha-icon></button>`)
              .join("")}</div>
          </div>
          <div class="name">${esc(item.name)}</div>
          <div class="status">${esc(status || "–")}</div>
        </div>`)
      .join("");
    // Status or name too long for the tile: scroll it sideways instead of cutting it off.
    requestAnimationFrame(() => marquee(content.querySelectorAll(".name, .status")));
    content.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        const [domain, service, data] = views[btn.dataset.i].buttons[btn.dataset.j].call;
        this._hass.callService(domain, service, data);
      }),
    );
  }
}
