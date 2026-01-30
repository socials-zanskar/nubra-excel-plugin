---
title: "GEX Walls Dashboard"
summary: "Realtime OI Walls + Net GEX by strike to spot key support/resistance zones and dealer pressure areas."
tags: ["Tools","Options"]
image: "./assets/GEXWallsDashboard.png"
---

<video controls autoplay loop muted playsinline style="width: 100%; border-radius: 12px; display: block;">
  <source src="./assets/GEXWallsDashboardSpedUp.mp4" type="video/mp4" />
</video>

The **GEX Walls Dashboard** highlights where the options market is most concentrated by strike using two views:
1) **OI Walls** (largest Call/Put Open Interest levels)  
2) **Net GEX Walls** (largest absolute Net Gamma areas)

This helps traders identify likely **support/resistance zones**, **pinning levels**, and **high-impact strikes** around spot.

---

## Data Source

- **Nubra WebSocket – Option Chain**
- **Exchange:** NSE  
- **Data Type:** `option`
- **Subscription Format:** `ASSET:EXPIRY` (e.g., `RELIANCE:20260224`)

The stream provides strike-wise option data including **open interest, gamma, lot size** for both CE and PE legs.

---

## What It Calculates

### 1) OI Walls (Call / Put)
For each strike:
- **Call OI** = sum of CE open interest
- **Put OI** = sum of PE open interest

The chart plots:
- Call OI to the right (+)
- Put OI to the left (−)

### 2) Net GEX (Gamma Walls)
For each strike:
- **GEX (simple)** = `gamma × open_interest × lot_size`
- **Net GEX** = `Call GEX − Put GEX`

Net GEX is scaled for readability (e.g., in millions).

---

## How to Use It

- **Top Call OI walls:** potential overhead resistance zones
- **Top Put OI walls:** potential support zones
- **Largest |Net GEX| strikes:** high-impact strikes where dealer hedging flows can matter most
- The dashboard also shows the **nearest wall above/below spot** for quick reference.

---

## How It Works (Flow)

1. WebSocket subscribes to a list of configured underlyings and expiries.  
2. Incoming option-chain ticks are aggregated into strike-wise OI and Net GEX.  
3. UI renders:
   - OI Walls chart
   - Net GEX chart
   - Top tables for Call OI, Put OI, and Net GEX  
4. Dashboard refreshes every second.

---

## Code Implementation

```python
import threading
import time
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from nubra_python_sdk.ticker import websocketdata
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv


# =========================
# CONFIG
# =========================
ENV = NubraEnv.UAT
EXCHANGE = "NSE"
REFRESH_SEC = 1.0

# Put your watchlist here (any underlying that has options in Nubra)
# NOTE: Expiry format is YYYYMMDD and must match what Nubra expects.
UNDERLYINGS = {
    "NIFTY": ["20260203", "20260210", "20260217", "20260224"],
    "BANKNIFTY": ["20260224"],
    "RELIANCE": ["20260224"],
    "TCS": ["20260224"],
    "INFY": ["20260224"],
    "HDFCBANK": ["20260224"],
    "ICICIBANK": ["20260224"],
    "SBIN": ["20260224"],
    "AXISBANK": ["20260224"],
    "LT": ["20260224"],
    "ITC": ["20260224"],
    "HINDUNILVR": ["20260224"],
    "KOTAKBANK": ["20260224"],
    "BAJFINANCE": ["20260224"],
    "BAJAJFINSV": ["20260224"],
    "MARUTI": ["20260224"],
    "TITAN": ["20260224"],
    "SUNPHARMA": ["20260224"],
    "ONGC": ["20260224"],
    "NTPC": ["20260224"],
    "POWERGRID": ["20260224"],
    "ADANIENT": ["20260224"],# example from docs
}

# GEX scaling mode:
# - "simple": gamma * OI * lot
# - "spot2":  gamma * OI * lot * spot^2
GEX_MODE = "simple"

# To keep numbers readable on chart (e.g. show in "millions")
DISPLAY_DIVISOR = 1e6

# Assets that should be shown without decimals
INDEX_ASSETS = {"NIFTY", "BANKNIFTY"}


# =========================
# STATE
# =========================
@dataclass
class ChainSnapshot:
    asset: str = ""
    expiry: str = ""
    spot: Optional[float] = None
    atm: Optional[float] = None
    ts: Optional[float] = None
    df: Optional[pd.DataFrame] = None


@dataclass
class AppState:
    lock: threading.Lock
    latest_by_key: Dict[Tuple[str, str], ChainSnapshot]
    desired: Tuple[str, str]  # (asset, expiry)
    connected: bool = False
    msg_count: int = 0
    last_msg_time: Optional[float] = None
    started: bool = False


@st.cache_resource
def get_state() -> AppState:
    default_asset = list(UNDERLYINGS.keys())[0]
    default_expiry = UNDERLYINGS[default_asset][0]
    return AppState(
        lock=threading.Lock(),
        latest_by_key={},
        desired=(default_asset, default_expiry),
    )


def safe_float(x) -> Optional[float]:
    try:
        if x is None:
            return None
        return float(x)
    except Exception:
        return None


def compute_walls_df(msg) -> pd.DataFrame:
    spot = safe_float(getattr(msg, "current_price", None))
    atm = safe_float(getattr(msg, "at_the_money_strike", None))
    asset = getattr(msg, "asset", "") or ""

    if spot is not None:
        spot = spot / 100.0
        if asset in INDEX_ASSETS:
            spot = round(spot)
    if atm is not None:
        atm = atm / 100.0
        if asset in INDEX_ASSETS:
            atm = round(atm)

    def option_gex(opt) -> float:
        gamma = safe_float(getattr(opt, "gamma", None))
        oi = safe_float(getattr(opt, "open_interest", None))
        lot = safe_float(getattr(opt, "lot_size", None))
        if gamma is None or oi is None or lot is None:
            return 0.0
        base = gamma * oi * lot
        if GEX_MODE == "spot2" and spot is not None:
            base = base * spot * spot
        return float(base)

    agg: Dict[int, Dict[str, float]] = {}

    for opt in getattr(msg, "ce", []) or []:
        k = safe_float(getattr(opt, "strike_price", 0))
        if k is None:
            k = 0
        k = int(round(k / 100.0))
        agg.setdefault(k, {"call_oi": 0.0, "put_oi": 0.0, "call_gex": 0.0, "put_gex": 0.0})
        agg[k]["call_oi"] += safe_float(getattr(opt, "open_interest", 0)) or 0.0
        agg[k]["call_gex"] += option_gex(opt)

    for opt in getattr(msg, "pe", []) or []:
        k = safe_float(getattr(opt, "strike_price", 0))
        if k is None:
            k = 0
        k = int(round(k / 100.0))
        agg.setdefault(k, {"call_oi": 0.0, "put_oi": 0.0, "call_gex": 0.0, "put_gex": 0.0})
        agg[k]["put_oi"] += safe_float(getattr(opt, "open_interest", 0)) or 0.0
        agg[k]["put_gex"] += option_gex(opt)

    rows = []
    for strike, v in agg.items():
        call_gex = v["call_gex"]
        put_gex = v["put_gex"]
        net_gex = call_gex - put_gex
        rows.append(
            {
                "strike": strike,
                "call_oi": v["call_oi"],
                "put_oi": v["put_oi"],
                "net_gex": net_gex / DISPLAY_DIVISOR,
            }
        )

    df = pd.DataFrame(rows).sort_values("strike")
    df.attrs["spot"] = spot
    df.attrs["atm"] = atm
    df.attrs["asset"] = asset
    return df


def oi_walls_chart(df: pd.DataFrame, call_walls: pd.DataFrame, put_walls: pd.DataFrame, spot: Optional[float]):
    if df is None or df.empty:
        fig = go.Figure()
        fig.update_layout(title="OI Walls by Strike", height=420)
        return fig

    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            y=df["strike"],
            x=df["call_oi"],
            orientation="h",
            name="Call OI",
            marker_color="#2ca02c",
            opacity=0.75,
        )
    )
    fig.add_trace(
        go.Bar(
            y=df["strike"],
            x=-df["put_oi"],
            orientation="h",
            name="Put OI",
            marker_color="#d62728",
            opacity=0.75,
        )
    )

    if call_walls is not None and not call_walls.empty:
        fig.add_trace(
            go.Scatter(
                y=call_walls["strike"],
                x=call_walls["call_oi"],
                mode="markers",
                name="Top Call OI",
                marker=dict(size=10, color="#ffffff", line=dict(width=1, color="#ffffff")),
            )
        )
    if put_walls is not None and not put_walls.empty:
        fig.add_trace(
            go.Scatter(
                y=put_walls["strike"],
                x=-put_walls["put_oi"],
                mode="markers",
                name="Top Put OI",
                marker=dict(size=10, color="#ffffff", line=dict(width=1, color="#ffffff")),
            )
        )

    if spot is not None:
        fig.add_hline(y=spot, line_color="#ffffff", line_width=1, opacity=0.6)

    fig.update_layout(
        title="OI Walls by Strike",
        barmode="overlay",
        height=520,
        xaxis_title="Open Interest (+Call / -Put)",
        yaxis_title="Strike",
        margin=dict(l=60, r=20, t=60, b=40),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
    )
    return fig


def net_gex_chart(df: pd.DataFrame, net_walls: pd.DataFrame, spot: Optional[float]):
    if df is None or df.empty:
        fig = go.Figure()
        fig.update_layout(title="Net GEX by Strike", height=420)
        return fig

    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            y=df["strike"],
            x=df["net_gex"],
            orientation="h",
            name="Net GEX",
            marker_color="#1f77b4",
            opacity=0.75,
        )
    )
    if net_walls is not None and not net_walls.empty:
        fig.add_trace(
            go.Scatter(
                y=net_walls["strike"],
                x=net_walls["net_gex"],
                mode="markers",
                name="Top Net GEX",
                marker=dict(size=10, color="#ffffff", line=dict(width=1, color="#ffffff")),
            )
        )
    if spot is not None:
        fig.add_hline(y=spot, line_color="#ffffff", line_width=1, opacity=0.6)

    fig.update_layout(
        title="Net GEX by Strike",
        barmode="overlay",
        height=520,
        xaxis_title=f"Net GEX (÷ {DISPLAY_DIVISOR:g})",
        yaxis_title="Strike",
        margin=dict(l=60, r=20, t=60, b=40),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
    )
    return fig


def ensure_socket_started(state: AppState):
    with state.lock:
        if state.started:
            return
        state.started = True
    t = threading.Thread(target=ws_worker, args=(state,), daemon=True)
    t.start()


def ws_worker(state: AppState):
    nubra = InitNubraSdk(ENV, env_creds=True)

    def on_option_data(msg):
        try:
            df = compute_walls_df(msg)
            key = (
                getattr(msg, "asset", "") or "",
                getattr(msg, "expiry", "") or "",
            )
            with state.lock:
                state.latest_by_key[key] = ChainSnapshot(
                    asset=key[0],
                    expiry=key[1],
                    spot=df.attrs.get("spot"),
                    atm=df.attrs.get("atm"),
                    ts=time.time(),
                    df=df,
                )
                state.msg_count += 1
                state.last_msg_time = time.time()
        except Exception as e:
            print("on_option_data error:", e)

    def on_connect(msg):
        print("[status]", msg)
        with state.lock:
            state.connected = True

    def on_close(reason):
        print("Closed:", reason)
        with state.lock:
            state.connected = False

    def on_error(err):
        print("Error:", err)

    socket = websocketdata.NubraDataSocket(
        client=nubra,
        on_option_data=on_option_data,
        on_connect=on_connect,
        on_close=on_close,
        on_error=on_error,
    )

    socket.connect()
    subs = [f"{asset}:{exp}" for asset, exps in UNDERLYINGS.items() for exp in exps]
    if subs:
        print("Subscribing:", ", ".join(subs))
        socket.subscribe(subs, data_type="option", exchange=EXCHANGE)
    socket.keep_running()


# =========================
# STREAMLIT UI
# =========================
st.set_page_config(page_title="GEX Walls Dashboard", layout="wide")
st.title("GEX Walls Dashboard (Nubra Option Chain)")
st.caption(f"ENV: {ENV} | EXCHANGE: {EXCHANGE}")

state = get_state()
ensure_socket_started(state)

# Controls
c1, c2, c3 = st.columns([1.2, 1.2, 2])
asset = c1.selectbox("Underlying", list(UNDERLYINGS.keys()), index=0)
expiry = c2.selectbox("Expiry (YYYYMMDD)", UNDERLYINGS[asset], index=0)

with state.lock:
    state.desired = (asset, expiry)
    connected = state.connected
    msg_count = state.msg_count
    last_msg_time = state.last_msg_time
    snap = state.latest_by_key.get((asset, expiry), ChainSnapshot())

top_n = 10 if asset in INDEX_ASSETS else 5

c3.write("")
m1, m2, m3, m4 = c3.columns(4)
m1.metric("Connected", "Yes" if connected else "No")
m2.metric("Msgs", str(msg_count))
if asset in INDEX_ASSETS:
    spot_text = f"{snap.spot:,.0f}" if snap.spot is not None else "--"
else:
    spot_text = f"{snap.spot:,.2f}" if snap.spot is not None else "--"
m3.metric("Spot", spot_text)
m4.metric("ATM", f"{snap.atm:,.0f}" if snap.atm is not None else "--")

df = snap.df
if df is None or df.empty:
    st.info("Waiting for option chain ticks...")
else:
    call_walls = df.sort_values("call_oi", ascending=False).head(top_n)
    put_walls = df.sort_values("put_oi", ascending=False).head(top_n)
    net_walls = df.copy()
    net_walls["abs_net"] = net_walls["net_gex"].abs()
    net_walls = net_walls.sort_values("abs_net", ascending=False).head(top_n)

    above = None
    below = None
    if snap.spot is not None:
        above_candidates = net_walls[net_walls["strike"] > snap.spot]
        below_candidates = net_walls[net_walls["strike"] < snap.spot]
        if not above_candidates.empty:
            above = above_candidates.sort_values("strike").iloc[0]["strike"]
        if not below_candidates.empty:
            below = below_candidates.sort_values("strike").iloc[-1]["strike"]

    w1, w2 = st.columns(2)
    w1.metric("Nearest wall above spot", f"{above:,.0f}" if above is not None else "--")
    w2.metric("Nearest wall below spot", f"{below:,.0f}" if below is not None else "--")

    v1, v2 = st.columns(2)
    v1.plotly_chart(oi_walls_chart(df, call_walls, put_walls, snap.spot), width="stretch")
    v2.plotly_chart(net_gex_chart(df, net_walls, snap.spot), width="stretch")

    t1, t2, t3 = st.columns(3)
    t1.subheader(f"Top Call OI (Top {top_n})")
    t1.dataframe(call_walls[["strike", "call_oi"]], width="stretch", height=520)

    t2.subheader(f"Top Put OI (Top {top_n})")
    t2.dataframe(put_walls[["strike", "put_oi"]], width="stretch", height=520)

    t3.subheader(f"Top Net GEX (Top {top_n})")
    t3.dataframe(net_walls[["strike", "net_gex"]], width="stretch", height=520)

# refresh
time.sleep(REFRESH_SEC)
st.rerun()

```

