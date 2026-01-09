# Get Instruments

### Reference Data Overview

Nubra provides **two distinct reference data sets** to help you build trading and market-data systems efficiently:

- **Tradable Instruments Master**  
  Contains all exchange-listed, tradable instruments (stocks, futures, options) used for **orders, quotes, and WebSocket subscriptions**.

- **Index Master**  
  Contains metadata for supported **market indices** (NIFTY, BANKNIFTY, etc.) used for **index tracking, strategy logic, and UI mapping**.  
  Indices are **not tradable instruments** and are maintained separately.

---

### Quick Navigation

| Reference Data | Description | Link |
|---------------|-------------|------|
| **Instruments Master** | Tradable stocks, futures & options (NSE/BSE) | [Go to Instruments](#instrument-master-list) |
| **Index Master** | Market index metadata (NIFTY, BANKNIFTY, etc.) | [Go to Index Master](#get-index-master) |

## Instrument Master List
The nubra SDK automatically fetches the entire set of tradable instruments during the first run of the day and stores them in a local cache, making them available for your access anytime as a pandas DataFrame. The SDK provides several predefined methods to fetch specific instruments efficiently. This instrument data is essential for:

1. Getting the nubra reference ID (ref_id) required for Market Quote API calls
2. Mapping instruments in the Option Chain WebSocket feed
3. Quick lookup of instrument details like lot size, tick size, and other specifications

The cached data is automatically refreshed daily, ensuring you always have access to the latest instrument information without making repeated API calls.

> **Note:**  
> By default, the instruments cache loads **NSE instruments**.  
> To work with **BSE instruments**, explicitly pass the exchange while fetching the DataFrame.

```python
# NSE instruments (default)
instruments_df = instruments.get_instruments_dataframe()

# BSE instruments (explicit)
instruments_df = instruments.get_instruments_dataframe(exchange="BSE")
```

## Basic Usage

=== "Python"
```python
from nubra_python_sdk.refdata.instruments import InstrumentData
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv

# Initialize the Nubra SDK client
# Use NubraEnv.UAT for testing or NubraEnv.PROD for production
nubra = InitNubraSdk(NubraEnv.UAT)  # or NubraEnv.PROD

##using totp login and .env file 
#nubra = InitNubraSdk(NubraEnv.UAT, totp_login= True ,env_creds = True) 

# Initialize instruments master data with the client
instruments = InstrumentData(nubra)

# Get all instruments as a pandas DataFrame
instruments_df = instruments.get_instruments_dataframe()
print(f"Total instruments: {len(instruments_df)}\n\n")

# Get instrument by reference ID. Internal Reference ID from Nubra.
instrument = instruments.get_instrument_by_ref_id(69694)
print(f"Instrument details: {instrument}\n\n")

# Get instrument by instrument trading symbol eg: HDFCBANK25MAY2380CE, TATAMOTORS, NIFTY2550822400PE and exchange= "NSE"/"BSE"
instrument = instruments.get_instrument_by_symbol("HDFCBANK", exchange= "BSE")
print(f"Instrument details: {instrument}\n\n")

# Get instrument by nubra defined name of instrument eg: STOCK_HDFCBANK.NSECM, STOCK_HDFCBANK and exchange= "NSE"/"BSE"
instrument = instruments.get_instrument_by_nubra_name("STOCK_HDFCBANK.NSECM",exchange= "NSE") 
print(f"Instrument details: {instrument}\n\n")

# Fetch multiple instruments matching the pattern passed
instruments = instruments.get_instruments_by_pattern([{
        "exchange": "NSE",
        "asset": "NIFTY",
        "derivative_type": "OPT",
        "expiry":"20250522",
        "strike_price": "24000",
        "option_type": "CE",
        "asset_type": "INDEX_FO"
    }]
)
print(f"Instrument details: {instruments}\n\n")
```

## Available Methods in SDK

=== "Python"
    | Method | Description |
    |--------|-------------|
    | `get_ref_dataframe(exchange)` | Returns all instruments as a pandas DataFrame |
    | `get_instrument_by_ref_id(ref_id,exchange)` | Get instrument details by reference ID |
    | `get_instrument_by_symbol(trading_symbol,exchange)` | Get instrument by Trading symbol eg `HDFCBANK25MAY2380CE`, `TATAMOTORS`, `NIFTY2550822400PE` |
    | `get_instrument_by_nubra_name(nubra_name_of_instrument,exchange)` | Get instrument by Unique Name given by Nubra `STOCK_HDFCBANK.NSECM`|
    | `get_instruments_by_pattern(filter_with_multiple_params)` | Get instruments by passing a pattern eg `[{"exchange": "NSE","asset": "NIFTY", "derivative_type": "OPT", "expiry":"20250522", "strike_price": "24000", "option_type": "CE", "asset_type": "INDEX_FO"}]` |

## Response Structure

=== "Python"
    ```python
    # Response object structure
    class Instrument:
        ref_id: int                 # Reference ID of the instrument
        strike_price: int        # Strike price (null for non-options)
        option_type: str            # Option type (e.g., "CE", "PE", or "N/A")
        token: int                  # Token identifier
        stock_name: str             # Trading symbol
        nubra_name: str           # Nubra system name
        lot_size: int               # Minimum trading quantity
        asset: str                  # Asset name
        expiry: int                 # Expiry date (null for cash market)
        exchange: str               # Exchange name
        derivative_type: str        # Derivative type
        isin: str                   # ISIN code
        asset_type: str             # Asset type
        tick_size: int           # Minimum price movement
        underlying_prev_close: int # Underlying Previous Close
    ```


## Response attributes

=== "Python"
    | Attribute | Description |
    |-----------|-------------|
    | ref_id | Reference ID of the instrument (used in other API calls) |
    | strike_price | Strike price for options (null for non-options) |
    | option_type | Option type (e.g., "CE", "PE", or "N/A" for non-options) |
    | token | Token identifier for the instrument |
    | stock_name | Trading symbol of the instrument |
    | nubra_name | Nubra system name for the instrument |
    | lot_size | Minimum trading quantity |
    | asset | Asset name |
    | expiry | Expiry date for derivatives (null for cash market) |
    | exchange | Exchange where the instrument is traded (e.g., "NSE","BSE") |
    | derivative_type | Derivative type ("STOCK" or "FUT" or "OPT") |
    | isin | ISIN code of the instrument |
    | asset_type | Type of asset ("STOCKS" or "INDEX_FO" or "STOCK_FO") |
    | tick_size | Minimum price movement |
    | underlying_prev_close | Underlying previous close |


## Example: Working with the DataFrame

Since the reference data is returned as a pandas DataFrame, you can easily filter and query the data. Here's an updated example of how you might implement a helper class:

=== "Python"
```python
from nubra_python_sdk.refdata.instruments import InstrumentData
from nubra_python_sdk.start_sdk import InitNubraSdk
from typing import List, Optional, Dict, Any

class InstrumentFinder:
    """
    A utility class to find instruments using various filters.
    This class can be imported and used in other scripts to find instruments
    based on different criteria like exchange, asset, derivative type, etc.
    """
    def __init__(self):
        self.client = InitNubraSdk()
        self.instruments = InstrumentData(self.client)
        self.instruments_df = None
        self._load_reference_data()

    def _load_reference_data(self):
        if self.instruments_df is None:
            try:
                self.instruments_df = self.instruments.get_instruments_dataframe()
                if self.instruments_df is not None:
                    self.instruments_df.set_index(['ref_id'], inplace=True)
            except Exception as e:
                print(f"Error loading reference data: {e}")
                self.instruments_df = None

    def get_instruments(self, 
                        exchange: Optional[str] = None,
                        asset: Optional[str] = None,
                        derivative_type: Optional[str] = None,
                        asset_type: Optional[str] = None,
                        expiry: Optional[str] = None,
                        strike_price: Optional[float] = None,
                        option_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Find instruments based on the provided filters.
        """
        try:
            if self.instruments_df is None:
                self._load_reference_data()
                if self.instruments_df is None:
                    return []
            filtered_df = self.instruments_df.copy()
            if exchange:
                filtered_df = filtered_df[filtered_df['exchange'] == exchange]
            if asset:
                filtered_df = filtered_df[filtered_df['asset'] == asset]
            if derivative_type:
                filtered_df = filtered_df[filtered_df['derivative_type'] == derivative_type]
            if asset_type:
                filtered_df = filtered_df[filtered_df['asset_type'] == asset_type]
            if expiry:
                filtered_df = filtered_df[filtered_df['expiry'] == expiry]
            if strike_price is not None:
                filtered_df = filtered_df[filtered_df['strike_price'] == strike_price]
            if option_type:
                filtered_df = filtered_df[filtered_df['option_type'] == option_type]
            return filtered_df.reset_index().to_dict('records')
        except Exception as e:
            print(f"Error finding instruments: {e}")
            return []

# Example usage
finder = InstrumentFinder()
instruments = finder.get_instruments(
    exchange='NSE',
    asset='HDFCBANK',
    derivative_type='STOCK'
)
print(f"\nFound {len(instruments)} instruments for HDFCBANK stock:")
for instrument in instruments:
    print(f"\nInstrument details:")
    print(instrument)
```

    ## Get Index Master

In addition to tradable instruments, Nubra provides a **public Index Master** that lists all supported indices along with their metadata.  
This is useful for:

- Discovering available indices (NIFTY, BANKNIFTY, FINNIFTY, etc.)
- Mapping index names to symbols used in market data APIs
- Building index-aware strategies and dashboards

The Index Master is exposed as a **public CSV endpoint** and does not require authentication.

---

### Fetch Index Master (CSV)

=== "Python"
```python
import requests
import csv
from io import StringIO

INDEX_URL = "https://api.nubra.io/public/indexes?format=csv"

def fetch_indices_master():
    response = requests.get(INDEX_URL, timeout=10)
    response.raise_for_status()

    csv_buffer = StringIO(response.text)
    reader = csv.DictReader(csv_buffer)

    return list(reader)

# Example usage
indices = fetch_indices_master()

print(f"Total indices fetched: {len(indices)}")
print(indices)
```

---

### Notes

- This endpoint returns **index metadata only** (not tradable instruments)
- No SDK initialization or login is required
- Data can be cached locally and refreshed periodically as needed
- Index data complements the **Instruments Master**, especially for:
  - Index-based option strategies
  - Market data subscriptions
  - UI dropdowns and symbol mappings