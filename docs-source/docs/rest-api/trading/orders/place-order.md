# Place Order

The Place Order endpoint allows you to execute a single buy or sell order by specifying essential parameters such as instrument, quantity, side, delivery type, validity, and price type.

```jsx
Method: POST
Endpoint: orders/v2/single
```

## Limit Order

### cURL
```bash
curl --location 'https://api.nubra.io/orders/v2/single' \
--header 'x-device-id: {{x_device_id}}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer {{session_token}}' \
--data '{
  "ref_id": 1842210,
  "order_type": "ORDER_TYPE_REGULAR",
  "order_qty": 1,
  "order_side": "ORDER_SIDE_BUY",
  "order_delivery_type": "ORDER_DELIVERY_TYPE_CNC",
  "validity_type": "DAY",
  "price_type": "LIMIT",
  "order_price": {{order_price_in_paise}},
  "tag": "reliance_limit_at_ltp",
  "algo_params": {}
}'
```

### Payload

```jsx
{
  "ref_id": 1842210,
  "order_type": "ORDER_TYPE_REGULAR",
  "order_qty": 1,
  "order_side": "ORDER_SIDE_BUY",
  "order_delivery_type": "ORDER_DELIVERY_TYPE_CNC",
  "validity_type": "DAY",
  "price_type": "LIMIT",
  "order_price": {{order_price_in_paise}},
  "tag": "reliance_limit_at_ltp",
  "algo_params": {}
}
```

## Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ref_id | int | Yes | The instrument reference id received from Instrument API (e.g., "69353") |
| order_type | enum | Yes | ORDER_TYPE_REGULAR, ORDER_TYPE_STOPLOSS, ORDER_TYPE_ICEBERG |
| order_qty | int | Yes | Quantity of contracts or shares |
| order_side | enum | Yes | ORDER_SIDE_BUY or ORDER_SIDE_SELL |
| order_delivery_type | enum | Yes | ORDER_DELIVERY_TYPE_CNC, ORDER_DELIVERY_TYPE_IDAY |
| validity_type | enum | Yes | DAY, IOC |
| price_type | enum | Yes | LIMIT, MARKET |
| order_price | int | Optional | The limit price for the order. The order will only execute at this price or better (in paise). |
| tag | string | Optional | Helps you tag your order with unique name e.g., order_test |
| leg_size | int | No | Required for ICEBERG strategy to be passed in algo_params. The size of each visible portion (leg) of the order. This is the quantity that will be exposed to the market at one time. Note: The total order quantity must be greater than the leg_size (and usually an integer multiple of leg_size). |
| trigger_price | int | No | Required only for STOPLOSS orders to be passed in algo_params. The price at which the stop order is triggered/activated. For a BUY stop-loss order, the trigger price must be less than or equal to the order price. For a SELL stop-loss order, the trigger price must be greater than or equal to the order price (in paise). |

## Response Structure

```jsx
{
  "order_id": 867,
  "client_code": "I0006I",
  "basket_id": 0,
  "ref_id": 250486,
  "order_source": "ORDER_SOURCE_NORMAL",
  "order_type": "ORDER_TYPE_STOPLOSS",
  "order_side": "ORDER_SIDE_BUY",
  "order_price": 283,
  "order_qty": 4,
  "filled_qty": 0,
  "avg_filled_price": 0,
  "order_status": "ORDER_STATUS_PENDING",
  "order_time": -6795364578871345152,
  "ack_time": null,
  "filled_time": null,
  "last_modified": null,
  "updated_by": 0,
  "ref_data": null,
  "order_delivery_type": "ORDER_DELIVERY_TYPE_CNC",
  "display_name": "",
  "brokerage": null,
  "price_type": "LIMIT",
  "validity_type": "DAY",
  "exchange_order_id": 0,
  "execution_type": "",
  "tag": "tag",
  "algo_params": {
    "leg_size": 0,
    "duration": 0,
    "trigger_price": 113,
    "max_prate": 0,
    "min_prate": 0,
    "benchmark_type": "",
    "benchmark_price": 0,
    "cleanup_price": 0
  },
  "exchange": "NSE",
  "LTP": null
}
```

## Response Attributes

| Attribute | Description |
|-----------|-------------|
| order_id | Unique ID of the order |
| exchange_order_id | Order ID assigned by the exchange |
| ref_id | The instrument reference id received from Instrument API (e.g., "69353") |
| order_type | Type of order ("ORDER_TYPE_REGULAR", "ORDER_TYPE_STOPLOSS", "ORDER_TYPE_ICEBERG") |
| order_side | "ORDER_SIDE_BUY", "ORDER_SIDE_SELL" |
| order_price | Price at which order is placed |
| order_qty | Total quantity ordered |
| filled_qty | Quantity already filled |
| avg_filled_price | Average price of filled quantity |
| order_status | Current status of the order |
| last_modified | Last modification time |
| last_traded_price | Last traded price of the instrument |
| order_delivery_type | CNC, Intraday |
| display_name | Represents the internal name of the traded instrument |
| brokerage | Displays brokerage |
| price_type | LIMIT, MARKET |
| validity_type | DAY, IOC |
| leg_size | Size of each leg in the order |
| trigger_price | Trigger price for stop-loss orders |
| tag | Helps you tag your order with unique name e.g., order_test |
