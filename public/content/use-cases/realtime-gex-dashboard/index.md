---
title: "Realtime GEX Dashboard"
summary: "Live Gamma Exposure (GEX) by strike to assess market stability vs directional risk using option-chain data."
tags: ["Tools","Options"]
image: "./assets/GEXDashboard.png"
---

<video controls autoplay loop muted playsinline style="width: 100%; border-radius: 12px; display: block;">
  <source src="./assets/GEXDashboardSpedUp.mp4" type="video/mp4" />
</video>

The **Realtime GEX Dashboard** visualizes **Gamma Exposure (GEX)** across option strikes for a selected index or stock and expiry.  
It helps traders understand **where option dealers may dampen price movement (pinning)** versus **where price can accelerate directionally**.

---

## Data Source

- **Nubra WebSocket – Option Chain**
- **Exchange:** NSE  
- **Data Type:** `option`
- **Subscription Format:** `ASSET:EXPIRY`  
  Example: `RELIANCE:20260224`

The feed provides full real-time option chain data including:
- Gamma
- Open Interest
- Lot Size
- Strike-wise Call (CE) and Put (PE) data

---

## What Is GEX (Gamma Exposure)?

**Gamma Exposure (GEX)** measures how sensitive option dealers’ hedging needs are to price changes.

For each option:
- **GEX = Gamma × Open Interest × Lot Size**

Strike-wise values are aggregated into:
- **Call GEX**
- **Put GEX**
- **Net GEX = Call GEX − Put GEX**

---

## How to Read the Chart

- **Green bars (right):** Call Gamma
- **Red bars (left):** Put Gamma
- **Line:** Net Gamma

### Interpretation
- **Positive Net GEX near ATM**
  - Dealers hedge *against* price movement
  - Market tends to be **range-bound / mean-reverting**
- **Negative Net GEX near ATM**
  - Dealers hedge *with* price movement
  - Market is **unstable / directional**
- **Large GEX clusters**
  - Act as **support/resistance zones**
  - Can cause price pinning near expiry

---

## How Traders Use It

- Identify **directional vs non-directional environments**
- Spot **volatility expansion or compression**
- Combine with OI and IV for high-conviction setups
- Monitor **expiry-based risk concentration**

---

## How It Works (Flow)

1. WebSocket subscribes to selected underlyings and expiries
2. Each option-chain tick updates strike-wise gamma exposure
3. GEX is recalculated and stored in memory
4. Dashboard updates in real time with:
   - GEX distribution
   - Spot and ATM reference
   - Top strikes by Net GEX

---

## Code Implementation

```python
import threading
import time
from dataclasses import dataclass
from typing import Dict, Optional, Tuple, List

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
    "NIFTY": ["20260203", "20260210", "20260217", "20260224"],          # example expiries (edit)
    "BANKNIFTY": ["20260224"],      # example expiries (edit)
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
    atm: Optional[int] = None
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
    # default selection
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


def compute_gex_df(msg) -> pd.DataFrame:
    """
    msg: OptionChainWrapper
    Builds strike-wise CallGEX / PutGEX / NetGEX dataframe.
    """
    asset = getattr(msg, "asset", "") or ""
    spot = safe_float(getattr(msg, "current_price", None))
    atm = safe_float(getattr(msg, "at_the_money_strike", None))
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

    # Aggregate by strike
    agg: Dict[int, Dict[str, float]] = {}

    for opt in getattr(msg, "ce", []) or []:
        k = safe_float(getattr(opt, "strike_price", 0))
        if k is None:
            k = 0
        k = int(round(k / 100.0))
        agg.setdefault(k, {"call_gex": 0.0, "put_gex": 0.0})
        agg[k]["call_gex"] += option_gex(opt)

    for opt in getattr(msg, "pe", []) or []:
        k = safe_float(getattr(opt, "strike_price", 0))
        if k is None:
            k = 0
        k = int(round(k / 100.0))
        agg.setdefault(k, {"call_gex": 0.0, "put_gex": 0.0})
        agg[k]["put_gex"] += option_gex(opt)

    rows = []
    for strike, v in agg.items():
        call_gex = v["call_gex"]
        put_gex = v["put_gex"]
        net_gex = call_gex - put_gex  # common convention for “net gamma”
        rows.append(
            {
                "strike": strike,
                "call_gex": call_gex / DISPLAY_DIVISOR,
                "put_gex": put_gex / DISPLAY_DIVISOR,
                "net_gex": net_gex / DISPLAY_DIVISOR,
            }
        )

    df = pd.DataFrame(rows).sort_values("strike")
    df.attrs["spot"] = spot
    df.attrs["atm"] = atm
    return df


def gex_bar_chart(df: pd.DataFrame, title: str):
    """
    Plot like screenshot: puts left (negative), calls right (positive), net overlay.
    """
    if df is None or df.empty:
        fig = go.Figure()
        fig.update_layout(title=title, height=520)
        return fig

    strikes = df["strike"].astype(str).tolist()

    call_vals = df["call_gex"].tolist()
    put_vals = (-df["put_gex"]).tolist()  # negative for left
    net_vals = df["net_gex"].tolist()

    fig = go.Figure()

    fig.add_trace(
        go.Bar(
            y=strikes,
            x=put_vals,
            name="Put Gamma",
            orientation="h",
        )
    )
    fig.add_trace(
        go.Bar(
            y=strikes,
            x=call_vals,
            name="Call Gamma",
            orientation="h",
        )
    )
    fig.add_trace(
        go.Scatter(
            y=strikes,
            x=net_vals,
            name="Net Gamma",
            mode="lines+markers",
            line=dict(color="#ff4d4d"),
            marker=dict(color="#ff4d4d"),
        )
    )

    spot = df.attrs.get("spot") if df is not None else None

    fig.update_layout(
        barmode="overlay",
        title=title,
        height=520,
        xaxis_title=f"GEX (÷ {DISPLAY_DIVISOR:g})  | mode={GEX_MODE}",
        yaxis_title="Strike",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
        margin=dict(l=70, r=20, t=70, b=40),
        paper_bgcolor="#000000",
        plot_bgcolor="#000000",
        font=dict(color="#ffffff"),
    )
    if spot is not None:
        fig.add_hline(y=spot, line_color="#ffffff", line_width=1, opacity=0.6)
    fig.update_xaxes(showgrid=True, gridcolor="#222222", tickfont=dict(color="#ffffff"))
    fig.update_yaxes(showgrid=False, tickfont=dict(color="#ffffff"))
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
        # msg is OptionChainWrapper
        try:
            df = compute_gex_df(msg)
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
st.set_page_config(page_title="GEX Dashboard", layout="wide")
st.markdown(
    """
    <style>
      .stApp {
        background-color: #000000;
        color: #ffffff;
      }
      body, p, h1, h2, h3, h4, h5, h6, span, div {
        color: #ffffff;
      }
      .stMarkdown, .stCaption, .stText, .stMetric, .stDataFrame, .stTable {
        color: #ffffff;
      }
      [data-testid="stMetricLabel"],
      [data-testid="stMetricValue"],
      [data-testid="stMetricDelta"] {
        color: #ffffff;
      }
      .stDataFrame table,
      .stTable table {
        color: #ffffff;
        background-color: #0b0b0b;
      }
      .stDataFrame th, .stDataFrame td,
      .stTable th, .stTable td {
        color: #ffffff;
        background-color: #0b0b0b;
        border-color: #222222;
      }
    </style>
    """,
    unsafe_allow_html=True,
)
st.title("Realtime GEX Dashboard (Nubra Option Chain)")
st.caption(f"ENV: {ENV} | EXCHANGE: {EXCHANGE}")

state = get_state()
ensure_socket_started(state)

# Controls
c1, c2, c3 = st.columns([1.2, 1.2, 2])

asset = c1.selectbox("Underlying", list(UNDERLYINGS.keys()), index=0)
expiry = c2.selectbox("Expiry (YYYYMMDD)", UNDERLYINGS[asset], index=0)

with state.lock:
    state.desired = (asset, expiry)

# Debug metrics
with state.lock:
    connected = state.connected
    msg_count = state.msg_count
    last_msg_time = state.last_msg_time
    snap = state.latest_by_key.get((asset, expiry), ChainSnapshot())

c3.write("")
m1, m2, m3, m4 = c3.columns(4)
m1.metric("Connected", "Yes" if connected else "No")
m2.metric("Msgs", str(msg_count))
if asset in INDEX_ASSETS:
    spot_text = f"{snap.spot:,.0f}" if snap.spot is not None else "—"
else:
    spot_text = f"{snap.spot:,.2f}" if snap.spot is not None else "—"
m3.metric("Spot", spot_text)
m4.metric("ATM", f"{snap.atm:,.0f}" if snap.atm is not None else "—")

# Layout
left, right = st.columns([2, 1], vertical_alignment="top")

df = snap.df
title = f"Largest GEX by Strike — {asset} ({expiry})"

left.plotly_chart(gex_bar_chart(df, title), width="stretch")

# Table
if df is None or df.empty:
    right.info("Waiting for option chain ticks…")
else:
    topn = right.slider("Top strikes by |Net GEX|", 10, 60, 25, step=5)
    view = df.copy()
    view["abs_net"] = view["net_gex"].abs()
    view = view.sort_values("abs_net", ascending=False).head(topn).drop(columns=["abs_net"])
    right.dataframe(view, width="stretch", height=520)

# refresh
time.sleep(REFRESH_SEC)
st.rerun()

```

