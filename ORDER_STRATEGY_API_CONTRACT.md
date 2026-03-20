# Order Strategy API Contract

## Confirmed For Immediate Implementation

### Single Buffered LTP Order
- Endpoint: `POST /orders/v2/single`
- Auth:
  - `Authorization: Bearer <session_token>`
  - `x-device-id: <device_id>`
- Confirmed request fields from local REST samples:
  - `ref_id`
  - `order_type`
  - `order_qty`
  - `order_side`
  - `order_delivery_type`
  - `validity_type`
  - `price_type`
  - `tag`

### Minimal Buffered LTP Limit Payload
```json
{
  "ref_id": 1842210,
  "order_type": "ORDER_TYPE_REGULAR",
  "order_qty": 1,
  "order_side": "ORDER_SIDE_BUY",
  "order_delivery_type": "ORDER_DELIVERY_TYPE_CNC",
  "validity_type": "IOC",
  "price_type": "LIMIT",
  "order_price": 12345,
  "tag": "excel_market_order"
}
```

### Validation Applied In Plugin
- `price_type` is fixed to `LIMIT`
- `order_price` is derived from live LTP with a side-aware buffer
- `ref_id` must be a positive integer
- `order_qty` must be a positive integer
- if cached instrument metadata provides `lot_size`, `order_qty` must be a multiple of it
- `ref_id` can be resolved from synced instrument data by `symbol/asset + exchange`

### Order Lookup
- Day orders: `GET /orders/v2`
- Order details: `GET /orders/{order_id}`
- Basket lookup by tag: `GET /orders/v2/basket?tag=<tag>`
- Filters used in plugin:
  - `tag`
  - `executed=true`
  - `executed=false`

## Confirmed For Strategy/Basket Phase

### Flexi Basket Placement
- Python SDK flow clearly uses `flexi_order(...)`
- Basket success must carry `basket_id`
- Square-off flow depends on:
  - basket lookup
  - fill verification
  - net position verification

### Basket Rules Preserved From Python
1. Do not treat success as placed if `basket_id` is missing
2. Reject invalid or non-multiple quantities
3. Track pending square-off separately from filled square-off
4. Block square-off if it would create new exposure

## Local Reference Files
- `rest_api/RESTAPIPlaceOrder.py`
- `rest_api/RESTAPIMultiOrder.py`
- `nubra_optionschain/examples/order_placement.py`
- `nubra_optionschain/examples/run_dashboard.py`
- `nubra_optionschain/src/nubra_optionschain/api.py`

## Decision
- Implement single buffered LTP limit order now on the isolated `Order Strategy` page
- Implement UAT-only basket strategy deploy now that `POST /orders/v2/basket` is confirmed
- Keep PROD out of scope for this phase

## Preview Layer
- Strategy preview is generated locally from live option-chain rows already present in the Excel plugin.
- Selection behavior is modeled on:
  - `select_straddle`
  - `select_strangle`
  - `select_iron_butterfly`
  - `select_iron_condor`
  - `_pair_groups`
  - `_compute_strategy_greeks`
- Reference source:
  - `nubra_optionschain/src/nubra_optionschain/strategy.py`
  - `nubra_optionschain/src/nubra_optionschain/api.py`

## Excel Projection
- The plugin now projects the latest order-strategy state into the `PlaceOrder` worksheet.
- Persisted per environment:
  - latest strategy preview
  - latest tracked strategy
  - latest market order request/response summary
  - latest order lookup summary

## Tracked Strategy
- The plugin now has a tracked-state concept modeled on `nubra_optionschain._tracked`.
- Tracked state stores:
  - `symbol`
  - `strategy`
  - `target_delta`
  - `selected_at`
  - `pair_number`
  - `baseline`
  - `legs`
- A deploy-ready payload preview is generated from tracked state using the same high-level structure as `_build_deploy_payload`.
- Requested deploy quantity follows the same rule as the Python worker:
  - if empty, default to lot size
  - if provided, it must be a positive integer
  - if lot sizes are known, it must be a multiple of each relevant lot size

## Flexi Order Preview
- The plugin now builds a preview-only flexi order request body using the tracked strategy state.
- Shape is derived from the Python `flexi_order(...)` examples:
  - `exchange`
  - `basket_name`
  - `tag`
  - `orders[]`
    - `ref_id`
    - `order_qty`
    - `order_side`
  - `basket_params`
    - `order_side`
    - `order_delivery_type`
    - `price_type`
    - `entry_price` for `LIMIT`
    - `multiplier`

## Live UAT Basket Submit
- Official REST basket endpoint confirmed: `POST /orders/v2/basket`
- Current plugin guardrails:
  - UAT only
  - requires a built deploy preview
  - live submit enabled only for `MARKET` basket price type in this phase
  - treats success without `basket_id` as failure
  - immediately reuses tag-based basket monitoring after submit
  - reconstructs `entry_price_once` from broker basket data when available

## Live UAT Square-Off
- Square-off uses the same basket endpoint: `POST /orders/v2/basket`
- Exit preview is built from tracked legs, then trimmed using live `/portfolio/positions`
- Current plugin square-off states mirror the Python worker:
  - `pending_fill`
  - `square_off_position_closed=true` but still waiting for fill price
  - `filled`
- Broker-side reconciliation uses:
  - `GET /orders/v2/basket?tag=<exit_tag>`
  - per-order `buy_qty` / `sell_qty`
  - per-order `buy_avg` / `sell_avg`
- When reconciliation confirms `filled`, the plugin archives one closed trade record with:
  - entry basket id
  - exit basket id
  - entry price
  - exit price
  - booked PnL
  - original legs

## Basket Monitor
- The plugin now includes a read-only basket monitor using tag-based basket lookup.
- It mirrors the Python tag-verification pattern:
  - tag lookup
  - matched basket id
  - basket status
  - basket count
- It now supports:
  - bounded basket-status history persisted per environment
  - optional auto refresh on the existing 15-second workspace heartbeat
  - `PlaceOrder` worksheet projection for latest snapshot and history
- Reference source:
  - `nubra_optionschain/examples/run_dashboard.py`
