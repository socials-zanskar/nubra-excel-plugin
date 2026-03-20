# Order Strategy Phase 0

## Goal
Freeze the API contract and risk model for order placement before implementing live deploy or square-off inside the Excel plugin.

## Current State
- The Excel plugin already handles auth, environment switching, REST proxying, and websocket streaming.
- The isolated `Order Strategy` page now implements:
  - single market order placement
  - order lookup
  - strategy preview from live option-chain data
  - tracked strategy state
  - deploy payload preview
  - flexi request preview
  - basket monitor with history
- The `PlaceOrder` worksheet now mirrors the latest strategy/order state, but live basket deploy and square-off are still not enabled.
- The Python project contains the deploy and square-off workflow logic, but it places orders through SDK calls rather than visible raw REST calls.

## Non-Negotiable Discovery Items
1. Raw broker REST endpoint for basket or flexi order placement
2. Request payload shape for entry basket
3. Success response shape, especially durable identifiers like `basket_id`
4. Endpoint for basket status lookup
5. Endpoint for order execution or fill lookup
6. Endpoint or safe method for square-off
7. Position response fields needed to verify net open quantity by `ref_id`
8. Lot size source of truth for quantity validation
9. Environment differences between UAT and PROD
10. Rate limits, timeout behavior, and retry-safe semantics

## Payload Parity To Preserve From Python
- `symbol`
- `asset`
- `expiry`
- `strategy`
- `target_delta`
- `pair_number`
- `selected_at`
- `baseline_greeks`
- `strategy_tag_base`
- `entry_tag`
- `exit_tag`
- `order_qty`
- `legs[]`
  - `side`
  - `option_type`
  - `ref_id`
  - `strike_raw`
  - `strike`

## Safety Rules To Preserve
1. No deploy if no tracked legs exist
2. `order_qty` must be a positive integer
3. `order_qty` must be a valid multiple of lot size
4. Do not mark order as placed unless the broker response includes a durable identifier
5. Square-off must not create fresh exposure
6. Pending-fill state must be tracked distinctly from filled state
7. UAT and PROD state must stay isolated
8. Every deploy and square-off must be logged

## Phase 0 Deliverables
1. Confirmed REST contract document for deploy and square-off
2. JS-side payload schema matching Python intent
3. Final validation checklist for entry and exit
4. Go or no-go decision for Phase 1 implementation

## Exit Criteria
Phase 0 is complete only when deploy and square-off can be described as raw HTTP flows without depending on Python or the SDK.

## Findings So Far
1. Single market order is already supported through raw REST and can be implemented immediately with `POST /orders/v2/single`.
2. Local test scripts confirm `price_type: "MARKET"` with bearer session token plus `x-device-id`.
3. The Excel plugin now has enough contract parity to preview strategy deploys and monitor tag-based basket lifecycle without Python.
4. Official and local references confirm basket placement through `POST /orders/v2/basket`, so UAT-only live basket submit can now be enabled from the preview body.
5. The Python no-new-exposure square-off rule has now been ported into the plugin using live `/portfolio/positions`.
6. Pending square-off reconciliation is now modeled on the Python worker: position closure and broker fill confirmation are tracked separately.
7. Confirmed square-off fills are now frozen into closed trade records with entry/exit basket ids and booked PnL.
