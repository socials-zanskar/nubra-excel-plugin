---
title: "Realtime IV Smile Dashboard"
summary: "Live implied volatility (IV) smile for calls and puts by strike to understand volatility, skew, and market hedging demand."
tags: ["Tools", "Options"]
image: "./assets/IVSmile.png"
---

<video controls autoplay loop muted playsinline style="width: 100%; border-radius: 12px; display: block;">
  <source src="./assets/IVSmileSpedup.mp4" type="video/mp4" />
</video>

The **Realtime IV Smile Dashboard** plots **Call IV** and **Put IV** across strikes for a chosen underlying + expiry.  
It helps traders understand **where IV is rich/cheap**, how **skew** is changing, and what the options market is pricing in.

---

## Data Source

- **Nubra WebSocket – Option Chain**
- **Exchange:** NSE  
- **Data Type:** `option`
- **Subscription Format:** `ASSET:EXPIRY` (e.g., `RELIANCE:20260224`)

The option chain feed provides strike-wise option data including:
- Implied volatility (`iv`)
- Delta (`delta`)
- Call (CE) and Put (PE) legs

---

## What It Calculates

### 1) IV Smile (Calls & Puts)
For each strike, the dashboard extracts:
- **Call IV** from CE options  
- **Put IV** from PE options

Then it plots:
- **Call IV curve**
- **Put IV curve**
- A vertical reference line at **spot**

### 2) ATM IV
Calculates a simple **ATM IV** using the nearest strike to spot:
- Uses the average of Call IV and Put IV when both exist (else whichever exists)

### 3) Skew (Put − Call)
Computes skew using a delta-based approach when available:
- **25Δ put IV − 25Δ call IV**  
If delta data is missing, it falls back to a nearest-strike approximation.

---

## How Traders Use It

- **ATM IV rising:** market expects larger moves / risk premium increasing  
- **Put IV > Call IV (positive skew):** downside protection is expensive (fear/hedging demand)  
- **Flattening skew:** fear reducing or upside getting bid  
- **Smile shape changes:** highlights which strikes are being actively priced (event risk, hedging zones)

---

## How It Works (Flow)

1. WebSocket subscribes to configured underlyings/expiries.  
2. Each tick builds a strike-wise dataframe of call/put IV and deltas.  
3. UI shows:
   - IV Smile chart
   - Spot & ATM
   - ATM IV and Skew metrics  
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


def get_iv(opt) -> Optional[float]:
    for key in ("iv", "implied_volatility", "implied_vol"):
        v = safe_float(getattr(opt, key, None))
        if v is not None:
            return v
    return None


def get_delta(opt) -> Optional[float]:
    return safe_float(getattr(opt, "delta", None))


def compute_iv_df(msg) -> pd.DataFrame:
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

    agg: Dict[int, Dict[str, Optional[float]]] = {}

    for opt in getattr(msg, "ce", []) or []:
        k = safe_float(getattr(opt, "strike_price", 0))
        if k is None:
            k = 0
        k = int(round(k / 100.0))
        agg.setdefault(k, {"call_iv": None, "put_iv": None})
        agg[k]["call_iv"] = get_iv(opt)
        agg[k]["call_delta"] = get_delta(opt)

    for opt in getattr(msg, "pe", []) or []:
        k = safe_float(getattr(opt, "strike_price", 0))
        if k is None:
            k = 0
        k = int(round(k / 100.0))
        agg.setdefault(k, {"call_iv": None, "put_iv": None})
        agg[k]["put_iv"] = get_iv(opt)
        agg[k]["put_delta"] = get_delta(opt)

    rows = []
    for strike, v in agg.items():
        rows.append(
            {
                "strike": strike,
                "call_iv": v["call_iv"],
                "put_iv": v["put_iv"],
                "call_delta": v.get("call_delta"),
                "put_delta": v.get("put_delta"),
            }
        )

    df = pd.DataFrame(rows).sort_values("strike")
    df.attrs["spot"] = spot
    df.attrs["atm"] = atm
    df.attrs["asset"] = asset
    return df


def iv_smile_chart(df: pd.DataFrame, spot: Optional[float], title: str):
    if df is None or df.empty:
        fig = go.Figure()
        fig.update_layout(title=title, height=520)
        return fig

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=df["strike"],
            y=df["call_iv"],
            mode="lines+markers",
            name="Call IV",
            line=dict(color="#2ca02c"),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=df["strike"],
            y=df["put_iv"],
            mode="lines+markers",
            name="Put IV",
            line=dict(color="#d62728"),
        )
    )
    if spot is not None:
        fig.add_vline(x=spot, line_color="#000000", line_width=1, opacity=0.6)

    fig.update_layout(
        title=title,
        height=520,
        xaxis_title="Strike",
        yaxis_title="Implied Volatility",
        margin=dict(l=60, r=20, t=60, b=40),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
    )
    return fig


def atm_iv_and_skew(df: pd.DataFrame, spot: Optional[float]) -> Tuple[Optional[float], Optional[float]]:
    if df is None or df.empty or spot is None:
        return None, None

    df = df.copy()
    df["dist"] = (df["strike"] - spot).abs()
    atm_row = df.sort_values("dist").iloc[0]
    call_iv = atm_row["call_iv"]
    put_iv = atm_row["put_iv"]
    atm_iv = None
    if pd.notna(call_iv) and pd.notna(put_iv):
        atm_iv = (call_iv + put_iv) / 2.0
    elif pd.notna(call_iv):
        atm_iv = call_iv
    elif pd.notna(put_iv):
        atm_iv = put_iv

    # Prefer delta-based skew if available
    call_df = df[df["call_delta"].notna() & df["call_iv"].notna()].copy()
    put_df = df[df["put_delta"].notna() & df["put_iv"].notna()].copy()

    skew = None
    if not call_df.empty and not put_df.empty:
        call_df["d_dist"] = (call_df["call_delta"] - 0.25).abs()
        put_df["d_dist"] = (put_df["put_delta"] + 0.25).abs()
        call_row = call_df.sort_values("d_dist").iloc[0]
        put_row = put_df.sort_values("d_dist").iloc[0]
        skew = put_row["put_iv"] - call_row["call_iv"]
    else:
        above = df[df["strike"] > spot].sort_values("strike")
        below = df[df["strike"] < spot].sort_values("strike")
        if not above.empty and not below.empty:
            call_skew = above.iloc[0]["call_iv"]
            put_skew = below.iloc[-1]["put_iv"]
            if pd.notna(call_skew) and pd.notna(put_skew):
                skew = put_skew - call_skew

    return atm_iv, skew


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
            df = compute_iv_df(msg)
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
st.set_page_config(page_title="IV Smile Dashboard", layout="wide")
st.title("IV Surface / Smile (Nubra Option Chain)")
st.caption(f"ENV: {ENV} | EXCHANGE: {EXCHANGE}")

state = get_state()
ensure_socket_started(state)

c1, c2, c3 = st.columns([1.2, 1.2, 2])
asset = c1.selectbox("Underlying", list(UNDERLYINGS.keys()), index=0)
expiry = c2.selectbox("Expiry (YYYYMMDD)", UNDERLYINGS[asset], index=0)

with state.lock:
    state.desired = (asset, expiry)
    connected = state.connected
    msg_count = state.msg_count
    snap = state.latest_by_key.get((asset, expiry), ChainSnapshot())

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
title = f"IV Smile — {asset} ({expiry})"
st.plotly_chart(iv_smile_chart(df, snap.spot, title), width="stretch")

atm_iv, skew = atm_iv_and_skew(df, snap.spot)
skew_label = f"{skew:+.2f}" if skew is not None else "--"
atm_label = f"{atm_iv:.2f}" if atm_iv is not None else "--"

c4, c5 = st.columns(2)
c4.metric("ATM IV", atm_label)
c5.metric("Skew (put - call)", skew_label)

# refresh
time.sleep(REFRESH_SEC)
st.rerun()

```

