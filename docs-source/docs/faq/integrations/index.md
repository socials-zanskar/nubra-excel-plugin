---
hide:
  - navigation
  - toc
---

# Integrations & Ecosystem FAQs
Below are the most common questions related to connecting Nubra with third-party platforms, backtesting tools, official SDKs, and code samples.  
Click any question to expand the detailed answer.

---

## Language & SDK Support

??? faq-question "How can I integrate Nubra’s data into Python, Node.js, or C#?"
    Nubra APIs are language-agnostic.

    You can use:

    - **Python SDK** (recommended — fastest, easiest)
    - **Native REST APIs** in Node.js, C#, Go, Java, or any language that supports HTTPS
    - **WebSockets** for real-time streaming (indices, options, orderbook, full market feed)

    Code examples for Python are provided in the SDK; REST samples can be adapted in any language.

    [Need more assistance?](https://nubra.io/support){.md-button .md-button--primary}

??? faq-question "Is there a Postman collection or code samples available?"
    Yes — Nubra provides **ready-to-use code samples** for every major API category (Market Data, Trading, Option Chain, WebSockets, Portfolio, etc.) directly inside the official documentation.

    You can find all examples in multiple languages (Python SDK, cURL, REST samples) at:

    👉 **https://nubra.io/products/api/docs/**

    A dedicated Postman collection is in progress and will be added soon.  
    For now, all REST endpoints in the docs include request/response schemas that can be copied directly into Postman or any API client.

    [Need more assistance?](https://nubra.io/support){.md-button .md-button--primary}

---

## Trading Platform & Third-Party Integrations

??? faq-question "How do I connect my API app to a third-party trading platform?"
    Every third-party platform ultimately connects to Nubra APIs using **your authentication token + REST/WebSocket calls**.

    Typical setup flow:

    1. Your trading platform sends signals (webhooks / API triggers)  
    2. Your backend receives them  
    3. Your backend calls Nubra's **Trading API (V2)** → place/modify/cancel  
    4. WebSocket feeds update your local system with fills, market data, and portfolio changes  

    If you need static IP whitelisting for automated systems, add your primary/secondary IP under:

    **Account Settings → API Credentials → Update Static IP**

    [Need more assistance?](https://nubra.io/support){.md-button .md-button--primary}

??? faq-question "Is Nubra integrating with popular platforms like AlgoTest and Tradetron?"
    ## Tradetron Integration – LIVE

    You can now use **Nubra as a broker on Tradetron**.

    ### How to Connect Nubra on Tradetron

    Inside **Tradetron → Brokers → Add Broker → Nubra**:

    1. Select **Nubra**
    2. Enter **registered phone number**
    3. Enter **MPIN**
    4. Click **Generate OTP**
    5. Enter OTP received on SMS
    6. Click **Save**

    Tradetron will now be linked to your Nubra trading account.

    ### Trading  
    Deploy any strategy inside Tradetron and choose Nubra as the broker for:

    - Live Auto  
    - Live  
    - Paper Trading  

    ---

    ## AlgoTest Integration – LIVE

    You can now use **Nubra as a broker on Algotest**.

    ### How to Connect Nubra on Algotest

    Inside **Algotest → Brokers → Add Broker → Nubra**:

    1. Select **Nubra**
    2. Enter **registered phone number**
    3. Enter **MPIN**
    4. Click **Generate OTP**
    5. Enter OTP received on SMS
    6. Click **Save**

    Algotest will now be linked to your Nubra trading account.

    [Need more assistance?](https://nubra.io/support){.md-button .md-button--primary}

??? faq-question "Can I connect Nubra APIs to platforms like TradingView, Excel, or Amibroker?"
    Nubra does **not** provide native plugins/connectors for:

    - TradingView  
    - Excel  
    - Amibroker  
    - MT5 / MT4  
    - NinjaTrader  
    - AmiBroker AFL  

    However, you *can* integrate Nubra with these platforms by building a **custom bridge** using REST or WebSocket APIs.

    Typical integration methods:

    - Python/Node.js middleware for TradingView alerts  
    - Excel integration via Office Scripts / Python / VBA  
    - Amibroker plugin using AFL extensions  
    - Custom charting using WebSocket streaming feed  

    Nubra’s APIs are fully capable; some scripting is needed.

    [Need more assistance?](https://nubra.io/support){.md-button .md-button--primary}

---

## Backtesting & Analytics

??? faq-question "Can I backtest strategies using Nubra’s historical data APIs?"
    Yes. Nubra supports backtesting using its historical datasets.

    Available data:

    - **1-second data** (up to 3 months)  
    - **1-minute, 5-minute, 15-minute candles**  
    - **Complete option chain snapshots**  
    - **Historical OHLC, OI, volume**  

    These can be used in:

    - Pandas/Numpy  
    - Backtrader  
    - QuantConnect (local)  
    - Custom Python frameworks  
    - Excel-based backtesting  

    For extended historical datasets, contact:

    📩 **support@nubra.io**

    [Need more assistance?](https://nubra.io/support){.md-button .md-button--primary}

---

## Continue exploring related FAQs

Click any category to navigate directly to its FAQ group.

[Browse all FAQs](../index.md){ .md-button }

<div class="faq-card-grid">

<a class="faq-mini-card" href="../troubleshooting/">
  <h4>Troubleshooting & Errors</h4>
  <p>Common API errors, WebSocket drops, and debugging.</p>
</a>

<a class="faq-mini-card" href="../integrations/">
  <h4>Integrations & Tools</h4>
  <p>Connecting to third-party platforms, available SDKs (Python, Node.js).</p>
</a>

<a class="faq-mini-card" href="../algo/">
  <h4>Algo Registration & Compliance</h4>
  <p>Sebi guidelines, workflow, approvals, documentation.</p>
</a>

</div>
