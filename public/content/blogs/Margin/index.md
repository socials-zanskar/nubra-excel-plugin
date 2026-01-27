---
title: "Why Margin Is Not Just a Number"
summary: "Margin in trading is a dynamic risk construct, not a static balance. This article explains how margins change with positions, hedges, volatility, and order intent—and why misunderstanding margin is one of the most common causes of order rejections and forced exits."
tags: ["Risk, Margin & Compliance", "Execution & Order Management"]
readTime: "6 min"
publishDate: "2025-12-29"
author: "Akshay Navin: Algo Trader & Content Developer"
---


### Understanding Modern Margin Systems in Trading

If margin were simple, it would just be:

> “You need ₹1,00,000 to place this trade.”

But margin isn’t simple.

It changes with volatility.  
It depends on risk, not just position size.  
It reacts to hedges, offsets, and correlations.  
And for real strategies, margin must be evaluated **across positions**, not per order.

That’s why modern trading systems—like :contentReference[oaicite:0]{index=0}—treat margin as a **portfolio-level risk problem**, not a per-order checklist.

---

## The Illusion of “Per-Order Margin”

Traditional systems calculate margin like this:

> Order × Quantity × Fixed Formula

Each order:
- Blocks margin independently  
- Ignores other open positions  
- Assumes worst-case risk in isolation  

This works only if:
- You place one trade at a time  
- You never hedge  
- You don’t run strategies  

Which is not how real traders trade.

---

## What Margin Is *Actually* About

Margin is not capital.  
Margin is **risk coverage**.

It answers one question:

> “What is the worst-case loss this portfolio can incur right now?”

That question cannot be answered by looking at a single order.

---

## Why Per-Order Margin Breaks for Strategies

Consider a simple hedge:

- Buy Call  
- Sell Call  
- Same expiry, same underlying  

Risk is limited.  
But if margins are calculated per order:

- Both legs block full margin  
- Hedge benefit is ignored  
- Capital usage looks inflated  

The trader is punished for reducing risk.

---

## Margin Is a Portfolio Problem

Real margin systems must evaluate:

- Net exposure  
- Directional offsets  
- Option greeks interaction  
- Volatility risk  
- Worst-case scenarios  

That requires **portfolio-level computation**, not order-level math.

---

## How Nubra Handles Margin for API Users

Nubra calculates margin **at the portfolio level**, not per order.

### What this means for API traders:

- All open positions are evaluated together  
- Hedged positions automatically reduce margin  
- Capital reflects *actual risk*, not gross exposure  
- No artificial margin inflation  

You don’t need to manually track offsets.  
The system understands them.

---

## Margin with Flexi Basket Orders

| ❌ **Without Flexi (Leg-wise Margin)** | ✅ **With Flexi (Strategy Margin)** |
|--------------------------------------|------------------------------------|
| ![Without Flexi](./assets/IndividualOrder.gif) | ![With Flexi Basket](./assets/FlexiOrder.gif) |
| **What happens**<br/>Strategy legs arrive one by one.<br/><br/>• Margin blocked per leg<br/>• Temporary margin spikes<br/>• Possible order rejections<br/><br/>**Result**<br/>Higher capital usage despite lower risk | **What happens**<br/>All legs arrive as one strategy.<br/><br/>• Net payoff evaluated instantly<br/>• Hedge benefit applied upfront<br/>• Margin based on worst-case strategy loss<br/><br/>**Result**<br/>• Optimized margin<br/>• Fewer rejections<br/>• Strategy-aware risk |

---

## What Flexi Enables at Margin Level

When you send a hedged strategy using Flexi:

- Margin is computed on the **combined payoff**
- Worst-case loss is strategy-based
- No temporary over-blocking
- Cleaner capital utilization
- Fewer order rejections due to margin spikes  

In short:  
**The system understands your intent, not just your orders.**

---


## Final Takeaway

Margin is not about how much you trade.  
It’s about how much you can lose.

Systems that calculate margin per order:
- Overestimate risk  
- Lock excess capital  
- Penalize hedging  

Nubra’s approach:
- Evaluates **portfolio risk**
- Rewards hedged strategies
- Optimizes capital automatically
- Aligns margin with reality  

That’s why margin is not just a number.  
It’s a **risk model**.

And modern trading demands that it be a smart one.
