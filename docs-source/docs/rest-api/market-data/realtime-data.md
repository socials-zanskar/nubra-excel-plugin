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

## 3. Order Book

**Channel:** `orderbook`

### Subscribe / Unsubscribe

```
SUBSCRIBE:   batch_subscribe [token] orderbook {"instruments":[1120031,73009]}
UNSUBSCRIBE: batch_unsubscribe [token] orderbook {"instruments":[1120031,73009]}
```

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
