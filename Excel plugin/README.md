# Nubra Excel Plugin

## Purpose
The Nubra Excel Plugin is a Microsoft Excel Office Add-in developed on behalf of Nubra to provide authenticated market access and live trading data directly inside Excel.

This plugin supports:
- OTP and MPIN-based user authentication
- Instrument reference-data sync
- Live WebSocket market feeds
- Positions retrieval over REST
- Historical candles retrieval over REST with chart output in Excel

The implementation is Node.js-based and does not require Python.

## Functional Scope
The add-in manages and updates the following sheets:
- `Instruments`: reference data sync
- `Master`: normalized live stream output
- `LivePrices`: live price updates
- `LiveOptionChain`: option-chain live updates
- `Positions`: REST-based positions snapshot
- `Historical`: historical candles + auto-generated line chart

## Technology Overview
- Frontend: HTML/CSS/JavaScript (Office task pane)
- Local bridge/server: Node.js (`dev-server.js`)
- Add-in manifest: `manifest.xml`
- Launch automation: PowerShell scripts
  - `setup-local.ps1`
  - `start-all.ps1`
  - `stop-all.ps1`

## Environment Requirements
- Windows machine
- Microsoft Excel (desktop, Microsoft 365 recommended)
- Node.js 18+ with `npm` and `npx`
- PowerShell 5.1+
- Internet access to Nubra REST and WebSocket endpoints
- Administrator privileges (one-time setup step for loopback exemption)

## Prerequisite Downloads (Before Setup)
Install these before running `npm run setup`:

1. Node.js LTS (includes `npm` and `npx`)
   - Download: `https://nodejs.org/`
   - Verify in PowerShell:
     ```powershell
     node -v
     npm -v
     npx -v
     ```
2. Microsoft Excel Desktop (Microsoft 365)
   - Ensure Excel desktop app is installed and opens normally.
3. PowerShell 5.1+ (Windows default on supported systems)
   - Verify:
     ```powershell
     $PSVersionTable.PSVersion
     ```

## If Setup Stops Due to Missing Tools
If setup/launch stops with missing command errors (for example `node`, `npm`, or `npx`):

1. Install Node.js LTS from `https://nodejs.org/`.
2. Close and reopen terminal.
3. Verify:
   ```powershell
   node -v
   npm -v
   npx -v
   ```
4. Retry:
   ```powershell
   npm run setup
   npm run start
   ```

## Project Structure
- `taskpane.html`, `taskpane.js`, `taskpane.css`: Excel task pane UI and logic
- `dev-server.js`: HTTPS local dev server and WebSocket bridge
- `manifest.xml`: Office Add-in manifest for sideloading
- `setup-local.ps1`: one-time local machine preparation
- `start-all.ps1`: starts server and sideloads into Excel
- `stop-all.ps1`: stops local server process

## One-Time Setup
Run once on a new machine:

```powershell
npm run setup
```

What this does:
- Installs dependencies (if needed)
- Installs/trusts Office development localhost certificate
- Enables Office/WebView loopback for `https://localhost:3000`
- Applies required app container loopback exemptions

## Launch the Extension
Run:

```powershell
npm run start
```

This command:
- Starts the local HTTPS server at `https://localhost:3000`
- Verifies server readiness via `/ws/status`
- Registers and sideloads the add-in manifest into desktop Excel

## Stop the Extension
Run:

```powershell
npm run stop
```

## API and Connectivity Context
REST endpoints used by the plugin:
- Auth: `sendphoneotp`, `verifyphoneotp`, `verifypin`
- Refdata: `refdata/refdata/{date}?exchange=...`
- Positions: `portfolio/positions`
- Historical: `POST /charts/timeseries`

Local bridge endpoints:
- `/ws/start`
- `/ws/events`
- `/ws/stop`
- `/ws/status`

Nubra WebSocket upstream targets:
- `wss://api.nubra.io/apibatch/ws`
- `wss://uatapi.nubra.io/apibatch/ws`

## Historical Data Module
The task pane includes a dedicated **Historical Data (REST)** section with:
- Symbol input: `Stock/Index/Option`
- Type: `STOCK`, `INDEX`, `OPT`
- Exchange: `NSE`, `BSE`
- Date range: `Start Date`, `End Date` (IST UI dates)
- Interval: `1s`, `1m`, `2m`, `3m`, `5m`, `15m`, `30m`, `1h`, `1d`, `1w`, `1mt`
- Action: `Build Historical Sheet + Chart`

### Validation and Constraints
- Login is required before historical requests.
- `Start Date` and `End Date` are mandatory.
- `Start Date` cannot be greater than `End Date`.
- `1s` interval is allowed only in `LIVE/PROD`.
- For `1s`, start and end date must be the same day.
- For `1s` in `LIVE/PROD`, selected day must be within previous 7 days.

### Historical Request Payload (high level)
The add-in sends `POST /charts/timeseries` with:
- `exchange`, `type`, `values` (symbol list)
- `fields`: `open`, `high`, `low`, `close`, `volume`
- `startDate` and `endDate` converted from IST date selection to UTC ISO
- `interval`, `intraDay: false`, `realTime: false`

### Historical Output in Excel
The add-in creates or refreshes a worksheet named `Historical` and writes:
- Metadata block: symbol, type, exchange, interval, start/end date, update time
- Candle table columns: `ts_ist`, `close`, `open`, `high`, `low`, `volume`
- Numeric formatting for OHLC columns
- A line chart of close price (`symbol Close (interval)`) placed on the same sheet

## Authentication and Session Behavior
- `x-device-id` is generated once and reused for the client
- OTP step transitions automatically to MPIN step in UI flow
- On successful login, authentication panel is collapsed and state is reflected in UI
- Session artifacts are stored in browser local storage (MVP behavior)

## Operational Notes
- If setup was not run as admin, loopback configuration may fail
- If sideload does not appear in Excel, rerun `npm run start`
- Dev server logs are written to `dev-server.log`
- If startup fails, inspect the log and confirm certificate trust and loopback exemptions

## Compliance and Deployment Note
This repository currently targets local development and sideload validation. For broker-grade production deployment, hardening is recommended for:
- Session/token storage strategy
- Secret management and environment isolation
- Audit logging and user activity traceability
- Secure packaging and controlled distribution
