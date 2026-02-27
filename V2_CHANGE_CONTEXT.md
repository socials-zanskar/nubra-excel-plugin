# V2 Change Context (Easy Undo Guide)

Date: 2026-02-25

Files changed:
- `taskpane.html`
- `taskpane.css`
- `taskpane.js`

## What was added

1. UX clarity
- Persistent active environment chip (`#activeEnvChip`)
- Settings button now labeled (`Settings`) with tooltip
- Env auth tags now show `Authenticated` / `Not Auth`
- Master empty-state quick actions:
  - `#masterQuickStartPricesButton`
  - `#masterQuickStartOcButton`

2. Trading safety
- Env risk framing styles via `body.env-uat` / `body.env-live`
- Risk accents on `#positionsPanel` and `#historicalPanel` (`.risk-sensitive-card`)
- New setting: `Confirm before PROD order actions` (`#confirmProdOrderInput`)
  - Storage key: `nubra.excel.confirm_prod_order`
  - Guard currently applies to REST paths containing `/order`, `/orders`, or `placeorder` for POST/PUT/DELETE in PROD

3. Reliability/performance
- Env switch behavior is now controlled by setting:
  - `Clear stream sheets on environment switch` (`#clearOnEnvSwitchInput`)
  - Storage key: `nubra.excel.clear_on_env_switch`
  - Default: OFF (so env switch does not clear stream sheets)
- Per-sheet refresh policy added in `taskpane.js`:
  - `SHEET_REFRESH_POLICY`
  - `REFRESH_REASON`
  - `shouldRefreshSheet(...)`
- PlaceOrder env refresh hook added:
  - `refreshPlaceOrderSheetForEnvSwitch()`
  - Updates `PlaceOrder!A1:B2` if sheet exists
- SSE reconnect backoff with visible labels:
  - `#masterReconnectLabel`, `#livePricesReconnectLabel`, `#liveOcReconnectLabel`
  - Exponential backoff up to 20s

4. Telemetry
- New panel: `#telemetryLog`
- Logs include:
  - WS start/stop
  - API latency and failures
  - Last successful sheet write
  - Reconnect scheduling

## Quick rollback options

1. Soft rollback (runtime toggles)
- Turn OFF in Settings:
  - `Clear stream sheets on environment switch` (if you want old clear behavior, turn ON)
  - `Confirm before PROD order actions`

2. Hard rollback of major policy logic
- In `taskpane.js`, remove or bypass:
  - `SHEET_REFRESH_POLICY`
  - `shouldRefreshSheet(...)`
  - `refreshPlaceOrderSheetForEnvSwitch()`
  - Reconnect-label helpers and backoff in `openSse`

3. UI-only rollback
- Revert IDs/classes introduced in:
  - `taskpane.html`: `activeEnvChip`, `telemetryLog`, reconnect labels, master quick action block, new settings checkboxes
  - `taskpane.css`: `.active-env-chip`, `.reconnect-label`, `.risk-sensitive-card`, `.settings-btn`, env body classes

