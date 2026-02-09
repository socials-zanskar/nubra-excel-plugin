## Flexi Basket Order 

The **Flexi Basket Order** allows you to place and execute a basket of trades as a single, unified strategy. It enables users to create multiple buy/sell legs across derivative (options) and define key execution parameters—like price type, stop loss, and target—at the basket level, rather than for each individual leg.

---

## Usage

=== "Python"
```python
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
from nubra_python_sdk.trading.trading_data import NubraTrader
from nubra_python_sdk.trading.trading_enum import (
    DeliveryTypeEnum, 
    OrderSideEnum, 
    PriceTypeEnumV2, 
    ExchangeEnum
)
# Initialize the Nubra SDK client
# Use NubraEnv.UAT for testing or NubraEnv.PROD for production
nubra = InitNubraSdk(NubraEnv.UAT)

##using totp login and .env file 
#nubra = InitNubraSdk(NubraEnv.UAT, totp_login= True ,env_creds = True)

trade = NubraTrader(nubra, version="V2")

ref_id = 69353  # Example instrument ref_id
limit_order_price = 72500  # Example price in paise
result = trade.flexi_order({
    "exchange": ExchangeEnum.NSE,
    "basket_name": "Optionbasket",
    "tag": "order_test",
    "orders": [
        {
            "ref_id": ref_id,
            "order_qty": 1,
            "order_side": OrderSideEnum.ORDER_SIDE_BUY
        }
    ],
    "basket_params": {
        "order_side": OrderSideEnum.ORDER_SIDE_BUY,
        "order_delivery_type": DeliveryTypeEnum.ORDER_DELIVERY_TYPE_CNC,
        "price_type": PriceTypeEnumV2.LIMIT,
        "entry_price": limit_order_price,
        "multiplier": 2
        # "momentum_trigger_price": 
        # "stoploss_price": 72300
        # "exit_price": 72550
        # "entry_time": "2025-08-08T11:03:57.000Z"
        # "exit_time": "2025-08-08T11:03:57.000Z"
    }
})
```


### Request structure
```python
#Validation for Basket Order
class SingleBasketOrderV2:
    ref_id: int
    order_qty : int
    order_side: OrderSideEnum

class BasketParamsV2:
    order_side: OrderSideEnum
    order_delivery_type: DeliveryTypeEnum
    price_type: PriceTypeEnumV2

    multiplier: int

    entry_price: Optional[int]
    momentum_trigger_price: Optional[int] 

    exit_price : Optional[int] 
    stoploss_price: Optional[int] 

    entry_time: Optional[str]
    exit_time: Optional[str] 

class BasketOrderV2:
    exchange: ExchangeEnum
    basket_name: str
    tag: Optional[str] 
    orders: List[SingleBasketOrderV2]
    basket_params: BasketParamsV2
```

### Request Parameters

BasketOrderV2

| Parameter       | Type                       | Required | Description                                                 |
| --------------- | -------------------------- | -------- | ----------------------------------------------------------- |
| `exchange`      | `ExchangeEnum`             | Yes      | Exchange where the basket is to be executed. Example: `NSE` |
| `basket_name`   | str                        | Yes      | Name the basket                                             |
| `tag`           | str                        | Optional | Helps you tag your order with unique name eg: order_test    |
| `orders`        | List\[SingleBasketOrderV2] | Yes      | List of individual orders within the basket                 |
| `basket_params` | `BasketParamsV2`           | Yes      | Common execution parameters for all orders in the basket    |

---

SingleBasketOrderV2

| Parameter    | Type            | Required | Description                                          |
| ------------ | --------------- | -------- | ---------------------------------------------------- |
| `ref_id`     | `int`           | Yes      | Reference ID of the instrument (from Instrument API) |
| `order_qty`  | `int`           | Yes      | Quantity to be ordered                               |
| `order_side` | `OrderSideEnum` | Yes      | `ORDER_SIDE_BUY` or `ORDER_SIDE_SELL`                |

---

BasketParamsV2

| Parameter                | Type               | Required | Description                                                       |
| ------------------------ | ------------------ | -------- | -----------------------------------------------------------       |
| `order_side`             | `OrderSideEnum`    | Yes         | ORDER_SIDE_BUY (Basket paramas to be selcetd as BUY always)    |
| `order_delivery_type`    | `DeliveryTypeEnum` | Yes         | e.g., `ORDER_DELIVERY_TYPE_CNC`, `ORDER_DELIVERY_TYPE_IDAY`    |
| `price_type`             | `PriceTypeEnumV2`  | Yes         | `LIMIT`, `MARKET`.                                             |
| `multiplier`             | `int`              | Yes         | Quantity multiplier across the basket                          |
| `entry_price`            | `int`              | Optional    | Price to enter the order (in paise).Required in case of price_type =LIMIT                            |
| `momentum_trigger_price` | `int`              | Optional    | Trigger price for momentum-based entries                       |
| `exit_price`             | `int`              | Optional    | Exit target price (optional for strategy exits)                |
| `stoploss_price`         | `int`              | Optional    | Stop loss price (in paise)                                     |
| `entry_time`             | `str`              | Optional    | Time window to trigger entry ("2025-08-08T11:03:45.000Z")  UTC |
| `exit_time`              | `str`              | Optional    | Time window to trigger exit  ("2025-08-08T11:03:57.000Z")  UTC |

---
### Response Structure
```python
class BasketIDParamsV2:
    order_side: Optional[str]
    order_delivery_type: Optional[str]
    price_type: Optional[str]
    multiplier: int
    entry_price: Optional[int]
    momentum_trigger_price: Optional[int]
    exit_price : Optional[int] 
    stoploss_price: Optional[int] 
    entry_time: Optional[str]
    exit_time: Optional[str] 
    basket_strategy: Optional[str]
    request_type: Optional[str] 

class BasketIDOrdersV2:
    exchange_order_id: Optional[int] 
    exchange: Optional[str] 
    order_id: int
    basket_id: Optional[int] 
    ref_id: int
    order_type: Optional[OrderTypeEnumV2] 
    order_side: Optional[OrderSideEnum] 
    order_price: Optional[int] 
    order_qty: Optional[int] 
    filled_qty: Optional[int] 
    avg_filled_price: Optional[int] 
    order_status: Optional[OrderStatusEnum] 
    order_time: Optional[int] 
    ack_time: Optional[int] 
    filled_time: Optional[int] 
    last_modified: Optional[int] 
    ref_data: Optional[RefData] 
    order_delivery_type: Optional[DeliveryTypeEnum] 
    display_name: Optional[str] 
    brokerage: Optional[int] 
    price_type: Optional[PriceTypeEnumV2] 
    validity_type: Optional[ValidityTypeEnumV2] 
    execution_type: Optional[str] 
    last_traded_price: Optional[int] 
    pnl: Optional[int] 
    pnl_change: Optional[float] 

class GetBasketV2:
    basket_id:Optional[int] 
    user_id: Optional[int] 
    basket_name: Optional[str] 
    tag: Optional[str] 
    orders: Optional[List[BasketIDOrdersV2]]
    basket_params: Optional[BasketIDParamsV2] 
    last_traded_price: Optional[int] 
    pnl: Optional[int] 
    pnl_change: Optional[float] 
```

## Notes:
>The Flexi Basket order treats all included legs as one unit and applies price-based and time-based risk management at the basket level.

>Entry/exit decisions are evaluated across the net basket price, not individual instruments.

>Stop Loss and Target work in OCO (One Cancels Other) mode—only one will be executed.

>Exit time is a hard exit trigger and will close the basket if no other condition is met. ( 3:05pm is the default exit time for Intraday)

>Exit time can be passed in case of only Intraday order.

>Only legs from the same underlying asset are currently allowed. Cross-asset (e.g., NIFTY + BANKNIFTY) or cross-exchange (NSE + BSE) baskets are not supported at this time.

>Prices are specified in paise, not rupees (e.g., ₹150 = 15000).

>Multi-asset and modification support not supported in this version.

>Currently flexi basket order can't be modified 



## GOLDEN RULES: (irrespective of net buy/sell exposure)
>Stop loss price has to be less than Limit Price

>Target Price has to be greater than limit price

>Momentum trigger has to be lesser than target price

>Aggressive limit order - The limit price entered has to be greater than LTP

>Passive Limit order - The limit price entered has to be lesser than the LTP.

>Cancel Flexi order - The Cancel flexi placed while Flexi order is being executed will lead to improper fills. 
