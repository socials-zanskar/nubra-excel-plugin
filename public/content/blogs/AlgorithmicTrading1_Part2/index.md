---
title: "Part 2: From Strategy Idea to Live Orders — LLM-Driven Algorithmic Trading"
summary: "Learn how to generate, deploy, and execute algorithmic trading strategies using LLMs. This guide shows how natural-language strategies are converted into Python functions and executed live using Nubra’s trading engine."
tags: ["Algo Trading", "Market Data", "API Trading"]
readTime: "12 min"
publishDate: "2025-12-27"
author: "Akshay Navin: Algo Trader & Content Developer"
---

In Part 1, we built a production-grade market data pipeline with live WebSocket streaming, persistent tick storage, and clean OHLC candle generation.

In this second part, we focus on **strategy creation, execution, and deployment**, using an LLM-driven workflow.

The core idea is simple:

Trading strategies are written in **natural language**, converted into **Python code by an LLM**, and deployed into a **live trading engine** without changing any infrastructure.

---

## High-Level Strategy Architecture

OHLC Candle Database  
→ Strategy Engine  
→ Signal Generation  
→ Order Placement (UAT / Live)

The strategy layer is intentionally isolated from:
- Market data ingestion  
- Database logic  
- Order execution mechanics  

Only **one function** is user-modifiable.

---

## The Core Idea: Prompt → LLM → Strategy Function

The complete workflow is:

1. The user writes a natural-language strategy idea  
2. The idea is fed into an LLM using a strict prompt contract  
3. The LLM outputs **only a single Python function**  
4. That function replaces the strategy function in the codebase  
5. The algo is deployed immediately  

No other part of the system changes.

---

## Strategy Prompt Contract (Copy–Paste into ChatGPT or Any LLM)

You give the LLM the following prompt.  
The user edits **only the strategy description section**.

    You are an expert quantitative trading engineer.

    Your task is to generate ONLY the Python function named:

        generate_strategy_signals(data_dict, position_state)

    You must NOT generate any other code, imports, explanations, or text.
    Only output the function definition and its body.

    FUNCTION CONTRACT:
    - data_dict: { symbol: pandas DataFrame }
    - Each DataFrame contains completed 3-minute candles
    - Columns: candle_time, open, high, low, close

    OUTPUT:
    - Return SymbolList, SignalList
    - Signals must be only "BUY" or "SELL"

    EXECUTION RULES:
    - One execution per completed candle
    - Use only the latest and previous candle
    - No intra-candle logic

    POSITION RULES:
    - BUY only if not LONG
    - SELL only if LONG
    - Update position_state

    STRICT RESTRICTIONS:
    - No imports
    - No database access
    - No order placement
    - No printing or logging

    STRATEGY DESCRIPTION:
    <<<
    USER WRITES STRATEGY HERE
    >>>

---

## Example Strategy Descriptions

SMA Crossover:

    Use a 5-period SMA and a 10-period SMA on close prices.
    Generate a BUY when the 5 SMA crosses above the 10 SMA.
    Generate a SELL when the 5 SMA crosses below the 10 SMA.

EMA–SMA Crossover:

    Use a 5-period EMA and a 20-period SMA on close prices.
    Generate a BUY when EMA(5) crosses above SMA(20).
    Generate a SELL when EMA(5) crosses below SMA(20).

RSI Mean Reversion:

    Use a 14-period RSI on close prices.
    Generate a BUY when RSI crosses below 20 and then moves back above 20.
    Generate a SELL when RSI crosses above 80 and then moves back below 80.

---

## Full Strategy Engine Code (Runnable)

The user copies this file and **replaces only the strategy function** with the LLM output.

```python
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
from nubra_python_sdk.trading.trading_data import NubraTrader
from nubra_python_sdk.refdata.instruments import InstrumentData
import talib
import sqlite3
import pandas as pd
import time
import os

nubra = InitNubraSdk(NubraEnv.UAT, env_creds=True)
instrument_data = InstrumentData(nubra)
trader = NubraTrader(nubra, version="V2")

def place_orders(SymbolList, SignalList, quantity=1):
    for symbol, signal in zip(SymbolList, SignalList):
        instrument = instrument_data.get_instrument_by_symbol(symbol, exchange="NSE")
        if instrument is None:
            continue

        trader.create_order({
            "ref_id": instrument.ref_id,
            "order_side": "ORDER_SIDE_BUY" if signal == "BUY" else "ORDER_SIDE_SELL",
            "order_type": "ORDER_TYPE_REGULAR",
            "price_type": "MARKET",
            "order_qty": quantity,
            "validity_type": "IOC",
            "order_delivery_type": "ORDER_DELIVERY_TYPE_IDAY",
            "exchange": "NSE",
            "tag": "Algo_Strategy"
        })

def load_ohlc_data(db_path):
    conn = sqlite3.connect(db_path)
    df = pd.read_sql(
        "SELECT symbol,candle_time,open,high,low,close FROM ohlc_3m ORDER BY symbol,candle_time",
        conn
    )
    conn.close()
    df["candle_time"] = pd.to_datetime(df["candle_time"])
    return {s: g.reset_index(drop=True) for s, g in df.groupby("symbol")}

def run_realtime_loop(db_path, poll_interval=5):
    position_state = {}
    last_candle = None

    while True:
        data_dict = load_ohlc_data(db_path)
        candle_times = [df["candle_time"].iloc[-1] for df in data_dict.values() if len(df) > 0]

        if not candle_times:
            time.sleep(poll_interval)
            continue

        latest_candle = max(candle_times)

        if latest_candle != last_candle:
            symbols, signals = generate_strategy_signals(data_dict, position_state)
            if symbols:
                place_orders(symbols, signals)
            last_candle = latest_candle

        time.sleep(poll_interval)

def generate_strategy_signals(data_dict, position_state):
    # REPLACED BY LLM OUTPUT
    return [], []

if __name__ == "__main__":
    DB_PATH = os.path.join(os.path.dirname(__file__), "ohlc_3m.db")
    run_realtime_loop(DB_PATH)
```

---

## Live Order Execution (Demonstration)

<video controls width="100%">
    <source src="./assets/OrdersbeingplacedVideoNew.mp4" type="video/mp4">
</video>

---
## Live Order Execution (Strat Change)

<video controls width="100%">
    <source src="./assets/OrdersbeingplacedVideoStart2New.mp4" type="video/mp4">
</video>

---

## Final Thoughts

With this two-part system:

- Part 1 delivers a robust real-time market data pipeline  
- Part 2 delivers an LLM-powered strategy engine  

Humans define ideas.  
LLMs translate ideas into code.  
The engine executes with discipline.

End of Part 2


