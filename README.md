# Nubra Excel Plugin (Phase 1)

Node-only Excel Office Add-in for:

- OTP + MPIN authentication
- Instrument sync (`Instruments` sheet)
- WebSocket-driven sheets:
  - `Master`
  - `LivePrices`
  - `LiveOptionChain`
- REST positions sheet (`Positions`)

No Python runtime is required for this plugin.

## One-time setup (automated)

From repo root:

```powershell
npm run excel:setup
```

This script installs dev certs, enables loopback, and prepares Office sideloading.

## Start (automated)

```powershell
npm run excel:start
```

This starts the HTTPS dev server (`https://localhost:3000`) and sideloads the add-in into Excel.

## Stop

```powershell
npm run excel:stop
```

## Endpoints used

- Auth (REST): `sendphoneotp`, `verifyphoneotp`, `verifypin`
- Refdata (REST): `refdata/refdata/{date}?exchange=...`
- Positions (REST): `portfolio/positions`
- WS bridge (local server): `/ws/start`, `/ws/events`, `/ws/stop`, `/ws/status`
- Nubra WS targets (server-side): `wss://api.nubra.io/apibatch/ws`, `wss://uatapi.nubra.io/apibatch/ws`

## Implementation notes

- `x-device-id` is generated once and reused.
- Session tokens are stored in browser local storage for MVP convenience.
- After OTP verification, UI auto-switches to MPIN stage.
- After successful login, auth panel auto-collapses and shows authenticated badge.
