---
hide:
  - toc
  - navigation
---

# Placing Orders: The Core of Algo Execution

Placing orders is where **signals turn into real action**.

No matter how sophisticated your strategy is, its success depends on **how reliably, quickly, and correctly orders are placed** in the market.

Nubra’s Trading API is designed to make order placement:

- Predictable
- Deterministic
- Fully automatable
- Identical across UAT and LIVE environments

---

# What Happens When You Place an Order?

## The 4 Pillars of Every Order

<div class="place-order">

  <!-- =======================
  1) ORDER SIDE
  ======================= -->
  <div class="po-pillar">

    <div class="po-header-card">
    <h3><span class="po-index">1</span> Order Side</h3>

    <p class="po-subtitle">Direction of the order</p>

    <div class="po-field-wrap">
        <code class="po-field">"order_side"</code>
    </div>

    <p class="po-desc">
        Defines whether you are buying or selling the instrument.
    </p>
    </div>


    <div class="po-options-grid">
      <div class="po-option po-buy">
        <code>"ORDER_SIDE_BUY"</code>
        <p class="po-option-desc">
          Places a buy order to acquire the instrument.
        </p>
      </div>

      <div class="po-option po-sell">
        <code>"ORDER_SIDE_SELL"</code>
        <p class="po-option-desc">
          Places a sell order to exit or short the instrument.
        </p>
      </div>
    </div>

  </div>

  <!-- =======================
  2) ORDER TYPE
  ======================= -->
  <div class="po-pillar">

    <div class="po-header-card">
    <h3><span class="po-index">2</span> Order Type</h3>

    <p class="po-subtitle">Execution logic</p>

    <div class="po-field-wrap">
        <code class="po-field">"order_type"</code>
    </div>

    <p class="po-desc">
        Decides <em>how and when</em> the order is executed.
    </p>
    </div>


    <div class="po-options-grid">
      <div class="po-option po-regular">
        <code>"ORDER_TYPE_REGULAR"</code>
        <p class="po-option-desc">
          Executes immediately at market or limit price.
        </p>
      </div>

      <div class="po-option po-stoploss">
        <code>"ORDER_TYPE_STOPLOSS"</code>
        <p class="po-option-desc">
          Triggers execution only after a stop price is hit.
        </p>
      </div>

      <div class="po-option po-iceberg">
        <code>"ORDER_TYPE_ICEBERG"</code>
        <p class="po-option-desc">
          Splits a large order into smaller visible quantities.
        </p>
      </div>
    </div>

  </div>

  <!-- =======================
  3) PRICE TYPE
  ======================= -->
  <div class="po-pillar">

    <div class="po-header-card">
    <h3><span class="po-index">3</span> Price Type</h3>

    <p class="po-subtitle">Price control</p>

    <div class="po-field-wrap">
        <code class="po-field">"price_type"</code>
    </div>

    <p class="po-desc">
        Controls execution speed versus price precision.
    </p>
    </div>


    <div class="po-options-grid">
      <div class="po-option po-limit">
        <code>"LIMIT"</code>
        <p class="po-option-desc">
          Executes only at the specified price or better.
        </p>
      </div>

      <div class="po-option po-market">
        <code>"MARKET"</code>
        <p class="po-option-desc">
          Executes immediately at the best available price.
        </p>
      </div>
    </div>

  </div>

  <!-- =======================
  4) VALIDITY
  ======================= -->
  <div class="po-pillar">

    <div class="po-header-card">
    <h3><span class="po-index">4</span> Validity</h3>

    <p class="po-subtitle">Order lifetime</p>

    <div class="po-field-wrap">
        <code class="po-field">"validity"</code>
    </div>

    <p class="po-desc">
        Controls how long the order stays active.
    </p>
    </div>

    <div class="po-options-grid">
      <div class="po-option po-day">
        <code>"DAY"</code>
        <p class="po-option-desc">
          Remains active until the end of the trading day.
        </p>
      </div>

      <div class="po-option po-ioc">
        <code>"IOC"</code>
        <p class="po-option-desc">
          Executes immediately or cancels unfilled quantity.
        </p>
      </div>
    </div>

  </div>

</div>

---

## Place Order — Examples

Below are **ready-to-use examples** showing how different order configurations
map directly to the 4 pillars you just saw above.

=== "LIMIT Order"

    ```python
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
    from nubra_python_sdk.marketdata.market_data import MarketData
    from nubra_python_sdk.trading.trading_data import NubraTrader
    from nubra_python_sdk.refdata.instruments import InstrumentData

    # 1. Initialize Nubra SDK (Use NubraEnv.PROD for live trading)
    nubra = InitNubraSdk(NubraEnv.UAT)
    instruments = InstrumentData(nubra)
    md = MarketData(nubra)
    trade = NubraTrader(nubra, version="V2")

    # 2. Get Ref ID of instrument
    REF_ID = instruments.get_instrument_by_symbol('RELIANCE', exchange='NSE').ref_id

    # 3. Fetch LTP of instrument
    quote = md.quote(ref_id=REF_ID, levels=5)
    ltp = quote.orderBook.last_traded_price
    print(f"Last Traded Price (LTP): {ltp}")

    # 4. Place Order using LTP
    result = trade.create_order({
        "ref_id": REF_ID,
        "order_type": "ORDER_TYPE_STOPLOSS",
        "order_qty": 1,
        "order_side": "ORDER_SIDE_BUY",
        "order_delivery_type": "ORDER_DELIVERY_TYPE_CNC",
        "validity_type": "DAY",
        "price_type": "LIMIT",
        "order_price": ltp + 50,
        "exchange": "NSE",
        "tag": "Limit_example",
        "algo_params": {
            "trigger_price": ltp + 30
        }
    })

    print("Order Response:")
    print(result)
    ```

    **Explanation**

    - Uses `price_type = LIMIT`
    - Executes only at the specified price (or better)
    - LIMIT orders support:
        - **DAY** — valid for the trading day
        - **IOC** — executes immediately; unfilled quantity is cancelled

=== "MARKET Order"

    ```python
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
    from nubra_python_sdk.trading.trading_data import NubraTrader
    from nubra_python_sdk.refdata.instruments import InstrumentData

    # 1. Initialize Nubra SDK (Use NubraEnv.PROD for live trading)
    nubra = InitNubraSdk(NubraEnv.UAT)
    trade = NubraTrader(nubra, version="V2")
    instruments = InstrumentData(nubra)

    # 2. Get Ref ID of instrument
    REF_ID = instruments.get_instrument_by_symbol('TCS', exchange='NSE').ref_id

    # 3. Place Order using Market
    result = trade.create_order({
        "ref_id": REF_ID,
        "order_side": "ORDER_SIDE_BUY",
        "order_type": "ORDER_TYPE_REGULAR",
        "price_type": "MARKET",
        "order_qty": 1,
        "validity_type": "IOC",
        "order_delivery_type": "ORDER_DELIVERY_TYPE_CNC",
        "exchange": "NSE",
        "tag": "Market_example"
    })

    print(result.order_id)
    ```

    **Explanation**

    - Uses `price_type = MARKET`
    - Executes immediately at the best available price
    - MARKET orders:
        - **Only support IOC validity**
        - **Cannot be placed as DAY orders**
        - Any unfilled quantity is cancelled immediately

=== "REGULAR Order"

    ```python
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
    from nubra_python_sdk.marketdata.market_data import MarketData
    from nubra_python_sdk.trading.trading_data import NubraTrader

    # 1. Initialize Nubra SDK (Use NubraEnv.PROD for live trading)
    nubra = InitNubraSdk(NubraEnv.UAT)
    md = MarketData(nubra)
    instruments = InstrumentData(nubra)
    trade = NubraTrader(nubra, version="V2")

    # 1.1 Get Instrument Ref ID
    instrument = instruments.get_instrument_by_symbol("HDFCBANK", exchange="NSE")
    REF_ID = instrument.ref_id

    # 2. Fetch Market Quote
    quote = md.quote(ref_id=REF_ID, levels=5)
    ltp = quote.orderBook.last_traded_price
    print(f"Last Traded Price (LTP): {ltp}")

    # 3. Place Order using LTP
    trade = NubraTrader(nubra, version="V2")

    result = trade.create_order({
        "ref_id": REF_ID,
        "order_type": "ORDER_TYPE_REGULAR",
        "order_qty": 1,
        "order_side": "ORDER_SIDE_BUY",
        "order_delivery_type": "ORDER_DELIVERY_TYPE_IDAY",
        "validity_type": "DAY",
        "price_type": "LIMIT",
        "order_price": ltp + 50,
        "exchange": "NSE",
        "tag": "order_test_ltp",
        "algo_params": {
            "trigger_price": ltp + 30
        }
    })

    print("Order Response:")
    print(result)
    ```

    **Explanation**

    - Uses `order_type = ORDER_TYPE_REGULAR`
    - Can be placed as **LIMIT** or **MARKET**
    - Supports both validity types:
        - **DAY** — valid for the trading day
        - **IOC** — executes immediately; unfilled quantity is cancelled
    - Default order type for standard buy/sell execution

=== "STOPLOSS Order"

    ```python
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
    from nubra_python_sdk.marketdata.market_data import MarketData
    from nubra_python_sdk.trading.trading_data import NubraTrader

    # 1. Initialize Nubra SDK (Use NubraEnv.PROD for live trading)
    nubra = InitNubraSdk(NubraEnv.UAT)
    md = MarketData(nubra)
    instruments = InstrumentData(nubra)
    trade = NubraTrader(nubra, version="V2")

    # 1.1 Get Instrument Ref ID
    instrument = instruments.get_instrument_by_symbol("ICICIBANK", exchange="NSE")
    REF_ID = instrument.ref_id

    # 2. Fetch Market Quote
    quote = md.quote(ref_id=REF_ID, levels=5)
    ltp = quote.orderBook.last_traded_price
    print(f"Last Traded Price (LTP): {ltp}")

    # 3. Place Order using LTP

    result = trade.create_order({
        "ref_id": REF_ID,
        "order_type": "ORDER_TYPE_STOPLOSS",
        "order_qty": 1,
        "order_side": "ORDER_SIDE_BUY",
        "order_delivery_type": "ORDER_DELIVERY_TYPE_IDAY",
        "validity_type": "DAY",
        "price_type": "LIMIT",
        "order_price": ltp + 50,
        "exchange": "NSE",
        "tag": "Stoploss_example",
        "algo_params": {
            "trigger_price": ltp + 30
        }
    })

    print("Order Response:")
    print(result)
    ```

    **Explanation**

    - Uses `order_type = ORDER_TYPE_STOPLOSS`
    - Stop-loss orders can **only be placed as LIMIT orders**
    - Validity is **DAY only**
    - `IOC` validity is **not supported** for stop-loss orders
    - `trigger_price` is mandatory

=== "ICEBERG Order"

    ```python
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
    from nubra_python_sdk.marketdata.market_data import MarketData
    from nubra_python_sdk.trading.trading_data import NubraTrader
    from nubra_python_sdk.refdata.instruments import InstrumentData

    # 1. Initialize Nubra SDK (Use NubraEnv.PROD for live trading)
    nubra = InitNubraSdk(NubraEnv.UAT)
    md = MarketData(nubra)
    instruments = InstrumentData(nubra)
    trade = NubraTrader(nubra, version="V2")

    # 1.1 Get Instrument Ref ID
    instrument = instruments.get_instrument_by_symbol("RELIANCE", exchange="NSE")
    REF_ID = instrument.ref_id

    # 2. Fetch Market Quote
    quote = md.quote(ref_id=REF_ID, levels=5)
    ltp = quote.orderBook.last_traded_price
    print(f"Last Traded Price (LTP): {ltp}")

    # 3. Place ICEBERG Order
    TOTAL_QTY = 1000      # Total quantity to trade
    LEG_SIZE = 100        # Visible quantity per leg

    result = trade.create_order({
        "ref_id": REF_ID,
        "order_type": "ORDER_TYPE_ICEBERG",
        "order_qty": TOTAL_QTY,
        "order_side": "ORDER_SIDE_BUY",
        "order_delivery_type": "ORDER_DELIVERY_TYPE_CNC",
        "validity_type": "DAY",
        "price_type": "LIMIT",
        "order_price": ltp + 10,
        "exchange": "NSE",
        "tag": "iceberg_example",
        "algo_params": {
            "leg_size": LEG_SIZE
        }
    })

    print("Order Response:")
    ```

    **Explanation**

    - ICEBERG splits a large order into multiple visible legs
    - Only one leg is active in the market at any time
    - Remaining quantity is placed automatically after each fill
    - Helps minimize market impact