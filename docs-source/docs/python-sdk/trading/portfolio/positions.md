# Positions

Returns open and closed positions across stocks, futures, and options. Includes key details like symbol, quantity, average prices, last traded price, order side, and a comprehensive PnL breakdown — including realised, unrealised, and total PnL with percentage changes.

> **Note:**  
> By default, the Positions API returns **V1** data.  
> To enable **Positions V2**, pass `version="V2"` — this adds `buy_quantity` and `sell_quantity` fields to each position.

---

## Usage

=== "Python"
    ```python
    from nubra_python_sdk.portfolio.portfolio_data import NubraPortfolio
    from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv

    # Initialize the Nubra SDK client
    # Use NubraEnv.UAT for testing or NubraEnv.PROD for production
    nubra = InitNubraSdk(NubraEnv.UAT)  # or NubraEnv.PROD

    ## using totp login and .env file 
    # nubra = InitNubraSdk(NubraEnv.UAT, totp_login=True, env_creds=True)

    # Initialize the portfolio 
    portfolio = NubraPortfolio(nubra)

    # Get positions (V1 - default)
    result = portfolio.positions()

    # Get positions (V2 - includes buy_quantity & sell_quantity)
    result_v2 = portfolio.positions(version="V2")
    ```

---

## Accessing Data

=== "Python"
    ```python
    # Portfolio Client & Stats
    print(f"Client Code: {result.portfolio.client_code}")
    print(f"Total PnL: {result.portfolio.position_stats.total_pnl}")
    print(f"Total PnL % Change: {result.portfolio.position_stats.total_pnl_chg}")

    # Stock Positions (V1)
    if result.portfolio.stock_positions:
        print("\nOpen Stock Positions:")
        for pos in result.portfolio.stock_positions:
            print(f"Symbol: {pos.symbol}, Quantity: {pos.quantity}, PnL: {pos.pnl}")

    # Stock Positions (V2)
    if result_v2.portfolio.stock_positions:
        print("\nOpen Stock Positions (V2):")
        for pos in result_v2.portfolio.stock_positions:
            print(
                f"Symbol: {pos.symbol}, "
                f"Buy Qty: {pos.buy_quantity}, "
                f"Sell Qty: {pos.sell_quantity}, "
                f"Net Qty: {pos.quantity}, "
                f"PnL: {pos.pnl}"
            )
    ```

---

## Response Structure

```python
class PositionStats:
    realised_pnl: Optional[int]
    unrealised_pnl: Optional[int]
    total_pnl: Optional[int]
    total_pnl_chg: Optional[float]


class PositionStruct:
    ref_id: Optional[int]
    nubra_name: str
    displayName: Optional[str]
    derivative_type: Optional[str]
    strike_price: Optional[int]
    lot_size: Optional[int]
    exchange: str
    asset: str
    symbol: str
    product: Optional[str]
    order_side: Optional[str]

    quantity: Optional[int]              # Net quantity (V1 & V2)
    buy_quantity: Optional[int]          # V2 only
    sell_quantity: Optional[int]         # V2 only

    last_traded_price: Optional[int]
    avg_price: Optional[int]
    avg_buy_price: Optional[int]
    avg_sell_price: Optional[int]
    pnl: Optional[int]
    pnl_chg: Optional[float]


class Portfolio:
    client_code: str
    position_stats: PositionStats
    stock_positions: List[PositionStruct]
    fut_positions: List[PositionStruct]
    opt_positions: List[PositionStruct]
    close_positions: List[PositionStruct]


class PortfolioMessage:
    message: str
    portfolio: Portfolio
```

---

## Response Attributes

| Field | Description |
|-------|-------------|
| `message` | Response message |
| `portfolio.client_code` | Unique client code linked to the trading account |
| `portfolio.position_stats.realised_pnl` | Realised profit or loss from closed positions |
| `portfolio.position_stats.unrealised_pnl` | Unrealised profit or loss from open positions |
| `portfolio.position_stats.total_pnl` | Combined PnL from all positions (realised + unrealised) |
| `portfolio.position_stats.total_pnl_chg` | Overall PnL as a percentage change |
| `portfolio.*_positions[].ref_id` | Internal reference ID of the instrument |
| `portfolio.*_positions[].nubra_name` | Full instrument name used in Nubra |
| `portfolio.*_positions[].displayName` | Display name shown in UI |
| `portfolio.*_positions[].derivative_type` | Type of derivative (e.g., FUT, OPT, EQ) |
| `portfolio.*_positions[].strike_price` | Strike price of the option contract (if applicable) |
| `portfolio.*_positions[].lot_size` | Lot size of the instrument |
| `portfolio.*_positions[].exchange` | Exchange where the instrument is traded (e.g., NSE, BSE) |
| `portfolio.*_positions[].asset` | Asset class (Equity, Futures, Options, etc.) |
| `portfolio.*_positions[].symbol` | Trading symbol of the instrument |
| `portfolio.*_positions[].product` | Product type (e.g., NRML, MIS) |
| `portfolio.*_positions[].order_side` | Side of the position (BUY or SELL) |
| `portfolio.*_positions[].quantity` | Net quantity (Buy − Sell) |
| `portfolio.*_positions[].buy_quantity` | Total buy quantity (V2 only) |
| `portfolio.*_positions[].sell_quantity` | Total sell quantity (V2 only) |
| `portfolio.*_positions[].last_traded_price` | Latest traded price of the instrument |
| `portfolio.*_positions[].avg_price` | Average price of the total position |
| `portfolio.*_positions[].avg_buy_price` | Average buy price of the position |
| `portfolio.*_positions[].avg_sell_price` | Average sell price of the position |
| `portfolio.*_positions[].pnl` | Profit or loss on the position |
| `portfolio.*_positions[].pnl_chg` | Percentage change in PnL |

Note: The same structure applies to `stock_positions`, `fut_positions`, `opt_positions`, and `close_positions`.  
The fields `buy_quantity` and `sell_quantity` are populated **only when `version="V2"` is specified**.
