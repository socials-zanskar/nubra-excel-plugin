---
title: "Realtime Sector Screener"
summary: "A real-time sector performance screener to identify market leadership, weakness, and rotation."
tags: ["Screener","Indices"]
image: "./assets/SectorHeatmap.png"
---

<video controls autoplay loop muted playsinline style="width: 100%; border-radius: 12px; display: block;">
  <source src="./assets/SectorHeatmapSpedUp.mp4" type="video/mp4" />
</video>


The **Realtime Sector Screener** provides a live snapshot of how major NSE sectors are performing relative to each other during market hours.  
It helps traders quickly identify **sector leadership, weakness, and capital rotation** without analyzing individual stocks.

---

## Data Source

- **Nubra WebSocket – Index Data**
- **Exchange:** NSE  
- **Data Type:** `index`

Each sector is represented by its official NSE index, such as:
- IT → `NIFTYIT`
- Banking → `BANKNIFTY`
- Financial Services → `FINNIFTY`
- Auto → `NIFTYAUTO`
- Pharma → `NIFTYPHARMA`
- FMCG → `NIFTYFMCG`
- Metal → `NIFTYMETAL`
- Oil & Gas → `NOILGAS`
- Realty → `NIFTYREALTY`
- Media → `NIFTYMEDIA`

The screener consumes **real-time percentage change and last traded values** for each index.

---

## How It Works

1. A WebSocket subscribes to all sector indices simultaneously.
2. Incoming index ticks update:
   - Last traded value
   - Percentage change
   - Timestamp
3. The latest values are stored in shared state.
4. A heatmap and ranking table update every second to reflect live market conditions.

---

## How Traders Use It

- **Identify leading sectors** to focus long trades.
- **Avoid weak sectors** showing sustained underperformance.
- **Spot sector rotation** early during intraday sessions.
- **Confirm market breadth** when indices move.

---

## Key Benefits

- Real-time (WebSocket-based)
- No historical data required
- Visual and intuitive
- Low latency
- Suitable for intraday and short-term trading

---

## Code Implementation

```python
import threading
import time
from dataclasses import dataclass
from typing import Dict, Optional

import pandas as pd
import plotly.express as px
import streamlit as st

from nubra_python_sdk.ticker import websocketdata
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv


# =========================
# CONFIG
# =========================
ENV = NubraEnv.UAT
EXCHANGE = "NSE"
REFRESH_SEC = 1.0

SECTORS = [
    ("NIFTYIT", "IT"),
    ("BANKNIFTY", "Banks"),
    ("FINNIFTY", "Fin Services"),
    ("NIFTYAUTO", "Auto"),
    ("NIFTYPHARMA", "Pharma"),
    ("NIFTYFMCG", "FMCG"),
    ("NIFTYMETAL", "Metal"),
    ("NOILGAS", "Oil & Gas"),
    ("NIFTYREALTY", "Realty"),
    ("NIFTYMEDIA", "Media"),
]

SYMBOLS = [s for s, _ in SECTORS]
LABELS = {s: label for s, label in SECTORS}


# =========================
# SHARED STATE (persist across reruns)
# =========================
@dataclass
class Tick:
    change_pct: Optional[float] = None
    ltp: Optional[float] = None
    ts_ns: Optional[int] = None
    last_local_time: Optional[float] = None
    tick_change_pct: Optional[float] = None


@dataclass
class AppState:
    lock: threading.Lock
    latest: Dict[str, Tick]
    msg_count: int = 0
    last_msg_sym: Optional[str] = None
    last_msg_time: Optional[float] = None
    connected: bool = False
    started: bool = False


def to_float(x) -> Optional[float]:
    try:
        return float(x)
    except Exception:
        return None


@st.cache_resource
def get_state() -> AppState:
    # Created once per Streamlit server process, survives reruns
    return AppState(
        lock=threading.Lock(),
        latest={sym: Tick() for sym in SYMBOLS},
    )


def ws_worker(state: AppState):
    nubra = InitNubraSdk(ENV, env_creds=True)

    def on_index_data(msg):
        try:
            sym = getattr(msg, "indexname", None)
            if sym not in state.latest:
                return

            ltp = to_float(getattr(msg, "index_value", None))
            change_pct = to_float(getattr(msg, "changepercent", None))

            tick = Tick(
                change_pct=change_pct,
                ltp=ltp,
                ts_ns=getattr(msg, "timestamp", None),
                last_local_time=time.time(),
            )

            with state.lock:
                prev = state.latest.get(sym)
                prev_ltp = prev.ltp if prev else None
                if prev_ltp is not None and ltp is not None and prev_ltp != 0:
                    tick.tick_change_pct = ((ltp - prev_ltp) / prev_ltp) * 100.0

                state.latest[sym] = tick
                state.msg_count += 1
                state.last_msg_sym = sym
                state.last_msg_time = time.time()

        except Exception as e:
            print("on_index_data error:", e)

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
        on_index_data=on_index_data,
        on_connect=on_connect,
        on_close=on_close,
        on_error=on_error,
    )

    socket.connect()
    socket.subscribe(
        symbols=SYMBOLS,
        data_type="index",
        exchange=EXCHANGE,
    )
    socket.keep_running()


def ensure_socket_started(state: AppState):
    with state.lock:
        if state.started:
            return
        state.started = True

    t = threading.Thread(target=ws_worker, args=(state,), daemon=True)
    t.start()


# =========================
# UI HELPERS
# =========================
def snapshot_df(state: AppState) -> pd.DataFrame:
    with state.lock:
        snap = dict(state.latest)

    rows = []
    for sym in SYMBOLS:
        t = snap.get(sym, Tick())
        rows.append(
            {
                "sector": LABELS.get(sym, sym),
                "symbol": sym,
                "change_pct": t.change_pct,
                "ltp": t.ltp,
                "ts_ns": t.ts_ns,
                "last_local_time": t.last_local_time,
            }
        )

    df = pd.DataFrame(rows)
    df["change_pct"] = pd.to_numeric(df["change_pct"], errors="coerce")
    df["ltp"] = pd.to_numeric(df["ltp"], errors="coerce") / 100.0
    df["change_for_color"] = df["change_pct"].fillna(0.0).astype(float)
    return df


def heatmap_fig(df: pd.DataFrame):
    grid_cols = 5
    ordered = df.sort_values("change_pct", ascending=False, na_position="last").reset_index(drop=True)

    values = ordered["change_for_color"].tolist()
    max_abs = max((abs(v) for v in values), default=0.0)
    mat = [values[i : i + grid_cols] for i in range(0, len(values), grid_cols)]
    fig = px.imshow(
        mat,
        aspect="auto",
        labels={"color": "% chg"},
        color_continuous_scale=["#7a1414", "#f2f2f2", "#0b5d1e"],
        zmin=-max_abs if max_abs > 0 else None,
        zmax=max_abs if max_abs > 0 else None,
        color_continuous_midpoint=0,
    )

    for i, sym in enumerate(ordered["symbol"].tolist()):
        r = i // grid_cols
        c = i % grid_cols
        chg = ordered.loc[i, "change_pct"]
        shown = "—" if pd.isna(chg) else f"{chg:+.2f}%"
        fig.add_annotation(
            x=c, y=r,
            text=f"<b>{LABELS[sym]}<br>{shown}</b>",
            showarrow=False,
            font=dict(size=28, color="#000000"),
        )

    fig.update_layout(
        title="Realtime NSE Sector Heatmap",
        margin=dict(l=10, r=10, t=50, b=10),
        height=420,
        paper_bgcolor="#000000",
        plot_bgcolor="#000000",
        font=dict(color="#ffffff"),
    )
    fig.update_xaxes(visible=False)
    fig.update_yaxes(visible=False)
    return fig


def format_table(df: pd.DataFrame) -> pd.DataFrame:
    out = df[["sector", "symbol", "change_pct", "ltp", "last_local_time"]].copy()
    out = out.sort_values("change_pct", ascending=False, na_position="last")

    out["change_pct"] = out["change_pct"].map(lambda x: "" if pd.isna(x) else f"{x:+.2f}%")
    out["ltp"] = out["ltp"].map(lambda x: "" if pd.isna(x) else f"{x:,.0f}")

    def age(ts):
        if ts is None or pd.isna(ts):
            return ""
        return f"{(time.time() - float(ts)):.0f}s ago"

    out["last_tick_age"] = out["last_local_time"].map(age)
    out = out.drop(columns=["last_local_time"])
    return out


def debug_panel(state: AppState):
    with state.lock:
        connected = state.connected
        cnt = state.msg_count
        last_time = state.last_msg_time
        latest = dict(state.latest)

    top_sym = None
    top_change = None
    for sym, tick in latest.items():
        val = getattr(tick, "tick_change_pct", None)
        if val is None:
            continue
        if top_change is None or abs(val) > abs(top_change):
            top_change = val
            top_sym = sym

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Connected", "Yes" if connected else "No")
    c2.metric("Ticks received", str(cnt))
    if top_change is None:
        c3.metric("Largest%Change", "—")
    else:
        c3.metric("Largest%Change", f"{top_sym} {top_change:+.2f}%")
    c4.metric("Last tick", time.strftime("%H:%M:%S", time.localtime(last_time)) if last_time else "—")


# =========================
# STREAMLIT APP
# =========================
st.set_page_config(page_title="Sector Heatmap", layout="wide")
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
st.title("Realtime Sector Heatmap (Nubra Index Stream)")
st.caption(f"ENV: {ENV} | EXCHANGE: {EXCHANGE}")

state = get_state()
ensure_socket_started(state)

debug_panel(state)

left, right = st.columns([2, 1], vertical_alignment="top")
df = snapshot_df(state)

left.plotly_chart(heatmap_fig(df), width="stretch")
right.dataframe(format_table(df), width="stretch", height=420)

time.sleep(REFRESH_SEC)
st.rerun()

```

