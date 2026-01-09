# Place Order
The Place Order endpoint allows you to execute a single buy or sell order by specifying essential parameters such as the instrument, quantity, price, order type, and execution type.

## Usage

=== "Python"
    ```python
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
    from nubra_python_sdk.trading.trading_data import NubraTrader
    from nubra_python_sdk.trading.trading_enum import ( 
        OrderSideEnum, 
        OrderTypeEnumV2,
        ValidityTypeEnumV2,
        PriceTypeEnumV2
    )

    # Initialize the Nubra SDK client
    # Use NubraEnv.UAT for testing or NubraEnv.PROD for production
    nubra = InitNubraSdk(NubraEnv.UAT)  # or NubraEnv.PROD

    ##using totp login and .env file 
    #nubra = InitNubraSdk(NubraEnv.UAT, totp_login= True ,env_creds = True)

    trade = NubraTrader(nubra, version= "V2")

    result = trade.create_order({
        "ref_id": 250486,
        "order_type": "ORDER_TYPE_STOPLOSS", 
        "order_qty": 100,
        "order_side": "ORDER_SIDE_BUY", 
        "order_delivery_type": "ORDER_DELIVERY_TYPE_CNC", 
        "validity_type" : "DAY", 
        "price_type": "LIMIT", 
        "order_price": 11400,
        "exchange": "NSE",
        "tag": "order_test",
        "algo_params": {
        "trigger_price": 11380
     }
    })
    ```
    
## Accessing Data

=== "Python"
    ```python
    #Get order details
    print(f"Order ID: {result.order_id}")
    print(f"Exchange Order ID: {result.exchange_order_id}")
    print(f"Reference ID: {result.ref_id}")
    print(f"Display Name: {result.display_name}")
    ```
    
## Request Structure

```python
class AlgoParamsV2:
    min_prate: Optional[int] 
    max_prate: Optional[int] 
    leg_size : Optional[int] 
    trigger_price: Optional[int] 
    duration : Optional[int] 
    benchmark_price: Optional[int] 
    benchmark_type: Optional[BenchMarkTypeV2]
    cleanup_price: Optional[int] 
    
class CreateOrderV2:
    ref_id: int
    order_type: OrderTypeEnumV2
    order_qty: int
    order_side: OrderSideEnum
    order_delivery_type : DeliveryTypeEnum
    validity_type : ValidityTypeEnumV2
    price_type : PriceTypeEnumV2
    order_price: Optional[int] 
    exchange: ExchangeEnum
    algo_params: Optional[AlgoParamsV2] 

```
> Request structure for dictionary 
   
## Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ref_id | int | Yes | The instrument reference id received from Instrument API (e.g., "69353") |
| order_type | enum | Yes | ORDER_TYPE_REGULAR, ORDER_TYPE_STOPLOSS, ORDER_TYPE_ICEBERG |
| order_qty | int | Yes | Quantity of contracts or shares |
| order_side | enum | Yes | ORDER_SIDE_BUY or ORDER_SIDE_SELL |
| order_delivery_type | enum | Yes | ORDER_DELIVERY_TYPE_CNC, ORDER_DELIVERY_TYPE_IDAY|
| validity_type | enum | Yes | DAY, IOC | 
| price_type | enum| Yes | LIMIT, MARKET |
| order_price | int | Optional | The limit price for the order. The order will only execute at this price or better.Order_price is required in case of price_type = LIMIT (in paise)|
| exchange | enum | Yes | NSE, BSE |
| leg_size | int | No | Required for ICEBERG strategy to be passed in algo_params. The size of each visible portion (leg) of the order. This is the quantity that will be exposed to the market at one time.<br>Note: The total order quantity must be greater than the `leg_size` (and usually an integer multiple of `leg_size`).|
| trigger_price | int | No | Required only for STOPLOSS orders to be passed in algo_params. The price at which the stop order is triggered/activated. For a BUY stop-loss order, the trigger price must be less than or equal to the order price. For a SELL stop-loss order, the trigger price must be greater than or equal to the order price. (in paise) |
| tag | string | Optional | Helps you tag your order with unique name eg: order_test | 

## Response Structure
=== "Python"
    ```python

     class CreateOrderResponseV2:
        order_id : int
        exchange: ExchangeEnum
        exchange_order_id: Optional[int] 
        ref_id: int
        order_type: OrderTypeEnumV2
        order_side: OrderSideEnum
        order_price: int
        order_qty: int
        filled_qty: Optional[int] 
        avg_filled_price: Optional[int] 
        order_status: Optional[str] 
        order_time: Optional[int]
        ack_time: Optional[int] 
        filled_time: Optional[int] 
        last_modified: Optional[int] 
        ref_data: Optional[RefData]
        last_traded_price: Optional[int]
        order_delivery_type: DeliveryTypeEnum
        display_name: Optional[str] 
        brokerage : Optional[float] 
        price_type: PriceTypeEnumV2
        validity_type: ValidityTypeEnumV2
        execution_type: Optional[str]
        leg_size: Optional[int] 
        duration: Optional[int] 
        trigger_price: Optional[int] 
        max_prate: Optional[int]
        algo_params : Optional[AlgoParamsResponseV2] 
        tag : Optional[str]
        
    class AlgoParamsResponseV2:
        leg_size: Optional[int]
        duration: Optional[int] 
        trigger_price: Optional[int] 
        max_prate : Optional[int] 
        min_prate: Optional[int] 
        benchmark_type: Optional[str] 
        benchmark_price: Optional[int] 
        cleanup_price: Optional[int] 

    class RefData
        ref_id: int
        option_type: Optional[str]
        token: Optional[int]
        stock_name: str
        nubra_name: str
        lot_size: Optional[int]
        asset: str
        exchange: str
        derivative_type: Optional[str]
    ```

## Response Attributes

| Attribute | Description |
|-----------|-------------|
| order_id | Unique ID of the order |
| exchange | "NSE", "BSE" |
| exchange_order_id | order ID assigned by the exchange |
| ref_id | The instrument reference id received from Instrument API (e.g., "69353") |
| order_type | Type of order ( "ORDER_TYPE_REGULAR" , "ORDER_TYPE_STOPLOSS" , "ORDER_TYPE_ICEBERG" ) |
| order_side | "ORDER_SIDE_BUY" , "ORDER_SIDE_SELL" |
| order_price | Price at which order is placed |
| order_qty | Total quantity ordered |
| filled_qty | Quantity already filled |
| avg_filled_price | Average price of filled quantity |
| order_status | Current status of the order |
| last_modified | Last modification time |
| last_traded_price | Last traded price of the instrument |
| order_delivery_type | CNC, Intraday |
| display_name |  Represents the internal name of the traded instrument |
| brokerage | Displays brokerage |
| price_type | LIMIT , MARKET |
| validity_type | DAY, IOC |
| leg_size | Size of each leg in the order |
| trigger_price | Trigger price for stop-loss orders |
| tag | Helps you tag your order with unique name eg: order_test | 


## Enum Reference
In the context of the Orders API, enums specify permissible values for various order parameters.

=== "Python"
    ```python
    class OrderSideEnum(str, Enum):
        ORDER_SIDE_BUY= "ORDER_SIDE_BUY"
        ORDER_SIDE_SELL= "ORDER_SIDE_SELL"
        
    class OrderTypeEnumV2(str, Enum):
        """Enumerates execution types for orders."""
        ORDER_TYPE_REGULAR= "ORDER_TYPE_REGULAR"
        ORDER_TYPE_STOPLOSS= "ORDER_TYPE_STOPLOSS"
        ORDER_TYPE_ICEBERG= "ORDER_TYPE_ICEBERG"

    class ValidityTypeEnumV2(str, Enum):
        DAY = "DAY"
        IOC = "IOC"

    class DeliveryTypeEnum(str, Enum):
        """Enumerates delivery types for orders."""
        ORDER_DELIVERY_TYPE_IDAY = "ORDER_DELIVERY_TYPE_IDAY"
        ORDER_DELIVERY_TYPE_CNC = "ORDER_DELIVERY_TYPE_CNC"


    class PriceTypeEnumV2(str, Enum):
        LIMIT = "LIMIT"
        MARKET =" MARKET"

    class ExchangeEnum(str, Enum):
        NSE = "NSE"
        BSE = "BSE"
    
    class BenchMarkTypeV2(str, Enum):
        MANUAL = "MANUAL"
        VWAP = "VWAP"
        ARRIVAL = "ARRIVAL"

    ```
