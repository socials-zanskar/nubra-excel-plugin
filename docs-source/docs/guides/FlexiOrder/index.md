---
hide:
  - toc
  - navigation
---

# Flexi Basket Orders

In options trading, **strategies matter more than individual legs**. Most trading APIs force you to place orders one leg at a time.  
Margin and risk are calculated **after execution**, often leading to inefficient capital usage and unreliable position sizing.

---

Nubra’s **Flexi Basket** is designed for **strategy-based trading**.

It lets you place an entire options strategy as **one order**.

- All legs are evaluated together  
- Hedge relationships are recognized upfront  
- Margin is calculated on the **net position**

---

## Individual Orders vs Flexi Basket Orders

<div class="flexi-order-guide">
  <div class="flexi-order-container">

    <!-- INDIVIDUAL ORDERS -->
    <div class="flexi-order-column">
      <h3 class="flexi-order-title">Individual Orders</h3>

      <div class="flexi-explain-box danger">
        Each option leg is sent independently to the exchange.
        <br><br>
        Margin is calculated <strong>per-leg</strong>, without considering strategy-level hedging.
      </div>

      <div class="flexi-gif-wrap glow-red">
        <figure class="gif-card">
          <img src="../../assets/guides/FlexiOrder/IndividualOrder.gif"
               alt="Individual option orders margin blocking"/>
        </figure>
      </div>

      <ul class="flexi-points">
        <li>Buy and sell legs placed separately</li>
        <li>Margin blocked independently</li>
        <li>No hedge recognition</li>
        <li>Higher capital usage</li>
      </ul>
    </div>

    <div class="flexi-divider"></div>

    <!-- FLEXI BASKET -->
    <div class="flexi-order-column">
      <h3 class="flexi-order-title">Flexi Basket Orders</h3>

      <div class="flexi-explain-box success">
        All legs are placed as a <strong>single strategy-aware basket</strong>.
        <br><br>
        Nubra calculates <strong>net margin after hedge benefit</strong> before execution.
      </div>

      <div class="flexi-gif-wrap glow-green">
        <figure class="gif-card">
          <img src="../../assets/guides/FlexiOrder/FlexiOrder.gif"
               alt="Flexi basket hedge margin benefit"/>
        </figure>
      </div>

      <ul class="flexi-points">
        <li>Atomic strategy execution</li>
        <li>Exchange-recognized hedge benefit</li>
        <li>Lower final margin</li>
        <li>Accurate position sizing</li>
      </ul>
    </div>

  </div>
</div>


---

## Why Flexi Basket Matters for Algo Traders

Flexi Basket is not just convenience — it is **capital efficiency baked into the API**.

<div class="flexi-feature-grid">

<div class="flexi-feature-card">
<h4>Hedge Benefit</h4>

<ul>
  <li>Margin computed on the <strong>net strategy</strong></li>
  <li>Spread & hedge relationships recognized instantly</li>
  <li>No over-blocking of capital</li>
</ul>
</div>

<div class="flexi-feature-card">
<h4>Position Sizing</h4>

<ul>
  <li>Final margin known <strong>before execution</strong></li>
  <li>No leg-by-leg margin estimation</li>
  <li>Safer deployment for leveraged strategies</li>
</ul>
</div>

<div class="flexi-feature-card">
<h4>Strategy Execution</h4>

<ul>
  <li>All-or-nothing strategy placement</li>
  <li>No partial-leg execution risk</li>
  <li>Ideal for spreads & multi-leg structures</li>
</ul>
</div>

<div class="flexi-feature-card">
<h4>Algo Logic</h4>

<ul>
  <li>One API call per strategy</li>
  <li>Simpler tracking & reconciliation</li>
  <li>Single basket ID instead of many orders</li>
</ul>
</div>

</div>


---

## Example: Placing a Flexi Basket via API

This example demonstrates how to place a **Flexi Basket order** using a **plug-and-play strategy definition**.

All SDK setup, symbol construction, ref-ID resolution, and order payload creation are handled internally.  
To create or modify a strategy, you only need to update the **Example Usage** section at the bottom of the file.

In that section, add one or more option legs using `build_option_symbol()` by specifying:

- underlying
- strike
- day (date of expiry for weekly, dummy for monthly)
- option type (CE / PE)
- expiry (weekly or monthly)
- BUY / SELL side per leg

You can add **any number of legs** (2, 3, or more) to build straddles, spreads, condors, or custom strategies.  
No manual symbol formatting or ref-ID handling is required.

Scroll to **Example Usage** to define your strategy and run the script to place the Flexi basket.


```python
from typing import Optional, List, Dict
from nubra_python_sdk.refdata.instruments import InstrumentData
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
from nubra_python_sdk.trading.trading_data import NubraTrader
from nubra_python_sdk.trading.trading_enum import (
    OrderSideEnum,
    DeliveryTypeEnum,
    PriceTypeEnumV2,
    ExchangeEnum
)

# =====================================================
# Initialize Nubra SDK & Instrument Master (Once)
# =====================================================

nubra = InitNubraSdk(
    NubraEnv.UAT,          # Change to NubraEnv.PROD for production
    env_creds=True,
)

instruments = InstrumentData(nubra)
trade = NubraTrader(nubra, version="V2")

# =====================================================
# NSE Month Codes
# =====================================================

MONTH_CODE_MONTHLY = {
    1: "JAN", 2: "FEB", 3: "MAR", 4: "APR",
    5: "MAY", 6: "JUN", 7: "JUL", 8: "AUG",
    9: "SEP", 10: "OCT", 11: "NOV", 12: "DEC"
}

# =====================================================
# Build Option Symbol + Side
# =====================================================

def build_option_symbol(
    *,
    underlying: str,
    strike: int,
    option_type: str,
    year: int,
    month: int,
    expiry_type: str,
    side: str,
    day: Optional[int] = None
) -> Dict[str, str]:
    """
    Builds NSE option trading symbol and attaches BUY/SELL side.
    Weekly expiry uses numeric month without zero-padding.
    """

    underlying = underlying.upper().strip()
    option_type = option_type.upper().strip()
    expiry_type = expiry_type.lower().strip()
    side = side.upper().strip()

    if option_type not in ("CE", "PE"):
        raise ValueError("option_type must be CE or PE")

    if side not in ("BUY", "SELL"):
        raise ValueError("side must be BUY or SELL")

    year_short = str(year)[-2:]

    if expiry_type == "weekly":
        if day is None:
            raise ValueError("day is required for weekly expiry")

        symbol = (
            f"{underlying}"
            f"{year_short}"
            f"{month}"        # 👈 no zero padding
            f"{day:02d}"
            f"{strike}"
            f"{option_type}"
        )

    elif expiry_type == "monthly":
        symbol = (
            f"{underlying}"
            f"{year_short}"
            f"{MONTH_CODE_MONTHLY[month]}"
            f"{strike}"
            f"{option_type}"
        )

    else:
        raise ValueError("expiry_type must be weekly or monthly")

    print(symbol)
    return {
        "symbol": symbol,
        "side": side
    }



# =====================================================
# Build Flexi Basket Orders Automatically
# =====================================================

def build_flexi_orders(
    symbol_inputs: List[Dict[str, str]],
    order_qty: int,
    exchange: str = "NSE"
) -> List[Dict]:
    """
    Converts symbol+side input into Flexi basket orders payload.
    """

    side_map = {
        "BUY": OrderSideEnum.ORDER_SIDE_BUY,
        "SELL": OrderSideEnum.ORDER_SIDE_SELL
    }

    orders = []

    for item in symbol_inputs:
        symbol = item["symbol"]
        side = item["side"]

        instrument = instruments.get_instrument_by_symbol(
            symbol,
            exchange=exchange
        )

        if instrument is None:
            raise ValueError(f"Instrument not found for symbol: {symbol}")

        orders.append({
            "ref_id": instrument.ref_id,
            "order_qty": order_qty,
            "order_side": side_map[side]
        })

    return orders

def place_flexi_basket(
    symbols,
    order_qty,
    basket_name,
    tag,
    exchange,
    multiplier):

    orders = build_flexi_orders(
        symbol_inputs=symbols,
        order_qty=order_qty
    )

    basket = trade.flexi_order({
        "exchange": exchange,
        "basket_name": basket_name,
        "tag": tag,
        "orders": orders,
        "basket_params": {
            "order_side": OrderSideEnum.ORDER_SIDE_BUY,
            "order_delivery_type": DeliveryTypeEnum.ORDER_DELIVERY_TYPE_CNC,
            "price_type": PriceTypeEnumV2.MARKET,
            "multiplier": multiplier
        }
    })

    return basket
# =======================================================
# Example Usage (Add as many options payloads to symbols)
# =======================================================

symbols = [
    build_option_symbol(
        underlying="NIFTY",
        strike=26700,
        option_type="CE",
        year=2026,
        month=1,
        day=13,
        expiry_type="weekly",
        side="BUY"
    ),
    build_option_symbol(
        underlying="NIFTY",
        strike=24900,
        option_type="PE",
        year=2026,
        month=1,
        day=13,
        expiry_type="weekly",
        side="BUY"
    ),
    build_option_symbol(
        underlying="NIFTY",
        strike=24700,
        option_type="PE",
        year=2026,
        month=1,
        day=13,
        expiry_type="weekly",
        side="BUY"
    )
]

# =====================================================
# Place Flexi Basket using above symbols
# =====================================================
basket = place_flexi_basket(
    symbols=symbols,
    order_qty=65,
    basket_name="AutoBuiltFlexiStrategy",
    tag="auto_entry",
    exchange = ExchangeEnum.NSE,
    multiplier = 1
)


print("Basket ID:", basket.basket_id)
print("Basket Orders:", basket.orders)
```