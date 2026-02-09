---
title: "Synthetic Futures Dashboard"
summary: "Snapshot view of synthetic futures pricing and roll metrics built from ATM options and futures quotes across the NIFTY 100."
tags: ["Tools", "Options", "Futures"]
image: "./assets/SyntheticFutures.png"
---

<video controls autoplay loop muted playsinline style="width: 100%; border-radius: 12px; display: block;">
  <source src="./assets/RealtimeSynFutDashboard.mp4" type="video/mp4" />
</video>

The **Synthetic Futures Dashboard** estimates synthetic futures prices using ATM options and compares them to traded futures.  
It highlights rollover and implied carry so traders can evaluate roll yield, financing, and mispricing.

---

## Data Source

- **Nubra REST - Instruments (instrument master)**
- **Nubra REST - Market Data (L1 quotes)**
- **Exchange:** NSE
- **Instruments:** options and futures
- **Refresh:** snapshot every 3 seconds

---

## What Are Synthetic Futures?

A synthetic future replicates a futures position using options at the same strike and expiry. Using call-put parity:

**Synthetic Future ~= Call - Put + Strike (adjusted for carry)**

This gives an implied forward price derived from options. Comparing it to the listed futures can reveal:
- implied financing or carry
- roll yield between current and next expiry
- relative mispricing between options and futures

---

## What This Dashboard Shows

- Synthetic futures bid/ask for each symbol (ATM strike)
- Synthetic ATM rollover (bid/ask, in bps)
- Estimated transaction cost (bps) and net rollover
- Regular futures bid/ask and regular rollover for comparison
- Strike-level synthetic futures for the selected symbol

---

## How It Works (Flow)

1. Load instrument master and map options/futures for NIFTY 100 symbols.
2. Pick the nearest current and next futures expiry per symbol.
3. Find the nearest option expiry and ATM strike, then select strikes around ATM.
4. Fetch L1 quotes for options and futures (snapshot).
5. Compute synthetic future, roll, cost, and net roll metrics and render tables.

---

## Key Calculations

- Synthetic future (bid/ask):
  - `syn_fut_ask = (CE_ask - PE_bid) * (1 + RT) + strike`
  - `syn_fut_bid = (CE_bid - PE_ask) * (1 + RT) + strike`

- Rollover (bps):
  - `roll = ln(syn_fut / fut) * 10000`

- Cost estimate (bps):
  - `cost = ((CE_ltp + PE_ltp) * 0.001179) / fut_ltp * 10000`

- Net rollover:
  - `net_roll = roll - cost`

Where `RT` is the carry factor derived from the ratio of next vs current futures and time to next expiry.

---

## Code Implementation


Below is the entire dashboard for SyntheticFutures:

```python
import html as html_lib
import math
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import pandas as pd
import streamlit as st

from nubra_python_sdk.marketdata.market_data import MarketData
from nubra_python_sdk.refdata.instruments import InstrumentData
from nubra_python_sdk.start_sdk import InitNubraSdk, NubraEnv
import pyotp


# =========================
# CONFIG
# =========================
ENV = NubraEnv.PROD
EXCHANGE = "NSE"
REFRESH_SEC = 3.0

PhNo = "Your Phone Number"
MPIN = "Your MPIN" 
secret = "Your Secret"

TOP_SYMBOLS = [
    "RELIANCE",
    "TCS",
    "HDFCBANK",
    "ICICIBANK",
    "INFY",
    "HINDUNILVR",
    "ITC",
    "LT",
    "SBIN",
    "BHARTIARTL",
]

NIFTY100 = [
    "ADANIENT",
    "ADANIPORTS",
    "APOLLOHOSP",
    "ASIANPAINT",
    "AXISBANK",
    "BAJAJ-AUTO",
    "BAJFINANCE",
    "BAJAJFINSV",
    "BEL",
    "BHARTIARTL",
    "CIPLA",
    "COALINDIA",
    "DRREDDY",
    "EICHERMOT",
    "ETERNAL",
    "GRASIM",
    "HCLTECH",
    "HDFCBANK",
    "HDFCLIFE",
    "HINDALCO",
    "HINDUNILVR",
    "ICICIBANK",
    "INDIGO",
    "INFY",
    "ITC",
    "JIOFIN",
    "JSWSTEEL",
    "KOTAKBANK",
    "LT",
    "M&M",
    "MARUTI",
    "MAXHEALTH",
    "NESTLEIND",
    "NTPC",
    "ONGC",
    "POWERGRID",
    "RELIANCE",
    "SBILIFE",
    "SHRIRAMFIN",
    "SBIN",
    "SUNPHARMA",
    "TCS",
    "TATACONSUM",
    "TMPV",
    "TATASTEEL",
    "TECHM",
    "TITAN",
    "TRENT",
    "ULTRACEMCO",
    "WIPRO",
    "ABB",
    "ADANIENSOL",
    "ADANIGREEN",
    "ADANIPOWER",
    "AMBUJACEM",
    "BAJAJHLDNG",
    "BAJAJHFL",
    "BANKBARODA",
    "BPCL",
    "BRITANNIA",
    "BOSCHLTD",
    "CANBK",
    "CGPOWER",
    "CHOLAFIN",
    "DIVISLAB",
    "DLF",
    "DMART",
    "GAIL",
    "GODREJCP",
    "HAVELLS",
    "HAL",
    "HINDZINC",
    "HYUNDAI",
    "ICICIGI",
    "INDHOTEL",
    "IOC",
    "NAUKRI",
    "IRFC",
    "JINDALSTEL",
    "JSWENERGY",
    "LICI",
    "LODHA",
    "LTIM",
    "MAZDOCK",
    "PIDILITIND",
    "PFC",
    "PNB",
    "RECLTD",
    "MOTHERSON",
    "SHREECEM",
    "SIEMENS",
    "ENRIN",
    "SOLARINDS",
    "TATAPOWER",
    "TORNTPHARM",
    "TVSMOTOR",
    "UNITDSPR",
    "VBL",
    "VEDL",
    "ZYDUSLIFE",
]

IST = timezone(timedelta(hours=5, minutes=30))
REFRESH_HOUR = 9
REFRESH_MINUTE = 16



# =========================
# SDK
# =========================
def init_nubra_with_totp():
    
    totp = pyotp.TOTP(secret)

    from contextlib import contextmanager

    @contextmanager
    def auto_login_input(phone, otp, mpin):
        import builtins
        original_input = builtins.input

        def fake_input(prompt=""):
            prompt = prompt.lower()
            if "phone" in prompt:
                return phone
            if "otp" in prompt:
                return otp
            if "mpin" in prompt:
                return mpin
            return original_input(prompt)

        builtins.input = fake_input
        try:
            yield
        finally:
            builtins.input = original_input

    with auto_login_input(PhNo, totp.now(), MPIN):
        return InitNubraSdk(ENV, totp_login=True)


@st.cache_resource
def get_clients() -> tuple[InstrumentData, MarketData]:
    nubra = init_nubra_with_totp()
    return InstrumentData(nubra), MarketData(nubra)


# =========================
# HELPERS
# =========================
def safe_float(x) -> Optional[float]:
    try:
        return float(x)
    except Exception:
        return None


def current_price_value(cp) -> Optional[float]:
    for key in ("ltp", "last_traded_price", "price", "last_price"):
        val = safe_float(getattr(cp, key, None))
        if val is not None:
            return val
    return None


def get_field(obj, *names):
    for name in names:
        if isinstance(obj, dict) and name in obj:
            return obj.get(name)
        if hasattr(obj, name):
            return getattr(obj, name)
    return None


@st.cache_resource
def load_instrument_master(_instruments: InstrumentData, exchange: str):
    master = _instruments.get_instruments(exchange=exchange)
    rows = []
    for item in master or []:
        rows.append(item)
    return rows


def build_option_maps(master, symbols: List[str]):
    symbols_set = set(symbols)
    option_map = {}
    strikes_map = {}
    expiries_map = {}

    for item in master:
        underlying = get_field(item, "underlying", "asset", "symbol", "name")
        if underlying not in symbols_set:
            continue

        inst_type = get_field(item, "instrument_type", "instrumentType", "type")
        if inst_type and str(inst_type).upper() not in ("OPT", "OPTION", "OPTIONS"):
            continue

        opt_type = get_field(item, "option_type", "optionType", "right")
        if not opt_type:
            continue
        opt_type = str(opt_type).upper()
        if opt_type not in ("CE", "PE"):
            continue

        expiry = get_field(item, "expiry", "expiry_date", "expiryDate")
        strike = get_field(item, "strike_price", "strikePrice", "strike")
        ref_id = get_field(item, "ref_id", "refId", "refid")

        if expiry is None or strike is None or ref_id is None:
            continue

        try:
            strike_val = float(strike)
        except Exception:
            continue

        option_map[(underlying, str(expiry), strike_val, opt_type)] = ref_id
        strikes_map.setdefault((underlying, str(expiry)), set()).add(strike_val)
        expiries_map.setdefault(underlying, set()).add(str(expiry))

    return option_map, strikes_map, expiries_map


def build_future_list(master, symbols: List[str]):
    symbols_set = set(symbols)
    futures = {}

    for item in master:
        underlying = get_field(item, "underlying", "asset", "symbol", "name")
        if underlying not in symbols_set:
            continue

        inst_type = get_field(item, "instrument_type", "instrumentType", "type")
        deriv_type = get_field(item, "derivative_type", "derivativeType")
        series = get_field(item, "series")
        inst_flag = str(inst_type).upper() if inst_type else ""
        deriv_flag = str(deriv_type).upper() if deriv_type else ""
        series_flag = str(series).upper() if series else ""
        if not (inst_flag.startswith("FUT") or deriv_flag.startswith("FUT") or series_flag.startswith("FUT")):
            continue

        expiry = get_field(item, "expiry", "expiry_date", "expiryDate")
        ref_id = get_field(item, "ref_id", "refId", "refid")
        tsym = get_field(
            item,
            "stock_name",
            "tradingsymbol",
            "trading_symbol",
            "tradingSymbol",
            "symbol",
            "display_symbol",
            "displaySymbol",
            "nubra_name",
        )
        if expiry is None or ref_id is None:
            continue

        expiry_str = str(expiry)
        futures.setdefault(underlying, []).append(
            {"expiry": expiry_str, "ref_id": ref_id, "symbol": tsym}
        )

    return futures


def parse_expiry(expiry_str: str) -> Optional[datetime]:
    if not expiry_str:
        return None
    for fmt in ("%Y%m%d", "%d%b%y", "%d%b%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(expiry_str, fmt)
        except Exception:
            continue
    return None


def pick_nearest_two_futures(futures_list: List[dict]) -> List[dict]:
    if not futures_list:
        return []
    with_dt = []
    without_dt = []
    for item in futures_list:
        dt = parse_expiry(item.get("expiry", ""))
        if dt is None:
            without_dt.append(item)
        else:
            with_dt.append((dt, item))
    if with_dt:
        with_dt.sort(key=lambda x: x[0])
        ordered = [item for _, item in with_dt]
    else:
        ordered = sorted(without_dt, key=lambda x: x.get("expiry", ""))
    return ordered[:2]


def build_futures_ref_id_cache(master, symbols: List[str]):
    cache_key = f"futures_ref_ids::{','.join(symbols)}"
    if cache_key in st.session_state:
        return st.session_state[cache_key]

    futures = build_future_list(master, symbols)
    out = {}
    for sym in symbols:
        picks = pick_nearest_two_futures(futures.get(sym, []))
        out[sym] = {
            "current": picks[0]["ref_id"] if len(picks) > 0 else None,
            "current_symbol": picks[0].get("symbol") if len(picks) > 0 else None,
            "current_expiry": picks[0].get("expiry") if len(picks) > 0 else None,
            "next": picks[1]["ref_id"] if len(picks) > 1 else None,
            "next_symbol": picks[1].get("symbol") if len(picks) > 1 else None,
            "next_expiry": picks[1].get("expiry") if len(picks) > 1 else None,
        }

    st.session_state[cache_key] = out
    return out


def pick_nearest_expiry(expiries: set[str]) -> Optional[str]:
    if not expiries:
        return None
    with_dt = []
    without_dt = []
    for exp in expiries:
        dt = parse_expiry(str(exp))
        if dt is None:
            without_dt.append(str(exp))
        else:
            with_dt.append((dt, str(exp)))
    if with_dt:
        with_dt.sort(key=lambda x: x[0])
        ordered = [x[1] for x in with_dt]
    else:
        ordered = sorted(without_dt)
    return ordered[0] if ordered else None


def build_option_expiry_map(expiries_map, symbols: List[str]):
    out = {}
    for sym in symbols:
        expiries = expiries_map.get(sym, set())
        nearest = pick_nearest_expiry(expiries)
        out[sym] = {
            "ref": nearest,
        }
    return out


def nearest_strike_index(strikes_sorted: List[float], spot: float) -> Optional[int]:
    if not strikes_sorted:
        return None
    return min(range(len(strikes_sorted)), key=lambda i: abs(strikes_sorted[i] - spot))


def build_atm_ref_id_cache(
    md: MarketData,
    symbols: List[str],
    option_map,
    strikes_map,
    expiry_by_symbol,
    cache_key: str,
):
    if cache_key in st.session_state:
        return st.session_state[cache_key]

    out = {}
    for sym in symbols:
        try:
            cp = md.current_price(sym)
            spot = current_price_value(cp)
        except Exception:
            spot = None

        expiry = expiry_by_symbol.get(sym)
        strikes = sorted(strikes_map.get((sym, expiry), set())) if expiry else []
        if spot is None or not strikes or expiry is None:
            out[sym] = {"expiry": expiry, "atm_strike": None, "strikes": [], "ref_ids": {}}
            continue

        atm_idx = nearest_strike_index(strikes, spot)
        if atm_idx is None:
            out[sym] = {"expiry": expiry, "atm_strike": None, "strikes": [], "ref_ids": {}}
            continue

        start = max(0, atm_idx - 4)
        end = min(len(strikes) - 1, atm_idx + 4)
        chosen = strikes[start : end + 1]

        ref_ids = {}
        for strike in chosen:
            ce_ref = option_map.get((sym, str(expiry), float(strike), "CE"))
            pe_ref = option_map.get((sym, str(expiry), float(strike), "PE"))
            if ce_ref:
                ref_ids[(float(strike), "CE")] = ce_ref
            if pe_ref:
                ref_ids[(float(strike), "PE")] = pe_ref

        out[sym] = {
            "expiry": expiry,
            "atm_strike": strikes[atm_idx],
            "strikes": chosen,
            "ref_ids": ref_ids,
        }

    st.session_state[cache_key] = out
    return out


def quote_l1(md: MarketData, ref_id: str):
    quote = md.quote(ref_id=ref_id, levels=1)
    bid, ask, _ = l1_from_quote(quote)
    return bid, ask


def quote_ltp(md: MarketData, ref_id: str) -> Optional[float]:
    quote = md.quote(ref_id=ref_id, levels=1)
    _, _, ltp = l1_from_quote(quote)
    return ltp


def fetch_snapshot_prices(
    md: MarketData,
    symbols: List[str],
    atm_cache_ref,
    futures_cache,
):
    quote_cache = {}

    def get_l1_ltp(ref_id: str):
        if not ref_id:
            return None, None, None
        cached = quote_cache.get(ref_id)
        if cached is None:
            quote = md.quote(ref_id=ref_id, levels=1)
            cached = l1_from_quote(quote)
            quote_cache[ref_id] = cached
        return cached

    rows = []
    for sym in symbols:
        ref_ce_bid = ref_ce_ask = None
        ref_pe_bid = ref_pe_ask = None
        ref_ce_ltp = ref_pe_ltp = None

        ref_cache = atm_cache_ref.get(sym, {})
        ref_atm = ref_cache.get("atm_strike")
        if ref_atm is not None:
            ref_ids = ref_cache.get("ref_ids", {})
            ce_ref = ref_ids.get((float(ref_atm), "CE"))
            pe_ref = ref_ids.get((float(ref_atm), "PE"))
            if ce_ref:
                try:
                    ref_ce_bid, ref_ce_ask, ref_ce_ltp = get_l1_ltp(ce_ref)
                except Exception:
                    pass
            if pe_ref:
                try:
                    ref_pe_bid, ref_pe_ask, ref_pe_ltp = get_l1_ltp(pe_ref)
                except Exception:
                    pass

        ref_fut_bid = ref_fut_ask = ref_fut_ltp = None
        next_fut_bid = next_fut_ask = next_fut_ltp = None
        fut_refs = futures_cache.get(sym, {})
        cur_ref = fut_refs.get("current")
        next_ref = fut_refs.get("next")
        if cur_ref:
            try:
                ref_fut_bid, ref_fut_ask, ref_fut_ltp = get_l1_ltp(cur_ref)
            except Exception:
                pass
        if next_ref:
            try:
                next_fut_bid, next_fut_ask, next_fut_ltp = get_l1_ltp(next_ref)
            except Exception:
                pass

        syn_fut_bid = syn_fut_ask = None
        syn_roll_bid = syn_roll_ask = None
        reg_roll_bid = reg_roll_ask = None
        cost_bps = None
        net_roll_bid = net_roll_ask = None
        reg_cost_bps = None
        reg_net_roll_bid = reg_net_roll_ask = None
        if ref_fut_ltp is not None and next_fut_ltp is not None:
            if ref_fut_ltp > 0 and next_fut_ltp > 0:
                ttm_years = None
                next_expiry = fut_refs.get("next_expiry")
                next_expiry_dt = parse_expiry(str(next_expiry)) if next_expiry else None
                if next_expiry_dt is not None:
                    now_ist = datetime.now(timezone.utc).astimezone(IST)
                    expiry_ist = datetime.combine(next_expiry_dt.date(), datetime.min.time()).replace(
                        hour=15, minute=30, tzinfo=IST
                    )
                    ttm_seconds = (expiry_ist - now_ist).total_seconds()
                    ttm_days = max(0.0, ttm_seconds / 86400.0)
                    ttm_years = ttm_days / 365.0
                RT = ((next_fut_ltp / ref_fut_ltp) - 1.0) * ttm_years if ttm_years is not None else None
                if (
                    RT is not None
                    and ref_ce_bid is not None and ref_ce_ask is not None
                    and ref_pe_bid is not None and ref_pe_ask is not None
                    and ref_atm is not None
                ):
                    syn_fut_ask = (ref_ce_ask - ref_pe_bid) * (1.0 + RT) + ref_atm
                    syn_fut_bid = (ref_ce_bid - ref_pe_ask) * (1.0 + RT) + ref_atm

                if (
                    ref_ce_ltp is not None
                    and ref_pe_ltp is not None
                    and ref_fut_ltp is not None
                    and ref_fut_ltp > 0
                ):
                    cost_bps = ((ref_ce_ltp + ref_pe_ltp) * 0.001179) / ref_fut_ltp * 10000.0

                if (
                    ref_fut_bid is not None and ref_fut_ask is not None
                    and syn_fut_bid is not None and syn_fut_ask is not None
                    and ref_fut_ask > 0 and ref_fut_bid > 0
                    and syn_fut_ask > 0 and syn_fut_bid > 0
                ):
                    syn_roll_ask = math.log(syn_fut_ask / ref_fut_ask) * 10000.0
                    syn_roll_bid = math.log(syn_fut_bid / ref_fut_bid) * 10000.0

                if syn_roll_ask is not None and syn_roll_bid is not None and cost_bps is not None:
                    net_roll_ask = syn_roll_ask - cost_bps
                    net_roll_bid = syn_roll_bid - cost_bps

                if (
                    next_fut_ask is not None and next_fut_bid is not None
                    and ref_fut_ask is not None and ref_fut_bid is not None
                    and next_fut_ask > 0 and next_fut_bid > 0
                    and ref_fut_ask > 0 and ref_fut_bid > 0
                ):
                    reg_roll_ask = math.log(next_fut_ask / ref_fut_ask) * 10000.0
                    reg_roll_bid = math.log(next_fut_bid / ref_fut_bid) * 10000.0

                if (
                    ref_fut_ltp is not None and ref_fut_ltp > 0
                    and next_fut_ltp is not None
                ):
                    reg_cost_bps = ((next_fut_ltp * 0.000281) / ref_fut_ltp) * 10000.0

                if reg_roll_ask is not None and reg_roll_bid is not None and reg_cost_bps is not None:
                    reg_net_roll_ask = reg_roll_ask - reg_cost_bps
                    reg_net_roll_bid = reg_roll_bid - reg_cost_bps

        def fmt_price(val: Optional[float]) -> str:
            if val is None:
                return ""
            return f"{val / 100.0:,.2f}"

        rows.append(
            {
                "Symbol": sym,
                "Fut Bid": fmt_price(syn_fut_bid),
                "Fut Ask": fmt_price(syn_fut_ask),
                "ATM Rollover (Bid)": "" if syn_roll_bid is None else f"{syn_roll_bid:.2f}",
                "ATM Rollover (Ask)": "" if syn_roll_ask is None else f"{syn_roll_ask:.2f}",
                "Cost": "" if cost_bps is None else f"{cost_bps:.2f}",
                "Net Rollover (Bid)": "" if net_roll_bid is None else f"{net_roll_bid:.2f}",
                "Net Rollover (Ask)": "" if net_roll_ask is None else f"{net_roll_ask:.2f}",
                "Reg Fut Bid": fmt_price(next_fut_bid),
                "Reg Fut Ask": fmt_price(next_fut_ask),
                "Reg ATM Rollover (Bid)": "" if reg_roll_bid is None else f"{reg_roll_bid:.2f}",
                "Reg ATM Rollover (Ask)": "" if reg_roll_ask is None else f"{reg_roll_ask:.2f}",
                "Reg Cost": "" if reg_cost_bps is None else f"{reg_cost_bps:.4f}",
                "Reg Net Rollover (Bid)": "" if reg_net_roll_bid is None else f"{reg_net_roll_bid:.2f}",
                "Reg Net Rollover (Ask)": "" if reg_net_roll_ask is None else f"{reg_net_roll_ask:.2f}",
            }
        )
    return pd.DataFrame(rows)


def l1_from_quote(quote):
    order_book = getattr(quote, "order_book", None) or getattr(quote, "orderBook", None)
    bid = ask = ltp = None
    if order_book is not None:
        bids = getattr(order_book, "bid", None) or []
        asks = getattr(order_book, "ask", None) or []
        if bids:
            bid = safe_float(getattr(bids[0], "price", None))
        if asks:
            ask = safe_float(getattr(asks[0], "price", None))
        ltp = safe_float(getattr(order_book, "last_traded_price", None))
    if ltp is None:
        ltp = safe_float(getattr(quote, "last_traded_price", None))
    return bid, ask, ltp


def render_table_html(df: pd.DataFrame) -> str:
    top_row = (
        "<tr>"
        "<th class=\"group-head\" colspan=\"1\"></th>"
        "<th class=\"group-head\" colspan=\"7\">Synthetic Futures</th>"
        "<th class=\"group-head\" colspan=\"7\">Regular Futures</th>"
        "</tr>"
    )
    header_row = (
        "<tr>"
        "<th rowspan=\"2\">Symbol</th>"
        "<th rowspan=\"2\">Fut Bid</th>"
        "<th rowspan=\"2\">Fut Ask</th>"
        "<th colspan=\"2\">ATM Rollover</th>"
        "<th rowspan=\"2\">Cost</th>"
        "<th colspan=\"2\">Net Rollover</th>"
        "<th rowspan=\"2\">Reg Fut Bid</th>"
        "<th rowspan=\"2\">Reg Fut Ask</th>"
        "<th colspan=\"2\">Reg ATM Rollover</th>"
        "<th rowspan=\"2\">Reg Cost</th>"
        "<th colspan=\"2\">Reg Net Rollover</th>"
        "</tr>"
    )
    sub_row = (
        "<tr>"
        "<th>Bid</th>"
        "<th>Ask</th>"
        "<th>Bid</th>"
        "<th>Ask</th>"
        "<th>Bid</th>"
        "<th>Ask</th>"
        "<th>Bid</th>"
        "<th>Ask</th>"
        "</tr>"
    )
    thead = top_row + header_row + sub_row

    body_rows = []
    for _, row in df.iterrows():
        cells = [html_lib.escape("" if pd.isna(v) else str(v)) for v in row.tolist()]
        body_rows.append("<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>")

    tbody = "".join(body_rows)
    return f"""
    <div class="sf-table-wrap">
      <table class="sf-table">
        <thead>{thead}</thead>
        <tbody>{tbody}</tbody>
      </table>
    </div>
    """


def render_strike_table_html(df: pd.DataFrame) -> str:
    header_row = (
        "<tr>"
        "<th>Strike</th>"
        "<th>Fut Bid</th>"
        "<th>Fut Ask</th>"
        "<th>ATM Rollover (Bid)</th>"
        "<th>ATM Rollover (Ask)</th>"
        "<th>Cost</th>"
        "<th>Net Rollover (Bid)</th>"
        "<th>Net Rollover (Ask)</th>"
        "</tr>"
    )
    thead = header_row

    body_rows = []
    for _, row in df.iterrows():
        cells = [html_lib.escape("" if pd.isna(v) else str(v)) for v in row.tolist()]
        body_rows.append("<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>")

    tbody = "".join(body_rows)
    return f"""
    <div class="sf-table-wrap">
      <table class="sf-table">
        <thead>{thead}</thead>
        <tbody>{tbody}</tbody>
      </table>
    </div>
    """


def fetch_strike_table(
    md: MarketData,
    symbol: str,
    atm_cache_ref,
    futures_cache,
):
    quote_cache = {}

    def get_l1_ltp(ref_id: str):
        if not ref_id:
            return None, None, None
        cached = quote_cache.get(ref_id)
        if cached is None:
            quote = md.quote(ref_id=ref_id, levels=1)
            cached = l1_from_quote(quote)
            quote_cache[ref_id] = cached
        return cached

    ref_cache = atm_cache_ref.get(symbol, {})
    strikes = ref_cache.get("strikes", []) or []
    ref_ids = ref_cache.get("ref_ids", {}) or {}

    fut_refs = futures_cache.get(symbol, {})
    cur_ref = fut_refs.get("current")
    next_ref = fut_refs.get("next")

    ref_fut_bid = ref_fut_ask = ref_fut_ltp = None
    next_fut_bid = next_fut_ask = next_fut_ltp = None
    if cur_ref:
        try:
            ref_fut_bid, ref_fut_ask, ref_fut_ltp = get_l1_ltp(cur_ref)
        except Exception:
            pass
    if next_ref:
        try:
            next_fut_bid, next_fut_ask, next_fut_ltp = get_l1_ltp(next_ref)
        except Exception:
            pass

    RT = None
    if ref_fut_ltp is not None and next_fut_ltp is not None and ref_fut_ltp > 0 and next_fut_ltp > 0:
        ttm_years = None
        next_expiry = fut_refs.get("next_expiry")
        next_expiry_dt = parse_expiry(str(next_expiry)) if next_expiry else None
        if next_expiry_dt is not None:
            now_ist = datetime.now(timezone.utc).astimezone(IST)
            expiry_ist = datetime.combine(next_expiry_dt.date(), datetime.min.time()).replace(
                hour=15, minute=30, tzinfo=IST
            )
            ttm_seconds = (expiry_ist - now_ist).total_seconds()
            ttm_days = max(0.0, ttm_seconds / 86400.0)
            ttm_years = ttm_days / 365.0
        RT = ((next_fut_ltp / ref_fut_ltp) - 1.0) * ttm_years if ttm_years is not None else None

    def fmt_price(val: Optional[float]) -> str:
        if val is None:
            return ""
        return f"{val / 100.0:,.2f}"

    rows = []
    for strike in strikes:
        ce_ref = ref_ids.get((float(strike), "CE"))
        pe_ref = ref_ids.get((float(strike), "PE"))
        if not ce_ref or not pe_ref:
            continue

        ref_ce_bid = ref_ce_ask = ref_ce_ltp = None
        ref_pe_bid = ref_pe_ask = ref_pe_ltp = None
        try:
            ref_ce_bid, ref_ce_ask, ref_ce_ltp = get_l1_ltp(ce_ref)
        except Exception:
            pass
        try:
            ref_pe_bid, ref_pe_ask, ref_pe_ltp = get_l1_ltp(pe_ref)
        except Exception:
            pass

        syn_fut_bid = syn_fut_ask = None
        syn_roll_bid = syn_roll_ask = None
        cost_bps = None
        net_roll_bid = net_roll_ask = None

        if (
            RT is not None
            and ref_ce_bid is not None and ref_ce_ask is not None
            and ref_pe_bid is not None and ref_pe_ask is not None
        ):
            syn_fut_ask = (ref_ce_ask - ref_pe_bid) * (1.0 + RT) + float(strike)
            syn_fut_bid = (ref_ce_bid - ref_pe_ask) * (1.0 + RT) + float(strike)

        if (
            ref_ce_ltp is not None
            and ref_pe_ltp is not None
            and ref_fut_ltp is not None
            and ref_fut_ltp > 0
        ):
            cost_bps = ((ref_ce_ltp + ref_pe_ltp) * 0.001179) / ref_fut_ltp * 10000.0

        if (
            ref_fut_bid is not None and ref_fut_ask is not None
            and syn_fut_bid is not None and syn_fut_ask is not None
            and ref_fut_ask > 0 and ref_fut_bid > 0
            and syn_fut_ask > 0 and syn_fut_bid > 0
        ):
            syn_roll_ask = math.log(syn_fut_ask / ref_fut_ask) * 10000.0
            syn_roll_bid = math.log(syn_fut_bid / ref_fut_bid) * 10000.0

        if syn_roll_ask is not None and syn_roll_bid is not None and cost_bps is not None:
            net_roll_ask = syn_roll_ask - cost_bps
            net_roll_bid = syn_roll_bid - cost_bps

        strike_display = round(float(strike) / 100.0, 2)
        rows.append(
            {
                "Strike": f"{strike_display:.2f}",
                "Fut Bid": fmt_price(syn_fut_bid),
                "Fut Ask": fmt_price(syn_fut_ask),
                "ATM Rollover (Bid)": "" if syn_roll_bid is None else f"{syn_roll_bid:.2f}",
                "ATM Rollover (Ask)": "" if syn_roll_ask is None else f"{syn_roll_ask:.2f}",
                "Cost": "" if cost_bps is None else f"{cost_bps:.2f}",
                "Net Rollover (Bid)": "" if net_roll_bid is None else f"{net_roll_bid:.2f}",
                "Net Rollover (Ask)": "" if net_roll_ask is None else f"{net_roll_ask:.2f}",
            }
        )

    return pd.DataFrame(rows)


def should_refresh_daily_cache() -> bool:
    now_ist = datetime.now(timezone.utc).astimezone(IST)
    last_date = st.session_state.get("cache_refresh_date")
    if last_date == now_ist.date():
        return False
    if (now_ist.hour, now_ist.minute) >= (REFRESH_HOUR, REFRESH_MINUTE):
        return True
    return False


def refresh_daily_cache(symbols: List[str]):
    try:
        load_instrument_master.clear()
    except Exception:
        pass
    futures_key = f"futures_ref_ids::{','.join(symbols)}"
    for key in (futures_key, "atm_ref_ids::ref"):
        if key in st.session_state:
            del st.session_state[key]
    now_ist = datetime.now(timezone.utc).astimezone(IST)
    st.session_state["cache_refresh_date"] = now_ist.date()
    st.session_state["cache_refresh_time"] = now_ist


def normalize_symbols(items: List[str]) -> List[str]:
    out = []
    for item in items:
        item = str(item).strip()
        if not item:
            continue
        out.append(item.upper())
    return out


def build_eligible_symbols(
    all_symbols: List[str],
    md: MarketData,
    option_map,
    strikes_map,
    expiries_map,
    master,
):
    futures_cache = build_futures_ref_id_cache(master, all_symbols)
    expiry_map = {k: {"ref": v.get("next_expiry")} for k, v in futures_cache.items()}
    atm_cache_ref = build_atm_ref_id_cache(
        md,
        all_symbols,
        option_map,
        strikes_map,
        {k: v.get("ref") for k, v in expiry_map.items()},
        "atm_ref_ids::ref::all",
    )

    eligible = []
    for sym in all_symbols:
        ref_ok = atm_cache_ref.get(sym, {}).get("atm_strike") is not None
        futs = futures_cache.get(sym, {})
        fut_ok = bool(futs.get("current")) and bool(futs.get("next"))
        if ref_ok and fut_ok:
            eligible.append(sym)
    return eligible


# =========================
# STREAMLIT UI
# =========================
st.set_page_config(page_title="Synthetic Futures (NIFTY 100)", layout="wide")
st.markdown(
    """
    <style>
      :root { color-scheme: dark; }
      html, body, [data-testid="stAppViewContainer"], [data-testid="stAppViewContainer"] > .main {
        background-color: #0b0b0b;
        color: #e6e6e6;
      }
      .stApp { background-color: #0b0b0b; color: #e6e6e6; }
      body, p, h1, h2, h3, h4, h5, h6, span, div { color: #e6e6e6; }
      .stDataFrame table, .stTable table {
        background-color: #0f1217;
        border: 1px solid #2a2f36;
      }
      .stDataFrame th, .stDataFrame td, .stTable th, .stTable td {
        background-color: #0f1217;
        color: #e6e6e6;
        border-color: #2a2f36;
        white-space: normal !important;
        word-break: break-word;
      }
      .sf-table-wrap {
        border: 1px solid #2a2f36;
        border-radius: 10px;
        overflow: hidden;
        background: #0f1217;
      }
      .sf-table {
        width: 100%;
        border-collapse: collapse;
        color: #e6e6e6;
        background: #0f1217;
        font-size: 0.92rem;
      }
      .sf-table th {
        text-align: left;
        padding: 8px 10px;
        background: #151922;
        color: #b7bdc9;
        font-weight: 600;
        border-bottom: 1px solid #2a2f36;
        border-right: 1px solid #232834;
        white-space: normal;
      }
      .sf-table th:last-child {
        border-right: none;
      }
      .sf-table th.group-head {
        text-align: center;
        background: #10141b;
        color: #9aa3b2;
        font-weight: 600;
        border-bottom: 1px solid #2a2f36;
        border-right: 1px solid #232834;
      }
      .sf-table th.group-head:last-child {
        border-right: none;
      }
      .sf-table td {
        padding: 8px 10px;
        border-bottom: 1px solid #20242c;
        border-right: 1px solid #232834;
        white-space: normal;
      }
      .sf-table td:last-child {
        border-right: none;
      }
      .sf-table th:nth-child(1),
      .sf-table td:nth-child(1),
      .sf-table th:nth-child(8),
      .sf-table td:nth-child(8) {
        border-right: 2px solid #2f3542;
      }
      .sf-table tr:last-child td {
        border-bottom: none;
      }
      .sf-table tr:hover td {
        background: #141922;
      }
      .symbol-header {
        margin-top: 8px;
        margin-bottom: 6px;
      }
      .symbol-name {
        font-size: 1.1rem;
        font-weight: 600;
        color: #e6e6e6;
        margin-bottom: 6px;
      }
      .symbol-badge {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 8px;
        background: #151922;
        border: 1px solid #2a2f36;
        color: #cfd6e3;
        font-size: 0.85rem;
        font-weight: 500;
      }
      [data-baseweb="select"] > div {
        min-height: 36px;
        height: 36px;
        background: #0f1217;
        border: 1px solid #2a2f36;
        border-radius: 6px;
      }
      [data-baseweb="select"] > div [data-baseweb="select"] input {
        line-height: 36px;
      }
      [data-baseweb="select"] input {
        font-size: 0.7rem;
        color: #e6e6e6;
      }
      [data-baseweb="select"] input::placeholder {
        font-size: 0.35rem;
        color: #7f8795;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("Synthetic Futures")
st.caption(f"ENV: {ENV} | Snapshot-only")

all_symbols = sorted(set(normalize_symbols(NIFTY100)))
st.subheader("Futures Rollover")
status_placeholder = st.empty()

if "symbol_select" not in st.session_state:
    st.session_state["symbol_select"] = "RELIANCE" if "RELIANCE" in all_symbols else None
col_sel, _ = st.columns([3, 7])
with col_sel:
    selected_symbol = st.selectbox(
        "Symbol",
        options=all_symbols,
        index=None,
        placeholder="Search",
        label_visibility="collapsed",
        key="symbol_select",
        width=280,
    )

base_symbols = normalize_symbols(TOP_SYMBOLS)
if selected_symbol:
    active_symbols = [selected_symbol] + [
        s for s in base_symbols if s != selected_symbol
    ][: max(len(base_symbols) - 1, 0)]
else:
    active_symbols = base_symbols
table_placeholder = st.empty()


@st.fragment(run_every=REFRESH_SEC)
def render_live_table():
    instruments, md = get_clients()
    if should_refresh_daily_cache():
        refresh_daily_cache(active_symbols)
    if "cache_refresh_time" not in st.session_state:
        st.session_state["cache_refresh_time"] = datetime.now(timezone.utc).astimezone(IST)
    last_refresh = st.session_state.get("cache_refresh_time")
    master = load_instrument_master(instruments, EXCHANGE)
    option_map, strikes_map, expiries_map = build_option_maps(master, all_symbols)
    active = active_symbols

    futures_cache_all = build_futures_ref_id_cache(master, all_symbols)
    expiry_map_all = {k: {"ref": v.get("next_expiry")} for k, v in futures_cache_all.items()}
    atm_cache_ref_all = build_atm_ref_id_cache(
        md,
        all_symbols,
        option_map,
        strikes_map,
        {k: v["ref"] for k, v in expiry_map_all.items()},
        "atm_ref_ids::ref::all",
    )
    atm_cache_ref = {k: atm_cache_ref_all.get(k, {}) for k in active}
    futures_cache = {k: futures_cache_all.get(k, {}) for k in active}
    status_placeholder.caption(
        f"Instrument master last refresh (IST): {last_refresh.strftime('%Y-%m-%d %H:%M:%S')}"
    )
    df = fetch_snapshot_prices(md, active, atm_cache_ref, futures_cache)
    table_placeholder.markdown(render_table_html(df), unsafe_allow_html=True)

    if selected_symbol:
        strike_df = fetch_strike_table(md, selected_symbol, atm_cache_ref_all, futures_cache_all)
        if not strike_df.empty:
            next_ref = futures_cache_all.get(selected_symbol, {}).get("next")
            next_fut_bid = next_fut_ask = next_fut_ltp = None
            if next_ref:
                try:
                    quote = md.quote(ref_id=next_ref, levels=1)
                    next_fut_bid, next_fut_ask, next_fut_ltp = l1_from_quote(quote)
                except Exception:
                    pass

            def fmt_ltp(val: Optional[float]) -> str:
                if val is None:
                    return ""
                return f"{val / 100.0:.2f}"

            badge_text = (
                f"Next Fut LTP: {fmt_ltp(next_fut_ltp)} | "
                f"Bid: {fmt_ltp(next_fut_bid)} | "
                f"Ask: {fmt_ltp(next_fut_ask)}"
            )
            st.markdown(
                f"""
                <div class="symbol-header">
                  <div class="symbol-name">{html_lib.escape(selected_symbol)}</div>
                  <div class="symbol-badge">{html_lib.escape(badge_text)}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            st.markdown(render_strike_table_html(strike_df), unsafe_allow_html=True)


render_live_table()

```
