# Realtime Market Data (WebSocket)

This section documents Nubra's WebSocket streams for real-time market data in the REST API. Use these streams for low-latency updates on indexes, instruments, order books, option chains, and Greeks.

## Available WebSocket Streams

| Stream | Channel | Description |
|---|---|---|
| [Index Data](#1-index-data) | `index` | Live index and instrument ticks including LTP, volume, and change percent. |
| [Index Bucket (OHLCV)](#2-index-bucket-ohlcv) | `index_bucket` | Time-bucketed OHLCV data for indexes and instruments. |
| [Order Book](#3-order-book) | `orderbook` | Market depth with bid/ask levels and LTP. |
| [Greeks](#4-greeks) | `greeks` | Tick-level option Greeks for option instruments. |
| [Option Chain](#5-option-chain) | `option` | Full option chain updates by asset and expiry. |

---

## WebSocket Stream Controls

These controls modify how WebSocket streams behave across channels, including update frequency and market mode.

| Feature | Command | Scope | Description |
|---|---|---|---|
| [Stream Interval](#stream-interval-control) | `socket_interval` | Per channel | Controls the update frequency of WebSocket streams (tick, seconds, or minutes). |
| [Post Market Data](#post-market-data) | `post_market` | Connection-level | Enables static post-market data for testing and validation after market hours. |


---

## Message Envelope (GenericData)

All WebSocket payloads are wrapped in a common envelope.

```proto
message GenericData {
  string key = 1;
  google.protobuf.Any data = 2;
}
```

- `key` identifies the message type.
- `data` contains one of the stream payloads defined below.

---

## 1. Index Data

**Channel:** `index`

### Subscribe / Unsubscribe

```
SUBSCRIBE:   batch_subscribe [token] index {"indexes":["BANKNIFTY","TCS","RELIANCE"]} NSE
UNSUBSCRIBE: batch_unsubscribe [token] index {"indexes":["BANKNIFTY","TCS","RELIANCE"]} NSE
```

Notes:
- `exchange` is specified at the message level (e.g., `NSE`, `BSE`). Send separate messages per exchange.
- Both index symbols and instrument symbols go in the `indexes` array. The response separates them into `indexes` and `instruments`.
- The JSON object must not contain spaces.

### Payload (Proto)

```proto
message BatchWebSocketIndexMessage {
  int64 timestamp = 1;
  repeated WebSocketMsgIndex indexes = 2;
  repeated WebSocketMsgIndex instruments = 3;
}

message WebSocketMsgIndex {
  string indexname = 1;
  int64 timestamp = 2;
  int64 index_value = 3;
  int64 high_index_value = 4;
  int64 low_index_value = 5;
  int64 volume = 6;
  float changepercent = 7;
  int64 tick_volume = 8;
  int64 prev_close = 9;
  string exchange = 10;
  int64 volume_oi = 11;
}
```

---

## 2. Index Bucket (OHLCV)

**Channel:** `index_bucket`

### Subscribe / Unsubscribe

```
SUBSCRIBE:   batch_subscribe [token] index_bucket {"indexes":["BANKNIFTY","TCS","RELIANCE"]} 2m NSE
UNSUBSCRIBE: batch_unsubscribe [token] index_bucket {"indexes":["BANKNIFTY","TCS","RELIANCE"]} 2m NSE
```

Notes:
- `interval` and `exchange` are specified at the message level. Send separate messages per exchange and interval.
- Both index symbols and instrument symbols go in the `indexes` array. The response separates them into `indexes` and `instruments`.
- The JSON object must not contain spaces.
- **Interval values are represented in the payload as an `Interval` enum.** The subscribe command still accepts the string form (e.g., `2m`).

---

### Supported Intervals

The server accepts the following interval strings in the subscribe command:

- `1s`, `5s`, `10s`, `30s`
- `1m`, `2m`, `3m`, `5m`, `10m`, `15m`, `30m`
- `1h`, `2h`, `4h`
- `1d`
- `1w`
- `1mt`
- `1yr`

> **Important:** Although the `Interval` enum includes values from `INTERVAL_INVALID = 0` through `INTERVAL_1_YEAR = 16`, **the following enum values are currently not available for `index_bucket`:**
- `INTERVAL_INVALID = 0`
- `INTERVAL_1_SECOND = 1`
- `INTERVAL_10_SECOND = 2`
- `INTERVAL_1_YEAR = 16`

---

### Payload (Proto)

```proto
message BatchWebSocketIndexBucketMessage {
  int64 timestamp = 1;
  repeated WebSocketMsgIndexBucket indexes = 2;
  repeated WebSocketMsgIndexBucket instruments = 3;
}

message WebSocketMsgIndexBucket {
  string indexname = 1;
  string exchange = 2;
  Interval interval = 3;
  int64 timestamp = 4;
  int64 open = 5;
  int64 high = 6;
  int64 low = 7;
  int64 close = 8;
  int64 bucket_volume = 9;
  int64 tick_volume = 10;
  int64 cumulative_volume = 11;
  int64 bucket_timestamp = 12;
}
```

---

### Interval Enum (Proto)

```proto
enum Interval {
  INTERVAL_INVALID = 0;
  INTERVAL_1_SECOND = 1;
  INTERVAL_10_SECOND = 2;
  INTERVAL_1_MINUTE = 3;
  INTERVAL_2_MINUTE = 4;
  INTERVAL_3_MINUTE = 5;
  INTERVAL_5_MINUTE = 6;
  INTERVAL_10_MINUTE = 7;
  INTERVAL_15_MINUTE = 8;
  INTERVAL_30_MINUTE = 9;
  INTERVAL_1_HOUR = 10;
  INTERVAL_2_HOUR = 11;
  INTERVAL_4_HOUR = 12;
  INTERVAL_1_DAY = 13;
  INTERVAL_1_WEEK = 14;
  INTERVAL_1_MONTH = 15;
  INTERVAL_1_YEAR = 16;
}
```

---

### Interval Mapping (Subscribe String → Enum)

Use these mappings to interpret `WebSocketMsgIndexBucket.interval`:

- `1m` → `INTERVAL_1_MINUTE (3)`
- `2m` → `INTERVAL_2_MINUTE (4)`
- `3m` → `INTERVAL_3_MINUTE (5)`
- `5m` → `INTERVAL_5_MINUTE (6)`
- `10m` → `INTERVAL_10_MINUTE (7)`
- `15m` → `INTERVAL_15_MINUTE (8)`
- `30m` → `INTERVAL_30_MINUTE (9)`
- `1h` → `INTERVAL_1_HOUR (10)`
- `2h` → `INTERVAL_2_HOUR (11)`
- `4h` → `INTERVAL_4_HOUR (12)`
- `1d` → `INTERVAL_1_DAY (13)`
- `1w` → `INTERVAL_1_WEEK (14)`
- `1mt` → `INTERVAL_1_MONTH (15)`

> Note: Even if the subscribe command allows `1s`, `5s`, `10s`, `30s`, the payload enum set shown above does **not** include `5s` or `30s` values.


---

## 3. Order Book

**Channel:** `orderbook`

Provides real-time market depth (bids/asks), LTP, volume, and trade quantity for subscribed instruments.

---

### Subscribe / Unsubscribe

#### Full Depth (Default – up to 20 levels)

```
SUBSCRIBE:   batch_subscribe [token] orderbook {"instruments":[1120031,73009]}
UNSUBSCRIBE: batch_unsubscribe [token] orderbook {"instruments":[1120031,73009]}
```

By default, the order book stream sends **up to 20 bid and ask levels** per instrument.

---

### Order Book Depth (Selective Levels)

Users can subscribe to a **specific depth level (1–20)** instead of receiving all 20 levels.

```
MESSAGE: batch_subscribe [token] orderbook_depth 4
```

Notes:
- Depth levels can range from **1 to 20**.
- This setting applies to the `orderbook` channel.
- Example: `orderbook_depth 4` will stream **top 4 bid and ask levels only**, reducing bandwidth and processing load.
- If not specified, the default depth is **20 levels**.

---

### Payload (Proto)

```proto
message BatchWebSocketOrderbookMessage {
  int64 timestamp = 1;
  repeated WebSocketMsgOrderBook instruments = 2;
}

message WebSocketMsgOrderBook {
  uint32 inst_id = 1;
  int64 timestamp = 2;
  repeated OrderBookLevel bids = 3;
  repeated OrderBookLevel asks = 4;
  int64 ltp = 5;
  int64 ltq = 6;
  int64 volume = 7;
  int64 ref_id = 8;
}

message OrderBookLevel {
  int64 price = 1;
  int64 quantity = 2;
  int64 orders = 3;
}
```

---

### Notes

- The number of `bids` and `asks` entries in the payload depends on the subscribed **order book depth**.
- `bids[0]` and `asks[0]` represent the **best bid and best ask** respectively.
- Depth subscription helps optimize performance for latency-sensitive strategies.


---

## 4. Greeks

**Channel:** `greeks`

### Subscribe / Unsubscribe

```
SUBSCRIBE:   batch_subscribe [token] greeks {"instruments":[1120031,1120032]}
UNSUBSCRIBE: batch_unsubscribe [token] greeks {"instruments":[1120031,1120032]}
```

### Payload (Proto)

```proto
message BatchWebSocketGreeksMessage {
  int64 timestamp = 1;
  repeated WebSocketMsgOptionChainItem instruments = 2;
}

message WebSocketMsgOptionChainItem {
  int64 inst_id = 1;
  int64 ts = 2;
  int64 sp = 3;
  int32 ls = 4;
  int64 ltp = 5;
  float ltpchg = 6;
  float iv = 7;
  float delta = 8;
  float gamma = 9;
  float theta = 10;
  float vega = 11;
  int64 oi = 12;
  int64 volume = 13;
  int64 ref_id = 14;
  int64 prev_oi = 15;
  int64 price_pcp = 16;
}
```

---

## 5. Option Chain

**Channel:** `option`

### Subscribe / Unsubscribe

```
SUBSCRIBE:   batch_subscribe [token] option [{"exchange":"NSE","asset":"RELIANCE","expiry":"20260224"},{"exchange":"BSE","asset":"SENSEX","expiry":"20260205"},{"exchange":"NSE","asset":"NIFTY","expiry":"20260203"}]
UNSUBSCRIBE: batch_unsubscribe [token] option [{"exchange":"NSE","asset":"RELIANCE","expiry":"20260224"},{"exchange":"BSE","asset":"SENSEX","expiry":"20260205"},{"exchange":"NSE","asset":"NIFTY","expiry":"20260203"}]
```

Notes:
- The JSON array must not contain spaces.
- Option chain updates are received in the older format: one packet per subscribed chain (not batched together).

### Payload (Proto)

```proto
message WebSocketMsgOptionChainUpdate {
  string asset = 1;
  string expiry = 2;
  repeated WebSocketMsgOptionChainItem ce = 3;
  repeated WebSocketMsgOptionChainItem pe = 4;
  int64 atm = 5;
  int64 currentprice = 6;
  string exchange = 7;
}
```

## Stream Interval Control

Users can control the **update frequency** of WebSocket streams by subscribing to a stream interval. This helps balance latency, bandwidth usage, and subscription limits.

---

### Set Stream Interval

```
MESSAGE: batch_subscribe [token] socket_interval option 1m
```

Notes:
- The stream interval applies to the specified **channel** (e.g., `option`, `index`, `orderbook`, etc.).
- Interval settings are **connection-level** and affect all subsequent subscriptions on that channel unless changed.
- If no interval is specified, the default behavior is **tick-level streaming**.

---

### Supported Stream Intervals

The following interval strings are supported:

- `1s`
- `5s`
- `10s`
- `30s`
- `1m`
- `5m`
- `10m`

---

### Subscription Limits by Interval

#### Second-Based Intervals (Limited)

The following intervals have **standard subscription limits**:

- `1s`
- `5s`
- `10s`
- `30s`

Notes:
- These intervals are subject to per-connection and per-channel subscription limits.
- Recommended for latency-sensitive strategies requiring near real-time updates.

---

#### Minute-Based Intervals (Unlimited)

The following intervals currently have **no subscription limits**:

- `1m`
- `5m`
- `10m`

Notes:
- You can subscribe to **any number of instruments** when using these intervals.
- Ideal for strategies focused on candle-based logic, scans, or lower-frequency signals.
- Significantly reduces bandwidth and processing overhead compared to second-level streams.

---

### Example

Subscribe to the option chain stream with 1-minute updates:

```
MESSAGE: batch_subscribe [token] socket_interval option 1m
MESSAGE: batch_subscribe [token] option [{"exchange":"NSE","asset":"NIFTY","expiry":"20260203"}]
```

---

### Best Practices

- Use **second-based intervals** only when necessary for execution or market-making strategies.
- Prefer **minute-based intervals** for monitoring, analytics, and signal generation.
- Combine `socket_interval` with features like **order book depth control** to further optimize performance.


## Post Market Data

Post market data is available for **testing and validation purposes**. This data represents the **end-of-day static snapshot** of the market and does not stream live updates.

---

### Enable Post Market Mode

```
MESSAGE: batch_subscribe [token] post_market true
```

Notes:
- When enabled, WebSocket streams return **static post-market data** instead of live ticks.
- Data remains unchanged for the duration of the session.
- This mode is intended for:
  - Strategy testing
  - Backtesting validation
  - UI and integration development
- Post market data is available only after the market has closed.

---

### Key Characteristics

- **Static data** (no real-time updates)
- Uses the **same payload structures** as live streams
- Safe to use without impacting live market limits
- Ideal for non-market-hour testing and demos

---

### Example Workflow

Enable post market mode and subscribe to an index stream:

```
MESSAGE: batch_subscribe [token] post_market true
MESSAGE: batch_subscribe [token] index {"indexes":["NIFTY","BANKNIFTY"]} NSE
```

---

### Notes

- Post market mode applies at the **connection level**.
- To resume live data, reconnect and do not enable `post_market`.
- Subscription limits may differ from live market streams.
