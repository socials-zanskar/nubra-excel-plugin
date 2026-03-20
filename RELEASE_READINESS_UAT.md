# UAT Release Readiness

## Scope
This checklist is for the Excel plugin UAT trading route:
- single buffered LTP limit order
- strategy preview and tracking
- basket deploy
- safe square-off
- pending-fill reconciliation
- closed-trade archival

## Reference Sources
Local strategy and safety references:
- `nubra_optionschain/examples/run_dashboard.py`
- `nubra_optionschain/src/nubra_optionschain/api.py`
- `nubra_optionschain/examples/order_placement.py`

Local REST references:
- `rest_api/RESTAPIPlaceOrder.py`
- `rest_api/RESTAPIOrders.py`

Official Nubra docs used in implementation:
- `https://nubra.io/products/api/docs/guides/PlaceOrder/index.html`
- `https://nubra.io/products/api/docs/rest-apis/orders/`
- `https://nubra.io/products/api/docs/rest-apis/orders/getbasket/`
- `https://nubra.io/products/api/docs/python-sdk/trading/orders/place-order.html`
- `https://nubra.io/products/api/docs/python-sdk/trading/orders/place-flexi-order.html`

## API Contract (UAT)
Primary UAT order endpoints:
- `POST /orders/v2/single` (single buffered LTP limit order)
- `POST /orders/v2/basket` (deploy and square-off)
- `GET /orders/v2/basket?tag=<tag>` (monitor and reconciliation)
- `GET /orders/v2` and `GET /orders/{order_id}` (lookup)
- `GET /portfolio/positions` (no-new-exposure and reconciliation)

## UAT Acceptance Criteria
1. Market order is blocked outside UAT.
2. Single buffered LTP limit order enforces:
- positive integer `ref_id`
- positive integer `order_qty`
- `price_type=LIMIT`
- broker order price derived from live LTP with a side-aware buffer
3. Quantity checks match `nubra_optionschain` behavior:
- positive integer
- lot-size multiple when lot size is known
4. Basket deploy success is not accepted as final when success-like status lacks `basket_id`.
5. Square-off uses safe exit order trimming against live net positions and blocks fresh exposure.
6. Square-off tracks:
- `pending_fill`
- `square_off_position_closed`
- `filled`
7. Closed-trade record is archived only after filled reconciliation and contains:
- entry basket id
- exit basket id
- entry price once
- exit price once
- booked PnL
- legs snapshot
8. `PlaceOrder` sheet reflects latest deploy, square-off, and closed-trade history.

## Distribution Acceptance Criteria
1. Build folder succeeds:
```powershell
npm run build:dist
```
2. Distribution validation succeeds:
```powershell
npm run validate:dist
```
3. If another dev-server is already running on machine:
```powershell
npm run validate:dist:allow-foreign
```
4. Shipped bundle contains:
- `NubraExcelLauncher.exe`
- `runtime\node\node.exe`
- `node_modules\office-addin-dev-settings\cli.js`
- `node_modules\office-addin-dev-certs\cli.js`
- `taskpane.js`, `taskpane.html`, `taskpane.css`
- `dev-server.js`, `manifest.xml`

## UAT Test Sequence
1. Launch bundle:
```powershell
.\ship\NubraExcelPlugin\NubraExcelLauncher.exe
```
2. Login UAT from plugin.
3. Place one buffered LTP limit order from `Order Strategy`.
4. Build strategy preview and track.
5. Build deploy basket preview and submit.
6. Verify basket monitor by tag.
7. Build square-off preview and submit.
8. Wait for reconciliation to move from `pending_fill` to `filled`.
9. Confirm closed trade appears in:
- `Completed Trades` panel
- `PlaceOrder` sheet history

## Known Non-Goals For This UAT Release
- PROD order placement rollout
- broker-grade secret vaulting
- enterprise installer packaging
