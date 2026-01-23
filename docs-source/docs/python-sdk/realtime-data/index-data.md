# Index Data

Subscribes to real-time market data for indices, equities, and derivative symbols.  
Index updates are delivered via the WebSocket and can be filtered using the `index` subscription.

> **Note:** Despite the name, the `index` subscription can also emit updates for stock symbols and derivative instruments (e.g., futures, options), depending on the symbol subscribed.

---

## Usage

### Python

```python
from nubra_python_sdk.ticker import websocketdata
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv

# Initialize the Nubra SDK client
nubra = InitNubraSdk(NubraEnv.UAT)

# Callback functions
def on_index_data(msg):
    print(f"[INDEX] {msg}")

def on_connect(msg):
    print("[status]", msg)

def on_close(reason):
    print(f"Closed: {reason}")

def on_error(err):
    print(f"Error: {err}")

# Initialize WebSocket
socket = websocketdata.NubraDataSocket(
    client=nubra,
    on_index_data=on_index_data,
    on_connect=on_connect,
    on_close=on_close,
    on_error=on_error
)

socket.connect()

# Subscribe to index / symbol data
socket.subscribe(
    symbols=["NIFTY", "RELIANCE26FEBFUT", "NIFTY2612026000CE"],
    data_type="index",
    exchange="NSE"
)

# Keep the socket running
socket.keep_running()
```

---

## Subscription Parameters

| Attribute | Data Type | Description |
|----------|----------|------------|
| symbols | List[str] | List of index or symbol identifiers (e.g., ["NIFTY", "RELIANCE26FEBFUT", "NIFTY2612026000CE"]) |
| data_type | str | Must be "index" |
| exchange | Optional[str] | "NSE" or "BSE" (default: "NSE") |

---

## Response Object

Index updates are delivered as an `IndexDataWrapper` object.

```python
class IndexDataWrapper:
    indexname: str              # Symbol name (index, equity, or derivative)
    exchange: str               # Exchange (e.g., NSE, BSE)
    timestamp: int              # Epoch timestamp (nanoseconds)
    index_value: int            # Current value / last traded price
    high_index_value: int       # Session high
    low_index_value: int        # Session low
    volume: int                 # Traded volume
    changepercent: float        # Percentage change from previous close
    tick_volume: int            # Number of ticks
    prev_close: int             # Previous closing value
    volume_oi: Optional[int]    # Open interest (present for derivatives, else None)
```

---

## Error Handling

The WebSocket connection includes built-in error handling through the `on_error` callback. Common errors include:
- Connection failures
- Authentication errors
- Subscription errors
- Data parsing errors

## Best Practices

1. Always run WebSocket connections in a separate thread to prevent blocking the main application
2. Implement proper error handling using the provided callbacks
3. Use the `keep_running()` method to maintain the connection
4. Close the connection properly when done using the `close()` method
5. Monitor connection status using the `on_connect` and `on_close` callbacks
6. Use the `on_market_data` callback as the primary data receiver, while using specific subscriptions to filter data types