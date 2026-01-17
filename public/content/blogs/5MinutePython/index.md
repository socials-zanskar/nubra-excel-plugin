---
title: "5-Minute Python Quickstart with Nubra SDK"
summary: "Get up and running with Nubra’s Python SDK in just 5 minutes. Learn how to authenticate, place your first order, and start trading using Nubra APIs."
tags: ["Python", "SDK", "API Trading"]
readTime: "5 min"
publishDate: "2025-12-27"
author: "Akshay Navin: Algo & Content Developer"
---


This quickstart walks you through **installing the Nubra Python SDK**, authenticating securely, and getting ready to stream realtime market data, place orders with just a few lines of code, and retrieve portfolio status — all in under 5 minutes.

Nubra’s APIs are designed to be developer-first: **minimal setup, intuitive workflows, and consistent patterns** across streaming, trading, and portfolio access.
You connect once, stream instantly, and place orders without any complexity.

---

## Installing the Nubra Python SDK (Under a Minute)

<div style="
  display: flex;
  gap: 20px;
  align-items: flex-start;
  margin-top: 20px;
">

<!-- LEFT: Video Card -->
<div style="
  flex: 2;
  background: #0b0f14;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
">
  <video
    controls
    autoplay
    muted
    loop
    playsinline
    style="width:100%; border-radius:12px; display:block;"
  >
    <source src="./assets/PythonSDKInstallVideoZoom.mp4" type="video/mp4">
    Your browser does not support the video tag.
  </video>
</div>

<!-- RIGHT: Steps -->
<div style="
  flex: 1;
  background: #111827;
  border-radius: 16px;
  padding: 16px 18px;
  color: #e5e7eb;
  line-height: 1.45;
">

<h3 style="margin-top:0; margin-bottom:12px;">Installation Steps</h3>

<ol style="
  margin: 0;
  padding-left: 18px;
">

<li>
<strong>Open Nubra API Docs</strong><br/>
<a href="https://nubra.io/products/api/docs/" target="_blank">
https://nubra.io/products/api/docs/
</a>
</li>

<li style="margin-top:8px;">
<strong>Open Python SDK Docs</strong><br/>
Click the <em>Python SDK</em> card
</li>

<li style="margin-top:8px;">
<strong>Copy Install Command</strong>
<pre style="
  background:#0b0f14;
  padding:8px;
  border-radius:8px;
  margin:6px 0 0 0;
  font-size: 0.85em;
  overflow-x:auto;
"><code>pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple nubra-sdk</code></pre>
</li>

<li style="margin-top:8px;">
<strong>Install the SDK</strong><br/>
Open <em>Command Prompt / Terminal</em> (ensure Python is in your PATH)
<pre style="
  background:#0b0f14;
  padding:8px;
  border-radius:8px;
  margin:6px 0 0 0;
  font-size: 0.85em;
  overflow-x:auto;
"><code>python -m pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple nubra-sdk</code></pre>
</li>

<li style="margin-top:8px;">
<strong>Done 🎉</strong><br/>
SDK installs in under a minute
</li>

</ol>

</div>
</div>

---

### What’s Next?

Once installed, you’re ready to:

- Initialize the Nubra SDK
- Pull live market data
- Place and manage orders
- Retrieve portfolio and positions

---

## Authentication & Login (Under a Minute)

Authenticate once to establish a secure session before accessing market data, trading, or portfolio APIs.

<div style="
  display: flex;
  gap: 20px;
  align-items: flex-start;
  margin-top: 20px;
">

<!-- LEFT: Video Card -->
<div style="
  flex: 2;
  background: #0b0f14;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
">
  <video
    controls
    autoplay
    muted
    loop
    playsinline
    style="width:100%; border-radius:12px; display:block;"
  >
    <source src="./assets/AuthenticationVideoFull.mp4" type="video/mp4">
    Your browser does not support the video tag.
  </video>
</div>

<!-- RIGHT: Steps -->
<div style="
  flex: 1;
  background: #111827;
  border-radius: 16px;
  padding: 16px 18px;
  color: #e5e7eb;
  line-height: 1.45;
">

<h3 style="margin-top:0; margin-bottom:12px;">Authentication Steps</h3>

<ol style="margin:0; padding-left:18px;">

<li>
<strong>Open Python SDK Docs</strong><br/>
From Nubra API Docs, click the <em>Python SDK</em> card
</li>

<li style="margin-top:8px;">
<strong>Navigate to Authentication</strong><br/>
Go to the <em>Authentication</em> section
</li>

<li style="margin-top:8px;">
<strong>Copy the Login Code</strong><br/>
Use the provided authentication example
</li>

<li style="margin-top:8px;">
<strong>Select Environment</strong><br/>
Choose the environment you want to log into:
<ul style="margin:6px 0 0 16px;">
  <li><strong>PROD</strong> — live market trading</li>
  <li><strong>UAT</strong> — simulated market environment for testing strategies</li>
</ul>
</li>

<li style="margin-top:8px;">
<strong>Run the Code</strong><br/>
When prompted, enter:
<ul style="margin:6px 0 0 16px;">
  <li>Registered mobile number</li>
  <li>OTP received on your phone</li>
  <li>MPIN</li>
</ul>
</li>

<li style="margin-top:8px;">
<strong>Done 🔐</strong><br/>
You are now successfully logged in
</li>

</ol>

</div>
</div>



### What’s Next?

Once authenticated, you’re ready to:

- Stream **realtime market data** via WebSocket
- Place **UAT or live orders**
- Retrieve **funds, positions, and portfolio**
- Build **fully automated execution and monitoring systems**

---

## Realtime Market Data via WebSocket (Under a Minute)

Stream live prices directly into your code using Nubra’s realtime WebSocket APIs.

<div style="
  display: flex;
  gap: 20px;
  align-items: flex-start;
  margin-top: 20px;
">

<!-- LEFT: Video Card -->
<div style="
  flex: 2;
  background: #0b0f14;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
">
  <video
    controls
    autoplay
    muted
    loop
    playsinline
    style="width:100%; border-radius:12px; display:block;"
  >
    <source src="./assets/UATWebsocketVideoFull.mp4" type="video/mp4">
    Your browser does not support the video tag.
  </video>
</div>

<!-- RIGHT: Steps -->
<div style="
  flex: 1;
  background: #111827;
  border-radius: 16px;
  padding: 16px 18px;
  color: #e5e7eb;
  line-height: 1.45;
">

<h3 style="margin-top:0; margin-bottom:12px;">WebSocket Streaming Steps</h3>

<ol style="margin:0; padding-left:18px;">

<li>
<strong>Open Python SDK Docs</strong><br/>
From Nubra API Docs, click the <em>Python SDK</em> card
</li>

<li style="margin-top:8px;">
<strong>Navigate to Realtime Data</strong><br/>
Go to the <em>Realtime Data</em> section
</li>

<li style="margin-top:8px;">
<strong>Select a Stream Type</strong><br/>
Nubra provides 5 realtime streams:
<ul style="margin:6px 0 0 16px;">
  <li>Index Data</li>
  <li>Greeks</li>
  <li>Option Chain</li>
  <li>Orderbook</li>
  <li>Market Moves</li>
</ul>
</li>

<li style="margin-top:8px;">
<strong>Copy the Index Data Example</strong><br/>
Index data streams basic <em>price</em> and <em>volume</em> in realtime
</li>

<li style="margin-top:8px;">
<strong>Run the Code</strong><br/>
Execute the script and watch realtime data streaming instantly
</li>

<li style="margin-top:8px;">
<strong>Done ⚡</strong><br/>
Realtime streaming live in under a minute
</li>

</ol>

</div>
</div>


### What’s Next?

Once you’ve streamed realtime data:

- With the addition of a few extra lines of code, you can **store the incoming ticks** and **chart them in realtime or post-session**
- Build **signal generation and strategies** on top of the stored market data
- Place orders **algorithmically** based on those signals
- Retrieve **portfolio, positions, and execution status** programmatically

---

## Placing Your First Order (Under a Minute)

Place a live or UAT order using Nubra’s Trading APIs with minimal code.

<div style="
  display: flex;
  gap: 20px;
  align-items: flex-start;
  margin-top: 20px;
">

<!-- LEFT: Video Card -->
<div style="
  flex: 2;
  background: #0b0f14;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
">
  <video
    controls
    autoplay
    muted
    loop
    playsinline
    style="width:100%; border-radius:12px; display:block;"
  >
    <source src="./assets/PlaceOrderVideoFull.mp4" type="video/mp4">
    Your browser does not support the video tag.
  </video>
</div>

<!-- RIGHT: Steps -->
<div style="
  flex: 1;
  background: #111827;
  border-radius: 16px;
  padding: 16px 18px;
  color: #e5e7eb;
  line-height: 1.45;
">

<h3 style="margin-top:0; margin-bottom:12px;">Order Placement Steps</h3>

<ol style="margin:0; padding-left:18px;">

<li>
<strong>Open Guides & Examples</strong><br/>
Navigate to <em>Guides and Examples</em> — either via the card on the page or the top navigation tab
</li>

<li style="margin-top:8px;">
<strong>Go to Place Order</strong><br/>
Open the <em>Place Order</em> card under <em>Order Placement & Execution</em>
</li>

<li style="margin-top:8px;">
<strong>Select an Order Type</strong><br/>
Choose the order flow that fits your use-case:
<ul style="margin:6px 0 0 16px;">
  <li><strong>Individual Orders</strong> — single-leg equity, futures, or options orders</li>
  <li><strong>Basket Orders</strong> — place multiple order types and instruments together in 1 single API call</li>
  <li><strong>Flexi Orders</strong> — strategy-level orders for futures & options with dynamic sizing, time windows, and modification support</li>
</ul>
Copy the relevant sample code
</li>

<li style="margin-top:8px;">
<strong>Run the Code</strong><br/>
Execute the script and head over to the <em>Nubra Terminal</em> to watch the order being executed
</li>

<li style="margin-top:8px;">
<strong>Done 🚀</strong><br/>
Your first trade placed in under a minute
</li>

</ol>

</div>
</div>

### What’s Next?

Once you can retrieve positions programmatically, you can:

- Build **position-aware strategies**
- Automate **risk checks and exits**
- Track **real-time P&amp;L and exposure**
- Combine positions with **realtime Greeks and market data**
- Create **fully automated execution and monitoring systems**

---


## Retrieving Positions & Portfolio (Under a Minute)

Fetch live positions, P&L, and portfolio state programmatically using Nubra’s Portfolio APIs.

<div style="
  display: flex;
  gap: 20px;
  align-items: flex-start;
  margin-top: 20px;
">

<!-- LEFT: Video Card -->
<div style="
  flex: 2;
  background: #0b0f14;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
">
  <video
    controls
    autoplay
    muted
    loop
    playsinline
    style="width:100%; border-radius:12px; display:block;"
  >
    <source src="./assets/PositionsVideoFull.mp4" type="video/mp4">
    Your browser does not support the video tag.
  </video>
</div>

<!-- RIGHT: Steps -->
<div style="
  flex: 1;
  background: #111827;
  border-radius: 16px;
  padding: 16px 18px;
  color: #e5e7eb;
  line-height: 1.45;
">

<h3 style="margin-top:0; margin-bottom:12px;">Positions & Portfolio Steps</h3>

<ol style="margin:0; padding-left:18px;">

<li>
<strong>Open Python SDK Docs</strong><br/>
From the Nubra API Docs, click the <em>Python SDK</em> card
</li>

<li style="margin-top:8px;">
<strong>Navigate to Portfolio</strong><br/>
Go to the <em>Portfolio</em> tab, which provides access to:
<ul style="margin:6px 0 0 16px;">
  <li>Funds &amp; Margin</li>
  <li>Holdings</li>
  <li>Positions</li>
</ul>
</li>

<li style="margin-top:8px;">
<strong>Check Funds &amp; Margin</strong><br/>
Use the <em>Funds</em> API to view available balance, collateral, margin usage, MTM, and net margin available
</li>

<li style="margin-top:8px;">
<strong>View Holdings</strong><br/>
Open the <em>Holdings</em> section to see invested value, current value, day &amp; overall PnL, margin benefit, and pledge availability
</li>

<li style="margin-top:8px;">
<strong>Go to Positions</strong><br/>
Navigate to the <em>Positions</em> section and copy the sample code
</li>

<li style="margin-top:8px;">
<strong>Run the Code</strong><br/>
Execute the script to fetch live positions, quantities, average prices, and real-time P&amp;L
</li>

<li style="margin-top:8px;">
<strong>Done 📊</strong><br/>
Track funds, holdings, positions, and P&amp;L programmatically in under a minute
</li>

</ol>


</div>
</div>

### What’s Next?

Once you can retrieve positions programmatically, you can:

- Build **position-aware strategies**
- Automate **risk checks and exits**
- Track **real-time P&amp;L and exposure**
- Combine positions with **realtime Greeks and market data**
- Create **fully automated execution + monitoring systems**
