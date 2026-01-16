# Current Price

The Current Price API provides a real-time price snapshot for an instrument, including its current price, previous close, percentage change, and exchange information.

This API is optimized for lightweight price polling without fetching order book depth.

---

## Usage

### Python
```python
from nubra_python_sdk.marketdata.market_data import MarketData
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv

# Initialize the Nubra SDK client
nubra = InitNubraSdk(NubraEnv.UAT, env_creds=True)  # Use NubraEnv.PROD for production

# Initialize MarketData
MDInstance = MarketData(nubra)

# Fetch current price
nifty_price = MDInstance.current_price("NIFTY")
reliance_price = MDInstance.current_price("RELIANCE")

print(nifty_price)
print(reliance_price)
```

---

## Accessing Data

### Python
```python
print(f"Message: {nifty_price.message}")
print(f"Exchange: {nifty_price.exchange}")
print(f"Current Price: {nifty_price.price}")
print(f"Previous Close: {nifty_price.prev_close}")
print(f"Change (%): {nifty_price.change}")
```

---

## Request Parameters

### Python

| Parameter | Type | Description |
|----------|------|-------------|
| symbol `required` | str | Trading symbol of the instrument (e.g., `"NIFTY"`, `"RELIANCE"`) |

---

## Response Structure

### Python
```python

class CurrentPrice(BaseModel):
    """
    Represents the current price snapshot of an instrument.
    """

    change: Optional[float] = None     # Percentage change from previous close
    message: str                       # Response message
    exchange: Optional[str] = None     # Exchange name (e.g., NSE)
    prev_close: Optional[int] = None   # Previous closing price
    price: Optional[int] = None        # Current price

```

---

## Sample Response

### Python
```text
change=0.22052865 message='current price' exchange='NSE' prev_close=2566560 price=2572220
change=0.047984645 message='current price' exchange='NSE' prev_close=145880 price=145950
```

---

## Response Attributes

### Python

| Attribute | Type | Description |
|----------|------|-------------|
| message | str | API response message |
| exchange | str | Exchange where the instrument is traded |
| price | int | Latest traded price |
| prev_close | int | Previous trading session’s closing price |
| change | float | Percentage change from previous close |

---

## Notes

- Prices are returned in exchange-native units (e.g., paise for NSE).
- `change` represents percentage movement from the previous close.
