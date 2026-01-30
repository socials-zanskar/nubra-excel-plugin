---
title: "Realtime Market Data & WebSockets: What �Realtime� Really Means in Practice"
summary: "A practical explanation of realtime feeds, the difference between ticks, quotes, depth, and order updates, how WebSockets behave conceptually, and how to use broker streams responsibly for UIs, algos, and monitoring."
tags: ["Market Data","Infrastructure"]
readTime: "9 min"
publishDate: "2025-11-20"
author: "Akshay Navin: Algo Trader & Content Developer"
---

Realtime is one of the most used words in trading systems.  
It usually means fast enough to get you into trouble quickly.

Let's define the terrain clearly, then talk about how to use it without lying to yourself or your users.

## A Clean Mental Model: Realtime Is a Stream, Not a Snapshot

Realtime data is a sequence of events arriving over time.  
You never have the market. You have *a stream of updates about the market*.

That stream can include different shapes of truth.

## Orderbook Stream
<video controls muted playsinline preload="metadata" style="width:100%; border-radius:12px; display:block;">
  <source src="./assets/WebsocketOrderbook.mp4" type="video/mp4" />
</video>

## Ticks vs Quotes vs Depth vs Order Updates

These are not synonyms. They answer different questions.

- **Ticks**: last traded price/quantity updates
- **Quotes**: top-of-book context (best bid/ask and LTP context)
- **Depth (orderbook)**: multiple levels of bids/asks
- **Order updates**: your order state transitions (ack, reject, fill, cancel)

A system that mixes these without clear boundaries eventually invents phantom states.

## How WebSockets Work (Conceptually, Not Just Technically)

WebSockets are a persistent channel where the server pushes updates.  
That changes the failure modes.

Key properties to remember:

- You must handle reconnects without duplicating state
- You must handle bursts without freezing your app
- You must decide what to do when you fall behind

WebSockets are less about connection code and more about state discipline.

## The Nubra Stream Surface (Why Multiple Streams Exist)

Brokers provide multiple streams because different decisions need different data.

Conceptual stream categories include:

- Index/spot streams for market context
- Orderbook/depth streams for execution assumptions
- Option chain streams for Greeks and structure
- Order update streams for risk and reconciliation

## Index Stream
<video controls muted playsinline preload="metadata" style="width:100%; border-radius:12px; display:block;">
  <source src="./assets/WebsocketIndex.mp4" type="video/mp4" />
</video>
If you subscribe to everything because it�s available, you�re not building an edge. You�re building a bottleneck.

## Where Realtime Streams Actually Earn Their Keep

The best use cases are narrow and explicit.

### UI Responsiveness

Realtime feeds are the only way to make a trading UI feel alive *and* correct.

### Algo Monitoring (Not Just Signals)

Signals matter. Monitoring matters more:

- Are we receiving data?
- Are we receiving plausible data?
- Are we trading on stale state?

### Alerting and Risk Context

Realtime alerts work when they are tied to specific stream semantics, not vague �price moved� logic.

## Latency, Reliability, and Compliance: The Broker Reality

Three truths hold simultaneously:

- Lower latency is useful
- Reliability is more useful
- Compliance expects you to explain what you consumed

That means you should plan for:

- Explicit scaling rules (paise vs rupees)
- Replayable traces (logs, snapshots, storage)
- Backpressure strategies (queues, batch writes, drop policies)

Realtime data is not �faster REST.� It�s a state machine you must own.


