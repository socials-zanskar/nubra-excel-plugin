# End of Day Bhavcopy (Reports)

The End of Day Bhavcopy API provides official NSE end-of-day reports in CSV format.  
These reports are generated after market close and are commonly used for reconciliation, reporting, analytics, and historical storage.

```jsx
Method: GET
Endpoint: bhavcopy/nse/{date}?format=csv&type={type}
```

## cURL

```bash
curl --location --globoff \
'https://api.nubra.io/bhavcopy/nse/{date}?format=csv&type={type}' \
--header 'x-device-id: TS123' \
--header 'Authorization: Bearer eyJh...6Pno'
```

## Path Parameters

| **Parameter** | **Description** |
|---|---|
| `date` | Trading date in `YYYYMMDD` format (must be a completed trading day) |
| `type` | Type is `FO`,`OP`,`BhavcopyFO`,`BhavcopySec`,`BhavcopyCM`,`PD`,`PR`|

## Query Parameters

| **Parameter** | **Description** |
|---|---|
| `format` | Response format. Supported value: `csv` and `json` |
| `type` | Bhavcopy / report type including date suffix (see supported types below) |

## Supported Bhavcopy & Report Types

The `type` parameter must include the date in `YYYYMMDD` format and must match the `{date}` in the endpoint.

| **Type Format** | **Description** | **Example Output File** |
|---|---|---|
| `BhavcopyFO{yyyymmdd}` | NSE Futures & Options Bhavcopy | `BhavCopy_NSE_FO_0_0_0_20251016_F_0000.csv` |
| `BhavcopyCM{yyyymmdd}` | NSE Cash Market Bhavcopy | `BhavCopy_NSE_CM_0_0_0_20251016_F_0000.csv` |
| `BhavcopySec{yyyymmdd}` | Security-wise Bhavcopy | `sec_bhavdata_full_16102025.csv` |
| `FO{yyyymmdd}` | FO Daily Report | `fo161025.csv` |
| `OP{yyyymmdd}` | Options Report | `op161025.csv` |
| `PD{yyyymmdd}` | Price Data Report | `pd16102025.csv` |
| `PR{yyyymmdd}` | Price Range Report | `pr16102025.csv` |

> ⚠️ **Important**
> - `{date}` in the endpoint and `{yyyymmdd}` in `type` must be identical  
> - Requests for future dates or non-trading days will fail

## Example Request

```bash
curl --location --globoff \
'https://api.nubra.io/bhavcopy/nse/20251016?format=csv&type=BhavcopyFO20251016' \
--header 'x-device-id: TS123' \
--header 'Authorization: Bearer eyJh...6Pno'
```

## Response

- **Content-Type:** `text/csv`
- **Response Body:** Raw CSV file

## Response Behavior

| **Scenario** | **Behavior** |
|---|---|
| Valid trading date and type | CSV file returned |
| Bhavcopy not generated yet | HTTP 440 |
| Future or invalid date | HTTP 440 |
| Invalid or expired session | HTTP 440 |

## Common Use Cases

- End-of-day reconciliation
- Portfolio valuation and P&L
- Historical data ingestion
- Back-office reporting
- Dashboards and analytics pipelines

## Notes for Developers

- Bhavcopies are generated after market close
- Availability varies by report type
- API returns raw CSV only
- Ensure session token is valid before requesting reports
