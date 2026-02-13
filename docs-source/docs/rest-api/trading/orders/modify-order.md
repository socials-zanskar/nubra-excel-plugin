# Modify Order

The Modify Order API allows you to adjust the price, quantity, order type, or validity of an existing pending order without canceling it.

```jsx
Method: POST
Endpoint: orders/v2/modify/{order_id}
```

### cURL
```bash
curl --location --request POST 'https://api.nubra.io/orders/v2/modify/3380' \
--header 'x-device-id: {{x_device_id}}' \
--header 'Authorization: Bearer Bearer eyJh...6Pno' \
--data '{
    "order_price": 1080,
    "order_qty": 2,
    "order_type": "ORDER_TYPE_REGULAR",
    "exchange": "NSE",
    "price_type": "LIMIT"
}'
```     

### Payload
```jsx
{
    "order_price": 1080,
    "order_qty": 2,
    "order_type": "ORDER_TYPE_REGULAR",
    "exchange": "NSE",
    "price_type": "LIMIT"
}
```

## Request Parameters

| Field | Type | Description |
|-------|------|-------------|
| `order_id` | int | ID of the order to modify |
| `order_qty` | int | Updated quantity |
| `order_price` | int | Updated price (in paise)|
| `trigger_price` | int | Price at which the order should be triggered (in paise)|
| `leg_size` | int | The size of each visible portion (leg) of the order |
| `price_type` | string | Price type (e.g., `LIMIT`) (compulsory) |

> Algo param is required in case of ORDER_TYPE_STOPLOSS ( "trigger_price" ), ORDER_TYPE_ICEBERG ( "leg_size" )

## Execution Type Requirements

| Execution Type | Modification Allowed | Compulsory field |
|----------------|---------------------|---------|
| ORDER_TYPE_REGULAR (LIMIT) | `order_price`, `order_qty` | `order_price`,`order_qty`,`price_type`,`exchange`,`order_type`|
| ORDER_TYPE_ICEBERG | `order_price`, `order_qty`| `order_price`, `order_qty`,`price_type`,`leg_size`,`exchange`,`order_type`|
| ORDER_TYPE_STOPLOSS | `order_price`, `order_qty`, `trigger_price` | `order_price`, `order_qty`,`price_type`,`trigger_price`,`exchange`,`order_type`|


### Response Structure

```jsx
{
    "message": "update request pushed"
}
``` 

