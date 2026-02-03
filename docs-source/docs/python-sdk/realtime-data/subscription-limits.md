# WebSocket Subscription Tiers & Weights

Nubra WebSocket streams use a **weight-based subscription system** to ensure fair usage and stable performance across all clients.

Each active WebSocket subscription consumes a fixed number of **weight points**.  
Your account has a **maximum weight capacity**, and the sum of all active subscriptions must remain within this limit.

---

## Subscription Weights by Stream

| WebSocket Stream | Weight per Subscription |
|------------------|-------------------------|
| Option Chain     | **20** |
| Order Book       | **5** |
| OHLC             | **2** |
| Index            | **1** |
| Greeks           | **1** |

Each individual subscription to a stream consumes the corresponding number of weight points.

---

## Free Tier Limits

| Limit Type | Value |
|-----------|-------|
| **Total WebSocket Weight (Session Limit)** | **50,000 points** |

- The **50,000-point limit** applies to the combined weight of all active WebSocket subscriptions.

---

## Example Scenarios

### Example 1: Mixed Subscriptions

```text
300 Option Chain subscriptions → 300 × 20  = 6,000 points
400 Order Book subscriptions   → 3,000 × 5   = 15,000 points
1,000 Index subscriptions      → 1,000 × 1 = 1,000 points
----------------------------------------------
Total Weight Used              → 22,000 / 50,000
```

---

### Example 2: Option Chain Heavy Usage

    1,000 Option Chain subscriptions → 1,000 × 20 = 20,000 points

Within the allowed session weight limit.

---

### Example 3: Exceeding Limits

    1,100 Option Chain subscriptions → 2,600 × 20 = 52,000 points

Not allowed — exceeds the 50,000-point session limit.

---

## Session Enforcement

- Weight limits are enforced per WebSocket session.
- Each session supports subscriptions up to a total of 50,000 weight points.
- If a client attempts to subscribe beyond this limit, the request is rejected with an error.

---

## Need Higher Limits?

If your use case requires:

- Higher WebSocket weight capacity
- More Option Chain subscriptions
- Institutional or high-frequency access

Please reach out to: [support@nubra.io](mailto:support@nubra.io)

Our team can help provision higher limits based on your requirements.

---
