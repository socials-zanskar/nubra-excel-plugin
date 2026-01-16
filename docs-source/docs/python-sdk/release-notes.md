# Release Notes

This document contains the release history and changes for the Nubra Python SDK.

## Version 0.3.7

### Features & Enhancements

- **Positions API (V2 Support)**  
  The Positions API now supports **V2**, with additional fields to provide clearer position-level visibility:
  - **Buy Quantity** – Total quantity bought for the position
  - **Sell Quantity** – Total quantity sold for the position  
  
## Version 0.3.6
### Features & Enhancements

- **Flexi Basket Modification** – Modify existing Flexi basket orders, including entry price, exit price, stoploss, timing, and multiplier (subject to order type rules)

- **Get Margin API** – Estimate margins for single-leg and multi-leg strategies with portfolio hedge benefits and final authoritative margin calculation

- **Greeks WebSocket** – Real-time streaming of option Greeks (Delta, Gamma, Theta, Vega, IV) for live risk monitoring and strategy management

- **OHLCV WebSocket** – Real-time OHLCV candle data via WebSocket for intraday analytics, indicators, and automated trading systems


---


## Version 0.3.5
Version 0.3.5 — internal change in the WebSocket endpoint for market-data.

We provide two endpoints for the WebSocket market-data:

In version 0.3.5, the new WebSocket endpoint is used by default.
To use the older WebSocket endpoint on version 0.3.5, pass socket_v2 = false.

For versions prior to 0.3.5 (i.e., ≤ 0.3.4), no flag is required — the previous endpoint will behave as before.

## Version 0.3.4

Introduced order tagging functionality in the “Place Order, Place Multi Order, Place Flexi order ” API

Enhanced “Get Order” API to filter orders by tag

Improved real-time order update import mechanism


## Version 0.3.1

### Breaking Changes:
TOTP and OTP Authentication:
Authentication with the use of .env files for both TOTP and OTP methods.

Price Format Update:
All prices and monetary values are now represented as integers in paise (instead of floating-point values in rupees).

Trading API V2:

New trading APIs have been added to the SDK with version V2. Please refer to the latest API reference for details on the updated parameter structure.

Link to [Trading API V1](./trading/orders/orders.md)

## Version 0.2.5

### Features
- **TOTP Authentication**
- **Portfolio APIs** - Complete portfolio management functionality
  - Holdings retrieval with detailed PnL breakdown
  - Position tracking for stocks, futures, and options
  - Funds and margin
- **Trading APIs** - Full trading capabilities
  - Place single and basket orders
  - Modify existing orders
  - Cancel orders (single and multiple)
  - Order book and status tracking
  - Support for multiple execution strategies (Market, Limit, IOC, Iceberg, Stop-loss)

## Version 0.1.1

### Features
- Initial release of the Nubra Python SDK
- Historical Market data retrieval
- Live Market Quotes including depth
- Realtime Marketdata through Websockets
- Optionchain Data
- Authenticate in Terminal with 2FA

## How to Update

To update to the latest version of the SDK:

```bash
pip install --upgrade --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple nubra-sdk
```

## Version Support

| Version | Status      | Python Version Support |
|---------|-------------|------------------------|
| 0.3.5   | Current     | 3.7+                   |
| 0.2.5   | Previous    | 3.7+                   |

