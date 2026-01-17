---
title: "Part 1: Building a Live Market Data Pipeline for Algorithmic Trading (Python + SQL)"
summary: "Learn how to build a production-grade real-time market data pipeline using Python, WebSockets, and SQLite. This guide covers live tick streaming, persistent storage, and OHLC candle generation as the foundation for algorithmic trading."
tags: ["Algorithmic Trading", "Market Data", "Python", "WebSockets", "SQL"]
readTime: "12 min"
publishDate: "2025-12-27"
author: "Akshay Navin: Alg Trader & Content Developer"
---


Algorithmic trading systems begin with data.  
Before strategies, signals, or execution logic, we must first build a **reliable real-time data pipeline** that can stream, store, and transform market data safely.

In this blog, we walk through a **complete live market data pipeline**, demonstrated through real-time videos and backed by production-ready Python code.

> Strategy design and execution will be covered in **Part 2**.

---

## High-Level Architecture

WebSocket Market Feed  
→ Tick Normalization  
→ SQLite Tick Database  
→ OHLC Candle Builder (Resampling Engine)

This separation ensures:
- Data collection is independent of strategy logic
- Candles can be rebuilt without re-streaming data
- Multiple strategies can reuse the same dataset

---

## Live WebSocket Market Stream

The following video shows the **real-time WebSocket feed in action**, streaming live ticks from the exchange as they arrive.

<video controls width="100%">
  <source src="./assets/WebsocketStreamWebinar.mp4" type="video/mp4">
</video>

This is the raw data layer of the system—everything downstream depends on this feed being fast, reliable, and lossless.

---

## Streaming Live Market Data into SQL

The first stage of the pipeline focuses on **ingesting live ticks** and persisting them efficiently into a SQL database.

### What This Layer Does

- Connects to a live WebSocket market feed  
- Subscribes to a user-defined list of symbols  
- Normalizes timestamps and prices  
- Buffers ticks using an in-memory queue  
- Writes data to SQLite using batched inserts  

### User-Defined Stock Universe

    SUBSCRIPTIONS = ["RELIANCE", "TCS", "INFY", "HDFCBANK"]

This allows the same pipeline to be reused across indices, sectors, and custom watchlists.

---

## Tick Stream Visualization

The video below shows **ticks flowing through the system in real time**, before being committed to the database.

<video controls width="100%">
  <source src="./assets/TickStreamVisualizedNew.mp4" type="video/mp4">
</video>

This stage prioritizes throughput and reliability, ensuring no ticks are dropped during high-volume periods.

---

## Live WebSocket → SQLite (Code)

```python
import sqlite3
import threading
import queue
import os
import json
from datetime import datetime, timezone, timedelta

from nubra_python_sdk.ticker import websocketdata
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv

SUBSCRIPTIONS = [
    'ADANIENT','ADANIPORTS','APOLLOHOSP','ASIANPAINT','AXISBANK',
    'BAJFINANCE','BAJAJFINSV','BEL','BHARTIARTL','CIPLA','COALINDIA',
    'DRREDDY','DUMMYHDLVR','EICHERMOT','ETERNAL','GRASIM','HCLTECH',
    'HDFCBANK','HDFCLIFE','HINDALCO','HINDUNILVR','ICICIBANK','ITC',
    'INFY','INDIGO','JSWSTEEL','JIOFIN','KOTAKBANK','LT','MARUTI',
    'MAXHEALTH','NTPC','NESTLEIND','ONGC','POWERGRID','RELIANCE',
    'SBILIFE','SHRIRAMFIN','SBIN','SUNPHARMA','TCS','TATACONSUM',
    'TMPV','TATASTEEL','TECHM','TITAN','TRENT','ULTRACEMCO','WIPRO'
]

DB_NAME = "market_data.db"
TABLE_NAME = "market_data"

QUEUE_SIZE = 20000
SNAPSHOT_SIZE = 20

tick_queue = queue.Queue(maxsize=QUEUE_SIZE)
IST = timezone(timedelta(hours=5, minutes=30))

if os.path.exists(DB_NAME):
    os.remove(DB_NAME)

def ns_to_ist(ns):
    return datetime.fromtimestamp(ns / 1_000_000_000, tz=timezone.utc) \
        .astimezone(IST).isoformat()

def normalize_index_value(value):
    return value / 100.0

def index_wrapper_to_dict(msg):
    return {
        "symbol": msg.indexname,
        "timestamp_ist": ns_to_ist(msg.timestamp),
        "price": normalize_index_value(msg.index_value),
        "volume": msg.volume
    }

def init_db(symbols):
    conn = sqlite3.connect(DB_NAME, check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")

    columns = ", ".join([f"{s} TEXT" for s in symbols])
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            {columns}
        )
    """)
    conn.commit()
    return conn, cursor

db_conn, db_cursor = init_db(SUBSCRIPTIONS)

def db_writer():
    snapshot = {}
    while True:
        symbol, tick = tick_queue.get()
        snapshot[symbol] = json.dumps(tick)
        tick_queue.task_done()

        if len(snapshot) >= SNAPSHOT_SIZE:
            cols = ", ".join(snapshot.keys())
            vals = list(snapshot.values())
            placeholders = ", ".join(["?"] * len(vals))
            sql = f"INSERT INTO {TABLE_NAME} ({cols}) VALUES ({placeholders})"
            db_cursor.execute(sql, vals)
            db_conn.commit()
            snapshot.clear()

threading.Thread(target=db_writer, daemon=True).start()

nubra = InitNubraSdk(NubraEnv.UAT)

def on_index_data(msg):
    if msg.indexname in SUBSCRIPTIONS:
        try:
            tick_queue.put_nowait(
                (msg.indexname, index_wrapper_to_dict(msg))
            )
        except queue.Full:
            pass

socket = websocketdata.NubraDataSocket(
    client=nubra,
    on_index_data=on_index_data
)

socket.connect()
socket.subscribe(SUBSCRIPTIONS, data_type="index", exchange="NSE")
socket.keep_running()
```
---

## Converting Tick Data into OHLC Candles

Raw ticks are not suitable for most trading strategies.  
The next stage converts tick data into **completed OHLC candles** using pandas resampling.

### Key Design Principles

- Candles aligned to market open (09:15 IST)  
- Only completed candles are stored  
- No partial or repainting bars  
- Timeframe is fully configurable  

    RESAMPLE_RULE = "1min"   # or "3min", "10min", etc.

---

## SQLite OHLC Stream (Database View)

This video shows the **SQLite OHLC database being updated live**, candle by candle, ready for strategy consumption.

<video controls width="100%">
  <source src="./assets/SQLiteDBStream.mp4" type="video/mp4">
</video>

---

## Tick Database → OHLC Database (Code)

```python
import sqlite3
import json
import pandas as pd
import os
from datetime import timedelta, timezone

SOURCE_DB = "market_data.db"
TARGET_DB = "ohlc_3m.db"

RESAMPLE_RULE = "3min"
IST = timezone(timedelta(hours=5, minutes=30))

if os.path.exists(TARGET_DB):
    os.remove(TARGET_DB)

src_conn = sqlite3.connect(SOURCE_DB)
dst_conn = sqlite3.connect(TARGET_DB)
dst_cursor = dst_conn.cursor()

dst_cursor.execute("""
    CREATE TABLE ohlc_3m (
        symbol TEXT,
        candle_time TEXT,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        PRIMARY KEY (symbol, candle_time)
    )
""")
dst_conn.commit()

def load_ticks(symbol):
    df_raw = pd.read_sql(
        f"SELECT {symbol} FROM market_data WHERE {symbol} IS NOT NULL",
        src_conn
    )
    records = [json.loads(x) for x in df_raw[symbol]]
    df = pd.DataFrame(records)
    df["timestamp_ist"] = pd.to_datetime(df["timestamp_ist"])
    return df.set_index("timestamp_ist")

symbols = pd.read_sql(
    "PRAGMA table_info(market_data)", src_conn
)["name"].tolist()[1:]

for symbol in symbols:
    df = load_ticks(symbol)
    if df.empty:
        continue

    ohlc = (
        df["price"]
        .resample(RESAMPLE_RULE, origin="start_day", offset="9h15min")
        .ohlc()
        .dropna()
    )

    for ts, row in ohlc.iterrows():
        dst_cursor.execute(
            "INSERT INTO ohlc_3m VALUES (?, ?, ?, ?, ?, ?)",
            (symbol, ts.isoformat(), row.open, row.high, row.low, row.close)
        )

dst_conn.commit()
```

---

## Summary

At this stage, the system provides:

- Live market data ingestion  
- Persistent tick-level storage  
- Clean OHLC candle generation  
- Flexible timeframe support  

This forms a **production-grade foundation** for algorithmic trading systems.

➡️ **Part 2** will introduce:
- A plug-and-play strategy engine  
- Strategy prompts  
- Sample trading strategies  

*Continued in Part 2…*
