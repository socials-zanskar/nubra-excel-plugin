# Historical Data

Historical Data API provides the candle data(Open, High, Low, Close) with timestamps for a given time period, for the given scrips, for a specifed candle duration. 

## Usage

=== "Python"
    ```python
    from nubra_python_sdk.marketdata.market_data import MarketData
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv

    # Initialize the Nubra SDK client
    # Use NubraEnv.UAT for testing or NubraEnv.PROD for production
    nubra = InitNubraSdk(NubraEnv.UAT)  # or NubraEnv.PROD

    ##using totp login and .env file 
    #nubra = InitNubraSdk(NubraEnv.UAT, totp_login= True ,env_creds = True)

    # Initialize MarketData with the client
    mdInstance = MarketData(nubra)
    result = mdInstance.historical_data({
        "exchange": "NSE",
        "type": "STOCK",
        "values": ["ASIANPAINT", "TATAMOTORS"],
        "fields": ["close", "high", "low", "open", "cumulative_volume"],
        "startDate": "2025-04-19T11:01:57.000Z",
        "endDate": "2025-04-24T06:13:57.000Z",
        "interval": "1d",
        "intraDay": False, # If set to True, then startDate and endDate will be ignored, and the current date will be used.
        "realTime": False
    })

    ```

###Accessing Data

=== "Python"
    ```python
    # Access values only after checking data exists in any variable as based on request some fields may not have value
    print(f"Market Time: {result.market_time}")
    print(f"Message: {result.message}")

    for data in result.result:
        print(f"Exchange: {data.exchange}")
        print(f"Type: {data.type}")
        for stock_data in data.values:
            for symbol, values in stock_data.items():
                print(f"\n{symbol}:")
                print(f"  Close: {[{'timestamp': v.timestamp, 'value': v.value} for v in values.close]}")
                print(f"  High: {[{'timestamp': v.timestamp, 'value': v.value} for v in values.high]}")
                print(f"  Low: {[{'timestamp': v.timestamp, 'value': v.value} for v in values.low]}")
                print(f"  Open: {[{'timestamp': v.timestamp, 'value': v.value} for v in values.open]}")
                print(f"  Volume: {[{'timestamp': v.timestamp, 'value': v.value} for v in values.cumulative_volume]}")

    ```

## Request Parameters

=== "Python"
    | Attribute | Data Type | Description|
    |----------|----------|----------|
    | exchange| String | Exchange name (e.g., NSE, BSE) |
    | type | String| "STOCK", "INDEX" ,"OPT" , "FUT"|
    | values | Union[List[str], str])| One or more instrument symbols e.g. ["ASIANPAINT","TATAMOTORS"],["HDFCBANK25MAY2380CE"],["NIFTY2550822400PE"]|
    | fields | List[str]| One or more fields e.g.["open","high","low","close","tick_volume","cumulative_volume","cumulative_volume_premium","cumulative_oi","cumulative_call_oi","cumulative_put_oi","cumulative_fut_oi","l1bid","l1ask","theta","delta","gamma","vega","iv_bid","iv_ask","iv_mid","cumulative_volume_delta"] |
    | startDate | str| Start date time format eg. "2025-04-19T11:01:57.000Z"|
    | endDate | str| end date time format eg. "2025-04-24T06:13:57.000Z"|
    | interval | str| Interval can be "1s","1m","2m","3m","5m","15m","30m","1h","1d","1w","1mt" |
    | intraDay | bool| If True startDate is current date |
    | realTime | bool| To be declared |

### Notes
> Intervals less than 1 day → data for last 3 months

> Intervals 1 day or more → data for up to 10 years (stocks)

> **1s interval special case**  
> - Supported only for the **previous 7 days**  
> - `startDate` and `endDate` must fall on the **same calendar day**

(In PROD environment)

## Response Structure

=== "Python"
    ```python
    # Response object structure
    class MarketChartsResponse:
        market_time: str  # e.g. "2025-04-30T10:00:000Z"
        message: str      # e.g. "charts"
        result: List[ChartData]

    class ChartData:
        exchange: str     # e.g. "NSE"
        type: str         # e.g. "STOCK"
        values: List[Dict[str, StockChart]]

    class StockChart:
        open: Optional[List[TimeSeriesPoint]] 
        high: Optional[List[TimeSeriesPoint]]
        low: Optional[List[TimeSeriesPoint]] 
        close: Optional[List[TimeSeriesPoint]] 
        tick_volume: Optional[List[TimeSeriesPoint]] 
        theta: Optional[List[TickPoint]] 
        delta: Optional[List[TickPoint]] 
        gamma: Optional[List[TickPoint]] 
        vega: Optional[List[TickPoint]] 
        iv_bid: Optional[List[TickPoint]] 
        iv_ask: Optional[List[TickPoint]] 
        iv_mid: Optional[List[TickPoint]] 
        cumulative_volume: Optional[List[TimeSeriesPoint]] 
        cumulative_volume_delta: Optional[List[TickPoint]] 
        cumulative_volume_premium: Optional[List[TimeSeriesPoint]] 
        cumulative_oi: Optional[List[TimeSeriesPoint]] 
        cumulative_call_oi: Optional[List[TimeSeriesPoint]] 
        cumulative_put_oi : Optional[List[TimeSeriesPoint]] 
        cumulative_fut_oi: Optional[List[TimeSeriesPoint]] 
        l1bid: Optional[List[TimeSeriesPoint]] 
        l1ask: Optional[List[TimeSeriesPoint]] 

    class Tickpoint:
        timestamp: Optional[int] 
        value: Optional[float] 

    class TimeSeriesPoint:
        timestamp: int       # Timestamp in Epoch
        value: int         # Value at the timestamp
    ```


## Response attributes

=== "Python"
    | Attribute | Description |
    |-----------|-------------|
    | market_time | Current market time in ISO format |
    | message | Response message type (e.g. "charts") |
    | result | List of DataResult objects containing the historical data |
    | result[].exchange | Exchange name (e.g. "NSE") |
    | result[].type | Security type (e.g. "STOCK", "INDEX") |
    | result[].values | List of dictionaries containing data for each symbol |
    | result[].values[].{symbol} | SymbolData object containing OHLCV data for specific symbol |
    | result[].values[].{symbol}.{field} | List of DataPoint objects for each requested field |
    | result[].values[].{symbol}.{field}[].timestamp | Timestamp in nanoseconds |
    | result[].values[].{symbol}.{field}[].value | Value for the field at given timestamp |

## Historical Data — Examples

Below are **ready-to-use examples** showing how to query Historical Data for different Asset Types

=== "Expired Options Data"

    ```python
    from nubra_python_sdk.marketdata.market_data import MarketData
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
    import pandas as pd
    pd.set_option('display.max_columns', None)     # Show all columns
    pd.set_option('display.max_rows', 1000)         # Limit to 100 rows
    pd.set_option('display.max_colwidth', None)    # Show full cell contents
    pd.set_option('display.width', 0)

    # -------------------------------
    # Initialize Nubra SDK
    # -------------------------------
    nubra = InitNubraSdk(NubraEnv.PROD, env_creds=True)
    mdInstance = MarketData(nubra)

    # -------------------------------
    # Fetch historical data
    # -------------------------------
    instruments = ['NIFTY2611326000CE','NIFTY25D2326000CE']

    response = mdInstance.historical_data({
        "exchange": "NSE",
        "type": "OPT",
        "values": instruments,
        "fields": ["open", "high", "low", "close", "cumulative_volume","theta","delta","gamma","vega","iv_mid",'cumulative_oi'],
        "startDate": "2025-12-01T11:01:57.000Z",
        "endDate": "2026-01-14T06:13:57.000Z",
        "interval": "1d",
        "intraDay": False,
        "realTime": False
    })

    # -------------------------------
    # Helper function
    # -------------------------------
    def tsp_list_to_series(tsp_list):
        return pd.Series(
            data=[p.value for p in tsp_list],
            index=pd.to_datetime([p.timestamp for p in tsp_list], unit="ns")
        )

    # -------------------------------
    # Convert ALL instruments dynamically
    # -------------------------------
    dfs = {}

    for instrument_dict in response.result[0].values:
        for symbol, stock_chart in instrument_dict.items():

            df = pd.DataFrame({
                "open": tsp_list_to_series(stock_chart.open),
                "high": tsp_list_to_series(stock_chart.high),
                "low": tsp_list_to_series(stock_chart.low),
                "close": tsp_list_to_series(stock_chart.close),
                "volume": tsp_list_to_series(stock_chart.cumulative_volume),
                "theta": tsp_list_to_series(stock_chart.theta),
                "delta": tsp_list_to_series(stock_chart.delta),
                "gamma": tsp_list_to_series(stock_chart.gamma),
                "vega": tsp_list_to_series(stock_chart.vega),
                "iv_mid": tsp_list_to_series(stock_chart.iv_mid),
                "cumulative_oi": tsp_list_to_series(stock_chart.cumulative_oi),
            })

            df.sort_index(inplace=True)
            df["symbol"] = symbol  # optional
            dfs[symbol] = df

    # -------------------------------
    # Example usage
    # -------------------------------
    print(f"{instruments[0]} Historical data with greeks")
    print(dfs[instruments[0]].head())
    print('\n')
    print(f"{instruments[1]} Historical data with greeks")
    print(dfs[instruments[1]].head())
    ```

    **Explanation**

    - Replace the instruments using `expired options names` of the last 3 months

=== "Indices Data"

    ```python
    import pandas as pd
    from nubra_python_sdk.marketdata.market_data import MarketData
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv

    # -------------------------------
    # Initialize Nubra SDK
    # -------------------------------
    nubra = InitNubraSdk(NubraEnv.PROD, env_creds=True)
    mdInstance = MarketData(nubra)

    # -------------------------------
    # Fetch historical data
    # -------------------------------
    instruments = ["NIFTY"]

    response = mdInstance.historical_data({
        "exchange": "NSE",
        "type": "INDEX",
        "values": instruments,
        "fields": ["open", "high", "low", "close", "cumulative_volume"],
        "startDate": "2016-02-01T11:01:57.000Z",
        "endDate": "2026-02-04T06:18:57.000Z",
        "interval": "1mt",
        "intraDay": False,
        "realTime": False
    })

    # -------------------------------
    # Helper function (values only)
    # -------------------------------
    def tsp_values(tsp_list):
        return [p.value for p in tsp_list]

    # -------------------------------
    # Convert response to DataFrames
    # -------------------------------
    dfs = {}

    for instrument_dict in response.result[0].values:
        for symbol, stock_chart in instrument_dict.items():

            # Create timestamp index ONCE
            index = pd.to_datetime(
                [p.timestamp for p in stock_chart.open],
                unit="ns"
            )

            df = pd.DataFrame(
                {
                    "open": tsp_values(stock_chart.open),
                    "high": tsp_values(stock_chart.high),
                    "low": tsp_values(stock_chart.low),
                    "close": tsp_values(stock_chart.close),
                    "volume": tsp_values(stock_chart.cumulative_volume),
                },
                index=index
            )

            df.sort_index(inplace=True)

            # -------------------------------
            # Scale price columns (paise → rupees)
            # Only non-null values are affected
            # -------------------------------
            price_cols = ["open", "high", "low", "close"]
            df[price_cols] = df[price_cols].div(100)

            df["symbol"] = symbol  # optional
            dfs[symbol] = df

    # -------------------------------
    # Example usage
    # -------------------------------
    print(dfs["NIFTY"])
    ```

    **Explanation**

    - Change or add `indices` to the instruments list


=== "Stocks Data"

    ```python
    import pandas as pd
    from nubra_python_sdk.marketdata.market_data import MarketData
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv

    # -------------------------------
    # Initialize Nubra SDK
    # -------------------------------
    nubra = InitNubraSdk(NubraEnv.PROD, env_creds=True)
    mdInstance = MarketData(nubra)

    # -------------------------------
    # Fetch historical data
    # -------------------------------
    instruments = ["RELIANCE"]

    response = mdInstance.historical_data({
        "exchange": "NSE",
        "type": "STOCK",
        "values": instruments,
        "fields": ["open", "high", "low", "close", "cumulative_volume"],
        "startDate": "2026-02-05T03:30:00.000Z",
        "endDate": "2026-02-05T11:30:00.000Z",
        "interval": "3m",
        "intraDay": False,
        "realTime": False
    })

    # -------------------------------
    # Helper function
    # -------------------------------
    def tsp_list_to_series(tsp_list):
        idx = pd.to_datetime(
            [p.timestamp for p in tsp_list],
            unit="ns",
            utc=True  # tells pandas this is UTC
        ).tz_convert("Asia/Kolkata")  # convert to IST

        return pd.Series(
            data=[p.value for p in tsp_list],
            index=idx
        )


    # -------------------------------
    # Convert ALL instruments dynamically
    # -------------------------------
    dfs = {}

    for instrument_dict in response.result[0].values:
        for symbol, stock_chart in instrument_dict.items():

            df = pd.DataFrame({
                "open": tsp_list_to_series(stock_chart.open),
                "high": tsp_list_to_series(stock_chart.high),
                "low": tsp_list_to_series(stock_chart.low),
                "close": tsp_list_to_series(stock_chart.close),
                "volume": tsp_list_to_series(stock_chart.cumulative_volume),
            })

            df.sort_index(inplace=True)
            df["symbol"] = symbol  # optional
            dfs[symbol] = df

    # -------------------------------
    # Example usage
    # -------------------------------
    print(dfs["RELIANCE"])
    ```
