// custom:tablet-appliances-card — one row of appliance tiles in the room-button
// style: icon, name, status line, progress bar while running, and round action
// buttons where the appliance can be controlled.
//
//   items:
//     - kind: washer       running, state, program, remaining (min), progress (%)
//     - kind: dishwasher   power, operation, program, programs (id → label), finish, progress, door
//     - kind: vacuum       entity, status, battery, progress

import { ensureShell, esc } from "./shared.js";

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

  _fmt(id) {
    const st = this._s(id);
    return st ? this._hass.formatEntityState?.(st) ?? st.state : "";
  }

  /** { status, active, progress (0–100 | null), buttons: [{icon, on, call}] } */
  _view(item) {
    const v = (id) => this._s(id)?.state;
    if (item.kind === "washer") {
      const active = v(item.running) === "on";
      const rem = Number(v(item.remaining));
      const status = active
        ? [v(item.program), Number.isFinite(rem) && OK(v(item.remaining)) ? `noch ${Math.round(rem)} min` : ""].filter(OK).join(" · ")
        : this._fmt(item.state);
      return { status, active, progress: active ? Number(v(item.progress)) || 0 : null, buttons: [] };
    }
    if (item.kind === "dishwasher") {
      const op = v(item.operation);
      const active = ["run", "delayedstart", "pause"].includes(op);
      let status = this._fmt(item.operation);
      if (active) {
        const prog = item.programs?.[v(item.program)] ?? "Programm läuft";
        const finish = Date.parse(v(item.finish));
        const rem = Number.isFinite(finish) ? `noch ${Math.max(0, Math.round((finish - Date.now()) / 60000))} min` : "";
        status = [prog, op === "delayedstart" ? "Startzeitvorwahl" : rem].filter(OK).join(" · ");
      } else if (v(item.door) === "open") {
        status = [status, "Tür offen"].filter(OK).join(" · ");
      }
      const power = v(item.power) === "on";
      return {
        status, active, progress: active ? Number(v(item.progress)) || 0 : null,
        buttons: item.power ? [{ icon: "mdi:power", on: power, call: ["switch", "toggle", { entity_id: item.power }] }] : [],
      };
    }
    // vacuum
    const vac = v(item.entity);
    const active = ["cleaning", "returning"].includes(vac);
    const battery = v(item.battery);
    const status = [this._fmt(item.status) || this._fmt(item.entity), OK(battery) ? `${battery} %` : ""].filter(OK).join(" · ");
    return {
      status, active, progress: vac === "cleaning" ? Number(v(item.progress)) || 0 : null,
      buttons: [
        vac === "cleaning"
          ? { icon: "mdi:pause", on: true, call: ["vacuum", "pause", { entity_id: item.entity }] }
          : { icon: "mdi:play", on: false, call: ["vacuum", "start", { entity_id: item.entity }] },
        { icon: "mdi:home-import-outline", on: false, call: ["vacuum", "return_to_base", { entity_id: item.entity }] },
      ],
    };
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const content = ensureShell(this.shadowRoot, `
      :host { display: block; height: 100%; }
      ha-card { height: 100%; background: none; border: none; box-shadow: none; color: #fff; }
      .content { height: 100%; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 14px; }
      .tile { position: relative; overflow: hidden; border-radius: 28px; padding: 16px 18px; box-sizing: border-box;
        background: rgba(16, 18, 40, 0.46); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
        display: flex; flex-direction: column; justify-content: center; gap: 4px; min-width: 0; }
      .tile.active { background: rgba(40, 70, 120, 0.55); }
      .top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
      .icon { width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.14);
        display: grid; place-items: center; --mdc-icon-size: 28px; flex: none; }
      .active .icon { background: rgba(255,255,255,0.92); color: #161830; }
      .buttons { margin-left: auto; display: flex; gap: 8px; }
      .buttons button { width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
        background: rgba(255,255,255,0.14); color: #fff; display: grid; place-items: center; --mdc-icon-size: 26px; }
      .buttons button.on { background: #fff; color: #161830; }
      .name { font-size: 21px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .status { font-size: 17px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .progress { position: absolute; left: 0; bottom: 0; height: 6px; background: #7cc4ff; transition: width .5s; }
    `);
    const views = this._config.items.map((item) => ({ item, ...this._view(item) }));
    const key = JSON.stringify(views.map(({ item, buttons, ...rest }) => [rest, buttons.map((b) => [b.icon, b.on])]));
    if (key === this._key) return;
    this._key = key;
    content.innerHTML = views
      .map(({ item, status, active, progress, buttons }, i) => `
        <div class="tile${active ? " active" : ""}">
          <div class="top">
            <div class="icon"><ha-icon icon="${esc(item.icon)}"></ha-icon></div>
            <div class="buttons">${buttons
              .map((b, j) => `<button class="${b.on ? "on" : ""}" data-i="${i}" data-j="${j}"><ha-icon icon="${esc(b.icon)}"></ha-icon></button>`)
              .join("")}</div>
          </div>
          <div class="name">${esc(item.name)}</div>
          <div class="status">${esc(status || "–")}</div>
          ${progress !== null ? `<div class="progress" style="width:${Math.max(2, progress)}%"></div>` : ""}
        </div>`)
      .join("");
    content.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        const [domain, service, data] = views[btn.dataset.i].buttons[btn.dataset.j].call;
        this._hass.callService(domain, service, data);
      }),
    );
  }
}
