---
title: "Code Switching: Other brokers to Nubra for Common Trading APIs"
summary: "Side-by-side Python examples for switching from Zerodha Kite Connect to Nubra SDK: market orders, historical candles, and realtime streams."
tags: ["API Integration", "Trading Automation", "Broker Switching"]
readTime: "7 min"
publishDate: "2025-12-01"
author: "Akshay Navin: Algo Trader & Content Developer"
---

Switching brokers does not have to mean rewriting your entire trading stack. This guide shows quick, direct code switches between Zerodha (Kite Connect), Dhan, Upstox, and Nubra for the most common workflows.

What changes most:
- Instrument identifiers (Zerodha uses instrument_token, Dhan uses security_id, Upstox uses instrument_key, Nubra uses ref_id or symbols)
- Method names and parameter keys
- Realtime streaming classes and subscription formats

Below are the most used workflows and the smallest code you need to switch between brokers.

## 1) Market Order

<div style="display: flex; gap: 32px; align-items: flex-start; flex-wrap: wrap;">

  <!-- Nubra Column -->
  <div style="flex: 1; min-width: 320px;">

  <div class="logo-button" role="presentation">
    <img src="./assets/Nubra.png" alt="" />
    <span>Nubra</span>
  </div>

  ```python
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
from nubra_python_sdk.trading.trading_data import NubraTrader
from nubra_python_sdk.refdata.instruments import InstrumentData

nubra = InitNubraSdk(NubraEnv.PROD)
trade = NubraTrader(nubra, version="V2")
instruments = InstrumentData(nubra)

ref_id = instruments.get_instrument_by_symbol("HDFCBANK", exchange="NSE").ref_id

result = trade.create_order({
    "ref_id": ref_id,
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

  </div>

  <!-- Zerodha Column -->
  <div style="flex: 1; min-width: 320px;">

<div class="broker-toggle" data-broker-group="market-order">
  <div class="broker-logos">
    <div class="logo-button is-active" role="button" tabindex="0" data-broker-target="zerodha">
      <img src="./assets/kiteconnect.png" alt="" />
      <span>Zerodha</span>
    </div>
    <div class="logo-button" role="button" tabindex="0" data-broker-target="dhan">
      <img src="./assets/dhan.png" alt="" />
      <span>Dhan</span>
    </div>
    <div class="logo-button" role="button" tabindex="0" data-broker-target="upstox">
      <img src="./assets/Upstox.png" alt="" />
      <span>Upstox</span>
    </div>
  </div>

  <div class="broker-code" data-broker-output></div>

  <textarea class="broker-code-source" data-broker-code="zerodha">from kiteconnect import KiteConnect

kite = KiteConnect(api_key=API_KEY)
kite.set_access_token(ACCESS_TOKEN)

order_id = kite.place_order(
    variety=kite.VARIETY_REGULAR,
    exchange=kite.EXCHANGE_NSE,
    tradingsymbol="HDFCBANK",
    transaction_type=kite.TRANSACTION_TYPE_BUY,
    quantity=1,
    product=kite.PRODUCT_CNC,
    order_type=kite.ORDER_TYPE_MARKET,
    validity=kite.VALIDITY_IOC
)

print(order_id)</textarea>

  <textarea class="broker-code-source" data-broker-code="dhan">import pandas as pd
from dhanhq import DhanContext, dhanhq

master = pd.read_csv("https://images.dhan.co/api-data/api-scrip-master.csv")
hdfc = master[
    (master["SEM_SEGMENT"] == "E") &
    (master["SM_SYMBOL_NAME"] == "HDFCBANK")
].iloc[0]
security_id = str(hdfc["SEM_EXM_EXCH_ID"])

dhan_context = DhanContext("client_id", "access_token")
dhan = dhanhq(dhan_context)

order_id = dhan.place_order(
    security_id=security_id,
    exchange_segment=dhan.NSE,
    transaction_type=dhan.BUY,
    quantity=1,
    order_type=dhan.MARKET,
    product_type=dhan.INTRA,
    price=0
)

print(order_id)</textarea>
  <textarea class="broker-code-source" data-broker-code="upstox">import gzip
import json
import requests
import upstox_client

instruments_url = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
raw = gzip.decompress(requests.get(instruments_url, timeout=30).content).decode("utf-8")
instruments = json.loads(raw)

hdfc = next(
    item for item in instruments
    if item.get("trading_symbol") == "HDFCBANK" and item.get("segment") == "NSE_EQ"
)
instrument_key = hdfc["instrument_key"]

configuration = upstox_client.Configuration()
configuration.access_token = "{your_access_token}"
api_instance = upstox_client.OrderApiV3(upstox_client.ApiClient(configuration))

body = upstox_client.PlaceOrderV3Request(
    quantity=1,
    product="D",
    validity="DAY",
    price=0,
    tag="Market_example",
    instrument_token=instrument_key,
    order_type="MARKET",
    transaction_type="BUY",
    disclosed_quantity=0,
    trigger_price=0.0,
    is_amo=False,
    slice=False
)

api_response = api_instance.place_order(body)
print(api_response)</textarea>
</div>

  </div>

</div>

Tip: Instrument IDs differ by broker: Zerodha uses `instrument_token`, Dhan uses `security_id`, Upstox uses `instrument_key`, and Nubra uses `ref_id` or symbol + exchange. Fetch the right ID first, then place the order.

---

## 2) Historical Data (Candles)

<div style="display: flex; gap: 32px; align-items: flex-start; flex-wrap: wrap;">

  <!-- Nubra Column -->
  <div style="flex: 1; min-width: 320px;">

  <div class="logo-button" role="presentation">
    <img src="./assets/Nubra.png" alt="" />
    <span>Nubra</span>
  </div>

  ```python
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
from nubra_python_sdk.marketdata.market_data import MarketData

nubra = InitNubraSdk(NubraEnv.PROD)
md = MarketData(nubra)
result = md.historical_data({
    "exchange": "NSE",
    "type": "STOCK",
    "values": ["HDFCBANK"],
    "fields": ["open", "high", "low", "close", "cumulative_volume"],
    "startDate": "2025-01-01T03:45:00.000Z",
    "endDate": "2025-01-31T10:00:00.000Z",
    "interval": "1d",
    "intraDay": False,
    "realTime": False
})
print(result)
  ```

  </div>

  <!-- Zerodha Column -->
  <div style="flex: 1; min-width: 320px;">
<div class="broker-toggle" data-broker-group="historical-data">
  <div class="broker-logos">
    <div class="logo-button is-active" role="button" tabindex="0" data-broker-target="zerodha">
      <img src="./assets/kiteconnect.png" alt="" />
      <span>Zerodha</span>
    </div>
    <div class="logo-button" role="button" tabindex="0" data-broker-target="dhan">
      <img src="./assets/dhan.png" alt="" />
      <span>Dhan</span>
    </div>
    <div class="logo-button" role="button" tabindex="0" data-broker-target="upstox">
      <img src="./assets/Upstox.png" alt="" />
      <span>Upstox</span>
    </div>
  </div>

  <div class="broker-code" data-broker-output></div>

  <textarea class="broker-code-source" data-broker-code="zerodha">from kiteconnect import KiteConnect

kite = KiteConnect(api_key=API_KEY)
kite.set_access_token(ACCESS_TOKEN)

instruments = kite.instruments("NSE")
hdfc = next(
    item for item in instruments
    if item.get("tradingsymbol") == "HDFCBANK" and item.get("exchange") == "NSE"
)
instrument_token = hdfc["instrument_token"]

candles = kite.historical_data(
    instrument_token,
    "2025-01-01 09:15:00",
    "2025-01-31 15:30:00",
    "day"
)

print(candles)</textarea>
  <textarea class="broker-code-source" data-broker-code="dhan">import pandas as pd
from dhanhq import DhanContext, HistoricalData

master = pd.read_csv("https://images.dhan.co/api-data/api-scrip-master.csv")
hdfc = master[
    (master["SEM_SEGMENT"] == "E") &
    (master["SM_SYMBOL_NAME"] == "HDFCBANK")
].iloc[0]
security_id = str(hdfc["SEM_EXM_EXCH_ID"])

dhan_context = DhanContext("client_id", "access_token")
historical = HistoricalData(dhan_context)

data = historical.historical_daily_data(
    security_id=security_id,
    exchange_segment="NSE_EQ",
    instrument_type="EQUITY",
    from_date="2025-01-01",
    to_date="2025-01-31",
    expiry_code=0
)

print(data)</textarea>
  <textarea class="broker-code-source" data-broker-code="upstox">import gzip
import json
import requests

instruments_url = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
raw = gzip.decompress(requests.get(instruments_url, timeout=30).content).decode("utf-8")
instruments = json.loads(raw)

hdfc = next(
    item for item in instruments
    if item.get("trading_symbol") == "HDFCBANK" and item.get("segment") == "NSE_EQ"
)
instrument_key = hdfc["instrument_key"]

url = f"https://api.upstox.com/v3/historical-candle/{instrument_key}/days/1/2025-03-01/2025-01-01"
headers = {
    "Accept": "application/json",
    "Authorization": "Bearer {your_access_token}"
}
response = requests.get(url, headers=headers)
print(response.json())</textarea>
</div>

  </div>

</div>

Tip: Historical APIs all need a broker-specific instrument ID and a date range. The payload shape differs, but the workflow is the same: resolve ID → pass dates/interval → read candles.

---

## 3) Realtime Data (Streaming)

<div style="display: flex; gap: 32px; align-items: flex-start; flex-wrap: wrap;">

  <!-- Nubra Column -->
  <div style="flex: 1; min-width: 320px;">

  <div class="logo-button" role="presentation">
    <img src="./assets/Nubra.png" alt="" />
    <span>Nubra</span>
  </div>

  ```python
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
from nubra_python_sdk.ticker import websocketdata

def on_index_data(msg):
    print(msg)

def on_connect(msg):
    print(msg)

def on_close(reason):
    print(reason)

def on_error(err):
    print(err)

nubra = InitNubraSdk(NubraEnv.PROD)

socket = websocketdata.NubraDataSocket(
    client=nubra,
    on_index_data=on_index_data,
    on_connect=on_connect,
    on_close=on_close,
    on_error=on_error
)

socket.connect()
socket.subscribe(["NIFTY", "HDFCBANK"], data_type="index", exchange="NSE")
socket.keep_running()
  ```

  </div>

  <!-- Zerodha Column -->
  <div style="flex: 1; min-width: 320px;">
<div class="broker-toggle" data-broker-group="realtime-data">
  <div class="broker-logos">
    <div class="logo-button is-active" role="button" tabindex="0" data-broker-target="zerodha">
      <img src="./assets/kiteconnect.png" alt="" />
      <span>Zerodha</span>
    </div>
    <div class="logo-button" role="button" tabindex="0" data-broker-target="dhan">
      <img src="./assets/dhan.png" alt="" />
      <span>Dhan</span>
    </div>
    <div class="logo-button" role="button" tabindex="0" data-broker-target="upstox">
      <img src="./assets/Upstox.png" alt="" />
      <span>Upstox</span>
    </div>
  </div>

  <div class="broker-code" data-broker-output></div>

  <textarea class="broker-code-source" data-broker-code="zerodha">from kiteconnect import KiteConnect, KiteTicker

kite = KiteConnect(api_key=API_KEY)
kite.set_access_token(ACCESS_TOKEN)

instruments = kite.instruments("NSE")
hdfc = next(
    item for item in instruments
    if item.get("tradingsymbol") == "HDFCBANK" and item.get("exchange") == "NSE"
)
instrument_token = hdfc["instrument_token"]

kws = KiteTicker(API_KEY, ACCESS_TOKEN)

def on_ticks(ws, ticks):
    print(ticks)

def on_connect(ws, response):
    ws.subscribe([instrument_token])
    ws.set_mode(ws.MODE_FULL, [instrument_token])

def on_close(ws, code, reason):
    ws.stop()

kws.on_ticks = on_ticks
kws.on_connect = on_connect
kws.on_close = on_close

kws.connect()</textarea>
  <textarea class="broker-code-source" data-broker-code="dhan">import pandas as pd
from dhanhq import DhanContext, MarketFeed

master = pd.read_csv("https://images.dhan.co/api-data/api-scrip-master.csv")
hdfc = master[
    (master["SEM_SEGMENT"] == "E") &
    (master["SM_SYMBOL_NAME"] == "HDFCBANK")
].iloc[0]
security_id = str(hdfc["SEM_EXM_EXCH_ID"])

dhan_context = DhanContext("client_id", "access_token")

instruments = [
    (MarketFeed.NSE, security_id, MarketFeed.Full)
]

data = MarketFeed(dhan_context, instruments, "v2")

while True:
    data.run_forever()
    response = data.get_data()
    print(response)</textarea>
  <textarea class="broker-code-source" data-broker-code="upstox">import gzip
import json
import requests
import upstox_client

instruments_url = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
raw = gzip.decompress(requests.get(instruments_url, timeout=30).content).decode("utf-8")
instruments = json.loads(raw)

hdfc = next(
    item for item in instruments
    if item.get("trading_symbol") == "HDFCBANK" and item.get("segment") == "NSE_EQ"
)
instrument_key = hdfc["instrument_key"]

def on_message(message):
    print(message)

configuration = upstox_client.Configuration()
configuration.access_token = "{your_access_token}"

streamer = upstox_client.MarketDataStreamerV3(
    upstox_client.ApiClient(configuration),
    [instrument_key],
    "full"
)

streamer.on("message", on_message)
streamer.connect()</textarea>
</div>

  </div>

</div>

Tip: Streaming subscriptions are not portable. Zerodha and Upstox subscribe by instrument ID, Dhan uses exchange + security_id, and Nubra uses exchange + symbol/type (or index codes).

---

## 4) Get Instruments

<div style="display: flex; gap: 32px; align-items: flex-start; flex-wrap: wrap;">

  <!-- Nubra Column -->
  <div style="flex: 1; min-width: 320px;">

  <div class="logo-button" role="presentation">
    <img src="./assets/Nubra.png" alt="" />
    <span>Nubra</span>
  </div>

  ```python
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
from nubra_python_sdk.refdata.instruments import InstrumentData

nubra = InitNubraSdk(NubraEnv.PROD)
instruments = InstrumentData(nubra)

instruments_df = instruments.get_instruments_dataframe()
print(len(instruments_df))

hdfc = instruments.get_instrument_by_symbol("HDFCBANK", exchange="NSE")
print(hdfc.ref_id)
  ```

  </div>

  <!-- Brokers Column -->
  <div style="flex: 1; min-width: 320px;">

<div class="broker-toggle" data-broker-group="get-instruments">
  <div class="broker-logos">
    <div class="logo-button is-active" role="button" tabindex="0" data-broker-target="zerodha">
      <img src="./assets/kiteconnect.png" alt="" />
      <span>Zerodha</span>
    </div>
    <div class="logo-button" role="button" tabindex="0" data-broker-target="dhan">
      <img src="./assets/dhan.png" alt="" />
      <span>Dhan</span>
    </div>
    <div class="logo-button" role="button" tabindex="0" data-broker-target="upstox">
      <img src="./assets/Upstox.png" alt="" />
      <span>Upstox</span>
    </div>
  </div>

  <div class="broker-code" data-broker-output></div>

  <textarea class="broker-code-source" data-broker-code="zerodha">from kiteconnect import KiteConnect

kite = KiteConnect(api_key=API_KEY)
kite.set_access_token(ACCESS_TOKEN)

instruments = kite.instruments("NSE")
print(len(instruments))

hdfc = next(
    item for item in instruments
    if item.get("tradingsymbol") == "HDFCBANK" and item.get("exchange") == "NSE"
)
print(hdfc["instrument_token"])</textarea>
  <textarea class="broker-code-source" data-broker-code="dhan">import pandas as pd

master = pd.read_csv("https://images.dhan.co/api-data/api-scrip-master.csv")
print(len(master))

hdfc = master[
    (master["SEM_SEGMENT"] == "E") &
    (master["SM_SYMBOL_NAME"] == "HDFCBANK")
].iloc[0]
security_id = str(hdfc["SEM_EXM_EXCH_ID"])
print(security_id)</textarea>
  <textarea class="broker-code-source" data-broker-code="upstox">import gzip
import json
import requests

instruments_url = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
raw = gzip.decompress(requests.get(instruments_url, timeout=30).content).decode("utf-8")
instruments = json.loads(raw)
print(len(instruments))

hdfc = next(
    item for item in instruments
    if item.get("trading_symbol") == "HDFCBANK" and item.get("segment") == "NSE_EQ"
)
print(hdfc["instrument_key"])</textarea>
</div>

  </div>

</div>

---

Learn more about the Nubra Python SDK and APIs here: [Nubra API Docs](https://nubra.io/products/api/docs/)

Use our integrated chatbot to ask questions and get help switching from other broker codes as well.
