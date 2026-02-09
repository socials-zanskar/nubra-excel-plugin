# Current Price

The Current Price API provides the latest market price snapshot for a given instrument or index across supported exchanges.

```jsx
Method: GET
Endpoint: optionchains/{instrument}/price
```

---

## Path Parameters

| **Parameter** | **Type** | **Required** | **Description** |
|--------------|---------|-------------|-----------------|
| instrument | string | Yes | Trading symbol of the instrument or index (e.g. `NIFTY`, `RELIANCE`, `BANKNIFTY`) |

---

## Query Parameters

| **Parameter** | **Type** | **Required** | **Description** |
|--------------|---------|-------------|-----------------|
| exchange | string | No | Exchange for the instrument. Defaults to `NSE`. Supported value: `BSE` |

> ⚠️ When `exchange` is `NSE` or not provided, the default endpoint is used without query parameters.

---

## Example Endpoints

- **NSE (default)**  
  ```
  optionchains/NIFTY/price
  ```

- **BSE**  
  ```
  optionchains/NIFTY/price?exchange=BSE
  ```

---

## cURL

```bash
curl --location 'https://api.nubra.io/optionchains/NIFTY/price' \
--header 'x-device-id: TS123' \
--header 'Authorization: Bearer eyJh...6Pno'
```

### BSE Example

```bash
curl --location 'https://api.nubra.io/optionchains/SENSEX/price?exchange=BSE' \
--header 'x-device-id: TS123' \
--header 'Authorization: Bearer eyJh...6Pno'
```

---

## Response Structure

```jsx
{
  "message": "current price",
  "exchange": "NSE",
  "price": 2575555,
  "prev_close": 2572755,
  "change": 0.10883275
}
```

---

## Response Attributes

| **Field** | **Description** |
|---------|-----------------|
| message | Description of the response |
| exchange | Exchange of the instrument |
| price | Latest traded price of the instrument (integer, exchange price units) |
| prev_close | Previous closing price of the instrument |
| change | Percentage change from previous close |

---

## Notes

- Authentication via `Authorization` and `x-device-id` headers is mandatory.
- NSE is used by default when `exchange` is not specified.
- This API returns a **snapshot** of the current price.
- The response format is **uniform across all instruments and indices**.
- Price values are returned in **exchange-defined integer units**.
- Prices are subject to market availability and exchange rules.
