(function () {
  "use strict";

  const S = {
    env: "nubra.excel.env",
    autoSwitchSheets: "nubra.excel.auto_switch_sheets",
    clearOnEnvSwitch: "nubra.excel.clear_on_env_switch",
    confirmProdOrder: "nubra.excel.confirm_prod_order",
    device: "nubra.excel.device_id",
    authDay: "nubra.excel.auth_day",
    ocView: "nubra.excel.oc_view",
    phone: "nubra.excel.phone",
    temp: "nubra.excel.temp_token",
    auth: "nubra.excel.auth_token",
    session: "nubra.excel.session_token",
    userId: "nubra.excel.user_id",
    marketWsUrl: "nubra.excel.market_ws_url",
    instruments: "nubra.excel.instruments",
    streamState: "nubra.excel.stream_state",
    strategyPreviewState: "nubra.excel.strategy_preview_state",
    trackedStrategyState: "nubra.excel.tracked_strategy_state",
    deployPreviewState: "nubra.excel.deploy_preview_state",
    basketSubmitState: "nubra.excel.basket_submit_state",
    squareOffPreviewState: "nubra.excel.square_off_preview_state",
    squareOffSubmitState: "nubra.excel.square_off_submit_state",
    closedTradeHistoryState: "nubra.excel.closed_trade_history_state",
    liveStrategyBookState: "nubra.excel.live_strategy_book_state",
    basketMonitorState: "nubra.excel.basket_monitor_state",
    basketMonitorAutoRefresh: "nubra.excel.basket_monitor_auto_refresh",
    marketOrderState: "nubra.excel.market_order_state",
    singleTradeBookState: "nubra.excel.single_trade_book_state",
    orderLookupState: "nubra.excel.order_lookup_state",
    orderInstrumentResolutionState: "nubra.excel.order_instrument_resolution_state",
    strategyEventFeedState: "nubra.excel.strategy_event_feed_state",
  };

  const BASE = { LIVE: "/proxy/live", UAT: "/proxy/uat" };
  const DATA_ENV = "LIVE";
  const ORDER_ENV = "UAT";
  const STREAM = { master: "master", prices: "live_prices", oc: "live_oc" };
  const SHEET = { placeOrder: "place_order" };
  const PAGE = { master: "master", realtime: "realtime", historical: "historical", orders: "orders" };
  const ENTRY_LTP_BUFFER_BPS = 20;
  const EXIT_LTP_BUFFER_BPS = 30;
  const SINGLE_ORDER_LTP_BUFFER_BPS = 20;
  const BATCH = 4000;
  const REFRESH_REASON = { manual: "manual", stream: "stream", env: "env", system: "system" };
  const SHEET_REFRESH_POLICY = {
    [STREAM.master]: { [REFRESH_REASON.manual]: true, [REFRESH_REASON.stream]: true, [REFRESH_REASON.env]: false, [REFRESH_REASON.system]: true },
    [STREAM.prices]: { [REFRESH_REASON.manual]: false, [REFRESH_REASON.stream]: true, [REFRESH_REASON.env]: false, [REFRESH_REASON.system]: true },
    [STREAM.oc]: { [REFRESH_REASON.manual]: false, [REFRESH_REASON.stream]: true, [REFRESH_REASON.env]: false, [REFRESH_REASON.system]: true },
    [SHEET.placeOrder]: { [REFRESH_REASON.manual]: true, [REFRESH_REASON.stream]: true, [REFRESH_REASON.env]: true, [REFRESH_REASON.system]: true },
  };

  const ws = {
    [STREAM.master]: mkState("Master"),
    [STREAM.prices]: mkState("LivePrices"),
    [STREAM.oc]: mkState("LiveOptionChain"),
  };

  let U = null;
  let officeReady = false;
  let masterProjectionTimer = null;
  let masterProjectionForceActivate = false;
  let masterProjectionStarted = false;
  let serverConnected = null;
  let serverStatusTimer = null;
  let singleTradeQuoteTimer = null;
  let ocSheetChangeBound = false;
  let sheetActivationBound = false;
  let bootstrapPromise = null;
  let suppressOcSheetSelectorEvent = false;
  let selectedMasterPriceSymbol = "";
  let workspaceReady = false;
  let authInvalidationInProgress = false;
  let symbolUniverse = [];
  let currentPage = PAGE.master;
  let instrumentIndex = new Map();
  let instrumentOptionIndex = new Map();
  let instrumentSymbolIndex = new Map();
  let placeOrderStreamRefreshTimer = null;
  let activeStrategyUiRefreshTimer = null;
  let lastPlaceOrderSheetStreamRefreshAt = 0;
  const DEFAULT_TARGET_DELTAS = [-1.0, -0.8, -0.6, -0.4, -0.2, 0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
  let latestStrategyPreviewState = null;
  let latestTrackedStrategyState = null;
  let latestDeployPreviewState = null;
  let latestBasketSubmitState = null;
  let latestSquareOffPreviewState = null;
  let latestSquareOffSubmitState = null;
  let latestClosedTradeHistoryState = [];
  let latestLiveStrategyBookState = [];
  let latestBasketMonitorState = null;
  let latestMarketOrderState = null;
  let latestSingleTradeBookState = [];
  let latestOrderLookupState = null;
  let latestOrderInstrumentResolutionState = {};
  let latestStrategyEventFeedState = [];
  let showCompletedTradeHistory = false;
  let instrumentAutoSyncInFlight = false;
  const instrumentAutoSyncLastByEnvExchange = new Map();
  let authTargetEnv = DATA_ENV;
  let ordersAuthPopupTimer = null;
  let pendingOrdersLoginRedirect = false;

  function mkState(sheetName) {
    return {
      sheetName,
      streamId: "",
      environment: "",
      sse: null,
      active: { indexSymbols: [], indexExchange: "NSE", optionItems: [], orderbookRefIds: [] },
      anchors: new Map(),
      idx: new Map(),
      opt: new Map(),
      ob: new Map(),
      settings: {},
      timer: null,
      pricePollTimer: null,
      pricePollBusy: false,
      ocPollTimer: null,
      ocPollBusy: false,
      dotResetTimer: null,
      startedOnce: false,
      reconnectTimer: null,
      reconnectTickTimer: null,
      reconnectAttempt: 0,
    };
  }

  const now = () =>
    new Date().toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const asEnv = (v) => (String(v || "").toUpperCase() === "LIVE" ? "LIVE" : "UAT");
  const clean = (v) => String(v || "").trim();
  const upper = (v) => clean(v).toUpperCase();
  const digits = (v) => String(v || "").replace(/\D/g, "");
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const todayIst = () => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch (_e) {
      return today();
    }
  };
  const csv = (v) => String(v || "").split(",").map((x) => upper(x)).filter(Boolean);
  const refCsv = (v) => String(v || "").split(",").map((x) => Number(clean(x))).filter((n) => Number.isInteger(n) && n > 0);
  const hasCellValue = (v) => !(v === undefined || v === null || v === "");
  const round2 = (n) => Math.round(n * 100) / 100;
  const KNOWN_INDEX_NAMES = new Set([
    "NIFTY",
    "BANKNIFTY",
    "FINNIFTY",
    "MIDCPNIFTY",
    "SENSEX",
    "BANKEX",
  ]);
  const MONTH_CODE_MONTHLY = {
    1: "JAN",
    2: "FEB",
    3: "MAR",
    4: "APR",
    5: "MAY",
    6: "JUN",
    7: "JUL",
    8: "AUG",
    9: "SEP",
    10: "OCT",
    11: "NOV",
    12: "DEC",
  };

  const PAGE_META = {
    [PAGE.master]: { group: "master" },
    [PAGE.realtime]: { group: "realtime" },
    [PAGE.historical]: { group: "historical" },
    [PAGE.orders]: { group: "orders" },
  };

  function toNumberOrNull(v) {
    if (!hasCellValue(v)) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function paiseToRupee(v) {
    const n = toNumberOrNull(v);
    if (n === null) return hasCellValue(v) ? v : "";
    return round2(n / 100);
  }

  function setActivePage(pageKey) {
    currentPage = PAGE_META[pageKey] ? pageKey : PAGE.master;
    if (!U) return;

    const ordersActive = currentPage === PAGE.orders;
    if (U.workspacePage) U.workspacePage.classList.toggle("hidden", ordersActive);
    if (U.orderStrategyPage) U.orderStrategyPage.classList.toggle("hidden", !ordersActive);

    const activeGroup = PAGE_META[currentPage].group;
    if (Array.isArray(U.pageGroupedCards)) {
      for (const node of U.pageGroupedCards) {
        const group = String(node.getAttribute("data-page-group") || "");
        let visible = !ordersActive && group === activeGroup;
        if (node === U.authCard && isAuthEnv(authEnv())) {
          // Keep auth form hidden once session is valid for selected auth env.
          visible = false;
        }
        node.classList.toggle("hidden", !visible);
      }
    }

    const tabs = [
      [U.masterPageButton, PAGE.master],
      [U.realtimePageButton, PAGE.realtime],
      [U.historicalPageButton, PAGE.historical],
      [U.ordersPageButton, PAGE.orders],
    ];
    for (const [btn, key] of tabs) {
      if (!btn) continue;
      const active = currentPage === key;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }
  }

  function tsToMs(ts) {
    if (!hasCellValue(ts)) return null;
    if (typeof ts === "string") {
      const p = Date.parse(ts);
      if (Number.isFinite(p)) return p;
    }
    const n = Number(ts);
    if (!Number.isFinite(n)) return null;
    const a = Math.abs(n);
    if (a >= 1e17) return Math.round(n / 1e6); // nanoseconds
    if (a >= 1e14) return Math.round(n / 1e3); // microseconds
    if (a >= 1e11) return Math.round(n); // milliseconds
    if (a >= 1e9) return Math.round(n * 1000); // seconds
    return Math.round(n);
  }

  function parseIstUiDateTimeToMs(value) {
    const raw = clean(value);
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6]);
    if (
      !Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)
      || !Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second)
    ) {
      return null;
    }
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+05:30`;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
  }

  function formatIstDateTime(value) {
    const ms = value instanceof Date ? value.getTime() : tsToMs(value);
    if (!Number.isFinite(ms)) return "";
    return new Date(ms).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function mergeDefined(base, patch) {
    const out = { ...(base || {}) };
    const src = patch || {};
    for (const [k, v] of Object.entries(src)) {
      if (hasCellValue(v)) out[k] = v;
    }
    return out;
  }

  function pickToken(obj, keys) {
    const src = obj && typeof obj === "object" ? obj : {};
    const nested = src.data && typeof src.data === "object" ? src.data : null;
    for (const k of keys) {
      const v1 = src[k];
      if (hasCellValue(v1)) return v1;
      if (nested) {
        const v2 = nested[k];
        if (hasCellValue(v2)) return v2;
      }
    }
    return "";
  }

  function lg(msg, err) {
    const p = `[${now()}] ${err ? "ERROR: " : ""}${msg}`;
    if (U?.statusLog) {
      U.statusLog.textContent = `${p}\n${U.statusLog.textContent}`.slice(0, 60000);
    }
    if (err) tlg(msg, true);
  }

  function tlg(msg, err) {
    if (!U?.telemetryLog) return;
    const p = `[${now()}] ${err ? "ERROR: " : ""}${msg}`;
    U.telemetryLog.textContent = `${p}\n${U.telemetryLog.textContent}`.slice(0, 30000);
  }

  function g(k, d = "") {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : v;
    } catch (_e) {
      return d;
    }
  }

  function set(k, v) {
    try {
      localStorage.setItem(k, String(v));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function del(k) {
    try {
      localStorage.removeItem(k);
    } catch (_e) {
      // ignore
    }
  }

  function canUseStorage(area) {
    try {
      if (!area) return false;
      const probeKey = "__nubra_storage_probe__";
      area.setItem(probeKey, "1");
      area.removeItem(probeKey);
      return true;
    } catch (_e) {
      return false;
    }
  }

  const sessionStorageAvailable = canUseStorage(typeof sessionStorage !== "undefined" ? sessionStorage : null);

  function gSession(k, d = "") {
    if (!sessionStorageAvailable) return d;
    try {
      const v = sessionStorage.getItem(k);
      return v == null ? d : v;
    } catch (_e) {
      return d;
    }
  }

  function setSession(k, v) {
    if (!sessionStorageAvailable) return false;
    try {
      sessionStorage.setItem(k, String(v));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function delSession(k) {
    if (!sessionStorageAvailable) return;
    try {
      sessionStorage.removeItem(k);
    } catch (_e) {
      // ignore
    }
  }

  function devId() {
    let id = g(S.device, "");
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID ? `EXCEL-${crypto.randomUUID()}` : `EXCEL-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      set(S.device, id);
    }
    return id;
  }

  const ENV_SUFFIX = { UAT: "uat", LIVE: "live" };
  const PER_ENV_STORAGE_BASES = new Set([S.authDay, S.ocView, S.phone, S.temp, S.auth, S.session, S.userId, S.marketWsUrl, S.instruments, S.streamState, S.strategyPreviewState, S.trackedStrategyState, S.deployPreviewState, S.basketSubmitState, S.squareOffPreviewState, S.squareOffSubmitState, S.closedTradeHistoryState, S.liveStrategyBookState, S.basketMonitorState, S.marketOrderState, S.singleTradeBookState, S.orderLookupState, S.orderInstrumentResolutionState, S.strategyEventFeedState]);
  const SESSION_ONLY_STORAGE_BASES = new Set([S.temp, S.auth, S.session, S.userId]);
  const STRATEGY_STATE_RESET_MARKER = "nubra.excel.strategy_state_reset_20260318_d";
  const AUTH_STATE_RESET_MARKER = "nubra.excel.auth_state_reset_20260318_a";
  const envLabel = (v) => (asEnv(v) === "LIVE" ? "PROD" : "UAT");
  const envBaseUrl = (v) => (asEnv(v) === "LIVE" ? "https://api.nubra.io" : "https://uatapi.nubra.io");
  const isExpiredSessionStatus = (status) => [401, 403, 440].includes(Number(status));

  function scopedKey(base, envValue) {
    const e = asEnv(envValue);
    return `${base}.${ENV_SUFFIX[e]}`;
  }

  function usesSessionStorage(base) {
    return sessionStorageAvailable && SESSION_ONLY_STORAGE_BASES.has(base);
  }

  function gScoped(base, envValue, d = "") {
    if (!PER_ENV_STORAGE_BASES.has(base)) return g(base, d);
    const key = scopedKey(base, envValue);
    const val = usesSessionStorage(base) ? gSession(key, "") : g(key, "");
    return val === "" ? d : val;
  }

  function setScoped(base, envValue, value) {
    if (!PER_ENV_STORAGE_BASES.has(base)) return set(base, value);
    const key = scopedKey(base, envValue);
    const ok = usesSessionStorage(base) ? setSession(key, value) : set(key, value);
    if (ok) {
      del(base);
      if (usesSessionStorage(base)) {
        del(key);
        delSession(base);
      }
    }
    return ok;
  }

  function delScoped(base, envValue) {
    if (!PER_ENV_STORAGE_BASES.has(base)) {
      del(base);
      return;
    }
    const key = scopedKey(base, envValue);
    if (usesSessionStorage(base)) {
      delSession(key);
      del(key);
      return;
    }
    del(key);
  }

  function loadScopedJson(base, envValue = env(), fallback = null) {
    const raw = gScoped(base, envValue, "");
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return fallback;
    }
  }

  function saveScopedJson(base, value, envValue = env()) {
    try {
      return setScoped(base, envValue, JSON.stringify(value));
    } catch (_e) {
      return false;
    }
  }

  function migrateLegacyScopedStorage() {
    const current = env();
    const keys = [S.authDay, S.ocView, S.phone, S.temp, S.auth, S.session, S.userId, S.instruments, S.streamState];
    for (const base of keys) {
      const legacy = g(base, "");
      if (legacy === "") continue;
      const sk = scopedKey(base, current);
      if (usesSessionStorage(base)) {
        if (gSession(sk, "") === "") {
          setSession(sk, legacy);
        }
      } else if (g(sk, "") === "") {
        set(sk, legacy);
      }
      del(base);
    }
    if (!sessionStorageAvailable) return;
    for (const base of SESSION_ONLY_STORAGE_BASES) {
      for (const envValue of ["UAT", "LIVE"]) {
        const sk = scopedKey(base, envValue);
        const legacy = g(sk, "");
        if (legacy === "") continue;
        if (gSession(sk, "") === "") {
          setSession(sk, legacy);
        }
        del(sk);
      }
    }
  }

  function clearStrategyStateLocalStorageOnce() {
    if (g(STRATEGY_STATE_RESET_MARKER, "") === "1") return false;
    const strategyBases = [
      S.strategyPreviewState,
      S.trackedStrategyState,
      S.deployPreviewState,
      S.basketSubmitState,
      S.squareOffPreviewState,
      S.squareOffSubmitState,
      S.closedTradeHistoryState,
      S.liveStrategyBookState,
      S.basketMonitorState,
      S.strategyEventFeedState,
    ];
    for (const base of strategyBases) {
      del(base);
      delScoped(base, "UAT");
      delScoped(base, "LIVE");
    }
    set(STRATEGY_STATE_RESET_MARKER, "1");
    return true;
  }

  function clearAuthStateLocalStorageOnce() {
    if (g(AUTH_STATE_RESET_MARKER, "") === "1") return false;
    const authBases = [S.temp, S.auth, S.session, S.userId, S.authDay, S.phone];
    for (const base of authBases) {
      del(base);
      del(scopedKey(base, "UAT"));
      del(scopedKey(base, "LIVE"));
    }
    set(AUTH_STATE_RESET_MARKER, "1");
    return true;
  }

  function applyDailyAuthReset() {
    // Keep auth state stable during the current browser session.
    // Token expiration is handled by backend invalidation responses.
    return false;
  }

  const env = () => asEnv(g(S.env, DATA_ENV));
  const setEnv = (v) => set(S.env, asEnv(v));
  const authEnv = () => asEnv(authTargetEnv || DATA_ENV);
  const setAuthTargetEnv = (v) => { authTargetEnv = asEnv(v); };
  const tok = (k, envValue = DATA_ENV) => gScoped(S[k], envValue, "");
  const setTok = (k, v, envValue = DATA_ENV) => setScoped(S[k], envValue, v);
  const delTok = (k, envValue = DATA_ENV) => delScoped(S[k], envValue);
  const marketWsUrl = (envValue = DATA_ENV) => gScoped(S.marketWsUrl, envValue, "");
  const isAuthEnv = (envValue) => Boolean(tok("session", envValue));
  const isAuth = () => isAuthEnv(DATA_ENV);
  const autoSwitchSheets = () => Boolean(U?.autoSwitchSheetsInput?.checked);
  const clearOnEnvSwitch = () => Boolean(U?.clearOnEnvSwitchInput?.checked);
  function shouldRefreshSheet(sheetKey, reason) {
    const r = REFRESH_REASON[reason] ? reason : REFRESH_REASON.stream;
    const policy = SHEET_REFRESH_POLICY[sheetKey] || {};
    return Boolean(policy[r]);
  }

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function setWorkspaceReady(v) {
    workspaceReady = Boolean(v);
    applyAuthGate();
  }

  function setWorkspaceLoading(loading, text) {
    if (!U) return;
    const isLoading = Boolean(loading);
    if (U.workspaceLoaderText && hasCellValue(text)) {
      U.workspaceLoaderText.textContent = String(text);
    }
    if (U.workspaceLoader) {
      if (isLoading) show(U.workspaceLoader);
      else hide(U.workspaceLoader);
    }
    document.body.classList.toggle("workspace-busy", isLoading);
  }

  function renderEnvAuthTags() {
    if (!U) return;
    const map = [
      { env: "UAT", tag: U.envUatAuthTag },
      { env: "LIVE", tag: U.envLiveAuthTag },
    ];
    for (const x of map) {
      const ok = isAuthEnv(x.env);
      x.tag.textContent = ok ? "Auth" : "No Auth";
      x.tag.classList.toggle("good", ok);
      x.tag.classList.toggle("bad", !ok);
    }
  }

  function renderEnvButtons() {
    if (!U) return;
    const current = authEnv();
    U.envUatButton.classList.toggle("active", current === ORDER_ENV);
    U.envLiveButton.classList.toggle("active", current === DATA_ENV);
    if (U.activeEnvChip) {
      U.activeEnvChip.textContent = `Data: PROD | Orders: UAT`;
    }
    if (U.topLogoutButton) {
      U.topLogoutButton.classList.remove("hidden");
      U.topLogoutButton.textContent = `Logout ${envLabel(authEnv())}`;
    }
    document.body.classList.toggle("env-uat", current === ORDER_ENV);
    document.body.classList.toggle("env-live", current === DATA_ENV);
    refreshOrderStrategyUi();
  }

  function syncAuthStagesForCurrentEnv() {
    if (tok("auth", authEnv()) && !tok("session", authEnv())) {
      hide(U.otpStage);
      show(U.mpinStage);
      refreshAuthControls();
      return;
    }
    show(U.otpStage);
    if (!tok("session", authEnv())) hide(U.mpinStage);
    refreshAuthControls();
  }

  function authUi() {
    const e = authEnv();
    const eLabel = envLabel(e);
    const ok = isAuthEnv(e);
    U.authTitle.textContent = `Authenticate (${eLabel})`;
    U.authBadge.textContent = ok ? `${eLabel} authenticated` : `${eLabel} not authenticated`;
    U.authBadge.classList.toggle("good", ok);
    U.authBadge.classList.toggle("bad", !ok);
    U.sessionState.textContent = ok ? `${eLabel} authenticated` : `${eLabel} not authenticated`;
    U.sessionState.classList.toggle("good", ok);
    U.sessionState.classList.toggle("bad", !ok);
    renderEnvAuthTags();
    renderEnvButtons();
    if (ok) hide(U.authCard);
    else show(U.authCard);
    if (!ok) {
      setWorkspaceLoading(false);
      setWorkspaceReady(false);
    }
    if (ok) {
      setFieldMessage(U.phoneFieldMsg, U.phoneInput, "", "error");
      setFieldMessage(U.otpFieldMsg, U.otpInput, "", "error");
      setFieldMessage(U.pinFieldMsg, U.pinInput, "", "error");
      clearAuthActionMessage();
    }
    applyAuthGate();
    refreshAuthControls();
  }

  function clearAuthTokensForEnv(envValue = env()) {
    delScoped(S.temp, envValue);
    delScoped(S.auth, envValue);
    delScoped(S.session, envValue);
    delScoped(S.userId, envValue);
    delScoped(S.marketWsUrl, envValue);
  }

  function applyEnvInfo(data, envValue = env()) {
    const src = data && typeof data === "object" ? data : {};
    const envInfo = src.env_info && typeof src.env_info === "object"
      ? src.env_info
      : (src.data && typeof src.data.env_info === "object" ? src.data.env_info : null);
    if (!envInfo) return "";
    const nextMarketWsUrl = clean(envInfo.market_ws_url || envInfo.marketWsUrl || "");
    if (/^wss?:\/\//i.test(nextMarketWsUrl)) {
      setScoped(S.marketWsUrl, envValue, nextMarketWsUrl);
    }
    return /^wss?:\/\//i.test(nextMarketWsUrl) ? nextMarketWsUrl : "";
  }

  async function refreshEnvironmentInfo(envValue = env(), options = {}) {
    const targetEnv = asEnv(envValue || DATA_ENV);
    if (!isAuthEnv(targetEnv)) return "";
    if (targetEnv !== DATA_ENV && targetEnv !== ORDER_ENV) return "";
    const silent = Boolean(options.silent);
    try {
      const data = await req("/userinfo", { token: "session", envOverride: targetEnv });
      const nextMarketWsUrl = applyEnvInfo(data, targetEnv);
      if (nextMarketWsUrl && !silent) {
        tlg(`Market WS override loaded for ${envLabel(targetEnv)}: ${nextMarketWsUrl}`);
      }
      return nextMarketWsUrl;
    } catch (e) {
      if (!silent) {
        lg(`Failed to refresh environment info: ${e.message || String(e)}`, true);
      }
      return "";
    }
  }

  async function validateStoredSession(envValue = env(), options = {}) {
    const targetEnv = asEnv(envValue || DATA_ENV);
    const silent = Boolean(options.silent);
    if (!tok("session", targetEnv)) return false;
    try {
      const data = await req("/userinfo", {
        token: "session",
        envOverride: targetEnv,
        skipAutoAuthInvalidation: true,
      });
      applyEnvInfo(data, targetEnv);
      return true;
    } catch (e) {
      if (isExpiredSessionStatus(e?.status)) {
        await invalidateCurrentSession(`HTTP ${e.status} on GET /userinfo (${envLabel(targetEnv)})`, targetEnv);
        return false;
      }
      if (!silent) {
        lg(`Failed to validate ${envLabel(targetEnv)} session: ${e.message || String(e)}`, true);
      }
      return false;
    }
  }

  async function invalidateCurrentSession(reason, targetEnv = DATA_ENV) {
    if (authInvalidationInProgress) return;
    authInvalidationInProgress = true;
    try {
      const currentEnv = asEnv(targetEnv || DATA_ENV);
      clearAuthTokensForEnv(currentEnv);
      if (currentEnv === DATA_ENV) {
        await stopAllWs({ preserveSelections: true, skipSheetRefresh: true }).catch(() => null);
        setWorkspaceReady(false);
        setWorkspaceLoading(false);
      }
      if (authEnv() === currentEnv) {
        show(U.otpStage);
        hide(U.mpinStage);
        U.otpInput.value = "";
        U.pinInput.value = "";
        setFieldMessage(U.phoneFieldMsg, U.phoneInput, "", "error");
        setFieldMessage(U.otpFieldMsg, U.otpInput, "", "error");
        setFieldMessage(U.pinFieldMsg, U.pinInput, "", "error");
        authUi();
        if (U?.phoneInput) U.phoneInput.focus();
      } else {
        renderEnvAuthTags();
        refreshAuthControls();
      }
      if (currentEnv === ORDER_ENV && U?.basketMonitorTagInput) {
        U.basketMonitorTagInput.value = "";
      }
      const why = clean(reason);
      if (authEnv() === currentEnv) {
        setAuthActionMessage(`Session expired${why ? `: ${why}` : ""}. Please login again.`);
      }
      refreshAuthControls();
      lg(`${envLabel(currentEnv)} session expired${why ? ` (${why})` : ""}. Please authenticate again.`);
    } finally {
      authInvalidationInProgress = false;
    }
  }

  function applyAuthGate() {
    if (!U) return;
    const ok = isAuth() && workspaceReady;
    const blocks = Array.isArray(U.authRequiredBlocks) ? U.authRequiredBlocks : [];
    for (const el of blocks) {
      if (!el) continue;
      el.classList.toggle("auth-locked", !ok);
      if (!ok && el.tagName === "DETAILS") {
        el.open = false;
      }
    }
    if (U.ocViewSelect) {
      U.ocViewSelect.disabled = !ok;
    }
  }

  function setFieldMessage(msgEl, inputEl, message, kind = "error") {
    if (!msgEl) return;
    const text = clean(message);
    if (!text) {
      msgEl.textContent = "";
      msgEl.classList.add("hidden");
      msgEl.classList.remove("error", "success", "info");
      if (inputEl) inputEl.classList.remove("input-invalid");
      return;
    }
    const normalizedKind = kind === "success" || kind === "info" ? kind : "error";
    msgEl.textContent = text;
    msgEl.classList.remove("hidden");
    msgEl.classList.toggle("error", normalizedKind === "error");
    msgEl.classList.toggle("success", normalizedKind === "success");
    msgEl.classList.toggle("info", normalizedKind === "info");
    if (inputEl) inputEl.classList.toggle("input-invalid", normalizedKind === "error");
  }

  function setAuthActionMessage(message, kind = "error") {
    setFieldMessage(U?.authActionMsg, null, message, kind);
  }

  function clearAuthActionMessage() {
    setAuthActionMessage("", "error");
  }

  function setMarketOrderActionMessage(message, kind = "error") {
    setFieldMessage(U?.marketOrderActionMsg, null, message, kind);
  }

  function setSingleTradeActionMessage(message, kind = "error") {
    setFieldMessage(U?.singleTradeActionMsg, null, message, kind);
  }

  function setOrderLookupActionMessage(message, kind = "error") {
    setFieldMessage(U?.orderLookupActionMsg, null, message, kind);
  }

  function setMarketOrderResponse(value) {
    if (!U?.marketOrderResponse) return;
    if (typeof value === "string") {
      U.marketOrderResponse.textContent = value;
      return;
    }
    try {
      U.marketOrderResponse.textContent = JSON.stringify(value, null, 2);
    } catch (_e) {
      U.marketOrderResponse.textContent = String(value);
    }
  }

  function setOrderLookupResponse(value) {
    if (!U?.orderLookupResponse) return;
    if (typeof value === "string") {
      U.orderLookupResponse.textContent = value;
      return;
    }
    try {
      U.orderLookupResponse.textContent = JSON.stringify(value, null, 2);
    } catch (_e) {
      U.orderLookupResponse.textContent = String(value);
    }
  }

  function setStrategyPreviewActionMessage(message, kind = "error") {
    setFieldMessage(U?.strategyPreviewActionMsg, null, message, kind);
  }

  function setStrategyPreviewResponse(value) {
    if (!U?.strategyPreviewResponse) return;
    if (typeof value === "string") {
      U.strategyPreviewResponse.textContent = value;
      return;
    }
    try {
      U.strategyPreviewResponse.textContent = JSON.stringify(value, null, 2);
    } catch (_e) {
      U.strategyPreviewResponse.textContent = String(value);
    }
  }

  function setDeployPreviewActionMessage(message, kind = "error") {
    setFieldMessage(U?.deployPreviewActionMsg, null, message, kind);
  }

  function setDeployPreviewResponse(value) {
    if (!U?.deployPreviewResponse) return;
    if (typeof value === "string") {
      U.deployPreviewResponse.textContent = value;
      return;
    }
    try {
      U.deployPreviewResponse.textContent = JSON.stringify(value, null, 2);
    } catch (_e) {
      U.deployPreviewResponse.textContent = String(value);
    }
  }

  function setBasketSubmitResponse(value) {
    if (!U?.basketSubmitResponse) return;
    if (typeof value === "string") {
      U.basketSubmitResponse.textContent = value;
      return;
    }
    try {
      U.basketSubmitResponse.textContent = JSON.stringify(value, null, 2);
    } catch (_e) {
      U.basketSubmitResponse.textContent = String(value);
    }
  }

  function setSquareOffActionMessage(message, kind = "error") {
    setFieldMessage(U?.squareOffActionMsg, null, message, kind);
  }

  function setSquareOffPreviewResponse(value) {
    if (!U?.squareOffPreviewResponse) return;
    if (typeof value === "string") {
      U.squareOffPreviewResponse.textContent = value;
      return;
    }
    try {
      U.squareOffPreviewResponse.textContent = JSON.stringify(value, null, 2);
    } catch (_e) {
      U.squareOffPreviewResponse.textContent = String(value);
    }
  }

  function setSquareOffSubmitResponse(value) {
    if (!U?.squareOffSubmitResponse) return;
    if (typeof value === "string") {
      U.squareOffSubmitResponse.textContent = value;
      return;
    }
    try {
      U.squareOffSubmitResponse.textContent = JSON.stringify(value, null, 2);
    } catch (_e) {
      U.squareOffSubmitResponse.textContent = String(value);
    }
  }

  function closedTradeMs(item) {
    const direct = tsToMs(item?.closed_at);
    if (Number.isFinite(direct)) return direct;
    const parsedIst = parseIstUiDateTimeToMs(item?.closed_at);
    if (Number.isFinite(parsedIst)) return parsedIst;
    return null;
  }

  function filteredClosedTrades(items) {
    const list = Array.isArray(items) ? items : [];
    if (showCompletedTradeHistory) return list.slice(0, 120);
    const cutoffMs = Date.now() - (24 * 60 * 60 * 1000);
    return list.filter((item) => {
      const ms = closedTradeMs(item);
      return Number.isFinite(ms) && ms >= cutoffMs;
    }).slice(0, 120);
  }

  function refreshCompletedTradesWindowUi(totalCount, shownCount) {
    if (U?.toggleTradeHistoryButton) {
      U.toggleTradeHistoryButton.textContent = showCompletedTradeHistory ? "Hide History" : "Show History";
    }
    if (U?.completedTradesWindowLabel) {
      U.completedTradesWindowLabel.textContent = showCompletedTradeHistory
        ? `Showing full history (${shownCount}/${totalCount}).`
        : `Showing only last 24 hours (${shownCount}/${totalCount}).`;
    }
  }

  function setCompletedTradesResponse(value) {
    if (!U?.completedTradesResponse) return;
    if (typeof value === "string") {
      U.completedTradesResponse.className = "completed-trades-empty";
      U.completedTradesResponse.textContent = value;
      refreshCompletedTradesWindowUi(0, 0);
      return;
    }
    try {
      const all = Array.isArray(value) ? value : [];
      const visible = filteredClosedTrades(all);
      refreshCompletedTradesWindowUi(all.length, visible.length);
      if (!visible.length) {
        U.completedTradesResponse.className = "completed-trades-empty";
        U.completedTradesResponse.textContent = showCompletedTradeHistory
          ? "No closed trades archived yet."
          : "No completed trades in the last 24 hours. Click Show History to view older trades.";
        return;
      }
      U.completedTradesResponse.className = "completed-trades-list";
      clearChildren(U.completedTradesResponse);
      const fragment = document.createDocumentFragment();
      for (const item of visible.slice(0, 20)) {
        // Tested and verified method: completed-trade `booked_pnl` is already stored in rupees.
        // Render it directly here; do not re-normalize or infer units from entry/exit again.
        const pnl = Number(item?.booked_pnl);
        const pnlClass = Number.isFinite(pnl) ? (pnl >= 0 ? "good" : "bad") : "";
        const legs = Array.isArray(item?.legs) ? item.legs : [];
        const article = document.createElement("article");
        article.className = "trade-card";

        const head = document.createElement("div");
        head.className = "trade-card-head";
        const headLeft = document.createElement("div");
        appendTextNode(headLeft, "h3", "trade-card-title", `${item?.symbol || "-"} | ${item?.strategy || "-"}`);
        appendTextNode(headLeft, "div", "trade-card-time", item?.closed_at || "");
        const pnlNode = document.createElement("div");
        pnlNode.className = pnlClass ? `trade-card-pnl ${pnlClass}` : "trade-card-pnl";
        pnlNode.textContent = Number.isFinite(pnl) ? pnl.toFixed(2) : "-";
        head.appendChild(headLeft);
        head.appendChild(pnlNode);

        const body = document.createElement("div");
        body.className = "trade-card-body";
        const statGrid = document.createElement("div");
        statGrid.className = "trade-stat-grid";
        appendTradeStat(statGrid, "Qty", hasCellValue(item?.order_qty) ? item.order_qty : "-");
        appendTradeStat(statGrid, "Entry Price", hasCellValue(item?.entry_price_once) ? paiseToRupee(item.entry_price_once) : "-");
        appendTradeStat(statGrid, "Exit Price", hasCellValue(item?.exit_price_once) ? paiseToRupee(item.exit_price_once) : "-");
        appendTradeStat(statGrid, "Entry Basket", hasCellValue(item?.entry_basket_id) ? item.entry_basket_id : "-");
        appendTradeStat(statGrid, "Exit Basket", hasCellValue(item?.exit_basket_id) ? item.exit_basket_id : "-");
        appendTradeStat(statGrid, "Entry Tag", item?.entry_tag || "-");

        const legsWrap = document.createElement("div");
        legsWrap.className = "trade-legs";
        appendTradeLegRow(legsWrap, ["Side", "Type", "Ref / Strike", "Lot"]);
        for (const leg of legs.slice(0, 8)) {
          const refOrStrike = hasCellValue(leg?.ref_id)
            ? `${leg.ref_id}${leg?.strike ? ` / ${leg.strike}` : ""}`
            : (leg?.strike || "-");
          appendTradeLegRow(legsWrap, [
            leg?.side || "",
            leg?.option_type || "",
            refOrStrike,
            hasCellValue(leg?.lot_size) ? leg.lot_size : "-",
          ]);
        }

        body.appendChild(statGrid);
        body.appendChild(legsWrap);
        article.appendChild(head);
        article.appendChild(body);
        fragment.appendChild(article);
      }
      U.completedTradesResponse.appendChild(fragment);
    } catch (_e) {
      U.completedTradesResponse.className = "completed-trades-empty";
      U.completedTradesResponse.textContent = String(value);
    }
  }

  function activeStrategyPnlClass(value) {
    const pnl = Number(value);
    if (!Number.isFinite(pnl)) return "flat";
    if (pnl > 0) return "good";
    if (pnl < 0) return "bad";
    return "flat";
  }

  function formatDisplayDateTime(value) {
    const raw = clean(value);
    if (!raw) return "-";
    if (raw.includes("/")) return raw;
    const ms = tsToMs(raw);
    if (!Number.isFinite(ms)) return raw;
    return formatIstDateTime(ms) || raw;
  }

  function isStrategySnapshotActive(stateLike) {
    if (!stateLike) return false;
    if (stateLike.closed) return false;
    if (stateLike.square_off_confirmed) return false;
    return true;
  }

  function formatActiveStrategyPnl(value) {
    const pnl = Number(value);
    if (!Number.isFinite(pnl)) return "-";
    const rupee = round2(pnl);
    return `${rupee > 0 ? "+" : ""}${rupee.toFixed(2)}`;
  }

  function strategyEventTimeText(value) {
    const raw = clean(value);
    if (!raw) return formatIstDateTime(new Date()).split(", ")[1] || "";
    const display = formatDisplayDateTime(raw);
    const parts = String(display).split(", ");
    return parts.length > 1 ? parts[1] : display;
  }

  function pushStrategyEvent(entry = {}) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      at: entry.at || formatIstDateTime(new Date()),
      symbol: entry.symbol || "",
      strategy: entry.strategy || "",
      qty: hasCellValue(entry.qty) ? Number(entry.qty) : null,
      live_pnl: Number.isFinite(Number(entry.live_pnl)) ? Number(entry.live_pnl) : null,
      booked_pnl: Number.isFinite(Number(entry.booked_pnl)) ? Number(entry.booked_pnl) : null,
      label: entry.label || "",
      detail: entry.detail || "",
      tone: entry.tone || "info",
    };
    const current = Array.isArray(latestStrategyEventFeedState) ? latestStrategyEventFeedState : [];
    const prev = current[0] || null;
    if (
      prev
      && prev.label === event.label
      && clean(prev.symbol || "") === clean(event.symbol || "")
      && clean(prev.strategy || "") === clean(event.strategy || "")
      && String(prev.qty ?? "") === String(event.qty ?? "")
      && String(prev.booked_pnl ?? "") === String(event.booked_pnl ?? "")
    ) {
      return;
    }
    latestStrategyEventFeedState = [event, ...current].slice(0, 20);
    saveScopedJson(S.strategyEventFeedState, latestStrategyEventFeedState, ORDER_ENV);
    setStrategyEventFeedResponse();
  }

  function setStrategyEventFeedResponse() {
    if (!U?.strategyEventFeedResponse) return;
    const items = Array.isArray(latestStrategyEventFeedState) ? latestStrategyEventFeedState : [];
    if (!items.length) {
      U.strategyEventFeedResponse.className = "active-strategies-empty";
      U.strategyEventFeedResponse.textContent = "No lifecycle events yet.";
      return;
    }
    U.strategyEventFeedResponse.className = "event-feed-list";
    clearChildren(U.strategyEventFeedResponse);
    const fragment = document.createDocumentFragment();
    for (const item of items.slice(0, 8)) {
      const descriptor = [
        item.symbol || "-",
        item.strategy || "-",
        hasCellValue(item.qty) ? `qty ${item.qty}` : "",
        Number.isFinite(Number(item.live_pnl)) ? `live ${formatActiveStrategyPnl(item.live_pnl)}` : "",
      ].filter(Boolean).join(" : ");
      const detailText = item.detail
        || (Number.isFinite(Number(item.booked_pnl)) ? `Booked P&L ${formatActiveStrategyPnl(item.booked_pnl)}` : "");
      const article = document.createElement("article");
      article.className = `event-feed-item ${item.tone || "info"}`;
      appendTextNode(article, "div", "event-feed-time", strategyEventTimeText(item.at));
      const body = document.createElement("div");
      body.className = "event-feed-body";
      appendTextNode(body, "div", "event-feed-line", `${item.label || "Event"}${descriptor ? ` : ${descriptor}` : ""}`);
      appendTextNode(body, "div", "event-feed-subline", detailText || " ");
      article.appendChild(body);
      fragment.appendChild(article);
    }
    U.strategyEventFeedResponse.appendChild(fragment);
  }

  function setTrackedPreviewResponse() {
    if (!U?.trackedPreviewResponse) return;
    const tracked = latestTrackedStrategyState;
    const active = activeStrategyStateSnapshot();
    const trackedOpen = tracked?.legs?.length && !tracked?.closed;
    if (!trackedOpen || active) {
      U.trackedPreviewResponse.className = "active-strategies-empty";
      U.trackedPreviewResponse.textContent = active ? "Tracked strategy is live now." : "No tracked strategy yet.";
      return;
    }
    const qty = Number(tracked?.requested_order_qty);
    const livePaise = signedEntryPriceFromTracked(tracked, "sell_positive");
    const livePrice = Number.isFinite(livePaise) ? paiseToRupee(livePaise) : null;
    U.trackedPreviewResponse.className = "";
    clearChildren(U.trackedPreviewResponse);
    const article = document.createElement("article");
    article.className = "tracked-preview-card";
    const title = document.createElement("div");
    title.className = "tracked-preview-title";
    appendStrongText(title, tracked.symbol || "-");
    appendTextNode(title, "span", "", `${tracked.strategy || "-"}${hasCellValue(tracked.target_delta) ? ` | Delta ${tracked.target_delta}` : ""}`);
    const meta = document.createElement("div");
    meta.className = "active-rail-meta";
    appendActiveRailChip(meta, "Qty", Number.isFinite(qty) && qty > 0 ? qty : "-");
    appendActiveRailChip(meta, "Time", formatDisplayDateTime(tracked.selected_at));
    appendActiveRailChip(meta, "Live", Number.isFinite(livePrice) ? round2(Number(livePrice)).toFixed(2) : "-");
    const banner = document.createElement("div");
    banner.className = "tracked-preview-banner";
    banner.textContent = "Tracked only. This strategy becomes live only after deploy confirmation.";
    article.appendChild(title);
    article.appendChild(meta);
    article.appendChild(banner);
    U.trackedPreviewResponse.appendChild(article);
  }

  function activeStrategyStateSnapshot() {
    const tracked = latestTrackedStrategyState;
    if (!tracked?.legs?.length || tracked.closed) return null;

    hydrateTrackedLegsFromLive(tracked);

    const basketState = latestBasketSubmitState;
    if (!basketState?.request?.orders?.length) return null;
    const trackedSymbol = clean(tracked.symbol || "");
    const basketSymbol = clean(
      latestDeployPreviewState?.tracked_symbol
      || latestDeployPreviewState?.deploy_payload?.symbol
      || basketState?.tracked_symbol
      || ""
    );
    if (trackedSymbol && basketSymbol && trackedSymbol !== basketSymbol) return null;
    const activeBasketId = hasCellValue(basketState?.basket_id) ? String(basketState.basket_id) : "";
    const activeEntryTag = clean(basketState?.tag || basketState?.request?.tag || "");
    const rawExitState = latestSquareOffSubmitState;
    const exitMatchesActive = Boolean(rawExitState) && (
      (activeBasketId && String(rawExitState?.original_basket_id ?? "") === activeBasketId)
      || (activeEntryTag && String(rawExitState?.entry_tag ?? rawExitState?.request?.entry_tag ?? "") === activeEntryTag)
    );
    const exitState = exitMatchesActive ? rawExitState : null;

    const qty = Number(
      latestDeployPreviewState?.requested_order_qty
      || tracked.requested_order_qty
      || latestBasketSubmitState?.request?.orders?.[0]?.order_qty
      || 0
    );
    const livePrice = signedEntryPriceFromTracked(tracked, "sell_positive");
    const entryPrice = latestBasketSubmitState?.request
      ? entryPriceOnceFromBasketState(latestBasketSubmitState)
      : signedEntryPriceFromTracked(tracked, "sell_positive");
    const livePnl = Number.isFinite(entryPrice) && Number.isFinite(livePrice) && Number.isFinite(qty)
      ? round2(((entryPrice - livePrice) * qty) / 100)
      : null;
    const entryPriceRupee = Number.isFinite(entryPrice) ? paiseToRupee(entryPrice) : null;
    const livePriceRupee = Number.isFinite(livePrice) ? paiseToRupee(livePrice) : null;

    const basketStatus = clean(exitState?.basket_status || "");
    const entryAt = latestBasketSubmitState?.requested_at_ist || tracked.selected_at || "";
    const updatedAt = exitState?.live_updated_at || basketState?.live_updated_at || tracked.live_updated_at || tracked.selected_at || "";
    const exitBasketStatus = clean(exitState?.basket_status || "");
    const squareOffConfirmed = Boolean(exitState?.square_off_position_closed)
      || exitState?.status === "filled"
      || Boolean(exitState && isBasketClosedStatus(exitBasketStatus));

    let statusTone = "flat";
    let statusText = "Tracked only. Deploy to make it live.";
    let actionLabel = "Square Off";
    let actionDisabled = true;

    if (exitState?.status === "pending_fill") {
      statusTone = "pending";
      statusText = exitState.message || "Square-off submitted. Waiting for broker fill confirmation.";
      actionLabel = "Pending Fill...";
      actionDisabled = true;
    } else if (basketState?.request?.orders?.length) {
      statusTone = "live";
      statusText = "Live strategy.";
      actionDisabled = false;
    }

    return {
      symbol: tracked.symbol || "",
      strategy: tracked.strategy || "",
      target_delta: tracked.target_delta,
      pair_number: tracked.pair_number,
      entry_at: entryAt,
      order_qty: Number.isFinite(qty) && qty > 0 ? qty : null,
      entry_price_once: Number.isFinite(entryPriceRupee) ? entryPriceRupee : null,
      live_strategy_ltp: Number.isFinite(livePriceRupee) ? livePriceRupee : null,
      live_pnl: Number.isFinite(livePnl) ? livePnl : null,
      basket_id: basketState?.basket_id ?? null,
      basket_tag: basketState?.tag || basketState?.request?.tag || "",
      basket_status: basketStatus,
      updated_at: updatedAt,
      square_off_confirmed: squareOffConfirmed,
      statusTone,
      statusText,
      actionLabel,
      actionDisabled,
      legs: Array.isArray(tracked.legs) ? tracked.legs.slice(0, 8) : [],
    };
  }

  function liveStrategyKeyFromState(stateLike) {
    const basketTag = clean(stateLike?.basket_tag || "");
    if (basketTag) return `tag:${basketTag}`;
    if (hasCellValue(stateLike?.basket_id)) return `basket:${stateLike.basket_id}`;
    const symbol = clean(stateLike?.symbol || "");
    const stamp = clean(stateLike?.updated_at || stateLike?.selected_at || "");
    return symbol ? `symbol:${symbol}|${stamp}` : "";
  }

  function pruneLiveStrategyBookFromClosedHistory() {
    const closed = Array.isArray(latestClosedTradeHistoryState) ? latestClosedTradeHistoryState : [];
    if (!closed.length) return;
    const closedTags = new Set(closed.map((item) => clean(item?.entry_tag || "")).filter(Boolean));
    const closedBaskets = new Set(closed.map((item) => String(item?.entry_basket_id ?? "")).filter(Boolean));
    const before = Array.isArray(latestLiveStrategyBookState) ? latestLiveStrategyBookState : [];
    const after = before.filter((item) => {
      const tag = clean(item?.basket_tag || "");
      const basket = String(item?.basket_id ?? "");
      if (tag && closedTags.has(tag)) return false;
      if (basket && closedBaskets.has(basket)) return false;
      return true;
    });
    if (after.length !== before.length) {
      latestLiveStrategyBookState = after;
      saveScopedJson(S.liveStrategyBookState, latestLiveStrategyBookState);
    }
  }

  function upsertLiveStrategyBookFromCurrent(snapshot, trackedState = null) {
    if (!snapshot) return;
    if (!clean(snapshot.basket_tag || "") && !hasCellValue(snapshot.basket_id)) return;
    const key = liveStrategyKeyFromState(snapshot);
    if (!key) return;
    const legs = Array.isArray(trackedState?.legs) ? trackedState.legs.slice(0, 8) : [];
    const item = {
      key,
      symbol: snapshot.symbol || "",
      strategy: snapshot.strategy || "",
      target_delta: snapshot.target_delta,
      pair_number: snapshot.pair_number,
      entry_at: snapshot.entry_at || "",
      order_qty: snapshot.order_qty,
      entry_price_once: snapshot.entry_price_once,
      entry_price_confirmed: Boolean(latestBasketSubmitState?.entry_price_confirmed),
      entry_price_source: latestBasketSubmitState?.entry_price_source || "",
      live_strategy_ltp: snapshot.live_strategy_ltp,
      live_pnl: snapshot.live_pnl,
      basket_id: snapshot.basket_id,
      basket_tag: snapshot.basket_tag || "",
      basket_status: snapshot.basket_status || "",
      portfolio_before_stats: latestBasketSubmitState?.portfolio_before_stats || null,
      updated_at: snapshot.updated_at || "",
      square_off_confirmed: Boolean(snapshot.square_off_confirmed),
      statusTone: snapshot.statusTone || "flat",
      statusText: snapshot.statusText || "",
      legs,
      last_seen_at: new Date().toISOString(),
    };
    const list = Array.isArray(latestLiveStrategyBookState) ? latestLiveStrategyBookState.slice(0, 79) : [];
    const idx = list.findIndex((x) => {
      if (x?.key && x.key === key) return true;
      if (item.basket_tag && clean(x?.basket_tag || "") === item.basket_tag) return true;
      if (hasCellValue(item.basket_id) && String(x?.basket_id ?? "") === String(item.basket_id)) return true;
      return false;
    });
    if (idx >= 0) list[idx] = { ...list[idx], ...item };
    else list.unshift(item);
    latestLiveStrategyBookState = list.slice(0, 80);
    saveScopedJson(S.liveStrategyBookState, latestLiveStrategyBookState);
  }

  function buildSnapshotFromLiveBookEntry(entry) {
    const qty = Number(entry?.order_qty);
    const base = {
      symbol: entry?.symbol || "",
      strategy: entry?.strategy || "",
      target_delta: entry?.target_delta,
      pair_number: entry?.pair_number,
      entry_at: entry?.entry_at || "",
      order_qty: Number.isFinite(qty) && qty > 0 ? qty : null,
      entry_price_once: Number.isFinite(Number(entry?.entry_price_once)) ? Number(entry.entry_price_once) : null,
      entry_price_confirmed: Boolean(entry?.entry_price_confirmed),
      entry_price_source: entry?.entry_price_source || "",
      live_strategy_ltp: Number.isFinite(Number(entry?.live_strategy_ltp)) ? Number(entry.live_strategy_ltp) : null,
      live_pnl: Number.isFinite(Number(entry?.live_pnl)) ? Number(entry.live_pnl) : null,
      basket_id: entry?.basket_id ?? null,
      basket_tag: entry?.basket_tag || "",
      basket_status: entry?.basket_status || "",
      portfolio_before_stats: entry?.portfolio_before_stats || null,
      updated_at: entry?.updated_at || "",
      square_off_confirmed: Boolean(entry?.square_off_confirmed),
      statusTone: entry?.statusTone || "flat",
      statusText: entry?.statusText || "Live strategy.",
      actionLabel: "Square Off",
      actionDisabled: !(Array.isArray(entry?.legs) && entry.legs.length && (clean(entry?.basket_tag || "") || hasCellValue(entry?.basket_id))),
      legs: Array.isArray(entry?.legs) ? entry.legs.slice(0, 8) : [],
    };
    if (!base.legs.length || !Number.isFinite(base.entry_price_once) || !Number.isFinite(base.order_qty)) return base;

    const tracked = { legs: base.legs.map((leg) => ({ ...leg })) };
    hydrateTrackedLegsFromLive(tracked);
    const signedLivePaise = signedEntryPriceFromTracked(tracked, "sell_positive");
    if (!Number.isFinite(signedLivePaise)) return base;
    const liveRupee = paiseToRupee(signedLivePaise);
    const entryPaise = Number(base.entry_price_once) * 100;
    const livePnl = Number.isFinite(entryPaise)
      ? round2(((entryPaise - signedLivePaise) * Number(base.order_qty)) / 100)
      : base.live_pnl;
    return {
      ...base,
      live_strategy_ltp: Number.isFinite(Number(liveRupee)) ? Number(liveRupee) : base.live_strategy_ltp,
      live_pnl: Number.isFinite(Number(livePnl)) ? Number(livePnl) : base.live_pnl,
      legs: tracked.legs.slice(0, 8),
      updated_at: formatIstDateTime(new Date()),
    };
  }

  function activeStrategySnapshots() {
    pruneLiveStrategyBookFromClosedHistory();
    const snapshots = [];
    const seen = new Set();
    const current = activeStrategyStateSnapshot();
    if (current && (clean(current.basket_tag || "") || hasCellValue(current.basket_id))) {
      upsertLiveStrategyBookFromCurrent(current, latestTrackedStrategyState);
      const k = liveStrategyKeyFromState(current);
      if (k) seen.add(k);
      if (isStrategySnapshotActive(current)) {
        snapshots.push({ ...current, trade_key: k, actionDisabled: Boolean(current.actionDisabled) });
      }
    }
    const fromBook = Array.isArray(latestLiveStrategyBookState) ? latestLiveStrategyBookState : [];
    for (const item of fromBook) {
      const k = clean(item?.key || liveStrategyKeyFromState(item));
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const snapshot = { ...buildSnapshotFromLiveBookEntry(item), trade_key: k };
      if (!isStrategySnapshotActive(snapshot)) continue;
      snapshots.push(snapshot);
    }
    return snapshots.slice(0, 24);
  }

  function findActiveStrategySnapshotByKey(tradeKey = "") {
    const key = clean(tradeKey);
    if (!key) return null;
    return activeStrategySnapshots().find((item) => clean(item?.trade_key || "") === key) || null;
  }

  function primeActiveStrategyContextFromSnapshot(snapshot) {
    if (!snapshot?.legs?.length) return false;
    const qty = Number(snapshot.order_qty);
    const entryPriceRupee = Number(snapshot.entry_price_once);
    const entryPricePaise = Number.isFinite(entryPriceRupee) ? Math.round(entryPriceRupee * 100) : null;

    latestTrackedStrategyState = {
      symbol: snapshot.symbol || "",
      strategy: snapshot.strategy || "",
      target_delta: snapshot.target_delta,
      selected_at: snapshot.entry_at || snapshot.updated_at || new Date().toISOString(),
      pair_number: snapshot.pair_number,
      requested_order_qty: Number.isFinite(qty) && qty > 0 ? qty : null,
      baseline: latestTrackedStrategyState?.baseline || {},
      legs: Array.isArray(snapshot.legs) ? snapshot.legs.map((leg) => ({ ...leg })) : [],
      source: latestTrackedStrategyState?.source || {},
    };
    saveScopedJson(S.trackedStrategyState, latestTrackedStrategyState, ORDER_ENV);

    latestBasketSubmitState = {
      environment: envLabel(ORDER_ENV),
      requested_at_ist: snapshot.entry_at || formatIstDateTime(new Date()),
      request: {
        tag: snapshot.basket_tag || "",
        orders: [
          {
            order_qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
          },
        ],
        basket_params: Number.isFinite(entryPricePaise)
          ? { entry_price: entryPricePaise }
          : {},
      },
      response: latestBasketSubmitState?.response || {},
      basket_id: hasCellValue(snapshot.basket_id) ? snapshot.basket_id : null,
      tag: snapshot.basket_tag || "",
      entry_price_once: entryPricePaise,
      entry_price_confirmed: Boolean(snapshot.entry_price_confirmed),
      entry_price_source: snapshot.entry_price_source || "",
      portfolio_before_stats: snapshot.portfolio_before_stats || null,
      basket_status: snapshot.basket_status || "",
    };
    saveScopedJson(S.basketSubmitState, latestBasketSubmitState, ORDER_ENV);

    if (!latestDeployPreviewState || !Number.isFinite(Number(latestDeployPreviewState?.requested_order_qty))) {
      latestDeployPreviewState = {
        ...(latestDeployPreviewState || {}),
        environment: envLabel(ORDER_ENV),
        requested_order_qty: Number.isFinite(qty) && qty > 0 ? qty : null,
        signed_entry_price_raw: entryPricePaise,
      };
      saveScopedJson(S.deployPreviewState, latestDeployPreviewState, ORDER_ENV);
    }
    return true;
  }

  function setActiveStrategiesResponse() {
    if (!U?.activeStrategiesResponse) return;
    const states = activeStrategySnapshots();
    if (!states.length) {
      U.activeStrategiesResponse.className = "active-strategies-empty";
      U.activeStrategiesResponse.textContent = "No live strategy yet.";
      setTrackedPreviewResponse();
      return;
    }
    U.activeStrategiesResponse.className = "active-strategies-list";
    clearChildren(U.activeStrategiesResponse);
    const fragment = document.createDocumentFragment();
    for (const state of states) {
      const pnlClass = activeStrategyPnlClass(state.live_pnl);
      const pnlText = formatActiveStrategyPnl(state.live_pnl);
      const strategyText = [
        state.strategy || "-",
        hasCellValue(state.target_delta) ? `Delta ${state.target_delta}` : "",
      ].filter(Boolean).join(" | ");
      const article = document.createElement("article");
      article.className = "active-strategy-rail";

      const main = document.createElement("div");
      main.className = "active-rail-main";
      const title = document.createElement("div");
      title.className = "active-rail-title";
      appendTextNode(title, "span", "active-rail-symbol", state.symbol || "-");
      appendTextNode(title, "span", "active-rail-strategy", strategyText);
      const meta = document.createElement("div");
      meta.className = "active-rail-meta";
      appendActiveRailChip(meta, "Qty", hasCellValue(state.order_qty) ? state.order_qty : "-");
      appendActiveRailChip(meta, "Entry", formatDisplayDateTime(state.entry_at));
      main.appendChild(title);
      main.appendChild(meta);

      const pnlWrap = document.createElement("div");
      pnlWrap.className = "active-rail-pnl";
      appendTextNode(pnlWrap, "span", "active-rail-pnl-label", "Live P&L");
      appendTextNode(
        pnlWrap,
        "span",
        pnlClass ? `active-rail-pnl-value ${pnlClass}` : "active-rail-pnl-value",
        pnlText
      );

      const action = document.createElement("button");
      action.type = "button";
      action.className = "active-rail-action";
      action.setAttribute("data-action", "square-off-active");
      action.setAttribute("data-trade-key", state.trade_key || "");
      action.textContent = state.actionLabel;
      action.disabled = Boolean(state.actionDisabled);

      article.appendChild(main);
      article.appendChild(pnlWrap);
      article.appendChild(action);
      fragment.appendChild(article);
    }
    U.activeStrategiesResponse.appendChild(fragment);
    setTrackedPreviewResponse();
  }

  function saveSingleTradeBookState() {
    saveScopedJson(S.singleTradeBookState, latestSingleTradeBookState, ORDER_ENV);
  }

  function liveSingleTrades() {
    const items = Array.isArray(latestSingleTradeBookState) ? latestSingleTradeBookState : [];
    return items.filter((item) => !item?.closed && item?.status !== "failed");
  }

  function formatSingleTradeStatus(trade) {
    const status = upper(trade?.status || "");
    if (status === "OPEN") return "Open";
    if (status === "ENTRY_PENDING") return "Entry Pending";
    if (status === "EXIT_PENDING") return "Exit Pending";
    if (status === "CLOSED") return "Closed";
    if (status === "FAILED") return "Failed";
    return trade?.status || "-";
  }

  function singleTradePositionSideText(trade) {
    return upper(trade?.entry_order_side) === "ORDER_SIDE_SELL" ? "Short" : "Long";
  }

  function formatPriceInputValue(paiseValue) {
    const n = Number(paiseValue);
    if (!Number.isFinite(n) || n <= 0) return "";
    return Number(paiseToRupee(n)).toFixed(2);
  }

  function setSingleTradesResponse() {
    if (!U?.singleTradesResponse) return;
    const trades = liveSingleTrades();
    if (!trades.length) {
      U.singleTradesResponse.className = "active-strategies-empty";
      U.singleTradesResponse.textContent = "No live single trade yet.";
      return;
    }
    U.singleTradesResponse.className = "single-trade-list";
    clearChildren(U.singleTradesResponse);
    const fragment = document.createDocumentFragment();
    for (const trade of trades.slice(0, 12)) {
      const article = document.createElement("article");
      article.className = "single-trade-card";
      article.setAttribute("data-trade-id", trade.id || "");

      const head = document.createElement("div");
      head.className = "single-trade-head";
      const headLeft = document.createElement("div");
      appendTextNode(headLeft, "h3", "trade-card-title", `${trade.symbol || "-"} | ${singleTradePositionSideText(trade)}`);
      appendTextNode(headLeft, "div", "trade-card-time", trade.opened_at || trade.requested_at_ist || "");
      const pnlNode = document.createElement("div");
      const pnlClass = activeStrategyPnlClass(trade.live_pnl_rupee);
      pnlNode.className = pnlClass ? `trade-card-pnl ${pnlClass}` : "trade-card-pnl";
      pnlNode.textContent = formatActiveStrategyPnl(trade.live_pnl_rupee);
      head.appendChild(headLeft);
      head.appendChild(pnlNode);

      const body = document.createElement("div");
      body.className = "single-trade-body";

      const statGrid = document.createElement("div");
      statGrid.className = "trade-stat-grid";
      appendTradeStat(statGrid, "Status", formatSingleTradeStatus(trade));
      appendTradeStat(statGrid, "Qty", hasCellValue(trade?.open_qty) ? trade.open_qty : (trade?.order_qty || "-"));
      appendTradeStat(statGrid, "Entry", hasCellValue(trade?.entry_fill_price_paise) ? paiseToRupee(trade.entry_fill_price_paise) : "-");
      appendTradeStat(statGrid, "LTP", hasCellValue(trade?.ltp_paise) ? paiseToRupee(trade.ltp_paise) : "-");
      appendTradeStat(statGrid, "Target", hasCellValue(trade?.target_price_paise) ? paiseToRupee(trade.target_price_paise) : "-");
      appendTradeStat(statGrid, "SL", hasCellValue(trade?.sl_trigger_price_paise) ? paiseToRupee(trade.sl_trigger_price_paise) : "-");
      body.appendChild(statGrid);

      const chips = document.createElement("div");
      chips.className = "single-trade-meta";
      for (const text of [
        `ref_id ${trade.ref_id || "-"}`,
        trade.exchange || "NSE",
        trade.tag ? `tag ${trade.tag}` : "",
        trade.sl_order_id ? `SL order ${trade.sl_order_id}` : "",
      ].filter(Boolean)) {
        appendTextNode(chips, "span", "single-trade-chip", text);
      }
      body.appendChild(chips);

      const controls = document.createElement("div");
      controls.className = "single-trade-controls";

      const targetWrap = document.createElement("div");
      targetWrap.className = "single-trade-control";
      appendTextNode(targetWrap, "label", "", "Managed Target");
      const targetRow = document.createElement("div");
      targetRow.className = "single-trade-input-row";
      const targetInput = document.createElement("input");
      targetInput.type = "number";
      targetInput.min = "0";
      targetInput.step = "0.05";
      targetInput.value = formatPriceInputValue(trade.target_price_paise);
      targetInput.placeholder = "Price";
      targetInput.setAttribute("data-input", "target");
      targetInput.setAttribute("data-trade-id", trade.id || "");
      const targetBtn = document.createElement("button");
      targetBtn.type = "button";
      targetBtn.className = "secondary";
      targetBtn.setAttribute("data-action", "save-single-target");
      targetBtn.setAttribute("data-trade-id", trade.id || "");
      targetBtn.textContent = "Save Target";
      targetRow.appendChild(targetInput);
      targetRow.appendChild(targetBtn);
      targetWrap.appendChild(targetRow);
      controls.appendChild(targetWrap);

      const slWrap = document.createElement("div");
      slWrap.className = "single-trade-control";
      appendTextNode(slWrap, "label", "", "Protective Stop Loss");
      const slRow = document.createElement("div");
      slRow.className = "single-trade-input-row";
      const slInput = document.createElement("input");
      slInput.type = "number";
      slInput.min = "0";
      slInput.step = "0.05";
      slInput.value = formatPriceInputValue(trade.sl_trigger_price_paise);
      slInput.placeholder = "Trigger";
      slInput.setAttribute("data-input", "sl");
      slInput.setAttribute("data-trade-id", trade.id || "");
      const slBtn = document.createElement("button");
      slBtn.type = "button";
      slBtn.className = "secondary";
      slBtn.setAttribute("data-action", "add-single-sl");
      slBtn.setAttribute("data-trade-id", trade.id || "");
      const slActive = trade.sl_order_id && !isFilledOrderStatusText(trade.sl_status) && !isDeadOrderStatusText(trade.sl_status);
      slBtn.textContent = slActive ? "SL Active" : "Add SL";
      slBtn.disabled = Boolean(slActive);
      slRow.appendChild(slInput);
      slRow.appendChild(slBtn);
      slWrap.appendChild(slRow);
      controls.appendChild(slWrap);
      body.appendChild(controls);

      const actions = document.createElement("div");
      actions.className = "single-trade-actions";
      const exitBtn = document.createElement("button");
      exitBtn.type = "button";
      exitBtn.className = "secondary";
      exitBtn.setAttribute("data-action", "exit-single-now");
      exitBtn.setAttribute("data-trade-id", trade.id || "");
      exitBtn.textContent = "Exit Now";
      exitBtn.disabled = upper(trade?.status || "") === "EXIT_PENDING";
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "secondary";
      clearBtn.setAttribute("data-action", "clear-single-target");
      clearBtn.setAttribute("data-trade-id", trade.id || "");
      clearBtn.textContent = "Clear Target";
      actions.appendChild(exitBtn);
      actions.appendChild(clearBtn);
      body.appendChild(actions);

      appendTextNode(
        body,
        "div",
        "single-trade-note",
        "Target is plugin-managed while this add-in is running. Protective SL uses a direct stop-loss order in UAT."
      );

      article.appendChild(head);
      article.appendChild(body);
      fragment.appendChild(article);
    }
    U.singleTradesResponse.appendChild(fragment);
  }

  function clearTransientStrategyStates(options = {}) {
    const preserveMessages = Boolean(options.preserveMessages);
    latestDeployPreviewState = null;
    latestBasketSubmitState = null;
    latestSquareOffPreviewState = null;
    latestSquareOffSubmitState = null;
    latestBasketMonitorState = null;

    delScoped(S.deployPreviewState, ORDER_ENV);
    delScoped(S.basketSubmitState, ORDER_ENV);
    delScoped(S.squareOffPreviewState, ORDER_ENV);
    delScoped(S.squareOffSubmitState, ORDER_ENV);
    delScoped(S.basketMonitorState, ORDER_ENV);

    if (!preserveMessages) {
      setDeployPreviewResponse("No deploy basket preview built yet.");
      setBasketSubmitResponse("No basket order submitted yet.");
      setSquareOffPreviewResponse("No square-off preview built yet.");
      setSquareOffSubmitResponse("No square-off order submitted yet.");
      setBasketMonitorResponse("No basket monitor snapshot yet.");
      setDeployPreviewActionMessage("");
      setSquareOffActionMessage("");
      setBasketMonitorActionMessage("");
    }
  }

  function setBasketMonitorActionMessage(message, kind = "error") {
    setFieldMessage(U?.basketMonitorActionMsg, null, message, kind);
  }

  function setBasketMonitorResponse(value) {
    if (!U?.basketMonitorResponse) return;
    if (typeof value === "string") {
      U.basketMonitorResponse.textContent = value;
      return;
    }
    try {
      U.basketMonitorResponse.textContent = JSON.stringify(value, null, 2);
    } catch (_e) {
      U.basketMonitorResponse.textContent = String(value);
    }
  }

  function basketMonitorAutoRefreshEnabled() {
    return U?.basketMonitorAutoRefreshInput ? Boolean(U.basketMonitorAutoRefreshInput.checked) : true;
  }

  function assertUatOnlyOrderAction() {
    if (!isAuthEnv(ORDER_ENV)) {
      throw new Error("Orders require UAT login. Open Orders tab and complete UAT authentication.");
    }
  }

  function appendBasketMonitorHistory(previousState, nextPoint) {
    const history = Array.isArray(previousState?.history) ? previousState.history.slice(-29) : [];
    history.push(nextPoint);
    return history.slice(-30);
  }

  function buildTrackedStrategyStateFromPreview(previewState) {
    if (!previewState?.payload?.legs?.length) return null;
    return {
      symbol: previewState.payload.symbol,
      strategy: previewState.payload.strategy,
      target_delta: previewState.payload.target_delta,
      selected_at: previewState.payload.selected_at,
      pair_number: previewState.payload.pair_number,
      requested_order_qty: null,
      baseline: previewState.payload.baseline_greeks || {},
      legs: previewState.payload.legs || [],
      source: previewState.source || {},
    };
  }

  function trackedLotSizes(trackedState) {
    return Array.from(new Set((trackedState?.legs || [])
      .map((leg) => Number(leg.lot_size))
      .filter((lot) => Number.isInteger(lot) && lot > 0)));
  }

  function validateTrackedOrderQty(trackedState, requestedOrderQty) {
    const lots = trackedLotSizes(trackedState);
    if (requestedOrderQty === null || requestedOrderQty === undefined || requestedOrderQty === "") {
      return { ok: true, qty: lots[0] || 65, auto: true };
    }
    const qty = Number(requestedOrderQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error("Requested order quantity must be a positive integer.");
    }
    for (const lot of lots) {
      if (lot > 0 && qty % lot !== 0) {
        throw new Error(`order_qty=${qty} must be multiple of lot_size=${lot}.`);
      }
    }
    return { ok: true, qty, auto: false };
  }

  function buildDeployPayloadFromTracked(trackedState, requestedOrderQty = null) {
    if (!trackedState?.legs?.length) return null;
    hydrateTrackedLegsFromLive(trackedState);
    const qtyInfo = validateTrackedOrderQty(trackedState, requestedOrderQty);
    const strategyName = String(trackedState.strategy || "strategy").trim().toLowerCase() || "strategy";
    const strategySlug = strategyName.replace(/[^a-z0-9_]+/gi, "_");
    const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "T");
    const unique = Math.random().toString(16).slice(2, 8);
    const tagBase = `${strategySlug}_${ts}_${unique}`;
    return {
      symbol: trackedState.symbol,
      asset: String(trackedState.symbol || "").split(":")[0] || trackedState.source?.asset || "",
      expiry: String(trackedState.symbol || "").split(":")[1] || trackedState.source?.expiry || "",
      strategy: trackedState.strategy,
      target_delta: trackedState.target_delta,
      pair_number: trackedState.pair_number,
      selected_at: trackedState.selected_at,
      baseline_greeks: trackedState.baseline || {},
      deploy_requested_at: new Date().toISOString(),
      strategy_tag_base: tagBase,
      entry_tag: `${tagBase}_entry`,
      exit_tag: `${tagBase}_exit`,
      order_qty: qtyInfo.qty,
      legs: (trackedState.legs || []).map((leg) => ({
        side: upper(leg.side || "SELL"),
        option_type: upper(leg.option_type || ""),
        ref_id: hasCellValue(leg.ref_id) ? Number(leg.ref_id) : null,
        strike_raw: Number(leg.strike_raw || 0),
        strike: hasCellValue(leg.strike) ? String(leg.strike) : "",
      })),
    };
  }

  function signedEntryPriceFromTracked(trackedState, signStyle = "sell_positive") {
    if (!trackedState?.legs?.length) return null;
    let total = 0;
    let seen = false;
    for (const leg of trackedState.legs) {
      const ltp = Number(leg.ltp);
      if (!Number.isFinite(ltp)) continue;
      const side = upper(leg.side || "SELL");
      if (signStyle === "sell_positive") {
        total += side === "SELL" ? ltp : -ltp;
      } else {
        total += side === "BUY" ? ltp : -ltp;
      }
      seen = true;
    }
    return seen ? total : null;
  }

  function signedExitPriceFromTracked(trackedState, signStyle = "buy_positive") {
    if (!trackedState?.legs?.length) return null;
    let total = 0;
    let seen = false;
    for (const leg of trackedState.legs) {
      const ltp = Number(leg.ltp);
      if (!Number.isFinite(ltp)) continue;
      const exitSide = upper(leg.side || "SELL") === "BUY" ? "SELL" : "BUY";
      if (signStyle === "buy_positive") {
        total += exitSide === "BUY" ? ltp : -ltp;
      } else {
        total += exitSide === "SELL" ? ltp : -ltp;
      }
      seen = true;
    }
    return seen ? total : null;
  }

  function applySignedPriceBuffer(rawPrice, bps = 0, signStyle = "sell_positive") {
    const raw = Number(rawPrice);
    const bpsNum = Number(bps || 0);
    if (!Number.isFinite(raw) || !Number.isFinite(bpsNum) || bpsNum <= 0) return raw;
    const ratio = bpsNum / 10000;
    const abs = Math.abs(raw);
    if (!Number.isFinite(abs) || abs <= 0) return raw;
    let nextAbs = abs;
    if (signStyle === "sell_positive") {
      // Credit: accept a little less. Debit: pay a little more.
      nextAbs = raw >= 0 ? abs * (1 - ratio) : abs * (1 + ratio);
    } else {
      // Debit: pay a little more. Credit: accept a little less.
      nextAbs = raw >= 0 ? abs * (1 + ratio) : abs * (1 - ratio);
    }
    const signed = raw >= 0 ? nextAbs : -nextAbs;
    return Math.round(signed);
  }

  function normalizeTickSizePaise(rawValue) {
    const raw = Number(rawValue);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    if (Number.isInteger(raw) && raw >= 1) return raw;
    return Math.max(1, Math.round(raw * 100));
  }

  function defaultTickSizePaiseForInstrument(instrument, exchange = "NSE") {
    const explicit = normalizeTickSizePaise(
      instrument?.tick_size_paise
      ?? instrument?.tick_size
      ?? instrument?.price_tick
      ?? instrument?.tick
    );
    if (Number.isInteger(explicit) && explicit > 0) return explicit;
    const ex = upper(exchange || instrument?.exchange || "NSE");
    if (ex === "NSE" || ex === "BSE") return 5;
    return 1;
  }

  function parseTickSizeInputToPaise(value) {
    const n = Number(clean(value));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.max(1, Math.round(n * 100));
  }

  function alignPriceToTick(pricePaise, tickSizePaise, orderSide = "") {
    const raw = Number(pricePaise);
    const tick = Number(tickSizePaise);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    if (!Number.isInteger(Math.round(tick)) || Math.round(tick) <= 0) return Math.round(raw);
    const roundedTick = Math.round(tick);
    const side = upper(orderSide || "");
    const units = raw / roundedTick;
    let nextUnits = Math.round(units);
    if (side === "ORDER_SIDE_BUY") nextUnits = Math.ceil(units);
    else if (side === "ORDER_SIDE_SELL") nextUnits = Math.floor(units);
    return Math.max(roundedTick, nextUnits * roundedTick);
  }

  function oppositeOrderSideForLeg(legSide) {
    return upper(legSide) === "BUY" ? "ORDER_SIDE_SELL" : "ORDER_SIDE_BUY";
  }

  function signedQtyFromPositionRow(row) {
    const explicitNetQty = Number(row?.net_qty);
    if (Number.isFinite(explicitNetQty) && explicitNetQty !== 0) {
      return Math.trunc(explicitNetQty);
    }
    const rawQty = Number(row?.qty ?? row?.quantity ?? 0);
    if (!Number.isFinite(rawQty) || rawQty === 0) return 0;
    const side = upper(row?.order_side || row?.side || "");
    if (side.includes("SELL")) return -Math.trunc(rawQty);
    if (side.includes("BUY")) return Math.trunc(rawQty);
    return Math.trunc(rawQty);
  }

  function positionsRowsFromPortfolio(portfolio, options = {}) {
    const includeClosed = Boolean(options.includeClosed);
    const groups = includeClosed
      ? ["stock_positions", "fut_positions", "opt_positions", "close_positions"]
      : ["stock_positions", "fut_positions", "opt_positions"];
    const rows = [];
    for (const key of groups) {
      const arr = Array.isArray(portfolio?.[key]) ? portfolio[key] : [];
      for (const row of arr) rows.push(row);
    }
    return rows;
  }

  function netQtyByRefFromPortfolio(portfolio, refIds, options = {}) {
    const wanted = new Set((refIds || []).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0));
    const out = new Map();
    for (const row of positionsRowsFromPortfolio(portfolio, options)) {
      const refId = Number(row?.ref_id);
      if (!Number.isInteger(refId) || refId <= 0 || (wanted.size && !wanted.has(refId))) continue;
      out.set(refId, (out.get(refId) || 0) + signedQtyFromPositionRow(row));
    }
    return out;
  }

  function computeSafeSquareOffOrders(trackedState, portfolio) {
    if (!trackedState?.legs?.length) throw new Error("Track a strategy before building square-off preview.");
    const qtyInfo = validateTrackedOrderQty(trackedState, trackedState.requested_order_qty);
    const desiredExitOrders = (trackedState.legs || [])
      .map((leg) => ({
        ref_id: Number(leg.ref_id),
        order_qty: qtyInfo.qty,
        order_side: oppositeOrderSideForLeg(leg.side),
        side: upper(leg.side || ""),
      }))
      .filter((order) => Number.isInteger(order.ref_id) && order.ref_id > 0);
    if (!desiredExitOrders.length) {
      throw new Error("Tracked strategy has no valid ref_id legs for square off.");
    }

    const netByRef = netQtyByRefFromPortfolio(portfolio, desiredExitOrders.map((x) => x.ref_id));
    const safeExitOrders = [];
    const netTargets = [];
    for (const order of desiredExitOrders) {
      const baselineNet = Number(netByRef.get(order.ref_id) || 0);
      const desiredQty = Number(order.order_qty);
      let closableQty = 0;
      let requiredChange = 0;
      if (order.order_side === "ORDER_SIDE_BUY") {
        if (baselineNet < 0) {
          closableQty = Math.min(desiredQty, Math.abs(baselineNet));
          requiredChange = closableQty;
        }
      } else if (order.order_side === "ORDER_SIDE_SELL") {
        if (baselineNet > 0) {
          closableQty = Math.min(desiredQty, Math.abs(baselineNet));
          requiredChange = -closableQty;
        }
      }
      if (closableQty <= 0) continue;
      safeExitOrders.push({
        ref_id: order.ref_id,
        order_qty: closableQty,
        order_side: order.order_side,
      });
      netTargets.push({
        ref_id: order.ref_id,
        baseline_net: baselineNet,
        required_change: requiredChange,
      });
    }
    return { requested_order_qty: qtyInfo.qty, safe_exit_orders: safeExitOrders, net_targets: netTargets };
  }

  async function fetchPortfolioSnapshot() {
    if (!isAuthEnv(ORDER_ENV)) throw new Error(`Please login to ${envLabel(ORDER_ENV)} first.`);
    const data = await req("/portfolio/positions", { token: "session", envOverride: ORDER_ENV });
    return data?.portfolio || {};
  }

  function singleTradeById(tradeId) {
    return (Array.isArray(latestSingleTradeBookState) ? latestSingleTradeBookState : []).find((item) => clean(item?.id || "") === clean(tradeId)) || null;
  }

  function upsertSingleTrade(trade) {
    if (!trade?.id) return;
    const current = Array.isArray(latestSingleTradeBookState) ? latestSingleTradeBookState.slice() : [];
    const idx = current.findIndex((item) => clean(item?.id || "") === clean(trade.id));
    if (idx >= 0) current[idx] = { ...current[idx], ...trade };
    else current.unshift(trade);
    latestSingleTradeBookState = current.slice(0, 40);
    saveSingleTradeBookState();
    setSingleTradesResponse();
    syncSingleTradeQuotePoller();
  }

  async function refreshSingleTradeQuotes(options = {}) {
    const silent = Boolean(options.silent);
    if (!isAuthEnv(ORDER_ENV)) return [];
    const trades = liveSingleTrades().filter((trade) => !trade?.closed && upper(trade?.status || "") !== "FAILED");
    if (!trades.length) return [];

    const updatedTrades = await Promise.all(trades.map(async (trade) => {
      const quote = await resolveSingleOrderLtpPaise(trade.ref_id, trade.symbol, trade.exchange).catch(() => null);
      if (!Number.isFinite(Number(quote?.ltpPaise)) || Number(quote.ltpPaise) <= 0) return trade;
      const nextTrade = {
        ...trade,
        ltp_paise: Math.round(Number(quote.ltpPaise)),
        ltp_source: clean(quote?.source || trade?.ltp_source || ""),
      };
      nextTrade.live_pnl_rupee = singleTradeLivePnlRupee(nextTrade, null);
      return nextTrade;
    }));

    const existing = Array.isArray(latestSingleTradeBookState) ? latestSingleTradeBookState.slice() : [];
    latestSingleTradeBookState = existing.map((item) => {
      const match = updatedTrades.find((trade) => clean(trade?.id || "") === clean(item?.id || ""));
      return match ? { ...item, ...match } : item;
    });
    saveSingleTradeBookState();
    setSingleTradesResponse();
    if (!silent) setSingleTradeActionMessage("Single trade quotes refreshed.", "success");
    return updatedTrades;
  }

  function stopSingleTradeQuotePoller() {
    if (singleTradeQuoteTimer) {
      clearInterval(singleTradeQuoteTimer);
      singleTradeQuoteTimer = null;
    }
  }

  function syncSingleTradeQuotePoller() {
    stopSingleTradeQuotePoller();
    if (!isAuthEnv(ORDER_ENV) || !liveSingleTrades().length) return;
    singleTradeQuoteTimer = setInterval(() => {
      refreshSingleTradeQuotes({ silent: true }).catch(() => null);
    }, 2000);
    void refreshSingleTradeQuotes({ silent: true }).catch(() => null);
  }

  function singleTradeTag(baseTag, suffix) {
    const safeBase = clean(baseTag || "single_trade").replace(/[^a-z0-9_:-]+/gi, "_");
    return `${safeBase}_${suffix}_${Date.now()}`;
  }

  function singleTradeTargetHit(trade, ltpPaise) {
    const target = Number(trade?.target_price_paise);
    if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(Number(ltpPaise))) return false;
    if (upper(trade?.entry_order_side) === "ORDER_SIDE_SELL") return Number(ltpPaise) <= target;
    return Number(ltpPaise) >= target;
  }

  function singleTradeStoplossOrderPrice(triggerPricePaise, exitOrderSide) {
    const trigger = Number(triggerPricePaise);
    if (!Number.isInteger(Math.round(trigger)) || trigger <= 0) return null;
    const triggerInt = Math.round(trigger);
    const side = upper(exitOrderSide || "ORDER_SIDE_SELL");
    if (side === "ORDER_SIDE_SELL") {
      return Math.max(1, applySignedPriceBuffer(triggerInt, SINGLE_ORDER_LTP_BUFFER_BPS, "sell_positive"));
    }
    return Math.max(1, applySignedPriceBuffer(triggerInt, SINGLE_ORDER_LTP_BUFFER_BPS, "buy_positive"));
  }

  async function fetchOrderDetailById(orderId) {
    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) return null;
    try {
      return await req(`/orders/${id}`, {
        token: "session",
        envOverride: ORDER_ENV,
        // This endpoint can return 403 for order-level visibility without meaning the
        // whole trading session has expired, so do not auto-log the user out.
        skipAutoAuthInvalidation: true,
      });
    } catch (_e) {
      return null;
    }
  }

  function normalizeOrderCollection(response) {
    if (Array.isArray(response?.root)) return response.root;
    if (Array.isArray(response?.orders)) return response.orders;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response)) return response;
    return [];
  }

  async function fetchOrdersByTag(tag) {
    const token = clean(tag);
    if (!token) return [];
    try {
      const response = await req(`/orders/v2?tag=${encodeURIComponent(token)}`, { token: "session", envOverride: ORDER_ENV });
      return normalizeOrderCollection(response);
    } catch (_e) {
      return [];
    }
  }

  function findSingleOrderRecordByTag(orders, tag, side, refId) {
    const wantedTag = clean(tag);
    const wantedSide = upper(side || "");
    const wantedRef = Number(refId);
    const rows = Array.isArray(orders) ? orders : [];
    for (const row of rows) {
      const rowTag = clean(row?.tag || "");
      const rowSide = upper(row?.order_side || row?.side || "");
      const rowRef = Number(row?.ref_id);
      if (wantedTag && rowTag && rowTag !== wantedTag) continue;
      if (wantedSide && rowSide && rowSide !== wantedSide) continue;
      if (Number.isInteger(wantedRef) && wantedRef > 0 && Number.isInteger(rowRef) && rowRef > 0 && rowRef !== wantedRef) continue;
      return row;
    }
    return rows[0] || null;
  }

  function orderDetailStatusText(detail) {
    return upper(pickToken(detail || {}, ["order_status", "status", "state", "message", "order_state"]));
  }

  function isFilledOrderStatusText(statusText) {
    const status = upper(statusText || "");
    return status.includes("FILL") || status.includes("TRADE") || status.includes("COMPLETE") || status.includes("EXECUT");
  }

  function isDeadOrderStatusText(statusText) {
    const status = upper(statusText || "");
    return status.includes("REJECT") || status.includes("CANCEL") || status.includes("FAIL");
  }

  function orderDetailAvgPrice(detail) {
    const candidates = [
      pickToken(detail || {}, ["avg_price", "average_price", "fill_price", "executed_price", "trade_price"]),
      pickToken(detail?.order || {}, ["avg_price", "average_price", "fill_price", "executed_price", "trade_price"]),
    ];
    for (const item of candidates) {
      const n = Number(item);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    return null;
  }

  function orderRecordStatusText(detail) {
    return upper(pickToken(detail || {}, ["order_status", "status", "state", "message", "order_state"]));
  }

  function orderRecordAvgPrice(detail) {
    const candidates = [
      pickToken(detail || {}, ["avg_price", "average_price", "fill_price", "executed_price", "trade_price", "buy_avg", "sell_avg"]),
    ];
    for (const item of candidates) {
      const n = Number(item);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    return null;
  }

  function findPositionRowForSingleTrade(portfolio, trade) {
    const side = upper(trade?.entry_order_side || "ORDER_SIDE_BUY");
    const wantedSign = side === "ORDER_SIDE_SELL" ? -1 : 1;
    const rows = positionsRowsFromPortfolio(portfolio || {}, { includeClosed: false });
    for (const row of rows) {
      const refId = Number(row?.ref_id);
      if (!Number.isInteger(refId) || refId <= 0 || refId !== Number(trade?.ref_id)) continue;
      const signedQty = signedQtyFromPositionRow(row);
      if (signedQty === 0) continue;
      if (Math.sign(signedQty) !== wantedSign) continue;
      return row;
    }
    return null;
  }

  function singleTradeLivePnlRupee(trade, positionRow) {
    const avgPrice = Number(positionRow?.avg_price ?? trade?.entry_fill_price_paise);
    const ltp = Number(trade?.ltp_paise ?? positionRow?.ltp ?? positionRow?.last_traded_price);
    const qty = Math.abs(Number(positionRow?.qty ?? positionRow?.quantity ?? trade?.open_qty ?? trade?.order_qty));
    const baselineLtp = Number(trade?.pnl_anchor_ltp_paise);
    const baselinePnl = Number(trade?.pnl_anchor_live_pnl_rupee);
    let computed = null;
    if (
      clean(trade?.pnl_anchor_mode) === "broker_running"
      && Number.isFinite(baselineLtp)
      && baselineLtp > 0
      && Number.isFinite(baselinePnl)
      && Number.isFinite(ltp)
      && Number.isFinite(qty)
      && qty > 0
    ) {
      const deltaPnl = upper(trade?.entry_order_side) === "ORDER_SIDE_SELL"
        ? round2(((baselineLtp - ltp) * qty) / 100)
        : round2(((ltp - baselineLtp) * qty) / 100);
      computed = round2(baselinePnl + deltaPnl);
    }
    if (Number.isFinite(avgPrice) && Number.isFinite(ltp) && Number.isFinite(qty) && qty > 0) {
      const entryComputed = upper(trade?.entry_order_side) === "ORDER_SIDE_SELL"
        ? round2(((avgPrice - ltp) * qty) / 100)
        : round2(((ltp - avgPrice) * qty) / 100);
      if (clean(trade?.pnl_anchor_mode) !== "broker_running") {
        computed = entryComputed;
      }
    }
    const brokerPnl = normalizeBrokerPnlToRupee(positionRow?.pnl ?? positionRow?.live_pnl ?? positionRow?.unrealised_pnl, computed);
    return Number.isFinite(computed) ? computed : brokerPnl;
  }

  function seedSingleTradePnlAnchor(trade, positionRow) {
    const nextTrade = { ...trade };
    const qty = Math.abs(Number(positionRow?.qty ?? positionRow?.quantity ?? nextTrade?.open_qty ?? nextTrade?.order_qty));
    const ltp = Number(nextTrade?.ltp_paise ?? positionRow?.ltp ?? positionRow?.last_traded_price);
    const avgPrice = Number(positionRow?.avg_price ?? nextTrade?.entry_fill_price_paise);
    const brokerPnl = normalizeBrokerPnlToRupee(positionRow?.pnl ?? positionRow?.live_pnl ?? positionRow?.unrealised_pnl, null);
    const hasRunningPnl = Number.isFinite(brokerPnl) && Math.abs(brokerPnl) > 0.009;

    if (Number.isFinite(avgPrice) && avgPrice > 0) {
      nextTrade.entry_fill_price_paise = Math.round(avgPrice);
    }
    if (Number.isFinite(ltp) && ltp > 0) {
      nextTrade.ltp_paise = Math.round(ltp);
    }
    if (Number.isFinite(qty) && qty > 0) {
      nextTrade.open_qty = qty;
    }
    if (clean(nextTrade?.pnl_anchor_mode)) {
      return nextTrade;
    }
    if (hasRunningPnl && Number.isFinite(ltp) && ltp > 0 && Number.isFinite(qty) && qty > 0) {
      nextTrade.pnl_anchor_mode = "broker_running";
      nextTrade.pnl_anchor_live_pnl_rupee = round2(brokerPnl);
      nextTrade.pnl_anchor_ltp_paise = Math.round(ltp);
      nextTrade.pnl_anchor_entry_price_paise = Number.isFinite(avgPrice) && avgPrice > 0 ? Math.round(avgPrice) : null;
      nextTrade.pnl_anchor_seeded_at = formatIstDateTime(new Date());
      return nextTrade;
    }
    nextTrade.pnl_anchor_mode = "fresh_zero";
    nextTrade.pnl_anchor_live_pnl_rupee = 0;
    nextTrade.pnl_anchor_ltp_paise = Number.isFinite(ltp) && ltp > 0 ? Math.round(ltp) : null;
    nextTrade.pnl_anchor_entry_price_paise = Number.isFinite(avgPrice) && avgPrice > 0 ? Math.round(avgPrice) : null;
    nextTrade.pnl_anchor_seeded_at = formatIstDateTime(new Date());
    return nextTrade;
  }

  async function submitSingleTradeExitOrder(trade, reason = "manual_exit") {
    const qty = Number(trade?.open_qty || trade?.order_qty || 0);
    if (!Number.isInteger(qty) || qty <= 0) throw new Error("No open quantity available for exit.");
    const exitOrderSide = upper(trade?.entry_order_side) === "ORDER_SIDE_SELL" ? "ORDER_SIDE_BUY" : "ORDER_SIDE_SELL";
    const ltpInfo = await resolveSingleOrderLtpPaise(trade.ref_id, trade.symbol, trade.exchange);
    if (!ltpInfo || !Number.isInteger(ltpInfo.ltpPaise) || ltpInfo.ltpPaise <= 0) {
      throw new Error("LTP unavailable for exit order.");
    }
    const bufferStyle = exitOrderSide === "ORDER_SIDE_BUY" ? "buy_positive" : "sell_positive";
    const rawOrderPrice = applySignedPriceBuffer(ltpInfo.ltpPaise, SINGLE_ORDER_LTP_BUFFER_BPS, bufferStyle);
    const tickSizePaise = defaultTickSizePaiseForInstrument(trade, trade.exchange);
    const orderPrice = alignPriceToTick(rawOrderPrice, tickSizePaise, exitOrderSide);
    const payload = {
      ref_id: Number(trade.ref_id),
      order_type: "ORDER_TYPE_REGULAR",
      order_qty: qty,
      order_side: exitOrderSide,
      order_delivery_type: trade.delivery_type || "ORDER_DELIVERY_TYPE_CNC",
      validity_type: trade.validity_type || "DAY",
      price_type: "LIMIT",
      order_price: orderPrice,
      tag: singleTradeTag(trade.tag || trade.symbol || "single_trade", reason),
      exchange: trade.exchange || "NSE",
    };
    const response = await req("/orders/v2/single", {
      method: "POST",
      token: "session",
      envOverride: ORDER_ENV,
      body: payload,
    });
    const exitOrderId = pickToken(response, ["order_id", "orderId", "id"]);
    upsertSingleTrade({
      ...trade,
      status: "exit_pending",
      exit_reason: reason,
      exit_tag: payload.tag,
      exit_order_id: hasCellValue(exitOrderId) ? Number(exitOrderId) : trade.exit_order_id ?? null,
      exit_request: payload,
      exit_response: response,
      exit_requested_at: formatIstDateTime(new Date()),
      tick_size_paise: tickSizePaise,
      target_exit_inflight: reason === "target_hit" ? true : trade.target_exit_inflight,
    });
    pushStrategyEvent({
      label: reason === "target_hit" ? "Target exit submitted" : "Exit submitted",
      symbol: trade.symbol || "",
      strategy: "single_trade",
      qty,
      live_pnl: trade.live_pnl_rupee,
      tone: "info",
      detail: hasCellValue(exitOrderId)
        ? `order_id=${exitOrderId} | tag=${payload.tag}`
        : `tag=${payload.tag}`,
    });
    return { payload, response };
  }

  async function submitSingleTradeStoploss(trade, triggerPricePaise) {
    const qty = Number(trade?.open_qty || trade?.order_qty || 0);
    if (!Number.isInteger(qty) || qty <= 0) throw new Error("No open quantity available for SL.");
    const exitOrderSide = upper(trade?.entry_order_side) === "ORDER_SIDE_SELL" ? "ORDER_SIDE_BUY" : "ORDER_SIDE_SELL";
    const tickSizePaise = defaultTickSizePaiseForInstrument(trade, trade.exchange);
    const trigger = alignPriceToTick(Math.round(Number(triggerPricePaise)), tickSizePaise, exitOrderSide);
    if (!Number.isInteger(trigger) || trigger <= 0) throw new Error("Valid SL trigger price is required.");
    const rawOrderPrice = singleTradeStoplossOrderPrice(trigger, exitOrderSide);
    const orderPrice = alignPriceToTick(rawOrderPrice, tickSizePaise, exitOrderSide);
    if (!Number.isInteger(orderPrice) || orderPrice <= 0) throw new Error("Unable to compute SL order price.");
    const payload = {
      ref_id: Number(trade.ref_id),
      order_type: "ORDER_TYPE_STOPLOSS",
      order_qty: qty,
      order_side: exitOrderSide,
      order_delivery_type: trade.delivery_type || "ORDER_DELIVERY_TYPE_CNC",
      validity_type: "DAY",
      price_type: "LIMIT",
      order_price: orderPrice,
      tag: singleTradeTag(trade.tag || trade.symbol || "single_trade", "sl"),
      exchange: trade.exchange || "NSE",
      algo_params: {
        trigger_price: trigger,
      },
    };
    const response = await req("/orders/v2/single", {
      method: "POST",
      token: "session",
      envOverride: ORDER_ENV,
      body: payload,
    });
    const slOrderId = pickToken(response, ["order_id", "orderId", "id"]);
    upsertSingleTrade({
      ...trade,
      sl_tag: payload.tag,
      sl_order_id: hasCellValue(slOrderId) ? Number(slOrderId) : trade.sl_order_id ?? null,
      sl_trigger_price_paise: trigger,
      sl_order_price_paise: orderPrice,
      tick_size_paise: tickSizePaise,
      sl_status: "submitted",
      sl_response: response,
      sl_requested_at: formatIstDateTime(new Date()),
    });
    pushStrategyEvent({
      label: "SL submitted",
      symbol: trade.symbol || "",
      strategy: "single_trade",
      qty,
      live_pnl: trade.live_pnl_rupee,
      tone: "info",
      detail: hasCellValue(slOrderId)
        ? `trigger ${paiseToRupee(trigger)} | order_id=${slOrderId}`
        : `trigger ${paiseToRupee(trigger)}`,
    });
    return { payload, response };
  }

  async function reconcileSingleTradeBook(options = {}) {
    const silent = Boolean(options.silent);
    if (!isAuthEnv(ORDER_ENV)) return [];
    const trades = liveSingleTrades();
    if (!trades.length) return [];
    const portfolio = await fetchPortfolioSnapshot().catch(() => null);
    const updatedTrades = [];
    for (const originalTrade of trades) {
      const trade = { ...originalTrade };
      const positionRow = portfolio ? findPositionRowForSingleTrade(portfolio, trade) : null;
      const positionQty = Math.abs(Number(positionRow?.qty ?? positionRow?.quantity ?? 0));
      const liveLtpInfo = !trade.closed
        ? await resolveSingleOrderLtpPaise(trade.ref_id, trade.symbol, trade.exchange).catch(() => null)
        : null;
      const liveLtpPaise = Number(liveLtpInfo?.ltpPaise);
      const portfolioLtpPaise = Number(positionRow?.ltp ?? positionRow?.last_traded_price);
      if (Number.isFinite(liveLtpPaise) && liveLtpPaise > 0) {
        trade.ltp_paise = Math.round(liveLtpPaise);
        trade.ltp_source = liveLtpInfo?.source || trade.ltp_source || "";
      } else if (Number.isFinite(portfolioLtpPaise) && portfolioLtpPaise > 0) {
        trade.ltp_paise = Math.round(portfolioLtpPaise);
      }
      if (Number.isFinite(positionQty) && positionQty > 0) trade.open_qty = positionQty;
      if (positionRow) {
        const anchoredTrade = seedSingleTradePnlAnchor(trade, positionRow);
        Object.assign(trade, anchoredTrade);
        if (upper(trade.status) === "ENTRY_PENDING" && !trade.event_entry_confirmed_pushed) {
          pushStrategyEvent({
            label: "Single entry confirmed",
            symbol: trade.symbol || "",
            strategy: "single_trade",
            qty: positionQty || trade.order_qty,
            live_pnl: trade.live_pnl_rupee,
            tone: "good",
            detail: Number.isFinite(Number(positionRow?.avg_price))
              ? `avg ${paiseToRupee(positionRow.avg_price)}`
              : "Position is now open.",
          });
          trade.event_entry_confirmed_pushed = true;
        }
        trade.status = upper(trade.status) === "EXIT_PENDING" ? "exit_pending" : "open";
        trade.opened_at = trade.opened_at || formatIstDateTime(new Date());
        const avg = Number(positionRow?.avg_price);
        if (Number.isFinite(avg) && avg > 0) trade.entry_fill_price_paise = Math.round(avg);
        trade.live_pnl_rupee = singleTradeLivePnlRupee(trade, positionRow);
      } else {
        const entryOrders = trade.tag ? await fetchOrdersByTag(trade.tag) : [];
        const entryOrder = findSingleOrderRecordByTag(entryOrders, trade.tag, trade.entry_order_side, trade.ref_id);
        const entryDetail = await fetchOrderDetailById(trade.entry_order_id);
        const entryStatus = orderDetailStatusText(entryDetail) || orderRecordStatusText(entryOrder);
        const entryAvg = orderDetailAvgPrice(entryDetail) || orderRecordAvgPrice(entryOrder);
        if (Number.isFinite(entryAvg) && entryAvg > 0) trade.entry_fill_price_paise = entryAvg;
        if (upper(trade.status) === "ENTRY_PENDING" && isDeadOrderStatusText(entryStatus)) {
          trade.status = "failed";
          trade.failed_at = formatIstDateTime(new Date());
          trade.error = clean(entryStatus || trade.error || "Entry order failed.");
        }
        if (upper(trade.status) === "EXIT_PENDING") {
          const exitOrders = trade?.exit_tag ? await fetchOrdersByTag(trade.exit_tag) : [];
          const exitOrder = findSingleOrderRecordByTag(
            exitOrders,
            trade?.exit_tag || "",
            trade?.exit_request?.order_side || "",
            trade.ref_id
          );
          const exitDetail = await fetchOrderDetailById(trade.exit_order_id);
          const exitStatus = orderDetailStatusText(exitDetail) || orderRecordStatusText(exitOrder);
          const exitAvg = orderDetailAvgPrice(exitDetail) || orderRecordAvgPrice(exitOrder);
          if (isFilledOrderStatusText(exitStatus) || isDeadOrderStatusText(exitStatus) || !positionRow) {
            trade.closed = true;
            trade.status = "closed";
            trade.closed_at = formatIstDateTime(new Date());
            if (Number.isFinite(exitAvg)) trade.exit_fill_price_paise = exitAvg;
            if (!trade.exit_reason) trade.exit_reason = "manual_exit";
            if (Number.isFinite(Number(trade.entry_fill_price_paise)) && Number.isFinite(Number(trade.exit_fill_price_paise))) {
              const signed = upper(trade.entry_order_side) === "ORDER_SIDE_SELL"
                ? (Number(trade.entry_fill_price_paise) - Number(trade.exit_fill_price_paise))
                : (Number(trade.exit_fill_price_paise) - Number(trade.entry_fill_price_paise));
              trade.booked_pnl_rupee = round2((signed * Number(trade.order_qty || 0)) / 100);
            }
            if (!trade.event_closed_pushed) {
              pushStrategyEvent({
                at: trade.closed_at,
                label: "Closed",
                symbol: trade.symbol || "",
                strategy: "single_trade",
                qty: trade.order_qty,
                booked_pnl: trade.booked_pnl_rupee,
                tone: Number(trade.booked_pnl_rupee) >= 0 ? "good" : "bad",
                detail: Number.isFinite(Number(trade.booked_pnl_rupee))
                  ? `Booked P&L ${formatActiveStrategyPnl(trade.booked_pnl_rupee)} (${trade.exit_reason || "single_exit"})`
                  : `Single trade closed (${trade.exit_reason || "single_exit"}).`,
              });
              trade.event_closed_pushed = true;
            }
          }
        }
        if (!trade.closed && trade.sl_order_id) {
          const slOrders = trade?.sl_tag ? await fetchOrdersByTag(trade.sl_tag) : [];
          const slOrder = findSingleOrderRecordByTag(slOrders, trade?.sl_tag || "", "", trade.ref_id);
          const slDetail = await fetchOrderDetailById(trade.sl_order_id);
          const slStatus = orderDetailStatusText(slDetail) || orderRecordStatusText(slOrder);
          trade.sl_status = clean(slStatus || trade.sl_status || "");
          if (isFilledOrderStatusText(slStatus)) {
            trade.closed = true;
            trade.status = "closed";
            trade.closed_at = formatIstDateTime(new Date());
            const exitAvg = orderDetailAvgPrice(slDetail) || orderRecordAvgPrice(slOrder);
            if (Number.isFinite(exitAvg)) trade.exit_fill_price_paise = exitAvg;
            trade.exit_reason = trade.exit_reason || "stop_loss";
            if (Number.isFinite(Number(trade.entry_fill_price_paise)) && Number.isFinite(Number(trade.exit_fill_price_paise))) {
              const signed = upper(trade.entry_order_side) === "ORDER_SIDE_SELL"
                ? (Number(trade.entry_fill_price_paise) - Number(trade.exit_fill_price_paise))
                : (Number(trade.exit_fill_price_paise) - Number(trade.entry_fill_price_paise));
              trade.booked_pnl_rupee = round2((signed * Number(trade.order_qty || 0)) / 100);
            }
            if (!trade.event_closed_pushed) {
              pushStrategyEvent({
                at: trade.closed_at,
                label: "Closed",
                symbol: trade.symbol || "",
                strategy: "single_trade",
                qty: trade.order_qty,
                booked_pnl: trade.booked_pnl_rupee,
                tone: Number(trade.booked_pnl_rupee) >= 0 ? "good" : "bad",
                detail: Number.isFinite(Number(trade.booked_pnl_rupee))
                  ? `Booked P&L ${formatActiveStrategyPnl(trade.booked_pnl_rupee)} (stop_loss)`
                  : "Single trade closed by stop loss.",
              });
              trade.event_closed_pushed = true;
            }
          }
        }
      }
      if (!trade.closed && positionRow && singleTradeTargetHit(trade, trade.ltp_paise) && !trade.target_exit_inflight) {
        try {
          const exitSubmit = await submitSingleTradeExitOrder(trade, "target_hit");
          trade.status = "exit_pending";
          trade.target_exit_inflight = true;
          const exitOrderId = pickToken(exitSubmit?.response || {}, ["order_id", "orderId", "id"]);
          if (hasCellValue(exitOrderId)) trade.exit_order_id = Number(exitOrderId);
        } catch (e) {
          if (!silent) {
            setSingleTradeActionMessage(e.message || String(e));
          }
        }
      }
      updatedTrades.push(trade);
    }
    if (updatedTrades.length) {
      const existing = Array.isArray(latestSingleTradeBookState) ? latestSingleTradeBookState.slice() : [];
      const next = existing.map((item) => {
        const match = updatedTrades.find((trade) => clean(trade?.id || "") === clean(item?.id || ""));
        return match ? { ...item, ...match } : item;
      });
      latestSingleTradeBookState = next;
      saveSingleTradeBookState();
      setSingleTradesResponse();
      syncSingleTradeQuotePoller();
    }
    return updatedTrades;
  }

  function parseDashboardPriceInput(value) {
    const n = Number(clean(value));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }

  async function saveSingleTradeTarget(tradeId, rawValue) {
    const trade = singleTradeById(tradeId);
    if (!trade) throw new Error("Single trade not found.");
    const pricePaise = parseDashboardPriceInput(rawValue);
    if (!Number.isFinite(pricePaise) || pricePaise <= 0) throw new Error("Enter a valid target price.");
    upsertSingleTrade({
      ...trade,
      target_price_paise: pricePaise,
      target_exit_inflight: false,
      target_saved_at: formatIstDateTime(new Date()),
    });
    setSingleTradeActionMessage(`Managed target saved at ${paiseToRupee(pricePaise)}.`, "success");
  }

  async function addSingleTradeStoploss(tradeId, rawValue) {
    assertUatOnlyOrderAction();
    const trade = singleTradeById(tradeId);
    if (!trade) throw new Error("Single trade not found.");
    const pricePaise = parseDashboardPriceInput(rawValue);
    if (!Number.isFinite(pricePaise) || pricePaise <= 0) throw new Error("Enter a valid SL trigger price.");
    setSingleTradeActionMessage("Submitting protective stop-loss order...", "info");
    await submitSingleTradeStoploss(trade, pricePaise);
    setSingleTradeActionMessage(`Protective SL submitted at ${paiseToRupee(pricePaise)}.`, "success");
  }

  function clearSingleTradeTarget(tradeId) {
    const trade = singleTradeById(tradeId);
    if (!trade) throw new Error("Single trade not found.");
    upsertSingleTrade({
      ...trade,
      target_price_paise: null,
      target_exit_inflight: false,
    });
    setSingleTradeActionMessage("Managed target cleared.", "success");
  }

  async function exitSingleTradeNow(tradeId) {
    assertUatOnlyOrderAction();
    const trade = singleTradeById(tradeId);
    if (!trade) throw new Error("Single trade not found.");
    setSingleTradeActionMessage("Submitting exit order...", "info");
    await submitSingleTradeExitOrder(trade, "manual_exit");
    setSingleTradeActionMessage("Exit order submitted.", "success");
  }

  function buildFlexiOrderPreviewFromTracked(trackedState, options = {}) {
    if (!trackedState?.legs?.length) throw new Error("Track a strategy before building deploy basket preview.");
    hydrateTrackedLegsFromLive(trackedState);
    const qtyInfo = validateTrackedOrderQty(trackedState, trackedState.requested_order_qty);
    const priceType = clean(options.priceType || "LIMIT").toUpperCase();
    const deliveryType = clean(options.deliveryType || "ORDER_DELIVERY_TYPE_CNC");
    const multiplier = Number(clean(options.multiplier || "1"));
    if (!Number.isInteger(multiplier) || multiplier <= 0) throw new Error("Multiplier must be a positive integer.");

    const deployPayload = buildDeployPayloadFromTracked(trackedState, qtyInfo.qty);
    const entryPriceRaw = signedEntryPriceFromTracked(trackedState, "sell_positive");
    const entryPriceInt = Number.isFinite(entryPriceRaw) ? Math.round(entryPriceRaw) : null;
    const entryPriceBuffered = Number.isFinite(entryPriceRaw)
      ? applySignedPriceBuffer(entryPriceRaw, ENTRY_LTP_BUFFER_BPS, "sell_positive")
      : null;
    const orders = (trackedState.legs || []).map((leg) => ({
      ref_id: hasCellValue(leg.ref_id) ? Number(leg.ref_id) : null,
      order_qty: qtyInfo.qty,
      order_side: upper(leg.side) === "BUY" ? "ORDER_SIDE_BUY" : "ORDER_SIDE_SELL",
    }));
    if (orders.some((order) => !Number.isInteger(order.ref_id) || order.ref_id <= 0)) {
      throw new Error("All tracked legs must have valid ref_id for flexi order preview.");
    }

    const basketBody = {
      exchange: trackedState.source?.exchange || "NSE",
      basket_name: `Dashboard_${trackedState.strategy}`,
      tag: deployPayload.entry_tag,
      orders,
      basket_params: {
        order_side: "ORDER_SIDE_BUY",
        order_delivery_type: deliveryType,
        price_type: priceType,
        multiplier,
      },
    };
    if (priceType === "LIMIT" && Number.isFinite(entryPriceBuffered)) {
      basketBody.basket_params.entry_price = entryPriceBuffered;
    }

    return {
      environment: envLabel(ORDER_ENV),
      generated_at_ist: formatIstDateTime(new Date()),
      tracked_symbol: trackedState.symbol,
      strategy: trackedState.strategy,
      requested_order_qty: qtyInfo.qty,
      auto_qty: qtyInfo.auto,
      signed_entry_price_raw: entryPriceRaw,
      signed_entry_price_int: entryPriceInt,
      signed_entry_price_buffered_int: entryPriceBuffered,
      deploy_payload: deployPayload,
      flexi_order_request: basketBody,
    };
  }

  function buildSquareOffPreviewPayload(trackedState, safeState, options = {}) {
    if (!trackedState?.legs?.length) throw new Error("Track a strategy before building square-off preview.");
    const safeExitOrders = Array.isArray(safeState?.safe_exit_orders) ? safeState.safe_exit_orders : [];
    if (!safeExitOrders.length) {
      throw new Error("No matching open net position found for square-off legs; blocked to avoid opening new exposure.");
    }
    const multiplier = Number(clean(options.multiplier || "1"));
    if (!Number.isInteger(multiplier) || multiplier <= 0) throw new Error("Multiplier must be a positive integer.");
    const deliveryType = clean(options.deliveryType || "ORDER_DELIVERY_TYPE_CNC");
    const deployPayload = latestDeployPreviewState?.deploy_payload || buildDeployPayloadFromTracked(trackedState, trackedState.requested_order_qty);
    const exitTag = deployPayload?.exit_tag || `dashboard_${String(trackedState.strategy || "strategy").toLowerCase()}_exit`;
    const exitPriceRaw = signedExitPriceFromTracked(trackedState, "buy_positive");
    const exitPriceBuffered = Number.isFinite(exitPriceRaw)
      ? applySignedPriceBuffer(exitPriceRaw, EXIT_LTP_BUFFER_BPS, "buy_positive")
      : null;
    const requestBody = {
      exchange: trackedState.source?.exchange || "NSE",
      basket_name: "Dashboard_SquareOff",
      tag: exitTag,
      orders: safeExitOrders,
      basket_params: {
        order_side: "ORDER_SIDE_BUY",
        order_delivery_type: deliveryType,
        price_type: Number.isFinite(exitPriceBuffered) ? "LIMIT" : "MARKET",
        multiplier,
      },
    };
    if (Number.isFinite(exitPriceBuffered)) {
      requestBody.basket_params.entry_price = exitPriceBuffered;
    }
    return {
      environment: envLabel(ORDER_ENV),
      generated_at_ist: formatIstDateTime(new Date()),
      strategy: trackedState.strategy,
      tracked_symbol: trackedState.symbol,
      original_basket_id: latestBasketSubmitState?.basket_id || null,
      exit_tag: exitTag,
      order_qty: safeState.requested_order_qty,
      net_targets: safeState.net_targets,
      safe_exit_orders: safeExitOrders,
      signed_exit_price_raw: Number.isFinite(exitPriceRaw) ? exitPriceRaw : null,
      signed_exit_price_buffered_int: Number.isFinite(exitPriceBuffered) ? exitPriceBuffered : null,
      square_off_request: requestBody,
    };
  }

  function desiredFilledQtyForOrder(orderSide, basketOrder) {
    if (orderSide === "ORDER_SIDE_BUY") return Number(basketOrder?.buy_qty || 0);
    if (orderSide === "ORDER_SIDE_SELL") return Number(basketOrder?.sell_qty || 0);
    return 0;
  }

  function desiredFillAvgForOrder(orderSide, basketOrder) {
    if (orderSide === "ORDER_SIDE_BUY") return Number(basketOrder?.buy_avg || 0);
    if (orderSide === "ORDER_SIDE_SELL") return Number(basketOrder?.sell_avg || 0);
    return 0;
  }

  function signedFillPriceFromBasketOrders(requestOrders, basketOrdersMap, signStyle = "buy_positive") {
    if (!Array.isArray(requestOrders) || !requestOrders.length) return null;
    let total = 0;
    let seen = false;
    for (const reqOrder of requestOrders) {
      const refId = Number(reqOrder?.ref_id);
      if (!Number.isInteger(refId) || refId <= 0) continue;
      const basketOrder = basketOrdersMap?.[String(refId)] || basketOrdersMap?.[refId] || null;
      if (!basketOrder) return null;
      const expectedQty = Number(reqOrder?.order_qty || 0);
      const filledQty = desiredFilledQtyForOrder(reqOrder?.order_side, basketOrder);
      const avg = desiredFillAvgForOrder(reqOrder?.order_side, basketOrder);
      if (!Number.isFinite(avg) || avg <= 0 || filledQty < expectedQty) return null;
      if (signStyle === "buy_positive") {
        total += reqOrder.order_side === "ORDER_SIDE_BUY" ? avg : -avg;
      } else {
        total += reqOrder.order_side === "ORDER_SIDE_SELL" ? avg : -avg;
      }
      seen = true;
    }
    return seen ? total : null;
  }

  function isBasketFailureStatus(statusText) {
    const status = upper(statusText || "");
    return status.includes("REJECT") || status.includes("CANCEL");
  }

  function isBasketClosedStatus(statusText) {
    const status = upper(statusText || "");
    return status.includes("FILLED") || status.includes("CLOSED");
  }

  function findBasketFromResponse(response, tag, basketId) {
    const baskets = Array.isArray(response?.root) ? response.root : Array.isArray(response) ? response : [];
    if (hasCellValue(basketId)) {
      const matchedById = baskets.find((item) => String(item?.basket_id ?? "") === String(basketId));
      if (matchedById) return matchedById;
    }
    if (tag) {
      const matchedByTag = baskets.find((item) => String(item?.tag || "") === String(tag));
      if (matchedByTag) return matchedByTag;
    }
    return baskets[0] || null;
  }

  function entryPriceOnceFromBasketState(state) {
    const basket = state?.basket_lookup || null;
    const basketOrdersMap = basket?.orders || {};
    const requestOrders = state?.request?.orders || [];
    const fromFills = signedFillPriceFromBasketOrders(requestOrders, basketOrdersMap, "sell_positive");
    if (Number.isFinite(fromFills)) return fromFills;
    const basketEntry = Number(basket?.basket_params?.entry_price);
    if (Number.isFinite(basketEntry)) return basketEntry;
    const basketResponse = state?.response || {};
    const direct = Number(
      pickToken(basketResponse, ["entry_price_once", "strategy_realtime_ltp", "entry_price"])
      || latestDeployPreviewState?.signed_entry_price_raw
    );
    return Number.isFinite(direct) ? direct : null;
  }

  function exitPriceOnceFromSquareOffState(state) {
    const basket = findBasketFromResponse(
      state?.basket_response || {},
      state?.exit_tag || state?.request?.tag || "",
      state?.basket_id
    );
    const basketOrdersMap = basket?.orders || {};
    const requestOrders = state?.request?.orders || [];
    const fromFills = signedFillPriceFromBasketOrders(requestOrders, basketOrdersMap, "buy_positive");
    if (Number.isFinite(fromFills)) return fromFills;
    const basketExit = Number(basket?.basket_params?.entry_price);
    if (Number.isFinite(basketExit)) return basketExit;
    const direct = Number(
      pickToken(state?.response || {}, ["entry_price_once", "strategy_realtime_ltp", "entry_price"])
      || pickToken(state?.basket_response || {}, ["entry_price_once", "strategy_realtime_ltp", "entry_price"])
      || state?.request?.basket_params?.entry_price
      || latestSquareOffPreviewState?.signed_exit_price_buffered_int
    );
    return Number.isFinite(direct) ? direct : null;
  }

  function resolvedEntryPriceState(state) {
    const basket = state?.basket_lookup || null;
    const basketOrdersMap = basket?.orders || {};
    const requestOrders = state?.request?.orders || [];
    const fromFills = signedFillPriceFromBasketOrders(requestOrders, basketOrdersMap, "sell_positive");
    if (Number.isFinite(fromFills)) {
      return { value: fromFills, confirmed: true, source: "basket_fills" };
    }
    const basketEntry = Number(basket?.basket_params?.entry_price);
    if (Number.isFinite(basketEntry)) {
      return { value: basketEntry, confirmed: false, source: "basket_params" };
    }
    const basketResponse = state?.response || {};
    const direct = Number(
      pickToken(basketResponse, ["entry_price_once", "strategy_realtime_ltp", "entry_price"])
      || latestDeployPreviewState?.signed_entry_price_raw
    );
    return Number.isFinite(direct)
      ? { value: direct, confirmed: false, source: "submit_response" }
      : { value: null, confirmed: false, source: "" };
  }

  function portfolioStatsRupeeSnapshot(portfolio, capturedAt = formatIstDateTime(new Date())) {
    const stats = portfolio?.position_stats || {};
    return {
      captured_at: capturedAt,
      realised_pnl: Number(paiseToRupee(stats?.realised_pnl)),
      unrealised_pnl: Number(paiseToRupee(stats?.unrealised_pnl)),
      total_pnl: Number(paiseToRupee(stats?.total_pnl)),
    };
  }

  function portfolioPnlDeltaRupee(beforeStats, afterStats) {
    const beforeRealised = Number(beforeStats?.realised_pnl);
    const afterRealised = Number(afterStats?.realised_pnl);
    if (Number.isFinite(beforeRealised) && Number.isFinite(afterRealised)) {
      return round2(afterRealised - beforeRealised);
    }
    const beforeTotal = Number(beforeStats?.total_pnl);
    const afterTotal = Number(afterStats?.total_pnl);
    if (Number.isFinite(beforeTotal) && Number.isFinite(afterTotal)) {
      return round2(afterTotal - beforeTotal);
    }
    return null;
  }

  function buildClosedTradeRecord() {
    if (!latestTrackedStrategyState?.legs?.length) return null;
    if (!latestBasketSubmitState?.request) return null;
    if (!latestSquareOffSubmitState?.request || latestSquareOffSubmitState.status !== "filled") return null;

    const entryPriceOnce = entryPriceOnceFromBasketState(latestBasketSubmitState);
    const exitPriceOnce = exitPriceOnceFromSquareOffState(latestSquareOffSubmitState);
    const qty = Number(
      latestDeployPreviewState?.requested_order_qty
      || latestTrackedStrategyState?.requested_order_qty
      || latestBasketSubmitState?.request?.orders?.[0]?.order_qty
      || 0
    );
    // Tested and verified method:
    // `entryPriceOnce` and `exitPriceOnce` are signed total strategy prices in paise.
    // Final strategy P&L in rupees is `((entry - exit) * qty) / 100`.
    // This logic has been verified against live UAT account P&L snapshots.
    // Do not introduce any extra `/100` or `/10000` conversion here.
    const computedBookedPnl = Number.isFinite(entryPriceOnce) && Number.isFinite(exitPriceOnce) && Number.isFinite(qty)
      ? ((entryPriceOnce - exitPriceOnce) * qty) / 100
      : null;
    const brokerBookedPnl = closedTradeBrokerPnlRupee(latestSquareOffSubmitState, computedBookedPnl);
    const portfolioDeltaPnl = portfolioPnlDeltaRupee(
      latestBasketSubmitState?.portfolio_before_stats,
      latestSquareOffSubmitState?.portfolio_after_stats
    );
    const bookedPnl = Number.isFinite(computedBookedPnl)
      ? computedBookedPnl
      : (Number.isFinite(portfolioDeltaPnl) ? portfolioDeltaPnl : brokerBookedPnl);
    const bookedPnlSource = Number.isFinite(computedBookedPnl)
      ? "fill_prices"
      : (Number.isFinite(portfolioDeltaPnl) ? "portfolio_delta" : (Number.isFinite(brokerBookedPnl) ? "broker_basket" : ""));
    return {
      id: `trade_${Date.now()}`,
      closed_at: latestSquareOffSubmitState.live_updated_at || latestSquareOffSubmitState.requested_at_ist || formatIstDateTime(new Date()),
      environment: envLabel(ORDER_ENV),
      symbol: latestTrackedStrategyState.symbol || "",
      strategy: latestTrackedStrategyState.strategy || "",
      order_qty: qty || null,
      entry_tag: latestBasketSubmitState.tag || latestBasketSubmitState.request?.tag || "",
      entry_basket_id: latestBasketSubmitState.basket_id ?? null,
      exit_tag: latestSquareOffSubmitState.exit_tag || latestSquareOffSubmitState.request?.tag || "",
      exit_basket_id: latestSquareOffSubmitState.basket_id ?? null,
      entry_price_once: Number.isFinite(entryPriceOnce) ? entryPriceOnce : null,
      exit_price_once: Number.isFinite(exitPriceOnce) ? exitPriceOnce : null,
      booked_pnl: Number.isFinite(bookedPnl) ? bookedPnl : null,
      booked_pnl_source: bookedPnlSource,
      portfolio_before_stats: latestBasketSubmitState?.portfolio_before_stats || null,
      portfolio_after_stats: latestSquareOffSubmitState?.portfolio_after_stats || null,
      baseline_greeks: latestTrackedStrategyState.baseline || {},
      legs: latestTrackedStrategyState.legs || [],
    };
  }

  function normalizeBrokerPnlToRupee(rawValue, computedRupee = null) {
    const raw = Number(rawValue);
    if (!Number.isFinite(raw)) return null;
    const asRupee = round2(raw);
    const asPaise = round2(raw / 100);
    if (Number.isFinite(computedRupee)) {
      return Math.abs(asRupee - computedRupee) <= Math.abs(asPaise - computedRupee) ? asRupee : asPaise;
    }
    if (Math.abs(raw) > 100000) return asPaise;
    return asRupee;
  }

  function closedTradeBrokerPnlRupee(squareOffState, computedRupee = null) {
    const basket = findBasketFromResponse(
      squareOffState?.basket_response || {},
      squareOffState?.exit_tag || "",
      squareOffState?.basket_id
    );
    const candidates = [
      basket?.basket_params?.booked_pnl,
      basket?.basket_params?.realised_pnl,
      basket?.basket_params?.realized_pnl,
      basket?.basket_params?.pnl,
      basket?.booked_pnl,
      basket?.realised_pnl,
      basket?.realized_pnl,
      basket?.pnl,
      pickToken(squareOffState?.basket_response || {}, ["booked_pnl", "realised_pnl", "realized_pnl", "pnl"]),
      pickToken(squareOffState?.response || {}, ["booked_pnl", "realised_pnl", "realized_pnl", "pnl"]),
    ];
    for (const val of candidates) {
      const normalized = normalizeBrokerPnlToRupee(val, computedRupee);
      if (Number.isFinite(normalized)) return normalized;
    }
    return null;
  }

  function finalizeClosedTradeIfReady() {
    if (latestSquareOffSubmitState?.status !== "filled") return null;
    if (hasCellValue(latestSquareOffSubmitState?.archived_trade_id)) return latestSquareOffSubmitState.archived_trade_id;
    const record = buildClosedTradeRecord();
    if (!record) return null;

    latestClosedTradeHistoryState = [record, ...(Array.isArray(latestClosedTradeHistoryState) ? latestClosedTradeHistoryState : [])].slice(0, 120);
    saveScopedJson(S.closedTradeHistoryState, latestClosedTradeHistoryState, ORDER_ENV);
    pruneLiveStrategyBookFromClosedHistory();
    setCompletedTradesResponse(latestClosedTradeHistoryState);

    latestSquareOffSubmitState = {
      ...latestSquareOffSubmitState,
      archived_trade_id: record.id,
    };
    saveScopedJson(S.squareOffSubmitState, latestSquareOffSubmitState, ORDER_ENV);
    setActiveStrategiesResponse();

    if (latestTrackedStrategyState) {
      latestTrackedStrategyState = {
        ...latestTrackedStrategyState,
        closed: true,
        closed_at: record.closed_at,
        entry_price_once: record.entry_price_once,
        exit_price_once: record.exit_price_once,
        booked_pnl: record.booked_pnl,
      };
      saveScopedJson(S.trackedStrategyState, latestTrackedStrategyState, ORDER_ENV);
      setActiveStrategiesResponse();
    }
    pushStrategyEvent({
      at: record.closed_at,
      label: "Closed",
      symbol: record.symbol || "",
      strategy: record.strategy || "",
      qty: record.order_qty,
      booked_pnl: record.booked_pnl,
      tone: Number(record.booked_pnl) >= 0 ? "good" : "bad",
      detail: `Booked P&L ${formatActiveStrategyPnl(record.booked_pnl)} (${record.booked_pnl_source || "final"})`,
    });
    return record.id;
  }

  async function resetActiveStrategyWorkspace() {
    latestStrategyPreviewState = null;
    latestTrackedStrategyState = null;

    delScoped(S.strategyPreviewState, ORDER_ENV);
    delScoped(S.trackedStrategyState, ORDER_ENV);
    clearTransientStrategyStates({ preserveMessages: true });

    setStrategyPreviewResponse("No strategy preview built yet.");
    setDeployPreviewResponse("No deploy basket preview built yet.");
    setBasketSubmitResponse("No basket order submitted yet.");
    setSquareOffPreviewResponse("No square-off preview built yet.");
    setSquareOffSubmitResponse("No square-off order submitted yet.");
    setActiveStrategiesResponse();
    setBasketMonitorResponse("No basket monitor snapshot yet.");
    setStrategyPreviewActionMessage("UAT strategy workspace reset. Archive history is preserved.", "success");
    setDeployPreviewActionMessage("");
    setSquareOffActionMessage("");
    setBasketMonitorActionMessage("");

    if (U?.trackedOrderQtyInput) U.trackedOrderQtyInput.value = "";
    if (U?.strategyPreviewPairNumberInput) U.strategyPreviewPairNumberInput.value = "";
    if (U?.deployPreviewPriceTypeSelect) U.deployPreviewPriceTypeSelect.value = "LIMIT";
    if (U?.deployPreviewDeliveryTypeSelect) U.deployPreviewDeliveryTypeSelect.value = "ORDER_DELIVERY_TYPE_CNC";
    if (U?.deployPreviewMultiplierInput) U.deployPreviewMultiplierInput.value = "1";
    if (U?.squareOffDeliveryTypeSelect) U.squareOffDeliveryTypeSelect.value = "ORDER_DELIVERY_TYPE_CNC";
    if (U?.squareOffMultiplierInput) U.squareOffMultiplierInput.value = "1";
    if (U?.basketMonitorTagInput) U.basketMonitorTagInput.value = "";
    if (U?.basketLookupTagInput) U.basketLookupTagInput.value = "";

    lg(`Active UAT trading workspace reset for ${envLabel(ORDER_ENV)}.`);
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  function netTargetsSatisfied(portfolio, netTargets) {
    if (!Array.isArray(netTargets) || !netTargets.length) return null;
    const netByRef = netQtyByRefFromPortfolio(portfolio, netTargets.map((x) => x.ref_id));
    for (const target of netTargets) {
      const baselineNet = Number(target?.baseline_net || 0);
      const requiredChange = Number(target?.required_change || 0);
      const currentNet = Number(netByRef.get(Number(target?.ref_id)) || 0);
      const moved = currentNet - baselineNet;
      if (requiredChange > 0 && moved < requiredChange) return false;
      if (requiredChange < 0 && moved > requiredChange) return false;
    }
    return true;
  }

  function trackedStrategyFlat(portfolio, trackedState) {
    if (!trackedState?.legs?.length) return null;
    const refIds = trackedState.legs
      .map((leg) => Number(leg?.ref_id))
      .filter((ref) => Number.isInteger(ref) && ref > 0);
    if (!refIds.length) return null;
    const netByRef = netQtyByRefFromPortfolio(portfolio, refIds);
    for (const refId of refIds) {
      const net = Number(netByRef.get(refId) || 0);
      if (net !== 0) return false;
    }
    return true;
  }

  function refreshOrderStrategyUi() {
    if (!U) return;
    const uatActive = isAuthEnv(ORDER_ENV);
    if (U.marketOrderEnvChip) {
      U.marketOrderEnvChip.textContent = uatActive ? "Orders: UAT Ready" : "Orders: Login UAT";
    }
    if (U.uatOnlyNotice) {
      U.uatOnlyNotice.classList.toggle("hidden", uatActive);
      if (!uatActive) {
        U.uatOnlyNotice.textContent = "Orders are UAT-only. Please login to UAT from this page. Data streams continue on PROD.";
      }
    }
    if (uatActive) hideOrdersAuthPopup();
    const lockTargets = [
      U.placeMarketOrderButton,
      U.resolveMarketRefButton,
      U.fetchOrdersButton,
      U.fetchOrderByIdButton,
      U.fetchBasketByTagButton,
      U.buildStrategyPreviewButton,
      U.trackStrategyPreviewButton,
      U.masterDeployButton,
      U.clearTrackedStrategyButton,
      U.buildDeployPreviewButton,
      U.submitDeployBasketButton,
      U.refreshBasketMonitorButton,
      U.buildSquareOffPreviewButton,
      U.submitSquareOffButton,
      U.refreshSquareOffStatusButton,
      U.openPlaceOrderSheetButton,
      U.resetActiveStrategyButton,
    ];
    for (const el of lockTargets) {
      if (!el) continue;
      el.disabled = !uatActive;
      if (!uatActive) {
        el.title = "Available only in UAT for this route.";
      } else if (el.title === "Available only in UAT for this route.") {
        el.title = "";
      }
    }
  }

  function hideOrdersAuthPopup() {
    if (ordersAuthPopupTimer) {
      clearTimeout(ordersAuthPopupTimer);
      ordersAuthPopupTimer = null;
    }
    if (U?.ordersAuthPopup) {
      U.ordersAuthPopup.classList.add("hidden");
    }
  }

  function showOrdersAuthPopup(message = "") {
    if (!U?.ordersAuthPopup) return;
    const text = clean(message || "Orders are UAT-only. Please login to UAT from this page. Data streams continue on PROD.");
    if (U.ordersAuthPopupText) U.ordersAuthPopupText.textContent = text;
    U.ordersAuthPopup.classList.remove("hidden");
    if (ordersAuthPopupTimer) clearTimeout(ordersAuthPopupTimer);
    ordersAuthPopupTimer = setTimeout(() => {
      hideOrdersAuthPopup();
    }, 5200);
  }

  function syncOrderStrategyStateFromStorage(envValue = ORDER_ENV) {
    latestStrategyPreviewState = loadScopedJson(S.strategyPreviewState, envValue, null);
    latestTrackedStrategyState = loadScopedJson(S.trackedStrategyState, envValue, null);
    latestDeployPreviewState = loadScopedJson(S.deployPreviewState, envValue, null);
    latestBasketSubmitState = loadScopedJson(S.basketSubmitState, envValue, null);
    latestSquareOffPreviewState = loadScopedJson(S.squareOffPreviewState, envValue, null);
    latestSquareOffSubmitState = loadScopedJson(S.squareOffSubmitState, envValue, null);
    latestClosedTradeHistoryState = loadScopedJson(S.closedTradeHistoryState, envValue, []) || [];
    latestLiveStrategyBookState = loadScopedJson(S.liveStrategyBookState, envValue, []) || [];
    latestBasketMonitorState = loadScopedJson(S.basketMonitorState, envValue, null);
    latestMarketOrderState = loadScopedJson(S.marketOrderState, envValue, null);
    latestSingleTradeBookState = (loadScopedJson(S.singleTradeBookState, envValue, []) || []).map((item) => {
      if (item?.closed || clean(item?.pnl_anchor_mode)) return item;
      return {
        ...item,
        live_pnl_rupee: 0,
      };
    });
    latestOrderLookupState = loadScopedJson(S.orderLookupState, envValue, null);
    latestOrderInstrumentResolutionState = loadScopedJson(S.orderInstrumentResolutionState, envValue, {}) || {};
    latestStrategyEventFeedState = loadScopedJson(S.strategyEventFeedState, envValue, []) || [];
    pruneLiveStrategyBookFromClosedHistory();

    setStrategyPreviewResponse(latestStrategyPreviewState || "No strategy preview built yet.");
    setDeployPreviewResponse(latestDeployPreviewState || "No deploy basket preview built yet.");
    setBasketSubmitResponse(latestBasketSubmitState || "No basket order submitted yet.");
    setSquareOffPreviewResponse(latestSquareOffPreviewState || "No square-off preview built yet.");
    setSquareOffSubmitResponse(latestSquareOffSubmitState || "No square-off order submitted yet.");
    setActiveStrategiesResponse();
    setStrategyEventFeedResponse();
    setCompletedTradesResponse(latestClosedTradeHistoryState.length ? latestClosedTradeHistoryState : "No closed trades archived yet.");
    setBasketMonitorResponse(latestBasketMonitorState || "No basket monitor snapshot yet.");
    setMarketOrderResponse(latestMarketOrderState || "No place order submitted yet.");
    setSingleTradesResponse();
    syncSingleTradeQuotePoller();
    setOrderLookupResponse(latestOrderLookupState || "No order lookup executed yet.");

    if (latestStrategyPreviewState?.source) {
      if (U?.strategyPreviewAssetInput) U.strategyPreviewAssetInput.value = latestStrategyPreviewState.source.asset || "";
      if (U?.strategyPreviewExpiryInput) U.strategyPreviewExpiryInput.value = latestStrategyPreviewState.source.expiry || "";
      if (U?.strategyPreviewExchangeSelect) U.strategyPreviewExchangeSelect.value = latestStrategyPreviewState.source.exchange || "NSE";
      if (U?.strategyPreviewTypeSelect) U.strategyPreviewTypeSelect.value = latestStrategyPreviewState.strategy || "strangle";
      if (U?.strategyPreviewTargetDeltaSelect && hasCellValue(latestStrategyPreviewState.target_delta)) {
        U.strategyPreviewTargetDeltaSelect.value = String(latestStrategyPreviewState.target_delta);
      }
      if (U?.strategyPreviewPairNumberInput) {
        U.strategyPreviewPairNumberInput.value = hasCellValue(latestStrategyPreviewState.payload?.pair_number) ? String(latestStrategyPreviewState.payload.pair_number) : "";
      }
    }
    if (U?.trackedOrderQtyInput) {
      U.trackedOrderQtyInput.value = hasCellValue(latestTrackedStrategyState?.requested_order_qty)
        ? String(latestTrackedStrategyState.requested_order_qty)
        : "";
    }
    if (latestDeployPreviewState?.flexi_order_request?.basket_params) {
      if (U?.deployPreviewPriceTypeSelect) U.deployPreviewPriceTypeSelect.value = latestDeployPreviewState.flexi_order_request.basket_params.price_type || "LIMIT";
      if (U?.deployPreviewDeliveryTypeSelect) U.deployPreviewDeliveryTypeSelect.value = latestDeployPreviewState.flexi_order_request.basket_params.order_delivery_type || "ORDER_DELIVERY_TYPE_CNC";
      if (U?.deployPreviewMultiplierInput) U.deployPreviewMultiplierInput.value = String(latestDeployPreviewState.flexi_order_request.basket_params.multiplier || 1);
    }
    if (latestSquareOffPreviewState?.square_off_request?.basket_params) {
      if (U?.squareOffDeliveryTypeSelect) U.squareOffDeliveryTypeSelect.value = latestSquareOffPreviewState.square_off_request.basket_params.order_delivery_type || "ORDER_DELIVERY_TYPE_CNC";
      if (U?.squareOffMultiplierInput) U.squareOffMultiplierInput.value = String(latestSquareOffPreviewState.square_off_request.basket_params.multiplier || 1);
    }
    if (U?.basketMonitorTagInput) {
      U.basketMonitorTagInput.value = latestBasketMonitorState?.tag
        || latestDeployPreviewState?.flexi_order_request?.tag
        || U.basketMonitorTagInput.value;
    }
    if (U?.basketMonitorAutoRefreshInput) {
      U.basketMonitorAutoRefreshInput.checked = g(S.basketMonitorAutoRefresh, "1") !== "0";
    }
    if (latestMarketOrderState?.request) {
      if (U?.marketOrderTagInput) U.marketOrderTagInput.value = latestMarketOrderState.request.tag || U.marketOrderTagInput.value;
      if (U?.marketOrderRefIdInput && hasCellValue(latestMarketOrderState.request.ref_id)) U.marketOrderRefIdInput.value = String(latestMarketOrderState.request.ref_id);
      if (U?.marketOrderQtyInput && hasCellValue(latestMarketOrderState.request.order_qty)) U.marketOrderQtyInput.value = String(latestMarketOrderState.request.order_qty);
      if (U?.marketOrderExchangeSelect && latestMarketOrderState.request.exchange) U.marketOrderExchangeSelect.value = latestMarketOrderState.request.exchange;
      if (U?.marketOrderSymbolInput && latestMarketOrderState.instrument?.symbol) U.marketOrderSymbolInput.value = latestMarketOrderState.instrument.symbol;
      if (U?.marketOrderTickSizeInput && hasCellValue(latestMarketOrderState.tick_size_rupee)) U.marketOrderTickSizeInput.value = String(latestMarketOrderState.tick_size_rupee);
      updateMarketResolvedMeta(latestMarketOrderState.instrument?.symbol ? `Restored latest place order for ${latestMarketOrderState.instrument.symbol}.` : "Instrument auto-resolution idle.");
    } else {
      updateMarketResolvedMeta("Instrument auto-resolution idle.");
    }
    if (latestOrderLookupState?.path) {
      if (U?.orderLookupTagInput) U.orderLookupTagInput.value = clean(U.orderLookupTagInput.value || pickToken(latestOrderLookupState.response || {}, ["tag"]));
      if (U?.basketLookupTagInput && /basket/i.test(latestOrderLookupState.path || "")) {
        const tagMatch = String(latestOrderLookupState.path || "").match(/tag=([^&]+)/i);
        if (tagMatch) U.basketLookupTagInput.value = decodeURIComponent(tagMatch[1]);
      }
    }
  }

  async function trackStrategyPreview() {
    if (!latestStrategyPreviewState?.payload?.legs?.length) throw new Error("Build strategy preview before tracking.");
    clearTransientStrategyStates();
    latestTrackedStrategyState = buildTrackedStrategyStateFromPreview(latestStrategyPreviewState);
    const requestedOrderQtyText = clean(U?.trackedOrderQtyInput?.value);
    const qtyInfo = validateTrackedOrderQty(latestTrackedStrategyState, requestedOrderQtyText ? Number(requestedOrderQtyText) : null);
    latestTrackedStrategyState.requested_order_qty = qtyInfo.qty;
    const hydrate = hydrateTrackedLegsFromLive(latestTrackedStrategyState);
    const resolved = hydrate.missing > 0
      ? await resolveTrackedLegsViaServer(latestTrackedStrategyState, { silent: true })
      : { updated: false, resolved: 0, missing: hydrate.missing };
    saveScopedJson(S.trackedStrategyState, latestTrackedStrategyState, ORDER_ENV);
    const missing = Number.isFinite(resolved.missing) ? resolved.missing : hydrate.missing;
    if (missing > 0) {
      setStrategyPreviewActionMessage(`Preview tracked. ${missing} leg(s) still missing ref_id after server resolution.`, "error");
    } else {
      setStrategyPreviewActionMessage("Preview tracked. Deploy-ready payload is now available in PlaceOrder sheet.", "success");
    }
    if (hydrate.resolved > 0) {
      lg(`Auto-resolved ${hydrate.resolved} missing leg ref_id(s) from live OC/instrument cache.`);
    }
    if (resolved.resolved > 0) {
      lg(`Server resolved ${resolved.resolved} leg ref_id(s) from UAT refdata.`);
    }
    lg(`Tracked strategy ${latestTrackedStrategyState.strategy} for ${latestTrackedStrategyState.symbol}.`);
    pushStrategyEvent({
      label: "Strategy tracked",
      symbol: latestTrackedStrategyState.symbol || "",
      strategy: latestTrackedStrategyState.strategy || "",
      qty: latestTrackedStrategyState.requested_order_qty,
      tone: "info",
      detail: "Tracked preview is ready. Deploy to make it live.",
    });
    setActiveStrategiesResponse();
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  async function clearTrackedStrategy() {
    latestTrackedStrategyState = null;
    delScoped(S.trackedStrategyState, ORDER_ENV);
    clearTransientStrategyStates();
    setStrategyPreviewActionMessage("Tracked strategy cleared.", "success");
    setActiveStrategiesResponse();
    lg(`Tracked strategy cleared for ${envLabel(ORDER_ENV)}.`);
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  async function buildDeployBasketPreview() {
    if (!latestTrackedStrategyState?.legs?.length) throw new Error("Track a strategy before deploying.");
    const localHydrate = hydrateTrackedLegsFromLive(latestTrackedStrategyState);
    if (localHydrate.missing > 0) {
      const resolved = await resolveTrackedLegsViaServer(latestTrackedStrategyState);
      if (resolved.missing > 0) {
        throw new Error(`Unable to resolve ${resolved.missing} tracked leg ref_id(s) from broker refdata.`);
      }
    }
    const priceType = clean(U?.deployPreviewPriceTypeSelect?.value || "LIMIT");
    const deliveryType = clean(U?.deployPreviewDeliveryTypeSelect?.value || "ORDER_DELIVERY_TYPE_CNC");
    const multiplier = clean(U?.deployPreviewMultiplierInput?.value || "1");
    latestDeployPreviewState = buildFlexiOrderPreviewFromTracked(latestTrackedStrategyState, {
      priceType,
      deliveryType,
      multiplier,
    });
    saveScopedJson(S.deployPreviewState, latestDeployPreviewState, ORDER_ENV);
    setDeployPreviewActionMessage("Deploy basket preview built from tracked strategy.", "success");
    setDeployPreviewResponse(latestDeployPreviewState);
    if (U?.basketMonitorTagInput) U.basketMonitorTagInput.value = latestDeployPreviewState.flexi_order_request?.tag || U.basketMonitorTagInput.value;
    lg(`Built flexi deploy preview for ${latestTrackedStrategyState?.symbol || "-"}.`);
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  async function submitDeployBasket() {
    assertUatOnlyOrderAction();
    if (!isAuthEnv(ORDER_ENV)) throw new Error(`Please login to ${envLabel(ORDER_ENV)} first.`);
    const asset = upper(U?.strategyPreviewAssetInput?.value);
    const expiry = clean(U?.strategyPreviewExpiryInput?.value);
    const exchange = upper(U?.strategyPreviewExchangeSelect?.value || "NSE");
    const strategy = clean(U?.strategyPreviewTypeSelect?.value || "strangle");
    const targetDelta = Number(clean(U?.strategyPreviewTargetDeltaSelect?.value || "0"));
    const pairNumberText = clean(U?.strategyPreviewPairNumberInput?.value);
    const pairNumber = pairNumberText ? Number(pairNumberText) : null;
    const orderQty = Number(clean(U?.trackedOrderQtyInput?.value || ""));
    if (!asset || !expiry) throw new Error("Asset and expiry are required before deploy.");
    if (!Number.isInteger(orderQty) || orderQty <= 0) throw new Error("Requested order quantity must be a positive integer.");

    setDeployPreviewActionMessage("");
    setBasketSubmitResponse({
      environment: envLabel(ORDER_ENV),
      requested_at_ist: formatIstDateTime(new Date()),
      request: { asset, expiry, exchange, strategy, target_delta: targetDelta, pair_number: pairNumber, order_qty: orderQty },
      status: "submitting",
    });

    let data = null;
    const portfolioBefore = await fetchPortfolioSnapshot().catch(() => null);
    const portfolioBeforeStats = portfolioBefore ? portfolioStatsRupeeSnapshot(portfolioBefore) : null;
    try {
      setDeployPreviewActionMessage("Fast deploy: resolving UAT refs and submitting basket...", "info");
      if (!latestTrackedStrategyState?.legs?.length && latestStrategyPreviewState?.payload?.legs?.length) {
        latestTrackedStrategyState = buildTrackedStrategyStateFromPreview(latestStrategyPreviewState);
      }
      if (!latestTrackedStrategyState?.legs?.length) {
        throw new Error("Track strategy legs first, then deploy.");
      }
      const resolveResult = await resolveTrackedLegsViaServer(latestTrackedStrategyState, { silent: true, force: true });
      if (resolveResult.missing > 0) {
        throw new Error(`Unable to resolve ${resolveResult.missing} leg ref_id(s) in UAT.`);
      }
      latestTrackedStrategyState.requested_order_qty = orderQty;
      latestDeployPreviewState = buildFlexiOrderPreviewFromTracked(latestTrackedStrategyState, {
        priceType: clean(U?.deployPreviewPriceTypeSelect?.value || "LIMIT"),
        deliveryType: clean(U?.deployPreviewDeliveryTypeSelect?.value || "ORDER_DELIVERY_TYPE_CNC"),
        multiplier: clean(U?.deployPreviewMultiplierInput?.value || "1"),
      });
      const fastPayload = JSON.parse(JSON.stringify(latestDeployPreviewState?.flexi_order_request || {}));
      if (!fastPayload?.orders?.length) {
        throw new Error("Fast deploy payload is empty.");
      }
      fastPayload.orders = fastPayload.orders.map((order) => ({
        ...order,
        order_qty: orderQty,
      }));
      const fastResponse = await req("/orders/v2/basket", {
        method: "POST",
        token: "session",
        envOverride: ORDER_ENV,
        body: fastPayload,
      });
      data = {
        preview: latestStrategyPreviewState || null,
        flexi_order_request: fastPayload,
        response: fastResponse,
        basket_id: pickToken(fastResponse, ["basket_id", "basketId", "id"]),
      };
    } catch (fastErr) {
      const fastMsg = String(fastErr?.message || fastErr || "");
      tlg(`Fast deploy path failed: ${fastMsg}. Falling back to backend deploy route.`, true);
      const res = await fetch("/api/strategy/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment: ORDER_ENV,
          data_environment: DATA_ENV,
          sessionToken: tok("session", ORDER_ENV),
          dataSessionToken: tok("session", DATA_ENV),
          deviceId: devId(),
          asset,
          expiry,
          exchange,
          strategy,
          target_delta: targetDelta,
          pair_number: Number.isInteger(pairNumber) && pairNumber > 0 ? pairNumber : null,
          order_qty: orderQty,
          price_type: clean(U?.deployPreviewPriceTypeSelect?.value || "LIMIT"),
          delivery_type: clean(U?.deployPreviewDeliveryTypeSelect?.value || "ORDER_DELIVERY_TYPE_CNC"),
          multiplier: clean(U?.deployPreviewMultiplierInput?.value || "1"),
          entry_ltp_buffer_bps: ENTRY_LTP_BUFFER_BPS,
        }),
      });
      data = await jsonSafe(res);
      if (!res.ok) throw new Error(data?.error || data?.message || `Deploy failed (${res.status}).`);
    }

    latestStrategyPreviewState = data.preview || latestStrategyPreviewState;
    if (data.preview?.payload) {
      latestTrackedStrategyState = buildTrackedStrategyStateFromPreview(data.preview);
      latestTrackedStrategyState.requested_order_qty = orderQty;
      saveScopedJson(S.trackedStrategyState, latestTrackedStrategyState, ORDER_ENV);
    }
    latestDeployPreviewState = data.preview ? {
      environment: envLabel(ORDER_ENV),
      generated_at_ist: data.preview.generated_at_ist || formatIstDateTime(new Date()),
      tracked_symbol: data.preview.payload?.symbol || "",
      strategy: data.preview.strategy || strategy,
      requested_order_qty: orderQty,
      auto_qty: false,
      signed_entry_price_raw: Number(data.flexi_order_request?.basket_params?.entry_price ?? null),
      signed_entry_price_int: Number(data.flexi_order_request?.basket_params?.entry_price ?? null),
      deploy_payload: data.preview.payload || null,
      flexi_order_request: data.flexi_order_request || null,
    } : latestDeployPreviewState;
    const payload = data.flexi_order_request || {};
    const response = data.response || {};
    const basketId = data.basket_id ?? pickToken(response, ["basket_id", "basketId", "id"]);
    const submitStatusText = String(pickToken(response, ["status", "message", "basket_status"]) || "").trim();
    const submitStatusNorm = upper(submitStatusText);
    const submitRejected = ["REJECT", "CANCEL", "FAIL", "ERROR"].some((token) => submitStatusNorm.includes(token));
    if (submitRejected) {
      throw new Error(`Broker rejected basket submit: ${submitStatusText || "unknown status"}.`);
    }
    if (!hasCellValue(basketId) && !clean(payload.tag)) {
      throw new Error("Basket submit returned without basket_id and tag. Cannot verify deploy.");
    }
    latestBasketSubmitState = {
      environment: envLabel(ORDER_ENV),
      requested_at_ist: formatIstDateTime(new Date()),
      request: payload,
      response,
      basket_id: hasCellValue(basketId) ? basketId : null,
      tag: payload.tag || "",
      entry_price_once: Number(payload?.basket_params?.entry_price ?? null),
      entry_price_confirmed: false,
      entry_price_source: Number(payload?.basket_params?.entry_price ?? null) ? "submit_payload" : "",
      portfolio_before_stats: portfolioBeforeStats,
    };
    saveScopedJson(S.basketSubmitState, latestBasketSubmitState, ORDER_ENV);
    setBasketSubmitResponse(latestBasketSubmitState);

    if (U?.basketMonitorTagInput && payload.tag) U.basketMonitorTagInput.value = payload.tag;
    if (U?.basketLookupTagInput && payload.tag) U.basketLookupTagInput.value = payload.tag;

    let monitorVerified = false;
    if (payload.tag) {
      await refreshBasketMonitor({ tag: payload.tag || "", silent: true, skipSheetRefresh: true }).catch(() => null);
      monitorVerified = Boolean(latestBasketMonitorState?.tag === payload.tag && latestBasketMonitorState?.verified);
    }

    const deployStateMsg = hasCellValue(basketId)
      ? `Basket order submitted in UAT. basket_id=${basketId}.${monitorVerified ? " Verified in basket lookup." : " Waiting for broker lookup visibility."}`
      : (monitorVerified
        ? "Basket order submitted in UAT and verified in basket lookup."
        : "Deploy request sent, but basket is not visible yet in lookup. Retry basket refresh.");
    setDeployPreviewActionMessage(
      deployStateMsg,
      hasCellValue(basketId) || monitorVerified ? "success" : "error"
    );
    lg(
      `Basket order submitted in UAT for tag=${payload.tag || "-"}${hasCellValue(basketId) ? ` basket_id=${basketId}` : ""}.`
      + `${monitorVerified ? " Verified in basket lookup." : " Basket lookup not yet visible."}`
    );
    pushStrategyEvent({
      label: "Basket submitted",
      symbol: latestTrackedStrategyState?.symbol || latestDeployPreviewState?.tracked_symbol || "",
      strategy: latestTrackedStrategyState?.strategy || latestDeployPreviewState?.strategy || "",
      qty: orderQty,
      tone: monitorVerified ? "good" : "pending",
      detail: hasCellValue(basketId) ? `basket_id=${basketId}` : "Waiting for basket lookup visibility.",
    });
    upsertLiveStrategyBookFromCurrent(activeStrategyStateSnapshot(), latestTrackedStrategyState);
    setActiveStrategiesResponse();
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
    return {
      basketId: hasCellValue(basketId) ? basketId : null,
      tag: clean(payload.tag),
      verified: monitorVerified,
      status: submitStatusText || "",
    };
  }

  async function buildSquareOffPreview() {
    assertUatOnlyOrderAction();
    const deliveryType = clean(U?.squareOffDeliveryTypeSelect?.value || "ORDER_DELIVERY_TYPE_CNC");
    const multiplier = clean(U?.squareOffMultiplierInput?.value || "1");
    let lastErr = null;
    let safeState = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const portfolio = await fetchPortfolioSnapshot();
      try {
        safeState = computeSafeSquareOffOrders(latestTrackedStrategyState, portfolio);
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      }
    }
    if (!safeState) throw lastErr || new Error("Unable to build square-off preview.");
    latestSquareOffPreviewState = buildSquareOffPreviewPayload(latestTrackedStrategyState, safeState, {
      deliveryType,
      multiplier,
    });
    saveScopedJson(S.squareOffPreviewState, latestSquareOffPreviewState, ORDER_ENV);
    setSquareOffActionMessage("Square-off preview built from live positions.", "success");
    setSquareOffPreviewResponse(latestSquareOffPreviewState);
    if (U?.basketMonitorTagInput) U.basketMonitorTagInput.value = latestSquareOffPreviewState.exit_tag || U.basketMonitorTagInput.value;
    if (U?.basketLookupTagInput) U.basketLookupTagInput.value = latestSquareOffPreviewState.exit_tag || U.basketLookupTagInput.value;
    lg(`Square-off preview built for ${latestTrackedStrategyState?.symbol || "-"}.`);
    setActiveStrategiesResponse();
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  async function submitSquareOff() {
    assertUatOnlyOrderAction();
    if (!isAuthEnv(ORDER_ENV)) throw new Error(`Please login to ${envLabel(ORDER_ENV)} first.`);
    const requestBody = latestSquareOffPreviewState?.square_off_request;
    if (!requestBody?.orders?.length) throw new Error("Build square-off preview before submitting.");

    setSquareOffActionMessage("");
    setSquareOffSubmitResponse({
      environment: envLabel(ORDER_ENV),
      requested_at_ist: formatIstDateTime(new Date()),
      request: requestBody,
      status: "submitting",
    });

    const response = await req("/orders/v2/basket", {
      method: "POST",
      token: "session",
      envOverride: ORDER_ENV,
      body: requestBody,
    });

    const basketId = pickToken(response, ["basket_id", "basketId", "id"]);
    const statusText = String(pickToken(response, ["status", "message", "basket_status"]) || "").trim().toLowerCase();
    if (["submitted", "success", "ok"].includes(statusText) && !hasCellValue(basketId)) {
      throw new Error("Square-off submit returned success without basket_id.");
    }

    latestSquareOffSubmitState = {
      environment: envLabel(ORDER_ENV),
      requested_at_ist: formatIstDateTime(new Date()),
      request: requestBody,
      response,
      basket_id: hasCellValue(basketId) ? basketId : null,
      exit_tag: requestBody.tag || "",
      original_basket_id: latestSquareOffPreviewState?.original_basket_id || null,
      net_targets: latestSquareOffPreviewState?.net_targets || [],
      status: "pending_fill",
      square_off_filled: false,
      square_off_position_closed: false,
    };
    saveScopedJson(S.squareOffSubmitState, latestSquareOffSubmitState, ORDER_ENV);
    setSquareOffSubmitResponse(latestSquareOffSubmitState);
    setSquareOffActionMessage(
      hasCellValue(basketId)
        ? `Square-off basket submitted in UAT. basket_id=${basketId}.`
        : "Square-off basket submitted in UAT.",
      "success"
    );
    if (U?.basketMonitorTagInput && requestBody.tag) U.basketMonitorTagInput.value = requestBody.tag;
    if (U?.basketLookupTagInput && requestBody.tag) U.basketLookupTagInput.value = requestBody.tag;
    lg(`Square-off basket submitted in UAT for tag=${requestBody.tag || "-"}${hasCellValue(basketId) ? ` basket_id=${basketId}` : ""}.`);
    pushStrategyEvent({
      label: "Square-off submitted",
      symbol: latestTrackedStrategyState?.symbol || "",
      strategy: latestTrackedStrategyState?.strategy || "",
      qty: latestTrackedStrategyState?.requested_order_qty,
      live_pnl: activeStrategyStateSnapshot()?.live_pnl,
      tone: "pending",
      detail: hasCellValue(basketId) ? `basket_id=${basketId}` : "Waiting for close confirmation.",
    });
    await refreshBasketMonitor({ tag: requestBody.tag || "", silent: true, skipSheetRefresh: true }).catch(() => null);
    upsertLiveStrategyBookFromCurrent(activeStrategyStateSnapshot(), latestTrackedStrategyState);
    setActiveStrategiesResponse();
    await reconcileSquareOffFast();
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  async function reconcileSquareOffFast() {
    let latest = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      latest = await reconcileSquareOffState({
        silent: attempt < 7,
        skipSheetRefresh: true,
      }).catch(() => null);
      if (latest?.status === "filled" || latest?.status === "failed") {
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    return latest;
  }

  async function refreshBasketMonitor(options = {}) {
    const silent = Boolean(options.silent);
    const skipSheetRefresh = Boolean(options.skipSheetRefresh);
    if (!isAuthEnv(ORDER_ENV)) throw new Error(`Please login to ${envLabel(ORDER_ENV)} first.`);
    const tag = clean(options.tag || U?.basketMonitorTagInput?.value || latestDeployPreviewState?.flexi_order_request?.tag || "");
    if (!tag) {
      if (!silent) setBasketMonitorActionMessage("Basket tag is required.");
      throw new Error("Missing basket tag.");
    }
    const path = `/orders/v2/basket?tag=${encodeURIComponent(tag)}`;
    const response = await req(path, { token: "session", envOverride: ORDER_ENV });
    const baskets = Array.isArray(response?.root) ? response.root : Array.isArray(response) ? response : [];
    const first = baskets[0] || {};
    const basketParams = first?.basket_params || {};
    const point = {
      fetched_at_ist: formatIstDateTime(new Date()),
      verified: baskets.length > 0,
      matched_basket_id: first?.basket_id ?? null,
      basket_status: basketParams?.basket_status || first?.basket_status || "",
      count: baskets.length,
    };
    latestBasketMonitorState = {
      environment: envLabel(ORDER_ENV),
      fetched_at_ist: point.fetched_at_ist,
      tag,
      verified: point.verified,
      matched_basket_id: point.matched_basket_id,
      basket_status: point.basket_status,
      count: point.count,
      history: appendBasketMonitorHistory(latestBasketMonitorState, point),
      response,
    };
    saveScopedJson(S.basketMonitorState, latestBasketMonitorState, ORDER_ENV);
    if (!silent) {
      setBasketMonitorActionMessage(baskets.length ? "Basket monitor refreshed." : "No baskets found for this tag.", baskets.length ? "success" : "error");
    }
    setBasketMonitorResponse(latestBasketMonitorState);
    if (!silent) {
      lg(`Basket monitor refreshed for tag=${tag} in ${envLabel(ORDER_ENV)}.`);
    }
    if (!skipSheetRefresh) {
      await refreshPlaceOrderSheet(silent ? REFRESH_REASON.system : REFRESH_REASON.manual);
    }
  }

  async function reconcileSquareOffState(options = {}) {
    const silent = Boolean(options.silent);
    const skipSheetRefresh = Boolean(options.skipSheetRefresh);
    const skipPortfolioCheck = options.skipPortfolioCheck !== undefined ? Boolean(options.skipPortfolioCheck) : false;
    const state = latestSquareOffSubmitState;
    if (!state?.request?.orders?.length || !state.exit_tag) return null;
    if (!isAuthEnv(ORDER_ENV)) return null;

    const basketResponse = await req(`/orders/v2/basket?tag=${encodeURIComponent(state.exit_tag)}`, { token: "session", envOverride: ORDER_ENV });
    const basket = findBasketFromResponse(basketResponse, state.exit_tag, state.basket_id);
    const basketParams = basket?.basket_params || {};
    const basketStatus = basketParams?.basket_status || basket?.basket_status || "";
    const basketOrdersMap = basket?.orders || {};
    const fillPrice = signedFillPriceFromBasketOrders(state.request.orders, basketOrdersMap, "buy_positive");
    const portfolio = skipPortfolioCheck ? null : await fetchPortfolioSnapshot();
    const positionClosed = portfolio ? netTargetsSatisfied(portfolio, state.net_targets) : null;
    const trackedFlat = portfolio ? trackedStrategyFlat(portfolio, latestTrackedStrategyState) : null;
    const fullyClosed = trackedFlat === true;
    const basketClosed = isBasketClosedStatus(basketStatus);
    const fillConfirmed = Number.isFinite(fillPrice) || (fullyClosed && basketClosed);

    latestSquareOffSubmitState = {
      ...state,
      live_updated_at: formatIstDateTime(new Date()),
      basket_status: basketStatus || state.basket_status || "",
      basket_response: basketResponse,
      square_off_fill_price: Number.isFinite(fillPrice) ? fillPrice : state.square_off_fill_price ?? null,
      portfolio_after_stats: portfolio ? portfolioStatsRupeeSnapshot(portfolio) : state.portfolio_after_stats || null,
      square_off_filled: fillConfirmed ? true : Boolean(state.square_off_filled),
      square_off_position_closed: fullyClosed || basketClosed ? true : Boolean(state.square_off_position_closed),
      status: fillConfirmed
        ? "filled"
        : isBasketFailureStatus(basketStatus)
          ? "failed"
          : "pending_fill",
      message: fillConfirmed
        ? ""
        : isBasketFailureStatus(basketStatus)
          ? `Square-off basket failed: ${basketStatus || "unknown"}`
          : (positionClosed === true
            ? "Square-off order placed; position appears closed but waiting for broker fill confirmation."
            : "Square-off order placed; waiting for fill confirmation."),
    };
    const archivedTradeId = finalizeClosedTradeIfReady();
    saveScopedJson(S.squareOffSubmitState, latestSquareOffSubmitState, ORDER_ENV);
    setSquareOffSubmitResponse(latestSquareOffSubmitState);
    upsertLiveStrategyBookFromCurrent(activeStrategyStateSnapshot(), latestTrackedStrategyState);
    setActiveStrategiesResponse();

    if (!silent) {
      const msg = latestSquareOffSubmitState.status === "filled"
        ? `Square-off fill confirmed.${archivedTradeId ? ` Archived as ${archivedTradeId}.` : ""}`
        : latestSquareOffSubmitState.message || "Square-off reconciliation refreshed.";
      setSquareOffActionMessage(msg, latestSquareOffSubmitState.status === "failed" ? "error" : "success");
      lg(`Square-off reconciliation refreshed for tag=${state.exit_tag} status=${latestSquareOffSubmitState.status}.`, latestSquareOffSubmitState.status === "failed");
    }
    if (!skipSheetRefresh) {
      await refreshPlaceOrderSheet(silent ? REFRESH_REASON.system : REFRESH_REASON.manual);
    }
    return latestSquareOffSubmitState;
  }

  async function reconcileEntryBasketState(options = {}) {
    const silent = Boolean(options.silent);
    const skipSheetRefresh = Boolean(options.skipSheetRefresh);
    const state = latestBasketSubmitState;
    if (!state?.request?.orders?.length || !state?.tag || !isAuthEnv(ORDER_ENV)) return null;
    if (Boolean(state.entry_price_confirmed) && !options.force) return state;
    const wasConfirmed = Boolean(state.entry_price_confirmed);

    const basketResponse = await req(`/orders/v2/basket?tag=${encodeURIComponent(state.tag)}`, { token: "session", envOverride: ORDER_ENV });
    const basket = findBasketFromResponse(basketResponse, state.tag, state.basket_id);
    const entryPriceState = resolvedEntryPriceState({
      ...state,
      basket_lookup: basket,
    });
    latestBasketSubmitState = {
      ...state,
      live_updated_at: formatIstDateTime(new Date()),
      basket_lookup: basket,
      entry_price_once: entryPriceState.value,
      entry_price_confirmed: Boolean(entryPriceState.confirmed),
      entry_price_source: entryPriceState.source || state.entry_price_source || "",
    };
    saveScopedJson(S.basketSubmitState, latestBasketSubmitState, ORDER_ENV);
    setBasketSubmitResponse(latestBasketSubmitState);
    upsertLiveStrategyBookFromCurrent(activeStrategyStateSnapshot(), latestTrackedStrategyState);
    setActiveStrategiesResponse();
    if (!silent) {
      setDeployPreviewActionMessage(
        Number.isFinite(Number(latestBasketSubmitState.entry_price_once))
          ? "Entry basket pricing refreshed from broker basket data."
          : "Entry basket status refreshed.",
        "success"
      );
      lg(`Entry basket reconciliation refreshed for tag=${state.tag}.`);
    }
    if (!wasConfirmed && Boolean(latestBasketSubmitState.entry_price_confirmed)) {
      const active = activeStrategyStateSnapshot();
      pushStrategyEvent({
        label: "Entry filled",
        symbol: latestTrackedStrategyState?.symbol || "",
        strategy: latestTrackedStrategyState?.strategy || "",
        qty: latestTrackedStrategyState?.requested_order_qty,
        live_pnl: active?.live_pnl,
        tone: "good",
        detail: Number.isFinite(Number(latestBasketSubmitState.entry_price_once))
          ? `Entry ${paiseToRupee(latestBasketSubmitState.entry_price_once)} confirmed.`
          : "Broker fill confirmed.",
      });
    }
    if (!skipSheetRefresh) {
      await refreshPlaceOrderSheet(silent ? REFRESH_REASON.system : REFRESH_REASON.manual);
    }
    return latestBasketSubmitState;
  }

  async function openPlaceOrderSheet() {
    if (!officeReady) throw new Error("Office is not ready.");
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
    await Excel.run(async (ctx) => {
      let sh = ctx.workbook.worksheets.getItemOrNullObject("PlaceOrder");
      await ctx.sync();
      if (sh.isNullObject) sh = ctx.workbook.worksheets.add("PlaceOrder");
      sh.activate();
      await ctx.sync();
    });
    lg("Opened PlaceOrder sheet.");
  }

  async function squareOffActiveStrategyInline(tradeKey = "") {
    const currentState = activeStrategyStateSnapshot();
    const currentKey = liveStrategyKeyFromState(currentState || {});
    if (tradeKey && (!currentKey || tradeKey !== currentKey)) {
      const snapshot = findActiveStrategySnapshotByKey(tradeKey);
      if (!snapshot) {
        throw new Error("Could not find that active strategy.");
      }
      if (!primeActiveStrategyContextFromSnapshot(snapshot)) {
        throw new Error("That active strategy does not have enough data for square off.");
      }
      setActiveStrategiesResponse();
    }
    if (!latestBasketSubmitState?.request?.orders?.length) {
      throw new Error("No live strategy is available for square off.");
    }
    if (latestSquareOffSubmitState?.status === "pending_fill") {
      throw new Error("Square-off is already pending fill.");
    }
    await buildSquareOffPreview();
    await submitSquareOff();
  }

  function instrumentLookupKey(symbol, exchange) {
    return `${upper(symbol)}|${upper(exchange || "NSE")}`;
  }

  function normalizeExpiryKey(value) {
    const raw = clean(value);
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly.length >= 8) return digitsOnly.slice(0, 8);
    return upper(raw);
  }

  function normalizeOptionType(value) {
    const token = upper(value);
    if (token === "CE" || token === "CALL" || token === "C") return "CE";
    if (token === "PE" || token === "PUT" || token === "P") return "PE";
    return token;
  }

  function normalizeStrikeForLookup(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const normalized = Math.abs(n) >= 100000 ? n / 100 : n;
    return round2(normalized);
  }

  function optionInstrumentLookupKey(asset, expiry, optionType, strike, exchange) {
    const assetKey = upper(asset);
    const expiryKey = normalizeExpiryKey(expiry);
    const optionTypeKey = normalizeOptionType(optionType);
    const strikeKey = normalizeStrikeForLookup(strike);
    const exchangeKey = upper(exchange || "NSE");
    if (!assetKey || !expiryKey || !optionTypeKey || strikeKey === null || !exchangeKey) return "";
    return `${assetKey}|${expiryKey}|${optionTypeKey}|${strikeKey}|${exchangeKey}`;
  }

  function instrumentSymbolLookupKey(symbol, exchange) {
    return `${upper(symbol)}|${upper(exchange || "NSE")}`;
  }

  function orderResolutionLookupKey(symbol, exchange) {
    return `${normalizeLooseToken(symbol)}|${upper(exchange || "NSE")}`;
  }

  function normalizeLooseToken(value) {
    return upper(value).replace(/[^A-Z0-9]/g, "");
  }

  function symbolRelaxedMatch(candidate, wanted) {
    const a = normalizeLooseToken(candidate);
    const b = normalizeLooseToken(wanted);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a);
  }

  function exchangeCompatible(candidateExchange, requestedExchange) {
    const a = upper(candidateExchange || "");
    const b = upper(requestedExchange || "");
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.startsWith(`${b}_`) || b.startsWith(`${a}_`)) return true;
    return a.includes(b) || b.includes(a);
  }

  function isLikelyCashInstrument(row) {
    const derivative = upper(row?.derivative_type || "");
    const optionType = upper(row?.option_type || "");
    const expiry = clean(row?.expiry || "");
    if (optionType === "CE" || optionType === "PE") return false;
    if (derivative.includes("OPT") || derivative.includes("FUT")) return false;
    if (expiry) return false;
    return true;
  }

  function rankInstrumentCandidate(row, query) {
    const symbol = normalizeIndexSymbolToken(row?.symbol || "");
    const instrumentSymbol = normalizeIndexSymbolToken(row?.instrument_symbol || "");
    const stockName = upper(row?.stock_name || "");
    const q = normalizeIndexSymbolToken(query);
    let score = 0;
    if (symbol === q || instrumentSymbol === q) score += 120;
    if (symbolRelaxedMatch(symbol, q)) score += 60;
    if (symbolRelaxedMatch(instrumentSymbol, q)) score += 70;
    if (symbolRelaxedMatch(stockName, q)) score += 35;
    if (isLikelyCashInstrument(row)) score += 20;
    if (Number.isInteger(Number(row?.ref_id)) && Number(row.ref_id) > 0) score += 10;
    return score;
  }

  function normalizeResolvedInstrument(match, fallbackSymbol, exchange) {
    const refId = Number(match?.ref_id);
    if (!Number.isInteger(refId) || refId <= 0) return null;
    return {
      ref_id: refId,
      symbol: upper(match?.symbol || fallbackSymbol || ""),
      instrument_symbol: upper(match?.instrument_symbol || ""),
      stock_name: upper(match?.stock_name || ""),
      exchange: upper(match?.exchange || exchange || "NSE"),
      lot_size: Number(match?.lot_size) || null,
      tick_size_paise: normalizeTickSizePaise(match?.tick_size_paise ?? match?.tick_size ?? match?.price_tick ?? match?.tick),
      derivative_type: upper(match?.derivative_type || ""),
      option_type: normalizeOptionType(match?.option_type || ""),
      expiry: normalizeExpiryKey(match?.expiry || ""),
      strike_price: normalizeStrikeForLookup(match?.strike_price),
    };
  }

  function upsertResolvedInstrumentCache(match, lookupSymbol, exchange, envValue = ORDER_ENV) {
    const normalized = normalizeResolvedInstrument(match, lookupSymbol, exchange);
    if (!normalized) return;
    instrumentIndex.set(instrumentLookupKey(normalized.symbol, normalized.exchange), normalized);
    if (normalized.instrument_symbol) {
      instrumentSymbolIndex.set(instrumentSymbolLookupKey(normalized.instrument_symbol, normalized.exchange), normalized);
    }
    if (normalized.stock_name) {
      instrumentSymbolIndex.set(instrumentSymbolLookupKey(normalized.stock_name, normalized.exchange), normalized);
    }
    const tupleKey = optionInstrumentLookupKey(
      normalized.symbol,
      normalized.expiry,
      normalized.option_type,
      normalized.strike_price,
      normalized.exchange
    );
    if (tupleKey) instrumentOptionIndex.set(tupleKey, normalized);

    const memory = (latestOrderInstrumentResolutionState && typeof latestOrderInstrumentResolutionState === "object")
      ? { ...latestOrderInstrumentResolutionState }
      : {};
    memory[orderResolutionLookupKey(lookupSymbol || normalized.symbol, exchange || normalized.exchange)] = {
      ...normalized,
      environment: envValue,
      remembered_at: Date.now(),
    };
    latestOrderInstrumentResolutionState = memory;
    saveScopedJson(S.orderInstrumentResolutionState, latestOrderInstrumentResolutionState, ORDER_ENV);

    const cached = loadInstruments(envValue);
    if (!cached || !Array.isArray(cached.items)) return;
    const refIdKey = String(normalized.ref_id);
    const exists = cached.items.some((x) => String(x?.ref_id ?? "") === refIdKey);
    if (!exists) {
      cached.items.unshift({
        ref_id: normalized.ref_id,
        asset: normalized.symbol,
        symbol: normalized.instrument_symbol || normalized.symbol,
        stock_name: normalized.stock_name || normalized.symbol,
        exchange: normalized.exchange,
        expiry: normalized.expiry || "",
        derivative_type: normalized.derivative_type || "",
        option_type: normalized.option_type || "",
        strike_price: hasCellValue(normalized.strike_price) ? normalized.strike_price : "",
        lot_size: normalized.lot_size || "",
        tick_size: normalized.tick_size_paise || "",
      });
      try {
        cacheInstruments(cached, envValue);
      } catch (_e) {
        // best effort cache extension
      }
    }
  }

  function resolveInstrumentFromMemory(symbol, exchange, envValue = ORDER_ENV) {
    const key = orderResolutionLookupKey(symbol, exchange);
    const entry = latestOrderInstrumentResolutionState?.[key] || null;
    if (!entry) return null;
    if (asEnv(entry?.environment || "") !== asEnv(envValue)) {
      return null;
    }
    const rememberedAt = Number(entry?.remembered_at || 0);
    if (Number.isFinite(rememberedAt) && Date.now() - rememberedAt > 24 * 60 * 60 * 1000) {
      return null;
    }
    const normalized = normalizeResolvedInstrument(entry, symbol, exchange);
    if (!normalized) return null;
    return normalized;
  }

  function resolveInstrumentFromScopedCache(symbol, exchange, envValue = ORDER_ENV) {
    const cached = loadInstruments(envValue);
    const rows = Array.isArray(cached?.items) ? cached.items : [];
    if (!rows.length) return null;
    return pickBestInstrumentFromRefdataRows(rows, symbol, exchange);
  }

  function pickBestInstrumentFromRefdataRows(rows, symbol, exchange) {
    const ex = upper(exchange || "NSE");
    const q = normalizeIndexSymbolToken(symbol);
    let best = null;
    let bestScore = 0;
    for (const it of Array.isArray(rows) ? rows : []) {
      if (!exchangeCompatible(it?.exchange || "NSE", ex)) continue;
      const candidate = {
        ref_id: Number(it?.ref_id),
        symbol: upper(it?.asset || it?.symbol || it?.stock_name || ""),
        instrument_symbol: upper(it?.symbol || ""),
        stock_name: upper(it?.stock_name || ""),
        exchange: upper(it?.exchange || "NSE"),
        lot_size: Number(it?.lot_size) || null,
        tick_size_paise: normalizeTickSizePaise(it?.tick_size_paise ?? it?.tick_size ?? it?.price_tick ?? it?.tick),
        derivative_type: upper(it?.derivative_type || ""),
        option_type: normalizeOptionType(it?.option_type || ""),
        expiry: normalizeExpiryKey(it?.expiry || ""),
        strike_price: normalizeStrikeForLookup(it?.strike_price),
      };
      if (!Number.isInteger(candidate.ref_id) || candidate.ref_id <= 0) continue;
      const score = rankInstrumentCandidate(candidate, q);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return bestScore >= 55 ? best : null;
  }

  function buildOptionCandidateSymbols(asset, expiry, strike, optionType) {
    const expiryKey = normalizeExpiryKey(expiry);
    const strikeKey = normalizeStrikeForLookup(strike);
    const optionTypeKey = normalizeOptionType(optionType);
    if (!asset || !/^\d{8}$/.test(expiryKey) || strikeKey === null || !optionTypeKey) return [];
    const year = Number(expiryKey.slice(0, 4));
    const month = Number(expiryKey.slice(4, 6));
    const day = Number(expiryKey.slice(6, 8));
    const yy = String(year).slice(-2);
    const strikeText = String(Math.trunc(Number(strikeKey)));
    const monthlyCode = MONTH_CODE_MONTHLY[month];
    const weekly = `${upper(asset)}${yy}${month}${String(day).padStart(2, "0")}${strikeText}${optionTypeKey}`;
    const monthly = monthlyCode ? `${upper(asset)}${yy}${monthlyCode}${strikeText}${optionTypeKey}` : "";
    return Array.from(new Set([weekly, monthly].filter(Boolean)));
  }

  function rebuildInstrumentIndex(cache) {
    instrumentIndex = new Map();
    instrumentOptionIndex = new Map();
    instrumentSymbolIndex = new Map();
    const rows = Array.isArray(cache?.items) ? cache.items : [];
    for (const item of rows) {
      const symbolKey = upper(item?.asset || item?.symbol || item?.stock_name || "");
      const exchangeKey = upper(item?.exchange || "NSE");
      const refId = Number(item?.ref_id);
      if (!symbolKey || !Number.isInteger(refId) || refId <= 0) continue;
      const expiryKey = normalizeExpiryKey(item?.expiry || "");
      const optionTypeKey = normalizeOptionType(item?.option_type || "");
      const strikeKey = normalizeStrikeForLookup(item?.strike_price);
      const optionTupleKey = optionInstrumentLookupKey(symbolKey, expiryKey, optionTypeKey, strikeKey, exchangeKey);
      const current = instrumentIndex.get(instrumentLookupKey(symbolKey, exchangeKey));
      const next = {
        ref_id: refId,
        symbol: symbolKey,
        instrument_symbol: upper(item?.symbol || ""),
        stock_name: upper(item?.stock_name || ""),
        exchange: exchangeKey,
        lot_size: Number(item?.lot_size) || null,
        tick_size_paise: normalizeTickSizePaise(item?.tick_size_paise ?? item?.tick_size ?? item?.price_tick ?? item?.tick),
        derivative_type: upper(item?.derivative_type || ""),
        option_type: optionTypeKey,
        expiry: expiryKey,
        strike_price: strikeKey,
      };
      if (!current) {
        instrumentIndex.set(instrumentLookupKey(symbolKey, exchangeKey), next);
      } else {
        const currentRank = current.derivative_type || current.option_type || current.expiry ? 1 : 0;
        const nextRank = next.derivative_type || next.option_type || next.expiry ? 1 : 0;
        if (nextRank < currentRank) {
          instrumentIndex.set(instrumentLookupKey(symbolKey, exchangeKey), next);
        }
      }
      if (optionTupleKey) {
        if (!instrumentOptionIndex.has(optionTupleKey)) {
          instrumentOptionIndex.set(optionTupleKey, next);
        } else {
          const existing = instrumentOptionIndex.get(optionTupleKey);
          const existingRank = Number.isInteger(Number(existing?.lot_size)) ? 1 : 0;
          const nextTupleRank = Number.isInteger(Number(next?.lot_size)) ? 1 : 0;
          if (nextTupleRank > existingRank) {
            instrumentOptionIndex.set(optionTupleKey, next);
          }
        }
      }
      for (const symbolCandidate of [item?.symbol, item?.stock_name]) {
        if (!clean(symbolCandidate)) continue;
        const symbolLookupKey = instrumentSymbolLookupKey(symbolCandidate, exchangeKey);
        if (!instrumentSymbolIndex.has(symbolLookupKey)) {
          instrumentSymbolIndex.set(symbolLookupKey, next);
        }
      }
    }
  }

  function resolveInstrumentRef(symbol, exchange) {
    const key = instrumentLookupKey(symbol, exchange);
    const exact = instrumentIndex.get(key) || null;
    if (exact) return exact;

    const ex = upper(exchange || "NSE");
    const q = upper(symbol);
    let best = null;
    let bestScore = 0;
    for (const row of instrumentIndex.values()) {
      if (!exchangeCompatible(row?.exchange || "NSE", ex)) continue;
      const score = rankInstrumentCandidate(row, q);
      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }
    return bestScore >= 65 ? best : null;
  }

  function resolveOptionInstrumentRef(asset, expiry, optionType, strike, exchange) {
    const key = optionInstrumentLookupKey(asset, expiry, optionType, strike, exchange);
    if (!key) return null;
    return instrumentOptionIndex.get(key) || null;
  }

  function resolveInstrumentByOptionSymbol(symbol, exchange) {
    const key = instrumentSymbolLookupKey(symbol, exchange);
    if (!key) return null;
    const exact = instrumentSymbolIndex.get(key) || null;
    if (exact) return exact;

    const ex = upper(exchange || "NSE");
    const q = upper(symbol);
    let best = null;
    let bestScore = 0;
    for (const [k, row] of instrumentSymbolIndex.entries()) {
      const [candidate, candidateEx] = String(k || "").split("|");
      if (!exchangeCompatible(candidateEx || "NSE", ex)) continue;
      const score = symbolRelaxedMatch(candidate, q) ? (isLikelyCashInstrument(row) ? 80 : 55) : 0;
      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }
    return bestScore >= 60 ? best : null;
  }

  function resolveTrackedSource(trackedState) {
    const symbolText = clean(trackedState?.symbol || "");
    const [symbolAsset = "", symbolExpiry = ""] = symbolText.split(":");
    return {
      asset: upper(trackedState?.source?.asset || symbolAsset),
      expiry: normalizeExpiryKey(trackedState?.source?.expiry || symbolExpiry),
      exchange: upper(trackedState?.source?.exchange || "NSE"),
    };
  }

  function resolveTrackedLegRefId(trackedState, leg, rows = null) {
    const currentRefId = Number(leg?.ref_id);
    if (Number.isInteger(currentRefId) && currentRefId > 0) return currentRefId;
    const source = resolveTrackedSource(trackedState);
    const optionType = normalizeOptionType(leg?.option_type || "");
    const strikeCandidates = Array.from(new Set([leg?.strike_raw, leg?.strike]
      .map((x) => normalizeStrikeForLookup(x))
      .filter((x) => x !== null)));
    if (!source.asset || !source.expiry || !optionType || !strikeCandidates.length) return null;

    const liveRows = Array.isArray(rows) ? rows : optionRawRowsForSelection(source.asset, source.expiry, source.exchange);
    for (const strike of strikeCandidates) {
      const matchedRow = liveRows.find((row) =>
        normalizeOptionType(row?.side) === optionType
        && normalizeStrikeForLookup(row?.sp ?? row?.strike_price ?? row?.strike) === strike
      );
      const rowRef = Number(matchedRow?.ref_id);
      if (Number.isInteger(rowRef) && rowRef > 0) return rowRef;
    }

    for (const strike of strikeCandidates) {
      const symbolCandidates = buildOptionCandidateSymbols(source.asset, source.expiry, strike, optionType);
      for (const symbolCandidate of symbolCandidates) {
        const symbolMatch = resolveInstrumentByOptionSymbol(symbolCandidate, source.exchange);
        const symbolRef = Number(symbolMatch?.ref_id);
        if (Number.isInteger(symbolRef) && symbolRef > 0) return symbolRef;
      }
    }

    for (const strike of strikeCandidates) {
      const tupleMatch = resolveOptionInstrumentRef(source.asset, source.expiry, optionType, strike, source.exchange);
      const tupleRef = Number(tupleMatch?.ref_id);
      if (Number.isInteger(tupleRef) && tupleRef > 0) return tupleRef;
    }
    return null;
  }

  function hydrateTrackedLegsFromLive(trackedState) {
    if (!trackedState?.legs?.length) return { updated: false, resolved: 0, missing: 0, liveHydrated: 0 };
    const source = resolveTrackedSource(trackedState);
    if (!source.asset || !source.expiry) return { updated: false, resolved: 0, missing: trackedState.legs.length, liveHydrated: 0 };
    const rows = optionRawRowsForSelection(source.asset, source.expiry, source.exchange);
    let updated = false;
    let resolved = 0;
    let liveHydrated = 0;

    for (const leg of trackedState.legs) {
      const originalRef = Number(leg?.ref_id);
      const fallbackRef = resolveTrackedLegRefId(trackedState, leg, rows);
      if ((!Number.isInteger(originalRef) || originalRef <= 0) && Number.isInteger(fallbackRef) && fallbackRef > 0) {
        leg.ref_id = fallbackRef;
        updated = true;
        resolved += 1;
      }

      const optionType = normalizeOptionType(leg?.option_type || "");
      const strikeMatch = normalizeStrikeForLookup(leg?.strike_raw ?? leg?.strike);
      if (!optionType || strikeMatch === null) continue;
      const liveRow = rows.find((row) =>
        normalizeOptionType(row?.side) === optionType
        && normalizeStrikeForLookup(row?.sp ?? row?.strike_price ?? row?.strike) === strikeMatch
      );
      if (!liveRow) continue;

      const nextFields = {
        strike_raw: Number.isFinite(Number(liveRow?.sp)) ? Number(liveRow.sp) : leg.strike_raw,
        strike: Number.isFinite(Number(liveRow?.sp)) ? round2(Number(liveRow.sp) / 100) : leg.strike,
        lot_size: Number.isFinite(Number(liveRow?.ls)) ? Number(liveRow.ls) : leg.lot_size,
        ltp: Number.isFinite(Number(liveRow?.ltp)) ? Number(liveRow.ltp) : leg.ltp,
        delta: Number.isFinite(Number(liveRow?.delta)) ? Number(liveRow.delta) : leg.delta,
        gamma: Number.isFinite(Number(liveRow?.gamma)) ? Number(liveRow.gamma) : leg.gamma,
        theta: Number.isFinite(Number(liveRow?.theta)) ? Number(liveRow.theta) : leg.theta,
        vega: Number.isFinite(Number(liveRow?.vega)) ? Number(liveRow.vega) : leg.vega,
        oi: Number.isFinite(Number(liveRow?.oi)) ? Number(liveRow.oi) : leg.oi,
        vol: Number.isFinite(Number(liveRow?.volume)) ? Number(liveRow.volume) : leg.vol,
      };
      for (const [k, v] of Object.entries(nextFields)) {
        if (!hasCellValue(v)) continue;
        if (leg[k] !== v) {
          leg[k] = v;
          updated = true;
        }
      }
      liveHydrated += 1;
    }

    const missing = (trackedState.legs || []).filter((leg) => {
      const ref = Number(leg?.ref_id);
      return !Number.isInteger(ref) || ref <= 0;
    }).length;
    if (updated) trackedState.live_updated_at = formatIstDateTime(new Date());
    return { updated, resolved, missing, liveHydrated };
  }

  async function resolveTrackedLegsViaServer(trackedState, options = {}) {
    if (!trackedState?.legs?.length) return { updated: false, resolved: 0, missing: 0 };
    const source = resolveTrackedSource(trackedState);
    if (!source.asset || !source.expiry) return { updated: false, resolved: 0, missing: trackedState.legs.length };
    if (!tok("session", ORDER_ENV)) return { updated: false, resolved: 0, missing: trackedState.legs.length };

    const force = Boolean(options.force);
    const unresolvedLegs = trackedState.legs.filter((leg) => {
      const ref = Number(leg?.ref_id);
      return !Number.isInteger(ref) || ref <= 0;
    });
    if (!force && !unresolvedLegs.length) return { updated: false, resolved: trackedState.legs.length, missing: 0 };

    const res = await fetch("/api/refdata/resolve-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        environment: ORDER_ENV,
        sessionToken: tok("session", ORDER_ENV),
        deviceId: devId(),
        asset: source.asset,
        expiry: source.expiry,
        exchange: source.exchange,
        date: todayIst(),
        force_resolve: force,
        legs: trackedState.legs.map((leg) => ({
          side: leg.side,
          option_type: leg.option_type,
          strike: leg.strike,
          strike_raw: leg.strike_raw,
          ref_id: leg.ref_id,
          lot_size: leg.lot_size,
        })),
      }),
    });
    const data = await jsonSafe(res);
    if (!res.ok) {
      if (!options.silent) {
        lg(`Server ref resolution failed: ${data?.error || data?.message || `HTTP ${res.status}`}`, true);
      }
      return { updated: false, resolved: 0, missing: force ? trackedState.legs.length : unresolvedLegs.length };
    }

    const resolvedLegs = Array.isArray(data?.legs) ? data.legs : [];
    let updated = false;
    for (let i = 0; i < trackedState.legs.length; i += 1) {
      const next = resolvedLegs[i];
      const leg = trackedState.legs[i];
      if (!leg || !next) continue;
      const nextRef = Number(next?.ref_id);
      if (Number.isInteger(nextRef) && nextRef > 0 && Number(leg.ref_id) !== nextRef) {
        leg.ref_id = nextRef;
        updated = true;
      }
      if (hasCellValue(next?.lot_size) && Number(leg.lot_size) !== Number(next.lot_size)) {
        leg.lot_size = Number(next.lot_size);
        updated = true;
      }
      if (next?.resolved_symbol && leg.resolved_symbol !== next.resolved_symbol) {
        leg.resolved_symbol = next.resolved_symbol;
        updated = true;
      }
      if (next?.resolution_source && leg.resolution_source !== next.resolution_source) {
        leg.resolution_source = next.resolution_source;
        updated = true;
      }
    }
    if (updated) {
      trackedState.live_updated_at = formatIstDateTime(new Date());
      saveScopedJson(S.trackedStrategyState, trackedState, ORDER_ENV);
    }
    return {
      updated,
      resolved: Number(data?.resolved || 0),
      missing: Number(data?.missing || 0),
    };
  }

  function updateMarketResolvedMeta(message) {
    if (!U?.marketOrderResolvedMeta) return;
    U.marketOrderResolvedMeta.textContent = clean(message) || "Instrument auto-resolution idle.";
  }

  function optionRawRowsForSelection(asset, expiry, exchange) {
    const st = ws[STREAM.oc];
    const rows = Array.from(st?.opt?.values?.() || []);
    return rows.filter((x) =>
      upper(x.asset) === upper(asset)
      && normalizeExpiryKey(x.expiry) === normalizeExpiryKey(expiry)
      && upper(x.exchange || "NSE") === upper(exchange || "NSE")
    );
  }

  function toStrategySnapshot(asset, expiry, exchange) {
    const rows = optionRawRowsForSelection(asset, expiry, exchange);
    const calls = [];
    const puts = [];
    let atm = null;
    let currentPrice = null;
    for (const x of rows) {
      const strikeRaw = Number(x.sp);
      if (!Number.isFinite(strikeRaw)) continue;
      const leg = {
        option_type: upper(x.side),
        ref_id: Number.isInteger(Number(x.ref_id)) ? Number(x.ref_id) : null,
        strike: strikeRaw,
        ltp: Number.isFinite(Number(x.ltp)) ? Number(x.ltp) : null,
        delta: Number.isFinite(Number(x.delta)) ? Number(x.delta) : null,
        gamma: Number.isFinite(Number(x.gamma)) ? Number(x.gamma) : null,
        theta: Number.isFinite(Number(x.theta)) ? Number(x.theta) : null,
        vega: Number.isFinite(Number(x.vega)) ? Number(x.vega) : null,
        oi: Number.isFinite(Number(x.oi)) ? Number(x.oi) : null,
        vol: Number.isFinite(Number(x.volume)) ? Number(x.volume) : null,
        lot_size: Number.isFinite(Number(x.ls)) ? Number(x.ls) : null,
      };
      if (upper(x.side) === "CE") calls.push(leg);
      else if (upper(x.side) === "PE") puts.push(leg);
      if (atm === null && Number.isFinite(Number(x.atm))) atm = Number(x.atm);
      if (currentPrice === null && Number.isFinite(Number(x.cp))) currentPrice = Number(x.cp);
      if (currentPrice === null && Number.isFinite(Number(x.price_pcp))) currentPrice = Number(x.price_pcp);
    }
    if (!calls.length && !puts.length) return null;
    return { asset: upper(asset), expiry: clean(expiry), exchange: upper(exchange), atm, current_price: currentPrice, calls, puts };
  }

  function snapshotCenter(snapshot) {
    if (Number.isFinite(snapshot?.atm)) return snapshot.atm;
    if (Number.isFinite(snapshot?.current_price)) return snapshot.current_price;
    const strikes = Array.from(new Set([...(snapshot?.calls || []), ...(snapshot?.puts || [])].map((leg) => Number(leg.strike)).filter(Number.isFinite))).sort((a, b) => a - b);
    if (!strikes.length) return null;
    return strikes[Math.floor(strikes.length / 2)];
  }

  function selectStraddleJs(snapshot) {
    const center = snapshotCenter(snapshot);
    if (!Number.isFinite(center)) return null;
    let callsByStrike = new Map((snapshot.calls || []).filter((leg) => leg.delta !== null).map((leg) => [leg.strike, leg]));
    let putsByStrike = new Map((snapshot.puts || []).filter((leg) => leg.delta !== null).map((leg) => [leg.strike, leg]));
    if (!callsByStrike.size || !putsByStrike.size) {
      callsByStrike = new Map((snapshot.calls || []).map((leg) => [leg.strike, leg]));
      putsByStrike = new Map((snapshot.puts || []).map((leg) => [leg.strike, leg]));
    }
    const strikes = Array.from(callsByStrike.keys()).filter((strike) => putsByStrike.has(strike));
    if (!strikes.length) return null;
    const nearest = strikes.reduce((best, strike) => (best === null || Math.abs(strike - center) < Math.abs(best - center) ? strike : best), null);
    if (!Number.isFinite(nearest)) return null;
    return [callsByStrike.get(nearest), putsByStrike.get(nearest)];
  }

  function selectStrangleJs(snapshot, targetDelta, tolerance = 0.05) {
    const center = snapshotCenter(snapshot);
    if (!Number.isFinite(center)) return [];
    const calls = (snapshot.calls || []).filter((leg) => leg.delta !== null && leg.strike >= center).sort((a, b) => a.strike - b.strike);
    const puts = (snapshot.puts || []).filter((leg) => leg.delta !== null && leg.strike <= center).sort((a, b) => b.strike - a.strike);
    if (!calls.length || !puts.length) {
      const fallbackCalls = (snapshot.calls || []).filter((leg) => leg.strike > center).sort((a, b) => a.strike - b.strike);
      const fallbackPuts = (snapshot.puts || []).filter((leg) => leg.strike < center).sort((a, b) => b.strike - a.strike);
      return fallbackCalls.length && fallbackPuts.length ? [[fallbackCalls[0], fallbackPuts[0]]] : [];
    }
    const usedPuts = new Set();
    const pairs = [];
    for (const call of calls) {
      const callDelta = Math.abs(Number(call.delta));
      for (let j = 0; j < puts.length; j += 1) {
        if (usedPuts.has(j)) continue;
        const put = puts[j];
        const putDelta = -Math.abs(Number(put.delta));
        const netDelta = -callDelta - putDelta;
        if (Math.abs(netDelta - Number(targetDelta)) <= tolerance) {
          pairs.push([call, put]);
          usedPuts.add(j);
          break;
        }
      }
    }
    return pairs;
  }

  function selectIronButterflyJs(snapshot, targetDelta) {
    const atmPair = selectStraddleJs(snapshot);
    if (!atmPair) return [];
    const [atmCall, atmPut] = atmPair;
    const atmStrike = atmCall.strike;
    const otmCalls = (snapshot.calls || []).filter((leg) => leg.delta !== null && leg.strike > atmStrike);
    const otmPuts = (snapshot.puts || []).filter((leg) => leg.delta !== null && leg.strike < atmStrike);
    if (!otmCalls.length || !otmPuts.length) return [];
    let best = null;
    for (const call of otmCalls) {
      for (const put of otmPuts) {
        const atmCallDelta = atmCall.delta !== null ? Math.abs(Number(atmCall.delta)) : 0;
        const atmPutDelta = atmPut.delta !== null ? -Math.abs(Number(atmPut.delta)) : 0;
        const callDelta = Math.abs(Number(call.delta));
        const putDelta = -Math.abs(Number(put.delta));
        const total = (-atmCallDelta - atmPutDelta) + (callDelta + putDelta);
        const diff = Math.abs(total - Number(targetDelta));
        if (!best || diff < best.diff) best = { diff, call, put };
      }
    }
    return best ? [[atmCall, atmPut], [best.call, best.put]] : [];
  }

  function selectIronCondorJs(snapshot, targetDelta) {
    const center = snapshotCenter(snapshot);
    if (!Number.isFinite(center)) return [];
    const shortCalls = (snapshot.calls || []).filter((leg) => leg.delta !== null && leg.strike > center).sort((a, b) => a.strike - b.strike);
    const shortPuts = (snapshot.puts || []).filter((leg) => leg.delta !== null && leg.strike < center).sort((a, b) => b.strike - a.strike);
    let best = null;
    for (const shortCall of shortCalls) {
      const longCalls = (snapshot.calls || []).filter((leg) => leg.delta !== null && leg.strike > shortCall.strike);
      for (const shortPut of shortPuts) {
        const longPuts = (snapshot.puts || []).filter((leg) => leg.delta !== null && leg.strike < shortPut.strike);
        for (const longCall of longCalls) {
          for (const longPut of longPuts) {
            const total = (-Math.abs(Number(shortCall.delta)) - (-Math.abs(Number(shortPut.delta))))
              + (Math.abs(Number(longCall.delta)) + (-Math.abs(Number(longPut.delta))));
            const diff = Math.abs(total - Number(targetDelta));
            if (!best || diff < best.diff) best = { diff, shortCall, shortPut, longCall, longPut };
          }
        }
      }
    }
    return best ? [[best.shortCall, best.shortPut], [best.longCall, best.longPut]] : [];
  }

  function pairGroupsJs(strategy, pairs) {
    if (!Array.isArray(pairs) || !pairs.length) return [];
    if (strategy === "iron_butterfly" || strategy === "iron_condor") return [pairs];
    return pairs.map((pair) => [pair]);
  }

  function computeStrategyGreeksJs(snapshot, legs) {
    const callMap = new Map((snapshot.calls || []).map((leg) => [leg.strike, leg]));
    const putMap = new Map((snapshot.puts || []).map((leg) => [leg.strike, leg]));
    const totals = { delta: 0, gamma: 0, theta: 0, vega: 0, ltp: 0 };
    const seen = { delta: false, gamma: false, theta: false, vega: false, ltp: false };
    for (const leg of legs || []) {
      const side = upper(leg.side || "SELL");
      const position = side === "BUY" ? 1 : -1;
      const optionType = upper(leg.option_type);
      const strikeRaw = Number(leg.strike_raw);
      const liveLeg = optionType === "CE" ? callMap.get(strikeRaw) : putMap.get(strikeRaw);
      if (!liveLeg) continue;
      if (liveLeg.delta !== null) {
        const signedDelta = optionType === "CE" ? Math.abs(Number(liveLeg.delta)) : -Math.abs(Number(liveLeg.delta));
        totals.delta += position * signedDelta;
        seen.delta = true;
      }
      for (const key of ["gamma", "theta", "vega", "ltp"]) {
        if (liveLeg[key] !== null) {
          totals[key] += position * Number(liveLeg[key]);
          seen[key] = true;
        }
      }
    }
    return Object.fromEntries(Object.keys(totals).map((key) => [key, seen[key] ? totals[key] : null]));
  }

  function buildStrategyPreviewPayload(strategy, targetDelta, groups, pairNumber, snapshot) {
    let targetGroups = groups;
    if (Number.isInteger(pairNumber) && pairNumber > 0) {
      if (pairNumber > groups.length) throw new Error(`Pair number must be between 1 and ${groups.length}.`);
      targetGroups = [groups[pairNumber - 1]];
    }
    const legs = [];
    const seen = new Set();
    for (const group of targetGroups) {
      for (let groupIdx = 0; groupIdx < group.length; groupIdx += 1) {
        const [callLeg, putLeg] = group[groupIdx];
        const side = strategy === "iron_butterfly" || strategy === "iron_condor"
          ? (groupIdx === 0 ? "SELL" : "BUY")
          : "SELL";
        const entries = [
          { side, option_type: "CE", leg: callLeg },
          { side, option_type: "PE", leg: putLeg },
        ];
        for (const entry of entries) {
          const key = `${entry.option_type}|${entry.leg.ref_id ?? entry.leg.strike}`;
          if (seen.has(key)) continue;
          seen.add(key);
          legs.push({
            side: entry.side,
            option_type: entry.option_type,
            ref_id: entry.leg.ref_id,
            strike_raw: Number(entry.leg.strike),
            strike: round2(Number(entry.leg.strike) / 100),
            lot_size: entry.leg.lot_size ?? null,
          });
        }
      }
    }
    const baseline = computeStrategyGreeksJs(snapshot, legs);
    const strategySlug = String(strategy || "strategy").replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
    const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "T");
    const unique = Math.random().toString(16).slice(2, 8);
    const tagBase = `${strategySlug}_${ts}_${unique}`;
    return {
      symbol: `${snapshot.asset}:${snapshot.expiry}`,
      asset: snapshot.asset,
      expiry: snapshot.expiry,
      strategy,
      target_delta: Number(targetDelta),
      pair_number: Number.isInteger(pairNumber) && pairNumber > 0 ? pairNumber : null,
      selected_at: new Date().toISOString(),
      baseline_greeks: baseline,
      strategy_tag_base: tagBase,
      entry_tag: `${tagBase}_entry`,
      exit_tag: `${tagBase}_exit`,
      order_qty: null,
      legs,
    };
  }

  async function buildStrategyPreview() {
    const asset = upper(U?.strategyPreviewAssetInput?.value);
    const expiry = clean(U?.strategyPreviewExpiryInput?.value);
    const exchange = upper(U?.strategyPreviewExchangeSelect?.value || "NSE");
    const strategy = clean(U?.strategyPreviewTypeSelect?.value || "strangle");
    const targetDelta = Number(clean(U?.strategyPreviewTargetDeltaSelect?.value || "0"));
    const pairNumberText = clean(U?.strategyPreviewPairNumberInput?.value);
    const pairNumber = pairNumberText ? Number(pairNumberText) : null;
    if (!asset || !expiry) throw new Error("Asset and expiry are required for strategy preview.");
    if (!tok("session", DATA_ENV)) throw new Error(`Please login to ${envLabel(DATA_ENV)} first for live data.`);

    const res = await fetch("/api/strategy/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        environment: DATA_ENV,
        sessionToken: tok("session", DATA_ENV),
        deviceId: devId(),
        asset,
        expiry,
        exchange,
        strategy,
        target_delta: targetDelta,
        pair_number: Number.isInteger(pairNumber) && pairNumber > 0 ? pairNumber : null,
      }),
    });
    const data = await jsonSafe(res);
    if (!res.ok) throw new Error(data?.error || data?.message || `Strategy preview failed (${res.status}).`);
    setStrategyPreviewActionMessage("Strategy preview built from PROD live OC snapshot.", "success");
    latestStrategyPreviewState = data;
    saveScopedJson(S.strategyPreviewState, latestStrategyPreviewState, ORDER_ENV);
    setStrategyPreviewResponse(latestStrategyPreviewState);
    lg(`Strategy preview built for ${asset}:${expiry} ${strategy} target ${targetDelta} via backend (${envLabel(DATA_ENV)} snapshot).`);
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  function instrumentResolutionHelpMessage(symbol, exchange, envValue = ORDER_ENV) {
    const symbolKey = upper(symbol);
    const ex = upper(exchange || "NSE");
    const hints = [];
    const rows = Array.isArray(loadInstruments(envValue)?.items) ? loadInstruments(envValue).items : [];
    for (const row of rows) {
      const rowEx = upper(row?.exchange || "NSE");
      if (rowEx !== ex) continue;
      const rowSymbol = upper(row?.symbol || row?.asset || row?.stock_name || "");
      if (!rowSymbol) continue;
      if (rowSymbol.startsWith(symbolKey) || rowSymbol.includes(symbolKey)) hints.push(rowSymbol);
      if (hints.length >= 3) break;
    }
    const hintText = hints.length ? ` Try: ${hints.join(", ")}.` : "";
    return `No cached instrument match for ${symbolKey} on ${ex}.${hintText} Sync instruments first if needed.`;
  }

  function resolveMarketRefFromInputs(options = {}) {
    const symbol = clean(U?.marketOrderSymbolInput?.value);
    const exchange = upper(U?.marketOrderExchangeSelect?.value || "NSE");
    const targetEnv = asEnv(options.envOverride || ORDER_ENV);
    if (!symbol) {
      if (!options.silent) setMarketOrderActionMessage("Enter a symbol or asset to place the order.");
      if (U?.marketOrderRefIdInput) U.marketOrderRefIdInput.value = "";
      updateMarketResolvedMeta("Enter a symbol or asset to auto-resolve the instrument.");
      return null;
    }
    const match = resolveInstrumentFromScopedCache(symbol, exchange, targetEnv)
      || resolveInstrumentFromMemory(symbol, exchange, targetEnv);
    if (!match) {
      const msg = instrumentResolutionHelpMessage(symbol, exchange, targetEnv);
      if (!options.silent) setMarketOrderActionMessage(msg);
      if (U?.marketOrderRefIdInput) U.marketOrderRefIdInput.value = "";
      updateMarketResolvedMeta(msg);
      if (options.autoSyncOnMiss && isAuthEnv(targetEnv)) {
        autoSyncInstrumentsIfStale(exchange, { envOverride: targetEnv }).catch(() => null);
      }
      return null;
    }
    if (U?.marketOrderRefIdInput) U.marketOrderRefIdInput.value = String(match.ref_id);
    if (match.lot_size && U?.marketOrderQtyInput) {
      const currentQty = Number(clean(U.marketOrderQtyInput.value || ""));
      if (!Number.isInteger(currentQty) || currentQty <= 0) {
        U.marketOrderQtyInput.value = String(match.lot_size);
      }
    }
    updateMarketResolvedMeta(
      `Resolved ${upper(match.symbol || symbol)} | ref_id ${match.ref_id} | ${match.exchange} | lot_size ${match.lot_size || "-"}${match.expiry ? ` | expiry ${match.expiry}` : ""}`
    );
    upsertResolvedInstrumentCache(match, symbol, exchange, targetEnv);
    if (!options.silent) setMarketOrderActionMessage("Instrument resolved from cached instruments.", "success");
    return match;
  }

  async function fetchOrderbookLtpPaise(refId) {
    const id = Number(refId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const quoteEnvs = [ORDER_ENV, DATA_ENV].filter((envValue, idx, arr) => arr.indexOf(envValue) === idx);
    for (const quoteEnv of quoteEnvs) {
      if (!isAuthEnv(quoteEnv)) continue;
      try {
        const data = await req(`/orderbooks/${encodeURIComponent(String(id))}?levels=1`, { token: "session", envOverride: quoteEnv });
        const ltp = Number(data?.orderBook?.ltp ?? data?.ltp);
        if (Number.isFinite(ltp) && ltp > 0) {
          return { ltpPaise: Math.round(ltp), source: `rest.orderbook.${String(quoteEnv || "").toLowerCase()}` };
        }
      } catch (_e) {
        // ignore and fall back
      }
    }
    return null;
  }

  async function fetchSymbolPriceLtpPaise(symbol, exchange) {
    const sym = upper(symbol || "");
    const ex = upper(exchange || "NSE");
    if (!sym) return null;
    const quoteEnvs = [ORDER_ENV, DATA_ENV].filter((envValue, idx, arr) => arr.indexOf(envValue) === idx);
    for (const quoteEnv of quoteEnvs) {
      if (!isAuthEnv(quoteEnv)) continue;
      try {
        const q = ex && ex !== "NSE" ? `?exchange=${encodeURIComponent(ex)}` : "";
        const data = await req(`/optionchains/${encodeURIComponent(sym)}/price${q}`, { token: "session", envOverride: quoteEnv });
        const ltp = Number(data?.price ?? data?.ltp);
        if (Number.isFinite(ltp) && ltp > 0) {
          return { ltpPaise: Math.round(ltp), source: `rest.symbol_price.${String(quoteEnv || "").toLowerCase()}` };
        }
      } catch (_e) {
        // ignore and report unavailable
      }
    }
    return null;
  }

  async function resolveSingleOrderLtpPaise(refId, symbol, exchange) {
    const numericRefId = Number(refId);
    if (Number.isInteger(numericRefId) && numericRefId > 0) {
      const refKey = String(numericRefId);
      for (const streamKey of [STREAM.master, STREAM.oc, STREAM.prices]) {
        const ob = ws[streamKey]?.ob?.get(refKey);
        const obLtp = Number(ob?.ltp);
        if (Number.isFinite(obLtp) && obLtp > 0) {
          return {
            ltpPaise: Math.round(obLtp),
            source: `${streamKey}.orderbook`,
          };
        }
      }

      for (const streamKey of [STREAM.oc, STREAM.master, STREAM.prices]) {
        for (const row of Array.from(ws[streamKey]?.opt?.values?.() || [])) {
          if (Number(row?.ref_id) !== numericRefId) continue;
          const optionLtp = Number(row?.ltp);
          if (!Number.isFinite(optionLtp) || optionLtp <= 0) continue;
          return {
            ltpPaise: Math.round(optionLtp),
            source: `${streamKey}.option_chain`,
          };
        }
      }
    }

    const symbolKey = upper(symbol || "");
    if (symbolKey) {
      const exchangeKey = upper(exchange || "NSE");
      for (const streamKey of [STREAM.prices, STREAM.master]) {
        const exactKey = `${exchangeKey}|${symbolKey}`;
        const exact = ws[streamKey]?.idx?.get(exactKey);
        const exactLtp = Number(exact?.ltp);
        if (Number.isFinite(exactLtp) && exactLtp > 0) {
          return { ltpPaise: Math.round(exactLtp), source: `${streamKey}.index` };
        }

        for (const row of Array.from(ws[streamKey]?.idx?.values?.() || [])) {
          if (!symbolRelaxedMatch(row?.symbol, symbolKey)) continue;
          if (!exchangeCompatible(row?.exchange || "NSE", exchangeKey)) continue;
          const idxLtp = Number(row?.ltp);
          if (Number.isFinite(idxLtp) && idxLtp > 0) {
            return {
              ltpPaise: Math.round(idxLtp),
              source: `${streamKey}.index`,
            };
          }
        }
      }
    }

    const restByRef = await fetchOrderbookLtpPaise(numericRefId);
    if (restByRef) return restByRef;

    const restBySymbol = await fetchSymbolPriceLtpPaise(symbol, exchange);
    if (restBySymbol) return restBySymbol;

    return null;
  }

  async function placeSingleMarketOrder() {
    assertUatOnlyOrderAction();
    if (!isAuthEnv(ORDER_ENV)) throw new Error(`Please login to ${envLabel(ORDER_ENV)} first.`);

    const symbol = clean(U?.marketOrderSymbolInput?.value);
    const exchange = upper(U?.marketOrderExchangeSelect?.value || "NSE");
    if (!symbol) {
      setMarketOrderActionMessage("Symbol or asset is required.");
      throw new Error("Missing symbol or asset.");
    }
    setMarketOrderActionMessage("Resolving instrument from UAT broker refdata...", "info");
    let resolved = await resolveInstrumentRefViaFreshRefdata(symbol, exchange, { envOverride: ORDER_ENV });
    if (!resolved && isAuthEnv(ORDER_ENV)) {
      try {
        await autoSyncInstrumentsIfStale(exchange, { envOverride: ORDER_ENV, force: true });
      } catch (_e) {
        // fall through and surface normal resolution guidance below
      }
      resolved = resolveInstrumentFromScopedCache(symbol, exchange, ORDER_ENV)
        || resolveInstrumentFromMemory(symbol, exchange, ORDER_ENV);
    }
    if (resolved?.ref_id) {
      upsertResolvedInstrumentCache(resolved, symbol, exchange, ORDER_ENV);
      if (U?.marketOrderRefIdInput) U.marketOrderRefIdInput.value = String(resolved.ref_id);
      updateMarketResolvedMeta(
        `Resolved ${upper(resolved.symbol || symbol)} | ref_id ${resolved.ref_id} | ${resolved.exchange} | lot_size ${resolved.lot_size || "-"}`
      );
    }
    const refId = Number(resolved?.ref_id);
    const qty = Number(clean(U?.marketOrderQtyInput?.value || "1"));
    const orderSide = clean(U?.marketOrderSideSelect?.value || "ORDER_SIDE_BUY");
    const delivery = clean(U?.marketOrderDeliverySelect?.value || "ORDER_DELIVERY_TYPE_CNC");
    const validity = clean(U?.marketOrderValiditySelect?.value || "DAY");
    const tag = clean(U?.marketOrderTagInput?.value || `excel_place_order_${Date.now()}`);
    const tickSizeOverridePaise = parseTickSizeInputToPaise(U?.marketOrderTickSizeInput?.value || "");

    if (!Number.isInteger(refId) || refId <= 0) {
      const msg = instrumentResolutionHelpMessage(symbol, exchange, ORDER_ENV);
      setMarketOrderActionMessage(msg);
      throw new Error(msg);
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setMarketOrderActionMessage("Quantity must be a positive integer.");
      throw new Error("Invalid order quantity.");
    }
    if (resolved?.lot_size && qty % resolved.lot_size !== 0) {
      setMarketOrderActionMessage(`Quantity must be a multiple of lot size ${resolved.lot_size}.`);
      throw new Error("Invalid order quantity for lot size.");
    }

    const ltpInfo = await resolveSingleOrderLtpPaise(refId, symbol, exchange);
    if (!ltpInfo || !Number.isInteger(ltpInfo.ltpPaise) || ltpInfo.ltpPaise <= 0) {
      setMarketOrderActionMessage("LTP unavailable for this instrument. Start Master WS or Live OC stream and retry.");
      throw new Error("LTP unavailable for place order.");
    }

    const bufferStyle = upper(orderSide) === "ORDER_SIDE_BUY" ? "buy_positive" : "sell_positive";
    const rawBufferedOrderPrice = applySignedPriceBuffer(ltpInfo.ltpPaise, SINGLE_ORDER_LTP_BUFFER_BPS, bufferStyle);
    const tickSizePaise = tickSizeOverridePaise || defaultTickSizePaiseForInstrument(resolved, exchange);
    const bufferedOrderPrice = alignPriceToTick(rawBufferedOrderPrice, tickSizePaise, orderSide);
    if (!Number.isInteger(bufferedOrderPrice) || bufferedOrderPrice <= 0) {
      setMarketOrderActionMessage("Buffered order price could not be computed from live LTP.");
      throw new Error("Buffered order price unavailable.");
    }

    const payload = {
      ref_id: refId,
      order_type: "ORDER_TYPE_REGULAR",
      order_qty: qty,
      order_side: orderSide,
      order_delivery_type: delivery,
      validity_type: validity,
      price_type: "LIMIT",
      order_price: bufferedOrderPrice,
      tag,
    };
    if (exchange) payload.exchange = exchange;

    setMarketOrderActionMessage("");
    setMarketOrderResponse({
      request: payload,
      status: "submitting",
      environment: envLabel(ORDER_ENV),
      ltp_source: ltpInfo.source,
      ltp_paise: ltpInfo.ltpPaise,
      ltp_rupee: paiseToRupee(ltpInfo.ltpPaise),
      ltp_buffer_bps: SINGLE_ORDER_LTP_BUFFER_BPS,
      tick_size_paise: tickSizePaise,
      tick_size_rupee: paiseToRupee(tickSizePaise),
      raw_buffered_order_price_paise: rawBufferedOrderPrice,
      raw_buffered_order_price_rupee: paiseToRupee(rawBufferedOrderPrice),
      buffered_order_price_paise: bufferedOrderPrice,
      buffered_order_price_rupee: paiseToRupee(bufferedOrderPrice),
      instrument: resolved || (symbol ? { symbol: upper(symbol), exchange } : null),
    });

    const response = await req("/orders/v2/single", {
      method: "POST",
      token: "session",
      envOverride: ORDER_ENV,
      body: payload,
    });

    latestMarketOrderState = {
      environment: envLabel(ORDER_ENV),
      requested_at_ist: formatIstDateTime(new Date()),
      instrument: resolved || (symbol ? { symbol: upper(symbol), exchange } : null),
      ltp_source: ltpInfo.source,
      ltp_paise: ltpInfo.ltpPaise,
      ltp_rupee: paiseToRupee(ltpInfo.ltpPaise),
      ltp_buffer_bps: SINGLE_ORDER_LTP_BUFFER_BPS,
      tick_size_paise: tickSizePaise,
      tick_size_rupee: paiseToRupee(tickSizePaise),
      raw_buffered_order_price_paise: rawBufferedOrderPrice,
      raw_buffered_order_price_rupee: paiseToRupee(rawBufferedOrderPrice),
      buffered_order_price_paise: bufferedOrderPrice,
      buffered_order_price_rupee: paiseToRupee(bufferedOrderPrice),
      request: payload,
      response,
    };
    saveScopedJson(S.marketOrderState, latestMarketOrderState, ORDER_ENV);
    setMarketOrderResponse(latestMarketOrderState);
    const orderId = pickToken(response, ["order_id", "orderId", "id"]);
    upsertSingleTrade({
      id: `single_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      environment: envLabel(ORDER_ENV),
      created_at: formatIstDateTime(new Date()),
      requested_at_ist: latestMarketOrderState.requested_at_ist,
      opened_at: null,
      closed_at: null,
      closed: false,
      status: "entry_pending",
      symbol: upper(symbol),
      exchange,
      ref_id: refId,
      tick_size_paise: tickSizePaise,
      order_qty: qty,
      open_qty: qty,
      tag,
      entry_order_id: hasCellValue(orderId) ? Number(orderId) : null,
      entry_order_side: orderSide,
      delivery_type: delivery,
      validity_type: validity,
      pnl_anchor_mode: "fresh_zero",
      pnl_anchor_live_pnl_rupee: 0,
      pnl_anchor_ltp_paise: ltpInfo.ltpPaise,
      pnl_anchor_entry_price_paise: null,
      pnl_anchor_seeded_at: formatIstDateTime(new Date()),
      entry_request: payload,
      entry_response: response,
      entry_requested_price_paise: bufferedOrderPrice,
      entry_fill_price_paise: null,
      ltp_paise: ltpInfo.ltpPaise,
      live_pnl_rupee: null,
      target_price_paise: null,
      target_exit_inflight: false,
      sl_order_id: null,
      sl_status: "",
      sl_trigger_price_paise: null,
      exit_order_id: null,
      exit_reason: "",
      exit_fill_price_paise: null,
      booked_pnl_rupee: null,
    });
    if (hasCellValue(orderId) && U?.orderLookupIdInput) U.orderLookupIdInput.value = String(orderId);
    if (U?.orderLookupTagInput) U.orderLookupTagInput.value = tag;
    setMarketOrderActionMessage(
      `Buffered LTP order submitted with LIMIT @ ${paiseToRupee(bufferedOrderPrice)} from LTP ${paiseToRupee(ltpInfo.ltpPaise)} (${SINGLE_ORDER_LTP_BUFFER_BPS} bps, tick ${paiseToRupee(tickSizePaise)}, source: ${ltpInfo.source}).`,
      "success"
    );
    lg(
      `Buffered LTP order submitted in ${envLabel(ORDER_ENV)}: ref_id=${refId}, qty=${qty}, side=${orderSide}, `
      + `ltp=${ltpInfo.ltpPaise}, order_price=${bufferedOrderPrice}, buffer_bps=${SINGLE_ORDER_LTP_BUFFER_BPS}.`
    );
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  async function fetchDayOrders() {
    if (!isAuthEnv(ORDER_ENV)) throw new Error(`Please login to ${envLabel(ORDER_ENV)} first.`);
    const tag = clean(U?.orderLookupTagInput?.value);
    const mode = clean(U?.orderLookupModeSelect?.value || "all");
    const qs = new URLSearchParams();
    if (tag) qs.set("tag", tag);
    if (mode === "live") qs.set("executed", "false");
    if (mode === "executed") qs.set("executed", "true");

    setOrderLookupActionMessage("");
    setOrderLookupResponse({ status: "fetching", mode, tag: tag || null, environment: envLabel(ORDER_ENV) });
    const path = `/orders/v2${qs.toString() ? `?${qs.toString()}` : ""}`;
    const response = await req(path, { token: "session", envOverride: ORDER_ENV });
    latestOrderLookupState = {
      environment: envLabel(ORDER_ENV),
      fetched_at_ist: formatIstDateTime(new Date()),
      path,
      response,
    };
    saveScopedJson(S.orderLookupState, latestOrderLookupState, ORDER_ENV);
    setOrderLookupResponse(latestOrderLookupState);
    setOrderLookupActionMessage("Order list fetched.", "success");
    lg(`Fetched day orders in ${envLabel(ORDER_ENV)}${tag ? ` for tag=${tag}` : ""}.`);
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  async function fetchOrderById() {
    if (!isAuthEnv(ORDER_ENV)) throw new Error(`Please login to ${envLabel(ORDER_ENV)} first.`);
    const orderId = Number(clean(U?.orderLookupIdInput?.value));
    if (!Number.isInteger(orderId) || orderId <= 0) {
      setOrderLookupActionMessage("Order ID must be a positive integer.");
      throw new Error("Invalid order ID.");
    }
    const path = `/orders/${orderId}`;
    setOrderLookupActionMessage("");
    setOrderLookupResponse({ status: "fetching", order_id: orderId, environment: envLabel(ORDER_ENV) });
    const response = await req(path, { token: "session", envOverride: ORDER_ENV });
    latestOrderLookupState = {
      environment: envLabel(ORDER_ENV),
      fetched_at_ist: formatIstDateTime(new Date()),
      path,
      response,
    };
    saveScopedJson(S.orderLookupState, latestOrderLookupState, ORDER_ENV);
    setOrderLookupResponse(latestOrderLookupState);
    setOrderLookupActionMessage("Order details fetched.", "success");
    lg(`Fetched order ${orderId} in ${envLabel(ORDER_ENV)}.`);
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  async function fetchBasketByTag() {
    if (!isAuthEnv(ORDER_ENV)) throw new Error(`Please login to ${envLabel(ORDER_ENV)} first.`);
    const tag = clean(U?.basketLookupTagInput?.value);
    if (!tag) {
      setOrderLookupActionMessage("Basket tag is required.");
      throw new Error("Missing basket tag.");
    }
    const path = `/orders/v2/basket?tag=${encodeURIComponent(tag)}`;
    setOrderLookupActionMessage("");
    setOrderLookupResponse({ status: "fetching", basket_tag: tag, environment: envLabel(ORDER_ENV) });
    const response = await req(path, { token: "session", envOverride: ORDER_ENV });
    latestOrderLookupState = {
      environment: envLabel(ORDER_ENV),
      fetched_at_ist: formatIstDateTime(new Date()),
      path,
      response,
    };
    saveScopedJson(S.orderLookupState, latestOrderLookupState, ORDER_ENV);
    setOrderLookupResponse(latestOrderLookupState);
    setOrderLookupActionMessage("Basket lookup fetched.", "success");
    lg(`Fetched basket lookup for tag=${tag} in ${envLabel(ORDER_ENV)}.`);
    await refreshPlaceOrderSheet(REFRESH_REASON.manual);
  }

  function phoneValidationMessage(value) {
    const d = digits(value);
    if (!d) return "Enter your 10-digit mobile number.";
    if (d.length !== 10) return "Phone must be exactly 10 digits.";
    return "";
  }

  function otpValidationMessage(value) {
    const d = digits(value);
    if (!d) return "Enter the 6-digit OTP.";
    if (d.length !== 6) return "OTP must be exactly 6 digits.";
    return "";
  }

  function pinValidationMessage(value) {
    const d = digits(value);
    if (!d) return "Enter your 4-digit MPIN.";
    if (d.length !== 4) return "MPIN must be exactly 4 digits.";
    return "";
  }

  function validatePhone(showMessage = true) {
    const msg = phoneValidationMessage(U?.phoneInput?.value);
    if (showMessage) setFieldMessage(U?.phoneFieldMsg, U?.phoneInput, msg, "error");
    return !msg;
  }

  function validateOtp(showMessage = true) {
    const msg = otpValidationMessage(U?.otpInput?.value);
    if (showMessage) setFieldMessage(U?.otpFieldMsg, U?.otpInput, msg, "error");
    return !msg;
  }

  function validatePin(showMessage = true) {
    const msg = pinValidationMessage(U?.pinInput?.value);
    if (showMessage) setFieldMessage(U?.pinFieldMsg, U?.pinInput, msg, "error");
    return !msg;
  }

  function refreshAuthControls() {
    if (!U) return;
    const isLoggedIn = isAuthEnv(authEnv());
    const phoneOk = validatePhone(false);
    const otpVisible = !U.otpStage?.classList?.contains("hidden");
    const mpinVisible = !U.mpinStage?.classList?.contains("hidden");
    const otpOk = validateOtp(false);
    const pinOk = validatePin(false);

    U.sendOtpButton.disabled = isLoggedIn || !phoneOk;
    U.verifyOtpButton.disabled = isLoggedIn || !otpVisible || !phoneOk || !otpOk;
    U.verifyPinButton.disabled = isLoggedIn || !mpinVisible || !pinOk;
  }

  function dotElementForStream(streamKey) {
    if (!U) return null;
    if (streamKey === STREAM.master) return U.masterWsDot;
    if (streamKey === STREAM.prices) return U.livePricesWsDot;
    if (streamKey === STREAM.oc) return U.liveOcWsDot;
    return null;
  }

  function setWsDot(streamKey, stateClass) {
    const dot = dotElementForStream(streamKey);
    if (!dot) return;
    dot.classList.remove("ready", "running", "stopped");
    dot.classList.add(stateClass);
  }

  function reconnectLabelForStream(streamKey) {
    if (!U) return null;
    if (streamKey === STREAM.master) return U.masterReconnectLabel;
    if (streamKey === STREAM.prices) return U.livePricesReconnectLabel;
    if (streamKey === STREAM.oc) return U.liveOcReconnectLabel;
    return null;
  }

  function setReconnectLabel(streamKey, text) {
    const el = reconnectLabelForStream(streamKey);
    if (!el) return;
    const v = clean(text);
    if (!v) {
      hide(el);
      return;
    }
    el.textContent = v;
    show(el);
  }

  function clearReconnectTimers(st) {
    if (!st) return;
    if (st.reconnectTimer) {
      clearTimeout(st.reconnectTimer);
      st.reconnectTimer = null;
    }
    if (st.reconnectTickTimer) {
      clearInterval(st.reconnectTickTimer);
      st.reconnectTickTimer = null;
    }
  }

  function clearDotResetTimer(streamKey) {
    const st = ws[streamKey];
    if (!st) return;
    if (st.dotResetTimer) {
      clearTimeout(st.dotResetTimer);
      st.dotResetTimer = null;
    }
  }

  function setStoppedThenReady(streamKey, delayMs) {
    const st = ws[streamKey];
    if (!st) return;
    clearDotResetTimer(streamKey);
    clearReconnectTimers(st);
    st.reconnectAttempt = 0;
    setReconnectLabel(streamKey, "");
    setWsDot(streamKey, "stopped");
    st.dotResetTimer = setTimeout(() => {
      st.dotResetTimer = null;
      setWsDot(streamKey, "ready");
    }, Number(delayMs || 1200));
  }

  function normActive(active) {
    const a = active || {};
    const optionItemsRaw = Array.isArray(a.optionItems) ? a.optionItems : [];
    return {
      indexSymbols: Array.from(new Set((Array.isArray(a.indexSymbols) ? a.indexSymbols : []).map((x) => upper(x)).filter(Boolean))),
      indexExchange: upper(a.indexExchange || "NSE"),
      optionItems: optionItemsRaw
        .map((x) => ({
          asset: upper(x?.asset || ""),
          expiry: clean(x?.expiry || ""),
          exchange: upper(x?.exchange || "NSE"),
        }))
        .filter((x) => x.asset && x.expiry),
      orderbookRefIds: Array.from(new Set((Array.isArray(a.orderbookRefIds) ? a.orderbookRefIds : []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))),
    };
  }

  const priceAnchorKey = (symbol) => `PRICE|${upper(symbol)}`;
  const ocAnchorKey = (asset, expiry, exchange) => `OC|${upper(asset)}|${clean(expiry)}|${upper(exchange || "NSE")}`;
  const activeOcViewKey = () => gScoped(S.ocView, env(), "");
  const ocItemLabel = (item) => `${upper(item?.asset)} ${clean(item?.expiry)} ${upper(item?.exchange || "NSE")}`;

  function clearChildren(node) {
    if (!node) return;
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function appendTextNode(parent, tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    node.textContent = String(text ?? "");
    parent.appendChild(node);
    return node;
  }

  function appendStrongText(parent, text) {
    const node = document.createElement("strong");
    node.textContent = String(text ?? "");
    parent.appendChild(node);
    return node;
  }

  function appendTradeStat(parent, label, value) {
    const stat = document.createElement("div");
    stat.className = "trade-stat";
    appendTextNode(stat, "span", "trade-stat-label", label);
    appendTextNode(stat, "span", "trade-stat-value", value);
    parent.appendChild(stat);
    return stat;
  }

  function appendActiveRailChip(parent, label, value) {
    const chip = document.createElement("span");
    chip.className = "active-rail-chip";
    appendStrongText(chip, label);
    chip.appendChild(document.createTextNode(String(value ?? "")));
    parent.appendChild(chip);
    return chip;
  }

  function appendTradeLegRow(parent, values) {
    const row = document.createElement("div");
    row.className = "trade-legs-row";
    for (const value of values) {
      appendTextNode(row, "span", "", value);
    }
    parent.appendChild(row);
    return row;
  }

  function replaceValueOptions(node, values, formatter = null) {
    if (!node) return;
    clearChildren(node);
    const fragment = document.createDocumentFragment();
    for (const value of values || []) {
      const option = document.createElement("option");
      option.value = String(value ?? "");
      if (typeof formatter === "function") {
        option.textContent = String(formatter(value) ?? "");
      }
      fragment.appendChild(option);
    }
    node.appendChild(fragment);
  }

  function setActiveOcViewKey(k) {
    if (!k) {
      delScoped(S.ocView, env());
      persistStreamState();
      return;
    }
    setScoped(S.ocView, env(), String(k));
    persistStreamState();
  }

  function activeOcItems() {
    return Array.isArray(ws[STREAM.oc]?.active?.optionItems) ? ws[STREAM.oc].active.optionItems : [];
  }

  function resolveActiveOcItem() {
    const items = activeOcItems();
    if (!items.length) return null;
    const selectedKey = activeOcViewKey();
    if (selectedKey) {
      const hit = items.find((x) => ocAnchorKey(x.asset, x.expiry, x.exchange) === selectedKey);
      if (hit) return hit;
    }
    return items[0];
  }

  function refreshOcViewSelector() {
    if (!U?.ocViewSelect) return;
    const items = activeOcItems();
    const selected = activeOcViewKey();
    clearChildren(U.ocViewSelect);
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "OC View: None";
    U.ocViewSelect.appendChild(noneOption);
    for (const x of items) {
      const key = ocAnchorKey(x.asset, x.expiry, x.exchange);
      const option = document.createElement("option");
      option.value = key;
      option.textContent = ocItemLabel(x);
      U.ocViewSelect.appendChild(option);
    }
    if (selected && items.some((x) => ocAnchorKey(x.asset, x.expiry, x.exchange) === selected)) {
      U.ocViewSelect.value = selected;
      renderMasterOcList(items, selected);
      return;
    }
    if (items.length) {
      const k = ocAnchorKey(items[0].asset, items[0].expiry, items[0].exchange);
      U.ocViewSelect.value = k;
      setActiveOcViewKey(k);
      renderMasterOcList(items, k);
      return;
    }
    U.ocViewSelect.value = "";
    setActiveOcViewKey("");
    renderMasterOcList(items, "");
  }

  function renderMasterOcList(items, selectedKey) {
    if (!U?.masterOcList) return;
    const query = upper(U.ocSearchInput?.value || "");
    const arr = Array.isArray(items) ? items : [];
    const filtered = query
      ? arr.filter((x) => ocItemLabel(x).includes(query))
      : arr;
    clearChildren(U.masterOcList);

    if (!filtered.length) {
      appendTextNode(U.masterOcList, "div", "master-oc-empty", query ? "No matching active OC." : "No active OC chains.");
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const x of filtered) {
      const key = ocAnchorKey(x.asset, x.expiry, x.exchange);
      const active = key === selectedKey;
      const button = document.createElement("button");
      button.className = active ? "master-oc-item active" : "master-oc-item";
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.setAttribute("data-oc-key", key);
      button.textContent = ocItemLabel(x);
      fragment.appendChild(button);
    }
    U.masterOcList.appendChild(fragment);
  }

  function colToNumber(col) {
    let n = 0;
    for (const ch of String(col || "").toUpperCase()) {
      const code = ch.charCodeAt(0);
      if (code < 65 || code > 90) return 0;
      n = n * 26 + (code - 64);
    }
    return n;
  }

  function addressTouchesB1(address) {
    const text = String(address || "").toUpperCase().replace(/\$/g, "");
    if (!text) return false;
    const parts = text.split(",");
    for (const raw of parts) {
      const part = raw.includes("!") ? raw.split("!").pop() : raw;
      if (part === "B1" || part === "B1:B1") return true;
      const m = part.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (!m) continue;
      const c1 = colToNumber(m[1]);
      const r1 = Number(m[2]);
      const c2 = colToNumber(m[3]);
      const r2 = Number(m[4]);
      if (r1 <= 1 && r2 >= 1 && c1 <= 2 && c2 >= 2) return true;
    }
    return false;
  }

  async function readOcSelectorKeyFromSheet() {
    const items = activeOcItems();
    if (!items.length) return "";
    const map = new Map(items.map((x) => [ocItemLabel(x), ocAnchorKey(x.asset, x.expiry, x.exchange)]));
    let selectedLabel = "";
    await Excel.run(async (ctx) => {
      const sh = ctx.workbook.worksheets.getItemOrNullObject(ws[STREAM.oc].sheetName);
      sh.load("isNullObject");
      await ctx.sync();
      if (sh.isNullObject) return;
      const cell = sh.getRange("B1");
      cell.load("values");
      await ctx.sync();
      selectedLabel = clean(cell.values?.[0]?.[0] ?? "");
    });
    return map.get(selectedLabel) || "";
  }

  async function applyOcSheetDropdown() {
    if (!officeReady) return;
    const items = activeOcItems();
    const labels = items.map((x) => ocItemLabel(x));
    const selected = resolveActiveOcItem();
    const selectedLabel = selected ? ocItemLabel(selected) : "None";

    suppressOcSheetSelectorEvent = true;
    try {
      await Excel.run(async (ctx) => {
        const sh = ctx.workbook.worksheets.getItemOrNullObject(ws[STREAM.oc].sheetName);
        sh.load("isNullObject");
        await ctx.sync();
        if (sh.isNullObject) return;

        sh.getRange("A1").values = [["oc_view"]];
        sh.getRange("B1").values = [[selectedLabel]];

        const helperCol = 16383; // XFD
        const helperLen = Math.max(labels.length, 1);
        const helper = sh.getRangeByIndexes(0, helperCol, helperLen, 1);
        helper.clear("Contents");

        const selector = sh.getRange("B1");
        const validation = selector.dataValidation;
        validation.clear();
        if (labels.length) {
          helper.values = labels.map((x) => [x]);
          helper.load("address");
          await ctx.sync();
          validation.rule = {
            list: {
              inCellDropDown: true,
              source: `=${helper.address}`,
            },
          };
        }
        await ctx.sync();
      });
    } finally {
      suppressOcSheetSelectorEvent = false;
    }
  }

  async function ensureOcSheetChangeListener() {
    if (!officeReady || ocSheetChangeBound) return;
    await Excel.run(async (ctx) => {
      const sh = ctx.workbook.worksheets.getItemOrNullObject(ws[STREAM.oc].sheetName);
      sh.load("isNullObject");
      await ctx.sync();
      if (sh.isNullObject) return;
      sh.onChanged.add(async (eventArgs) => {
        try {
          if (suppressOcSheetSelectorEvent) return;
          if (!addressTouchesB1(eventArgs.address)) return;
          const next = await readOcSelectorKeyFromSheet();
          if (!next || next === activeOcViewKey()) return;
          setActiveOcViewKey(next);
          refreshOcViewSelector();
          await flushSheet(STREAM.oc, { activateSheet: false });
          scheduleMasterProjectionFlush();
          lg("OC view switched from sheet selector.");
        } catch (e) {
          lg(e.message || String(e), true);
        }
      });
      await ctx.sync();
      ocSheetChangeBound = true;
    });
  }

  function focusPanelById(panelId) {
    const el = document.getElementById(panelId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function panelForSheetName(sheetName) {
    const n = upper(sheetName);
    if (n === "HISTORICAL") return "historicalPanel";
    if (n === "POSITIONS") return "positionsPanel";
    if (n === "MASTER") return "masterPanel";
    if (n === "LIVEPRICES") return "livePricesPanel";
    if (n === "LIVEOPTIONCHAIN") return "liveOcPanel";
    return "";
  }

  async function focusPanelForActiveSheet() {
    if (!officeReady) return;
    await Excel.run(async (ctx) => {
      const sh = ctx.workbook.worksheets.getActiveWorksheet();
      sh.load("name");
      await ctx.sync();
      const panelId = panelForSheetName(sh.name || "");
      if (panelId) focusPanelById(panelId);
    });
  }

  async function ensureSheetActivationListener() {
    if (!officeReady || sheetActivationBound) return;
    await Excel.run(async (ctx) => {
      ctx.workbook.worksheets.onActivated.add(async () => {
        try {
          await focusPanelForActiveSheet();
        } catch (_e) {
          // ignore activation scroll errors
        }
      });
      await ctx.sync();
    });
    sheetActivationBound = true;
  }

  async function ensureCoreSheetTabsOrder() {
    if (!officeReady) return;
    const preferred = ["Master", "LivePrices", "LiveOptionChain", "Historical", "Positions", "Instruments"];
    await Excel.run(async (ctx) => {
      const wb = ctx.workbook;
      const wsCol = wb.worksheets;
      wsCol.load("items/name");
      await ctx.sync();

      const existing = new Set(wsCol.items.map((w) => String(w.name || "")));
      for (const name of preferred) {
        if (!existing.has(name)) {
          wb.worksheets.add(name);
        }
      }
      await ctx.sync();

      for (let i = 0; i < preferred.length; i += 1) {
        const sh = wb.worksheets.getItem(preferred[i]);
        sh.position = i;
      }
      wb.worksheets.getItem("Master").activate();
      await ctx.sync();
    });
  }

  async function bootstrapWorkspace(reason) {
    if (!isAuth()) return;
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      setWorkspaceReady(false);
      setWorkspaceLoading(true, "Loading sheets and instruments...");
      lg(`Bootstrap started (${reason}).`);
      let completed = false;
      try {
        await refreshEnvironmentInfo(env(), { silent: reason !== "login" });
        clearInstrumentCache();
        await syncInstruments();
      } catch (e) {
        lg(`Bootstrap: instrument sync failed (${e.message || String(e)}).`, true);
      }

      await flushMasterProjection({ activateSheet: false }).catch((e) => lg(`Bootstrap: Master load failed (${e.message || String(e)}).`, true));
      await flushSheet(STREAM.prices, { activateSheet: false }).catch((e) => lg(`Bootstrap: LivePrices load failed (${e.message || String(e)}).`, true));
      await flushSheet(STREAM.oc, { activateSheet: false }).catch((e) => lg(`Bootstrap: LiveOptionChain load failed (${e.message || String(e)}).`, true));
      await ensureCoreSheetTabsOrder().catch((e) => lg(`Bootstrap: sheet ordering failed (${e.message || String(e)}).`, true));

      lg("Bootstrap completed: instruments synced, core sheets loaded, Master set first.");
      completed = true;
      setWorkspaceReady(completed && isAuth());
      setWorkspaceLoading(false);
    })().finally(() => {
      setWorkspaceLoading(false);
      bootstrapPromise = null;
    });
    return bootstrapPromise;
  }

  function getPersistedStreamState(envValue = env()) {
    const raw = gScoped(S.streamState, envValue, "");
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function persistStreamState(envValue = env()) {
    const payload = {
      prices: {
        symbols: Array.isArray(ws[STREAM.prices]?.active?.indexSymbols) ? ws[STREAM.prices].active.indexSymbols : [],
        exchange: upper(ws[STREAM.prices]?.active?.indexExchange || ws[STREAM.prices]?.settings?.exchange || "NSE"),
        interval: clean(ws[STREAM.prices]?.settings?.interval || U?.livePricesIntervalSelect?.value || "1s"),
      },
      oc: {
        items: Array.isArray(ws[STREAM.oc]?.active?.optionItems) ? ws[STREAM.oc].active.optionItems : [],
        exchange: upper(ws[STREAM.oc]?.settings?.exchange || U?.liveOcExchangeSelect?.value || "NSE"),
        interval: clean(ws[STREAM.oc]?.settings?.interval || U?.liveOcIntervalSelect?.value || "1s"),
      },
      selectedOcView: activeOcViewKey(),
    };
    setScoped(S.streamState, envValue, JSON.stringify(payload));
  }

  function applyPersistedUiState(envValue = env()) {
    const persisted = getPersistedStreamState(envValue);
    const priceSymbols = Array.isArray(persisted?.prices?.symbols) ? persisted.prices.symbols : [];
    const firstOc = Array.isArray(persisted?.oc?.items) ? persisted.oc.items[0] : null;

    if (U.livePricesSymbolsInput && priceSymbols.length) {
      U.livePricesSymbolsInput.value = priceSymbols.join(",");
    }
    if (U.livePricesExchangeSelect && persisted?.prices?.exchange) {
      U.livePricesExchangeSelect.value = upper(persisted.prices.exchange);
    }
    if (U.livePricesIntervalSelect && persisted?.prices?.interval) {
      U.livePricesIntervalSelect.value = clean(persisted.prices.interval);
    }

    if (U.liveOcAssetInput && firstOc?.asset) {
      U.liveOcAssetInput.value = upper(firstOc.asset);
    }
    if (U.liveOcExpiryInput && firstOc?.expiry) {
      U.liveOcExpiryInput.value = clean(firstOc.expiry);
    }
    if (U.liveOcExchangeSelect && (persisted?.oc?.exchange || firstOc?.exchange)) {
      U.liveOcExchangeSelect.value = upper(persisted?.oc?.exchange || firstOc?.exchange || "NSE");
    }
    if (U.liveOcIntervalSelect && persisted?.oc?.interval) {
      U.liveOcIntervalSelect.value = clean(persisted.oc.interval);
    }
  }

  async function restoreStreamsFromStorage(reason) {
    if (!isAuth()) return;
    const persisted = getPersistedStreamState(env());
    const priceSymbols = Array.isArray(persisted?.prices?.symbols) ? persisted.prices.symbols.map((x) => upper(x)).filter(Boolean) : [];
    const ocItems = Array.isArray(persisted?.oc?.items) ? persisted.oc.items : [];

    if (!priceSymbols.length && !ocItems.length) return;
    lg(`Restoring previous stream selections (${reason}).`);

    ws[STREAM.prices].startedOnce = true;
    ws[STREAM.oc].startedOnce = true;

    if (priceSymbols.length) {
      try {
        await startWs(STREAM.prices, {
          index: {
            symbols: priceSymbols,
            exchange: upper(persisted?.prices?.exchange || "NSE"),
            interval: clean(persisted?.prices?.interval || "1s"),
          },
        });
        await pollLivePriceSnapshots().catch(() => null);
      } catch (e) {
        lg(`Restore prices failed: ${e.message || String(e)}`, true);
      }
    }

    if (ocItems.length) {
      const items = ocItems
        .map((x) => ({
          asset: upper(x?.asset || ""),
          expiry: clean(x?.expiry || ""),
          exchange: upper(x?.exchange || persisted?.oc?.exchange || "NSE"),
        }))
        .filter((x) => x.asset && x.expiry);

      if (items.length) {
        try {
          await startWs(STREAM.oc, {
            option: {
              interval: clean(persisted?.oc?.interval || "1s"),
              exchange: upper(persisted?.oc?.exchange || items[0].exchange || "NSE"),
              items,
            },
          });
          if (persisted?.selectedOcView) {
            setActiveOcViewKey(String(persisted.selectedOcView));
            refreshOcViewSelector();
            await flushSheet(STREAM.oc, { activateSheet: false }).catch(() => null);
            scheduleMasterProjectionFlush();
          }
        } catch (e) {
          lg(`Restore option chain failed: ${e.message || String(e)}`, true);
        }
      }
    }
  }

  function setActiveFromServer(streamKey, data) {
    const st = ws[streamKey];
    if (!st) return;
    const prevOcKeys = streamKey === STREAM.oc
      ? new Set(
          (Array.isArray(st.active?.optionItems) ? st.active.optionItems : [])
            .map((x) => ocAnchorKey(x.asset, x.expiry, x.exchange))
        )
      : null;
    st.active = normActive(data?.active);
    renderActivePanels();
    if (streamKey === STREAM.oc) {
      const nextItems = Array.isArray(st.active?.optionItems) ? st.active.optionItems : [];
      const added = nextItems
        .map((x) => ocAnchorKey(x.asset, x.expiry, x.exchange))
        .filter((k) => !prevOcKeys?.has(k));
      if (added.length) {
        setActiveOcViewKey(added[added.length - 1]);
      }
      refreshOcViewSelector();
    }
    refreshWsOverview();
    if (streamKey === STREAM.prices || streamKey === STREAM.oc) {
      scheduleMasterProjectionFlush();
      refreshMasterProjectionDot();
    }
    if (streamKey === STREAM.prices) {
      syncPriceSnapshotPoller();
    } else if (streamKey === STREAM.oc) {
      syncOptionSnapshotPoller();
    }
    persistStreamState();
  }

  function clearActive(streamKey, persist = true, options = {}) {
    const skipProjectionRefresh = Boolean(options.skipProjectionRefresh);
    const st = ws[streamKey];
    if (!st) return;
    st.active = { indexSymbols: [], indexExchange: "NSE", optionItems: [], orderbookRefIds: [] };
    renderActivePanels();
    if (streamKey === STREAM.oc) refreshOcViewSelector();
    refreshWsOverview();
    if (!skipProjectionRefresh && (streamKey === STREAM.prices || streamKey === STREAM.oc)) {
      scheduleMasterProjectionFlush();
      refreshMasterProjectionDot();
    }
    if (streamKey === STREAM.prices) {
      syncPriceSnapshotPoller();
    } else if (streamKey === STREAM.oc) {
      syncOptionSnapshotPoller();
    }
    if (persist) persistStreamState();
  }

  function stopPriceSnapshotPoller() {
    const st = ws[STREAM.prices];
    if (!st) return;
    if (st.pricePollTimer) {
      clearInterval(st.pricePollTimer);
      st.pricePollTimer = null;
    }
    st.pricePollBusy = false;
  }

  function stopOptionSnapshotPoller() {
    const st = ws[STREAM.oc];
    if (!st) return;
    if (st.ocPollTimer) {
      clearInterval(st.ocPollTimer);
      st.ocPollTimer = null;
    }
    st.ocPollBusy = false;
  }

  async function pollLivePriceSnapshots() {
    const st = ws[STREAM.prices];
    if (!st || !st.streamId || st.pricePollBusy || !isAuth()) return;
    const symbols = Array.isArray(st.active?.indexSymbols) ? st.active.indexSymbols : [];
    if (!symbols.length) return;
    st.pricePollBusy = true;
    try {
      await seedIndexSnapshots(st, symbols, st.active?.indexExchange || "NSE");
      scheduleFlush(STREAM.prices);
      scheduleMasterProjectionFlush();
    } catch (e) {
      lg(`Live price fallback refresh failed: ${e.message || String(e)}`, true);
    } finally {
      st.pricePollBusy = false;
    }
  }

  function syncPriceSnapshotPoller() {
    const st = ws[STREAM.prices];
    if (!st) return;
    stopPriceSnapshotPoller();
    const symbols = Array.isArray(st.active?.indexSymbols) ? st.active.indexSymbols : [];
    if (!st.streamId || !symbols.length || !isAuth()) return;
    st.pricePollTimer = setInterval(() => {
      pollLivePriceSnapshots().catch(() => null);
    }, 2000);
  }

  async function seedOptionChainSnapshots(st, items) {
    if (!st || !Array.isArray(items) || !items.length || !isAuth()) return;
    const uniqItems = [];
    const seen = new Set();
    for (const item of items) {
      const asset = upper(item?.asset || "");
      const expiry = clean(item?.expiry || "");
      const exchange = upper(item?.exchange || "NSE");
      const key = `${asset}|${expiry}|${exchange}`;
      if (!asset || !expiry || seen.has(key)) continue;
      seen.add(key);
      uniqItems.push({ asset, expiry, exchange });
    }
    if (!uniqItems.length) return;

    let count = 0;
    await Promise.all(
      uniqItems.map(async ({ asset, expiry, exchange }) => {
        try {
          const qs = `?exchange=${encodeURIComponent(exchange)}&expiry=${encodeURIComponent(expiry)}`;
          const d = await req(`/optionchains/${encodeURIComponent(asset)}${qs}`, { token: "session" });
          const chain = d?.chain || {};
          const ts = Date.now();
          const mergeSide = (side, rows) => {
            for (const it of Array.isArray(rows) ? rows : []) {
              const strike = Number(it?.sp ?? 0);
              if (!Number.isFinite(strike)) continue;
              const rowKey = `${asset}|${expiry}|${strike}|${side}`;
              const prev = st.opt.get(rowKey) || {};
              st.opt.set(rowKey, mergeDefined(prev, {
                side,
                asset,
                exchange,
                expiry,
                atm: chain.atm,
                cp: chain.cp,
                ...it,
                ts,
              }));
            }
          };
          mergeSide("CE", chain.ce);
          mergeSide("PE", chain.pe);
          count += 1;
        } catch (_e) {
          // ignore per-chain failures
        }
      })
    );
    if (count > 0) {
      lg(`Seeded option snapshots for ${count} chain(s).`);
    }
  }

  async function pollLiveOptionSnapshots() {
    const st = ws[STREAM.oc];
    if (!st || !st.streamId || st.ocPollBusy || !isAuth()) return;
    const items = Array.isArray(st.active?.optionItems) ? st.active.optionItems : [];
    if (!items.length) return;
    st.ocPollBusy = true;
    try {
      await seedOptionChainSnapshots(st, items);
      scheduleFlush(STREAM.oc);
      scheduleMasterProjectionFlush();
      schedulePlaceOrderStreamRefresh();
      scheduleActiveStrategyUiRefresh();
    } catch (e) {
      lg(`Option snapshot refresh failed: ${e.message || String(e)}`, true);
    } finally {
      st.ocPollBusy = false;
    }
  }

  function syncOptionSnapshotPoller() {
    const st = ws[STREAM.oc];
    if (!st) return;
    stopOptionSnapshotPoller();
    const items = Array.isArray(st.active?.optionItems) ? st.active.optionItems : [];
    if (!st.streamId || !items.length || !isAuth()) return;
    st.ocPollTimer = setInterval(() => {
      pollLiveOptionSnapshots().catch(() => null);
    }, 2000);
  }

  function refreshMasterProjectionDot() {
    const pricesCount = ws[STREAM.prices]?.active?.indexSymbols?.length || 0;
    const ocCount = ws[STREAM.oc]?.active?.optionItems?.length || 0;
    if (pricesCount > 0 || ocCount > 0) {
      setWsDot(STREAM.master, "running");
      return;
    }
    setWsDot(STREAM.master, "ready");
  }

  function refreshWsOverview() {
    // Intentionally left minimal: active subscriptions are shown directly under each WS section.
  }

  function refreshMasterEmptyActions() {
    if (!U?.masterEmptyActions) return;
    const pricesCount = ws[STREAM.prices]?.active?.indexSymbols?.length || 0;
    const ocCount = ws[STREAM.oc]?.active?.optionItems?.length || 0;
    const showActions = pricesCount === 0 && ocCount === 0;
    if (showActions) show(U.masterEmptyActions);
    else hide(U.masterEmptyActions);
  }

  function renderActivePanels() {
    if (!U) return;

    const prices = ws[STREAM.prices]?.active?.indexSymbols || [];
    U.livePricesActiveCount.textContent = String(prices.length);
    clearChildren(U.livePricesActiveList);
    if (!prices.length) {
      appendTextNode(U.livePricesActiveList, "div", "active-empty", "No active symbols.");
    } else {
      const fragment = document.createDocumentFragment();
      for (const sym of prices) {
        const row = document.createElement("div");
        row.className = "active-item";
        const code = document.createElement("code");
        code.textContent = sym;
        const actions = document.createElement("div");
        actions.className = "actions";
        const goButton = document.createElement("button");
        goButton.className = "mini-btn";
        goButton.type = "button";
        goButton.setAttribute("data-action", "goto-price");
        goButton.setAttribute("data-symbol", sym);
        goButton.textContent = "Go";
        const stopButton = document.createElement("button");
        stopButton.className = "mini-btn secondary";
        stopButton.type = "button";
        stopButton.setAttribute("data-action", "stop-price");
        stopButton.setAttribute("data-symbol", sym);
        stopButton.textContent = "Stop";
        actions.appendChild(goButton);
        actions.appendChild(stopButton);
        row.appendChild(code);
        row.appendChild(actions);
        fragment.appendChild(row);
      }
      U.livePricesActiveList.appendChild(fragment);
    }

    const options = ws[STREAM.oc]?.active?.optionItems || [];
    U.liveOcActiveCount.textContent = String(options.length);
    clearChildren(U.liveOcActiveList);
    if (!options.length) {
      appendTextNode(U.liveOcActiveList, "div", "active-empty", "No active option chains.");
    } else {
      const fragment = document.createDocumentFragment();
      for (const x of options) {
        const row = document.createElement("div");
        row.className = "active-item";
        const code = document.createElement("code");
        code.textContent = `${x.asset} ${x.expiry} ${x.exchange}`;
        const actions = document.createElement("div");
        actions.className = "actions";
        const goButton = document.createElement("button");
        goButton.className = "mini-btn";
        goButton.type = "button";
        goButton.setAttribute("data-action", "goto-oc");
        goButton.setAttribute("data-asset", x.asset);
        goButton.setAttribute("data-expiry", x.expiry);
        goButton.setAttribute("data-exchange", x.exchange);
        goButton.textContent = "Go";
        const stopButton = document.createElement("button");
        stopButton.className = "mini-btn secondary";
        stopButton.type = "button";
        stopButton.setAttribute("data-action", "stop-oc");
        stopButton.setAttribute("data-asset", x.asset);
        stopButton.setAttribute("data-expiry", x.expiry);
        stopButton.setAttribute("data-exchange", x.exchange);
        stopButton.textContent = "Stop";
        actions.appendChild(goButton);
        actions.appendChild(stopButton);
        row.appendChild(code);
        row.appendChild(actions);
        fragment.appendChild(row);
      }
      U.liveOcActiveList.appendChild(fragment);
    }
    refreshMasterEmptyActions();
  }

  async function stopSinglePrice(symbol) {
    const sym = upper(symbol);
    if (!sym) return;
    const data = await wsCommand(STREAM.prices, "unsubscribe", {
      index: { symbols: [sym] },
    });
    setActiveFromServer(STREAM.prices, data);
    await flushSheet(STREAM.prices, { activateSheet: false });
    lg(`Live price unsubscribed: ${sym}`);
  }

  async function stopSingleOc(asset, expiry, exchange) {
    const a = upper(asset);
    const e = clean(expiry);
    const ex = upper(exchange || "NSE");
    if (!a || !e) return;
    const data = await wsCommand(STREAM.oc, "unsubscribe", {
      option: { items: [{ asset: a, expiry: e, exchange: ex }] },
    });
    setActiveFromServer(STREAM.oc, data);
    await flushSheet(STREAM.oc, { activateSheet: false });
    lg(`Live OC unsubscribed: ${a} ${e} ${ex}`);
  }

  async function goToCell(sheetName, row1, col1) {
    if (!officeReady) throw new Error("Office is not ready.");
    const r = Math.max(1, Number(row1 || 1));
    const c = Math.max(1, Number(col1 || 1));
    await Excel.run(async (ctx) => {
      const sh = ctx.workbook.worksheets.getItem(sheetName);
      sh.activate();
      const cell = sh.getCell(r - 1, c - 1);
      cell.select();
      await ctx.sync();
    });
  }

  async function goToPriceData(symbol) {
    selectedMasterPriceSymbol = upper(symbol);
    await flushMasterProjection({ activateSheet: false }).catch(() => null);
    const st = ws[STREAM.prices];
    const key = priceAnchorKey(symbol);
    let anchor = st?.anchors?.get(key);
    if (!anchor) {
      await flushSheet(STREAM.prices, { activateSheet: false });
      anchor = st?.anchors?.get(key);
    }
    if (!anchor) throw new Error(`Data block not found for ${upper(symbol)}.`);
    await goToCell(st.sheetName, anchor.row, anchor.col);
    lg(`Navigated to ${upper(symbol)} in ${st.sheetName}.`);
  }

  async function goToOcData(asset, expiry, exchange) {
    const st = ws[STREAM.oc];
    const key = ocAnchorKey(asset, expiry, exchange);
    setActiveOcViewKey(key);
    refreshOcViewSelector();
    let anchor = st?.anchors?.get(key);
    if (!anchor) {
      await flushSheet(STREAM.oc, { activateSheet: false });
      anchor = st?.anchors?.get(key);
    }
    if (!anchor) throw new Error(`Data block not found for ${upper(asset)} ${clean(expiry)}.`);
    await goToCell(st.sheetName, anchor.row, anchor.col);
    lg(`Navigated to ${upper(asset)} ${clean(expiry)} in ${st.sheetName}.`);
  }

  function scheduleMasterProjectionFlush(forceActivate, reason = REFRESH_REASON.stream) {
    if (!shouldRefreshSheet(STREAM.master, reason)) return;
    if (forceActivate) masterProjectionForceActivate = true;
    if (masterProjectionTimer) return;
    masterProjectionTimer = setTimeout(async () => {
      masterProjectionTimer = null;
      const activateSheet = masterProjectionForceActivate || autoSwitchSheets();
      masterProjectionForceActivate = false;
      try {
        await flushMasterProjection({ activateSheet }, reason);
      } catch (e) {
        lg(e.message || String(e), true);
      }
    }, 700);
  }

  function bind() {
    U = {
      statusLog: document.getElementById("statusLog"),
      telemetryLog: document.getElementById("telemetryLog"),
      activeEnvChip: document.getElementById("activeEnvChip"),
      uatOnlyNotice: document.getElementById("uatOnlyNotice"),
      ordersAuthPopup: document.getElementById("ordersAuthPopup"),
      ordersAuthPopupText: document.getElementById("ordersAuthPopupText"),
      ordersAuthPopupClose: document.getElementById("ordersAuthPopupClose"),
      masterPageButton: document.getElementById("masterPageButton"),
      realtimePageButton: document.getElementById("realtimePageButton"),
      historicalPageButton: document.getElementById("historicalPageButton"),
      ordersPageButton: document.getElementById("ordersPageButton"),
      resetActiveStrategyButton: document.getElementById("resetActiveStrategyButton"),
      workspacePage: document.getElementById("workspacePage"),
      orderStrategyPage: document.getElementById("orderStrategyPage"),
      pageGroupedCards: Array.from(document.querySelectorAll("[data-page-group]")),
      envUatButton: document.getElementById("envUatButton"),
      envLiveButton: document.getElementById("envLiveButton"),
      topLogoutButton: document.getElementById("topLogoutButton"),
      envUatAuthTag: document.getElementById("envUatAuthTag"),
      envLiveAuthTag: document.getElementById("envLiveAuthTag"),
      masterReconnectLabel: document.getElementById("masterReconnectLabel"),
      livePricesReconnectLabel: document.getElementById("livePricesReconnectLabel"),
      liveOcReconnectLabel: document.getElementById("liveOcReconnectLabel"),
      ocViewSelect: document.getElementById("ocViewSelect"),
      serverStatusButton: document.getElementById("serverStatusButton"),
      settingsToggleButton: document.getElementById("settingsToggleButton"),
      settingsBody: document.getElementById("settingsBody"),
      autoSwitchSheetsInput: document.getElementById("autoSwitchSheetsInput"),
      clearOnEnvSwitchInput: document.getElementById("clearOnEnvSwitchInput"),
      confirmProdOrderInput: document.getElementById("confirmProdOrderInput"),
      deviceIdText: document.getElementById("deviceIdText"),
      authBadge: document.getElementById("authBadge"),
      authTitle: document.getElementById("authTitle"),
      sessionState: document.getElementById("sessionState"),
      authCard: document.getElementById("authCard"),
      clearSessionButton: document.getElementById("clearSessionButton"),
      phoneInput: document.getElementById("phoneInput"),
      phoneFieldMsg: document.getElementById("phoneFieldMsg"),
      skipTotpInput: document.getElementById("skipTotpInput"),
      sendOtpButton: document.getElementById("sendOtpButton"),
      otpStage: document.getElementById("otpStage"),
      otpInput: document.getElementById("otpInput"),
      otpFieldMsg: document.getElementById("otpFieldMsg"),
      verifyOtpButton: document.getElementById("verifyOtpButton"),
      mpinStage: document.getElementById("mpinStage"),
      pinInput: document.getElementById("pinInput"),
      pinFieldMsg: document.getElementById("pinFieldMsg"),
      authActionMsg: document.getElementById("authActionMsg"),
      verifyPinButton: document.getElementById("verifyPinButton"),
      instrumentDateInput: document.getElementById("instrumentDateInput"),
      instrumentExchangeSelect: document.getElementById("instrumentExchangeSelect"),
      syncInstrumentsButton: document.getElementById("syncInstrumentsButton"),
      symbolList: document.getElementById("symbolList"),
      indexList: document.getElementById("indexList"),
      stockList: document.getElementById("stockList"),
      optionList: document.getElementById("optionList"),
      optionUnderlyingList: document.getElementById("optionUnderlyingList"),
      expiryList: document.getElementById("expiryList"),
      masterModeSelect: document.getElementById("masterModeSelect"),
      masterWsDot: document.getElementById("masterWsDot"),
      masterSymbolsInput: document.getElementById("masterSymbolsInput"),
      masterExchangeSelect: document.getElementById("masterExchangeSelect"),
      masterIntervalSelect: document.getElementById("masterIntervalSelect"),
      masterAssetInput: document.getElementById("masterAssetInput"),
      masterExpiryInput: document.getElementById("masterExpiryInput"),
      masterOrderbookRefIdsInput: document.getElementById("masterOrderbookRefIdsInput"),
      masterOrderbookLevelsInput: document.getElementById("masterOrderbookLevelsInput"),
      startMasterWsButton: document.getElementById("startMasterWsButton"),
      stopMasterWsButton: document.getElementById("stopMasterWsButton"),
      livePricesSymbolsInput: document.getElementById("livePricesSymbolsInput"),
      livePricesWsDot: document.getElementById("livePricesWsDot"),
      livePricesExchangeSelect: document.getElementById("livePricesExchangeSelect"),
      livePricesIntervalSelect: document.getElementById("livePricesIntervalSelect"),
      startLivePricesWsButton: document.getElementById("startLivePricesWsButton"),
      stopLivePricesWsButton: document.getElementById("stopLivePricesWsButton"),
      livePricesActivePanel: document.getElementById("livePricesActivePanel"),
      livePricesActiveCount: document.getElementById("livePricesActiveCount"),
      livePricesActiveList: document.getElementById("livePricesActiveList"),
      liveOcAssetInput: document.getElementById("liveOcAssetInput"),
      liveOcWsDot: document.getElementById("liveOcWsDot"),
      liveOcExpiryInput: document.getElementById("liveOcExpiryInput"),
      liveOcExchangeSelect: document.getElementById("liveOcExchangeSelect"),
      liveOcIntervalSelect: document.getElementById("liveOcIntervalSelect"),
      startLiveOcWsButton: document.getElementById("startLiveOcWsButton"),
      stopLiveOcWsButton: document.getElementById("stopLiveOcWsButton"),
      liveOcActivePanel: document.getElementById("liveOcActivePanel"),
      liveOcActiveCount: document.getElementById("liveOcActiveCount"),
      liveOcActiveList: document.getElementById("liveOcActiveList"),
      ocSearchInput: document.getElementById("ocSearchInput"),
      masterOcList: document.getElementById("masterOcList"),
      masterEmptyActions: document.getElementById("masterEmptyActions"),
      masterQuickStartPricesButton: document.getElementById("masterQuickStartPricesButton"),
      masterQuickStartOcButton: document.getElementById("masterQuickStartOcButton"),
      refreshPositionsButton: document.getElementById("refreshPositionsButton"),
      historicalSymbolInput: document.getElementById("historicalSymbolInput"),
      historicalTypeSelect: document.getElementById("historicalTypeSelect"),
      historicalExchangeSelect: document.getElementById("historicalExchangeSelect"),
      historicalStartDateInput: document.getElementById("historicalStartDateInput"),
      historicalEndDateInput: document.getElementById("historicalEndDateInput"),
      historicalIntervalSelect: document.getElementById("historicalIntervalSelect"),
      buildHistoricalButton: document.getElementById("buildHistoricalButton"),
      marketOrderEnvChip: document.getElementById("marketOrderEnvChip"),
      marketOrderSymbolInput: document.getElementById("marketOrderSymbolInput"),
      marketOrderExchangeSelect: document.getElementById("marketOrderExchangeSelect"),
      marketOrderRefIdInput: document.getElementById("marketOrderRefIdInput"),
      resolveMarketRefButton: document.getElementById("resolveMarketRefButton"),
      marketOrderResolvedMeta: document.getElementById("marketOrderResolvedMeta"),
      marketOrderQtyInput: document.getElementById("marketOrderQtyInput"),
      marketOrderSideSelect: document.getElementById("marketOrderSideSelect"),
      marketOrderDeliverySelect: document.getElementById("marketOrderDeliverySelect"),
      marketOrderValiditySelect: document.getElementById("marketOrderValiditySelect"),
      marketOrderTagInput: document.getElementById("marketOrderTagInput"),
      marketOrderTickSizeInput: document.getElementById("marketOrderTickSizeInput"),
      placeMarketOrderButton: document.getElementById("placeMarketOrderButton"),
      marketOrderActionMsg: document.getElementById("marketOrderActionMsg"),
      marketOrderResponse: document.getElementById("marketOrderResponse"),
      singleTradeActionMsg: document.getElementById("singleTradeActionMsg"),
      singleTradesResponse: document.getElementById("singleTradesResponse"),
      orderLookupTagInput: document.getElementById("orderLookupTagInput"),
      orderLookupModeSelect: document.getElementById("orderLookupModeSelect"),
      fetchOrdersButton: document.getElementById("fetchOrdersButton"),
      orderLookupIdInput: document.getElementById("orderLookupIdInput"),
      fetchOrderByIdButton: document.getElementById("fetchOrderByIdButton"),
      basketLookupTagInput: document.getElementById("basketLookupTagInput"),
      fetchBasketByTagButton: document.getElementById("fetchBasketByTagButton"),
      orderLookupActionMsg: document.getElementById("orderLookupActionMsg"),
      orderLookupResponse: document.getElementById("orderLookupResponse"),
      strategyPreviewAssetInput: document.getElementById("strategyPreviewAssetInput"),
      strategyPreviewExpiryInput: document.getElementById("strategyPreviewExpiryInput"),
      strategyPreviewExchangeSelect: document.getElementById("strategyPreviewExchangeSelect"),
      strategyPreviewTypeSelect: document.getElementById("strategyPreviewTypeSelect"),
      strategyPreviewTargetDeltaSelect: document.getElementById("strategyPreviewTargetDeltaSelect"),
      strategyPreviewPairNumberInput: document.getElementById("strategyPreviewPairNumberInput"),
      trackedOrderQtyInput: document.getElementById("trackedOrderQtyInput"),
      buildStrategyPreviewButton: document.getElementById("buildStrategyPreviewButton"),
      trackStrategyPreviewButton: document.getElementById("trackStrategyPreviewButton"),
      masterDeployButton: document.getElementById("masterDeployButton"),
      clearTrackedStrategyButton: document.getElementById("clearTrackedStrategyButton"),
      openPlaceOrderSheetButton: document.getElementById("openPlaceOrderSheetButton"),
      strategyPreviewActionMsg: document.getElementById("strategyPreviewActionMsg"),
      strategyPreviewResponse: document.getElementById("strategyPreviewResponse"),
      trackedPreviewResponse: document.getElementById("trackedPreviewResponse"),
      deployPreviewPriceTypeSelect: document.getElementById("deployPreviewPriceTypeSelect"),
      deployPreviewDeliveryTypeSelect: document.getElementById("deployPreviewDeliveryTypeSelect"),
      deployPreviewMultiplierInput: document.getElementById("deployPreviewMultiplierInput"),
      buildDeployPreviewButton: document.getElementById("buildDeployPreviewButton"),
      submitDeployBasketButton: document.getElementById("submitDeployBasketButton"),
      deployPreviewActionMsg: document.getElementById("deployPreviewActionMsg"),
      deployPreviewResponse: document.getElementById("deployPreviewResponse"),
      basketSubmitResponse: document.getElementById("basketSubmitResponse"),
      squareOffDeliveryTypeSelect: document.getElementById("squareOffDeliveryTypeSelect"),
      squareOffMultiplierInput: document.getElementById("squareOffMultiplierInput"),
      buildSquareOffPreviewButton: document.getElementById("buildSquareOffPreviewButton"),
      submitSquareOffButton: document.getElementById("submitSquareOffButton"),
      refreshSquareOffStatusButton: document.getElementById("refreshSquareOffStatusButton"),
      squareOffActionMsg: document.getElementById("squareOffActionMsg"),
      squareOffPreviewResponse: document.getElementById("squareOffPreviewResponse"),
      squareOffSubmitResponse: document.getElementById("squareOffSubmitResponse"),
      activeStrategiesResponse: document.getElementById("activeStrategiesResponse"),
      strategyEventFeedResponse: document.getElementById("strategyEventFeedResponse"),
      toggleTradeHistoryButton: document.getElementById("toggleTradeHistoryButton"),
      completedTradesWindowLabel: document.getElementById("completedTradesWindowLabel"),
      completedTradesResponse: document.getElementById("completedTradesResponse"),
      basketMonitorTagInput: document.getElementById("basketMonitorTagInput"),
      basketMonitorAutoRefreshInput: document.getElementById("basketMonitorAutoRefreshInput"),
      refreshBasketMonitorButton: document.getElementById("refreshBasketMonitorButton"),
      basketMonitorActionMsg: document.getElementById("basketMonitorActionMsg"),
      basketMonitorResponse: document.getElementById("basketMonitorResponse"),
      workspaceLoader: document.getElementById("workspaceLoader"),
      workspaceLoaderText: document.getElementById("workspaceLoaderText"),
      authRequiredBlocks: Array.from(document.querySelectorAll(".auth-required")),
    };
    setActivePage(currentPage);
  }

  function classifyInstrumentType(it) {
    const derivativeType = upper(it?.derivative_type);
    const optionType = upper(it?.option_type);
    const type = upper(it?.type || it?.instrument_type || it?.asset_type || it?.security_type || it?.segment);
    const name = upper(it?.asset || it?.symbol || it?.stock_name);
    const strike = clean(it?.strike_price);

    if (derivativeType.includes("OPT") || optionType === "CE" || optionType === "PE") return "OPT";
    if (strike && strike !== "0" && (optionType || derivativeType)) return "OPT";
    if (type.includes("INDEX") || KNOWN_INDEX_NAMES.has(name)) return "INDEX";
    if (type.includes("STOCK") || type.includes("EQ")) return "STOCK";
    return "STOCK";
  }

  function setInputList(inputEl, preferredListId, fallbackListId = "symbolList") {
    if (!inputEl) return;
    const preferred = document.getElementById(preferredListId);
    const fallback = document.getElementById(fallbackListId);
    const hasPreferred = preferred && preferred.options && preferred.options.length > 0;
    const listId = hasPreferred ? preferredListId : fallbackListId;
    if (listId && (preferred || fallback)) inputEl.setAttribute("list", listId);
  }

  function applyHistoricalSymbolInputContext() {
    if (!U?.historicalTypeSelect || !U?.historicalSymbolInput) return;
    const type = upper(U.historicalTypeSelect.value || "STOCK");
    if (type === "INDEX") return setInputList(U.historicalSymbolInput, "indexList");
    if (type === "OPT") return setInputList(U.historicalSymbolInput, "optionList");
    return setInputList(U.historicalSymbolInput, "stockList");
  }

  function applyInputContexts() {
    if (!U) return;
    setInputList(U.masterSymbolsInput, "indexList");
    setInputList(U.livePricesSymbolsInput, "indexList");
    setInputList(U.masterAssetInput, "optionUnderlyingList");
    setInputList(U.liveOcAssetInput, "optionUnderlyingList");
    applyHistoricalSymbolInputContext();
  }

  async function jsonSafe(res) {
    const t = await res.text();
    if (!t) return {};
    try { return JSON.parse(t); } catch (_e) {
      const raw = String(t || "").trim();
      const title = (raw.match(/<title>([^<]+)<\/title>/i) || [])[1];
      const h1 = (raw.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1];
      const compact = String(title || h1 || raw).replace(/\s+/g, " ").trim();
      return { message: compact, _raw: raw, _nonJson: true };
    }
  }

  async function req(path, o = {}) {
    const method = upper(o.method || "GET");
    const pathNorm = String(path || "").toLowerCase();
    const routeEnv = asEnv(o.envOverride || DATA_ENV);
    const prodOrderAction = routeEnv === "LIVE" && (method === "POST" || method === "PUT" || method === "DELETE")
      && (/\/orders?(\/|$)/.test(pathNorm) || pathNorm.includes("placeorder"));
    if (prodOrderAction) {
      throw new Error("LIVE/PROD order actions are disabled in this beta build. Use the Orders page with a UAT login.");
    }

    const hdr = { "x-device-id": devId(), ...(o.headers || {}) };
    if (o.token === "session") {
      if (!tok("session", routeEnv)) throw new Error(`Session token missing for ${envLabel(routeEnv)}. Login again.`);
      hdr.Authorization = `Bearer ${tok("session", routeEnv)}`;
    }
    if (o.token === "auth") {
      if (!tok("auth", routeEnv)) throw new Error(`Auth token missing for ${envLabel(routeEnv)}. Verify OTP first.`);
      hdr.Authorization = `Bearer ${tok("auth", routeEnv)}`;
    }
    if (o.tempToken) {
      if (!tok("temp", routeEnv)) throw new Error(`Temp token missing for ${envLabel(routeEnv)}. Send OTP first.`);
      hdr["x-temp-token"] = tok("temp", routeEnv);
    }
    const init = { method: method || "GET", headers: hdr };
    if (o.body !== undefined) {
      hdr["Content-Type"] = "application/json";
      init.body = JSON.stringify(o.body);
    }
    const url = `${BASE[routeEnv]}${path.startsWith("/") ? path : `/${path}`}`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, init);
      const data = await jsonSafe(res);
      const ms = Date.now() - t0;
      tlg(`API ${init.method} ${path} -> ${res.status} in ${ms}ms`);
      if (!res.ok && isExpiredSessionStatus(res.status) && o.token === "session" && !o.skipAutoAuthInvalidation) {
        void invalidateCurrentSession(`HTTP ${res.status} on ${init.method} ${path} (${envLabel(routeEnv)})`, routeEnv)
          .catch((err) => lg(err.message || String(err), true));
      }
      if (!res.ok) {
        const backendMsg = String(data?.error || data?.message || "").trim();
        let uiMsg = backendMsg || `${init.method} ${path} failed (${res.status})`;
        const authRoute = /\/(sendphoneotp|verifyphoneotp|verifypin)(\/|$)/.test(pathNorm);
        if (res.status >= 500 && authRoute) {
          uiMsg = `${envLabel(routeEnv)} auth gateway unavailable (HTTP ${res.status}). Retry in 30-60 seconds.`;
        } else if (res.status >= 500 && data?._nonJson) {
          uiMsg = `Gateway error (HTTP ${res.status}) for ${init.method} ${path}. Retry shortly.`;
        }
        const err = new Error(uiMsg);
        err.status = res.status;
        err.path = path;
        err.method = init.method;
        err.env = routeEnv;
        throw err;
      }
      lg(`HTTP ${init.method} ${path}`);
      return data;
    } catch (e) {
      const ms = Date.now() - t0;
      tlg(`API ${init.method} ${path} failed in ${ms}ms`, true);
      throw e;
    }
  }

  async function busy(btn, fn) {
    const t = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Working...";
    try { await fn(); } finally { btn.disabled = false; btn.textContent = t; }
  }

  function bindUppercaseInput(input) {
    if (!input) return;
    input.addEventListener("input", () => {
      const prev = String(input.value || "");
      const up = prev.toUpperCase();
      if (prev === up) return;
      const s = input.selectionStart;
      const e = input.selectionEnd;
      input.value = up;
      if (Number.isInteger(s) && Number.isInteger(e)) {
        input.setSelectionRange(s, e);
      }
    });
  }

  function bindUppercaseInputs() {
    const inputs = [
      U.masterSymbolsInput,
      U.masterAssetInput,
      U.masterExpiryInput,
      U.livePricesSymbolsInput,
      U.liveOcAssetInput,
      U.liveOcExpiryInput,
      U.historicalSymbolInput,
      U.marketOrderSymbolInput,
    ];
    for (const input of inputs) bindUppercaseInput(input);
  }

  function sortLex(a, b) {
    return String(a).localeCompare(String(b), "en", { sensitivity: "base", numeric: true });
  }

  function uniqSorted(values) {
    return Array.from(new Set((values || []).map((x) => upper(x)).filter(Boolean))).sort(sortLex);
  }

  function extractSymbolQuery(rawValue) {
    const v = String(rawValue || "");
    const parts = v.split(",");
    return upper(parts[parts.length - 1] || "");
  }

  function rankSymbolsForQuery(allSymbols, rawQuery, limit = 600) {
    const symbols = Array.isArray(allSymbols) ? allSymbols : [];
    const q = upper(rawQuery);
    if (!q) return symbols.slice(0, limit);

    const prefix = [];
    const substring = [];
    for (const sym of symbols) {
      if (sym.startsWith(q)) {
        prefix.push(sym);
      } else if (sym.includes(q)) {
        substring.push(sym);
      }
    }
    prefix.sort(sortLex);
    substring.sort(sortLex);
    return prefix.concat(substring).slice(0, limit);
  }

  function refreshSymbolSuggestions(rawQuery = "") {
    if (!U?.symbolList) return;
    const ranked = rankSymbolsForQuery(symbolUniverse, rawQuery, 600);
    replaceValueOptions(U.symbolList, ranked);
  }

  function wireRankedSymbolAutocomplete() {
    const inputs = [U?.livePricesSymbolsInput, U?.liveOcAssetInput, U?.historicalSymbolInput, U?.marketOrderSymbolInput].filter(Boolean);
    for (const input of inputs) {
      input.addEventListener("focus", () => {
        if (input.getAttribute("list") !== "symbolList") return;
        refreshSymbolSuggestions(extractSymbolQuery(input.value));
      });
      input.addEventListener("input", () => {
        if (input.getAttribute("list") !== "symbolList") return;
        refreshSymbolSuggestions(extractSymbolQuery(input.value));
      });
      input.addEventListener("blur", () => {
        refreshSymbolSuggestions("");
      });
    }
  }

  function cacheInstruments(obj, envValue = DATA_ENV) {
    if (!setScoped(S.instruments, envValue, JSON.stringify(obj))) {
      throw new Error("Storage quota exceeded while caching instruments.");
    }
  }

  function loadInstruments(envValue = DATA_ENV) {
    const raw = gScoped(S.instruments, envValue, "");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_e) { return null; }
  }

  function clearInstrumentCache(envValue = null) {
    if (envValue) {
      delScoped(S.instruments, envValue);
      return;
    }
    del(S.instruments);
    delScoped(S.instruments, "UAT");
    delScoped(S.instruments, "LIVE");
  }

  function buildInstrumentCacheFromList(list, dateValue, exchangeValue) {
    const syms = new Set();
    const indexSet = new Set();
    const stockSet = new Set();
    const optionSet = new Set();
    const optionUnderlyingSet = new Set();
    const map = {};
    const rows = [];

    for (const it of list) {
      const s = upper(it.asset || it.symbol || it.stock_name || "");
      const instrumentClass = classifyInstrumentType(it);
      if (s) syms.add(s);
      if (instrumentClass === "INDEX" && s) indexSet.add(s);
      if (instrumentClass === "STOCK" && s) stockSet.add(s);
      if (instrumentClass === "OPT") {
        const optionName = upper(it.symbol || it.stock_name || "");
        if (optionName) optionSet.add(optionName);
        if (s) optionUnderlyingSet.add(s);
      }
      const exp = clean(it.expiry);
      if (s && exp) {
        map[s] = map[s] || new Set();
        map[s].add(exp);
      }
      rows.push([
        it.ref_id ?? "", it.asset ?? "", it.symbol ?? "", it.stock_name ?? "", it.exchange ?? "", it.expiry ?? "",
        it.derivative_type ?? "", it.option_type ?? "", it.strike_price ?? "", it.lot_size ?? "", it.token ?? "",
      ]);
    }

    const expBySym = {};
    for (const [k, v] of Object.entries(map)) expBySym[k] = Array.from(v).sort();

    const cache = {
      date: dateValue,
      exchange: exchangeValue,
      count: list.length,
      items: list.map((it) => ({
        ref_id: it.ref_id ?? "",
        asset: it.asset ?? "",
        symbol: it.symbol ?? "",
        stock_name: it.stock_name ?? "",
        exchange: it.exchange ?? "",
        expiry: it.expiry ?? "",
        derivative_type: it.derivative_type ?? "",
        option_type: it.option_type ?? "",
        strike_price: it.strike_price ?? "",
        lot_size: it.lot_size ?? "",
      })),
      symbols: Array.from(syms).sort(),
      expiriesBySymbol: expBySym,
      categories: {
        allSymbols: Array.from(syms).sort(),
        indexes: Array.from(indexSet).sort(),
        stocks: Array.from(stockSet).sort(),
        options: Array.from(optionSet).sort(),
        optionUnderlyings: Array.from(optionUnderlyingSet).sort(),
      },
    };

    return { cache, rows };
  }

  async function writeInstrumentsSheetFromCache(cache, activateSheet = false) {
    const items = Array.isArray(cache?.items) ? cache.items : [];
    if (!items.length) return false;
    const rows = items.map((it) => ([
      it.ref_id ?? "", it.asset ?? "", it.symbol ?? "", it.stock_name ?? "", it.exchange ?? "", it.expiry ?? "",
      it.derivative_type ?? "", it.option_type ?? "", it.strike_price ?? "", it.lot_size ?? "", it.token ?? "",
    ]));
    await writeSections("Instruments", [], [{
      headers: ["ref_id", "asset", "symbol", "stock_name", "exchange", "expiry", "derivative_type", "option_type", "strike_price", "lot_size", "token"],
      rows,
    }], { activateSheet, clearSheet: true });
    return true;
  }

  async function ensureInstrumentsSheetOnLaunch() {
    const preferredEnv = isAuthEnv(DATA_ENV) ? DATA_ENV : (isAuthEnv(ORDER_ENV) ? ORDER_ENV : null);
    clearInstrumentCache();
    if (!preferredEnv) {
      lg("Instrument sync on launch skipped: no authenticated session available.");
      return false;
    }
    await syncInstruments({ envOverride: preferredEnv, activateSheet: true });
    return true;
  }

  function hydrateLists(cache) {
    const c = cache?.categories || {};
    const allSyms = uniqSorted(Array.isArray(c.allSymbols) ? c.allSymbols : (Array.isArray(cache?.symbols) ? cache.symbols : []));
    const indexes = uniqSorted(Array.isArray(c.indexes) ? c.indexes : []);
    const stocks = uniqSorted(Array.isArray(c.stocks) ? c.stocks : []);
    const options = uniqSorted(Array.isArray(c.options) ? c.options : []);
    const optionUnderlyings = uniqSorted(Array.isArray(c.optionUnderlyings) ? c.optionUnderlyings : []);

    symbolUniverse = allSyms;
    refreshSymbolSuggestions("");
    replaceValueOptions(U.indexList, indexes.slice(0, 6000));
    replaceValueOptions(U.stockList, stocks.slice(0, 6000));
    replaceValueOptions(U.optionList, options.slice(0, 6000));
    replaceValueOptions(U.optionUnderlyingList, optionUnderlyings.slice(0, 6000));
    const exps = new Set();
    for (const x of Object.values(cache?.expiriesBySymbol || {})) {
      for (const y of x || []) exps.add(String(y));
    }
    replaceValueOptions(U.expiryList, Array.from(exps).sort());
    rebuildInstrumentIndex(cache);
    applyInputContexts();
  }

  async function syncInstruments(options = {}) {
    const targetEnv = asEnv(options.envOverride || DATA_ENV);
    if (!isAuthEnv(targetEnv)) throw new Error(`Please login to ${envLabel(targetEnv)} first.`);
    const d = U.instrumentDateInput?.value || todayIst();
    const ex = upper(U.instrumentExchangeSelect?.value || "NSE");
    const data = await req(`/refdata/refdata/${encodeURIComponent(d)}?exchange=${ex}`, { token: "session", envOverride: targetEnv });
    const list = Array.isArray(data.refdata) ? data.refdata : [];
    if (!list.length) throw new Error("No instruments returned.");

    const { cache, rows } = buildInstrumentCacheFromList(list, d, ex);
    clearInstrumentCache(targetEnv);
    hydrateLists(cache);
    instrumentAutoSyncLastByEnvExchange.set(`${targetEnv}|${ex}`, Date.now());

    await writeSections("Instruments", [], [{
      headers: ["ref_id", "asset", "symbol", "stock_name", "exchange", "expiry", "derivative_type", "option_type", "strike_price", "lot_size", "token"],
      rows,
    }], { activateSheet: Boolean(options.activateSheet), clearSheet: true });
    lg(`Instruments synced: ${list.length} rows, ${cache.symbols.length} symbols (${ex}) from ${envLabel(targetEnv)}.`);
  }

  async function autoSyncInstrumentsIfStale(exchange, options = {}) {
    const targetEnv = asEnv(options.envOverride || DATA_ENV);
    if (!isAuthEnv(targetEnv)) return { synced: false, reason: "not_auth" };
    const ex = upper(exchange || "NSE");
    const envKey = targetEnv;
    const key = `${envKey}|${ex}`;
    const nowMs = Date.now();
    const staleAfterMs = Number(options.staleAfterMs || 90_000);
    const force = Boolean(options.force);
    const lastMs = Number(instrumentAutoSyncLastByEnvExchange.get(key) || 0);
    if (!force && lastMs > 0 && nowMs - lastMs < staleAfterMs) {
      return { synced: false, reason: "fresh_cache_window" };
    }
    if (instrumentAutoSyncInFlight) {
      return { synced: false, reason: "in_flight" };
    }

    instrumentAutoSyncInFlight = true;
    try {
      const d = U?.instrumentDateInput?.value || todayIst();
      const data = await req(`/refdata/refdata/${encodeURIComponent(d)}?exchange=${ex}`, { token: "session", envOverride: targetEnv });
      const list = Array.isArray(data.refdata) ? data.refdata : [];
      if (!list.length) {
        instrumentAutoSyncLastByEnvExchange.set(key, nowMs);
        return { synced: false, reason: "empty" };
      }

      const syms = new Set();
      const indexSet = new Set();
      const stockSet = new Set();
      const optionSet = new Set();
      const optionUnderlyingSet = new Set();
      const map = {};
      const rows = [];
      for (const it of list) {
        const s = upper(it.asset || it.symbol || it.stock_name || "");
        const instrumentClass = classifyInstrumentType(it);
        if (s) syms.add(s);
        if (instrumentClass === "INDEX" && s) indexSet.add(s);
        if (instrumentClass === "STOCK" && s) stockSet.add(s);
        if (instrumentClass === "OPT") {
          const optionName = upper(it.symbol || it.stock_name || "");
          if (optionName) optionSet.add(optionName);
          if (s) optionUnderlyingSet.add(s);
        }
        const exp = clean(it.expiry);
        if (s && exp) {
          map[s] = map[s] || new Set();
          map[s].add(exp);
        }
        rows.push([
          it.ref_id ?? "", it.asset ?? "", it.symbol ?? "", it.stock_name ?? "", it.exchange ?? "", it.expiry ?? "",
          it.derivative_type ?? "", it.option_type ?? "", it.strike_price ?? "", it.lot_size ?? "", it.token ?? "",
        ]);
      }

      const expBySym = {};
      for (const [k2, v] of Object.entries(map)) expBySym[k2] = Array.from(v).sort();
      const cache = {
        date: d,
        exchange: ex,
        count: list.length,
        items: list.map((it) => ({
          ref_id: it.ref_id ?? "",
          asset: it.asset ?? "",
          symbol: it.symbol ?? "",
          stock_name: it.stock_name ?? "",
          exchange: it.exchange ?? "",
          expiry: it.expiry ?? "",
          derivative_type: it.derivative_type ?? "",
          option_type: it.option_type ?? "",
          strike_price: it.strike_price ?? "",
          lot_size: it.lot_size ?? "",
        })),
        symbols: Array.from(syms).sort(),
        expiriesBySymbol: expBySym,
        categories: {
          allSymbols: Array.from(syms).sort(),
          indexes: Array.from(indexSet).sort(),
          stocks: Array.from(stockSet).sort(),
          options: Array.from(optionSet).sort(),
          optionUnderlyings: Array.from(optionUnderlyingSet).sort(),
        },
      };
      clearInstrumentCache(targetEnv);
      hydrateLists(cache);
      await writeTable("Instruments", ["ref_id", "asset", "symbol", "stock_name", "exchange", "expiry", "derivative_type", "option_type", "strike_price", "lot_size", "token"], rows);
      cacheInstruments(cache, targetEnv);
      instrumentAutoSyncLastByEnvExchange.set(key, nowMs);
      lg(`Instruments auto-synced: ${list.length} rows, ${cache.symbols.length} symbols (${ex}) from ${envLabel(targetEnv)}.`);
      return { synced: true, reason: "synced", count: list.length };
    } finally {
      instrumentAutoSyncInFlight = false;
    }
  }

  async function resolveInstrumentRefViaFreshRefdata(symbol, exchange, options = {}) {
    const targetEnv = asEnv(options.envOverride || ORDER_ENV);
    if (!isAuthEnv(targetEnv)) return null;
    const ex = upper(exchange || "NSE");
    const dateHint = U?.instrumentDateInput?.value || todayIst();
    const tried = new Set();
    const dateCandidates = [dateHint, todayIst(), today()].map((d) => clean(d)).filter(Boolean);
    for (const d of dateCandidates) {
      if (tried.has(d)) continue;
      tried.add(d);
      try {
        const data = await req(`/refdata/refdata/${encodeURIComponent(d)}?exchange=${ex}`, { token: "session", envOverride: targetEnv });
        const rows = Array.isArray(data?.refdata) ? data.refdata : [];
        if (!rows.length) continue;
        const picked = pickBestInstrumentFromRefdataRows(rows, symbol, ex);
        if (picked?.ref_id) return picked;
      } catch (_e) {
        // try next date candidate
      }
    }
    return null;
  }

  function flatPositions(p) {
    const groups = [["stock_positions", "STOCK"], ["fut_positions", "FUT"], ["opt_positions", "OPT"], ["close_positions", "CLOSE"]];
    const rows = [];
    for (const [field, bucket] of groups) {
      const arr = Array.isArray(p?.[field]) ? p[field] : [];
      for (const x of arr) {
        rows.push([
          bucket, x.ref_id ?? "", x.display_name ?? "", x.symbol ?? "", x.asset ?? "", x.exchange ?? "", x.derivative_type ?? "",
          x.product ?? "", x.order_side ?? "", x.qty ?? x.quantity ?? "", paiseToRupee(x.ltp ?? x.last_traded_price), paiseToRupee(x.avg_price),
          paiseToRupee(x.avg_buy_price), paiseToRupee(x.avg_sell_price), paiseToRupee(x.pnl), x.pnl_chg ?? "",
        ]);
      }
    }
    return rows;
  }

  async function refreshPositions() {
    if (!isAuth()) throw new Error("Please login first.");
    const data = await req("/portfolio/positions", { token: "session" });
    const p = data.portfolio || {};
    await writeTable(
      "Positions",
      ["bucket", "ref_id", "display_name", "symbol", "asset", "exchange", "derivative_type", "product", "order_side", "qty", "ltp", "avg_price", "avg_buy_price", "avg_sell_price", "pnl", "pnl_chg"],
      flatPositions(p),
      [
        ["client_code", p.client_code || ""],
        ["realised_pnl", paiseToRupee(p.position_stats?.realised_pnl)],
        ["unrealised_pnl", paiseToRupee(p.position_stats?.unrealised_pnl)],
        ["total_pnl", paiseToRupee(p.position_stats?.total_pnl)],
        ["total_pnl_chg", p.position_stats?.total_pnl_chg ?? ""],
        [],
      ]
    );
    lg("Positions sheet refreshed.");
  }

  function istDateToUtcIso(dateStr, isEnd) {
    const d = clean(dateStr);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new Error("Date must be in YYYY-MM-DD format.");
    }
    const t = isEnd ? "23:59:59" : "00:00:00";
    const dt = new Date(`${d}T${t}+05:30`);
    if (!Number.isFinite(dt.getTime())) {
      throw new Error("Invalid date input.");
    }
    return dt.toISOString();
  }

  function buildHistoricalRows(payload, symbol) {
    const target = upper(symbol);
    const result = Array.isArray(payload?.result) ? payload.result : [];
    let symbolData = null;
    let fallbackData = null;
    let foundTarget = false;
    for (const block of result) {
      const vals = Array.isArray(block?.values) ? block.values : [];
      for (const entry of vals) {
        if (!entry || typeof entry !== "object") continue;
        for (const [sym, data] of Object.entries(entry)) {
          if (upper(sym) === target) {
            symbolData = data;
            foundTarget = true;
            break;
          }
          if (!fallbackData) fallbackData = data;
        }
        if (foundTarget) break;
      }
      if (foundTarget) break;
    }
    if (!symbolData) symbolData = fallbackData;
    if (!symbolData || typeof symbolData !== "object") {
      throw new Error("No historical data returned for selected symbol.");
    }

    const map = new Map();
    const ingest = (field, targetField) => {
      const arr = Array.isArray(symbolData[field]) ? symbolData[field] : [];
      for (const p of arr) {
        const tsRaw = p?.ts ?? p?.timestamp;
        const vRaw = p?.v ?? p?.value;
        const ms = tsToMs(tsRaw);
        if (!Number.isFinite(ms)) continue;
        const k = String(ms);
        const row = map.get(k) || { ts: ms, open: "", high: "", low: "", close: "", volume: "" };
        row[targetField] = hasCellValue(vRaw) ? vRaw : row[targetField];
        map.set(k, row);
      }
    };

    ingest("open", "open");
    ingest("high", "high");
    ingest("low", "low");
    ingest("close", "close");
    ingest("value", "close");
    ingest("volume", "volume");
    ingest("cumulative_volume", "volume");

    const rows = Array.from(map.values())
      .sort((a, b) => a.ts - b.ts)
      .map((r) => ({
        ts: formatIstDateTime(r.ts),
        close: paiseToRupee(r.close),
        open: paiseToRupee(r.open),
        high: paiseToRupee(r.high),
        low: paiseToRupee(r.low),
        volume: r.volume,
      }));

    if (!rows.length) {
      throw new Error("Historical API returned empty candles for this input.");
    }
    return rows;
  }

  async function writeHistoricalSheet(meta, rows) {
    if (!officeReady) throw new Error("Office is not ready.");
    await Excel.run(async (ctx) => {
      const wb = ctx.workbook;
      let sh = wb.worksheets.getItemOrNullObject("Historical");
      await ctx.sync();
      if (sh.isNullObject) sh = wb.worksheets.add("Historical");

      const used = sh.getUsedRangeOrNullObject(true);
      await ctx.sync();
      if (!used.isNullObject) used.clear("Contents");

      const top = [
        ["symbol", meta.symbol],
        ["type", meta.type],
        ["exchange", meta.exchange],
        ["interval", meta.interval],
        ["start_ist", meta.startDate],
        ["end_ist", meta.endDate],
        ["updated_at_ist", formatIstDateTime(new Date())],
        ["", ""],
      ];
      sh.getRangeByIndexes(0, 0, top.length, 2).values = top;

      const headerRow = top.length + 1;
      const headers = ["ts_ist", "close", "open", "high", "low", "volume"];
      sh.getRangeByIndexes(headerRow - 1, 0, 1, headers.length).values = [headers];
      const vals = rows.map((r) => [r.ts, r.close, r.open, r.high, r.low, r.volume]);
      sh.getRangeByIndexes(headerRow, 0, vals.length, headers.length).values = vals;

      const priceRange = sh.getRangeByIndexes(headerRow, 1, vals.length, 4);
      priceRange.numberFormat = Array.from({ length: vals.length }, () => ["#,##0.00", "#,##0.00", "#,##0.00", "#,##0.00"]);

      const chartRange = sh.getRangeByIndexes(headerRow - 1, 0, vals.length + 1, 2);
      const charts = sh.charts;
      charts.load("items");
      await ctx.sync();
      for (const c of charts.items) c.delete();

      const chart = sh.charts.add("Line", chartRange, "Columns");
      chart.title.text = `${meta.symbol} Close (${meta.interval})`;
      chart.legend.visible = false;
      chart.setPosition(sh.getRange("H2"), sh.getRange("N20"));

      sh.activate();
      await ctx.sync();
    });
  }

  function validateHistoricalInterval(interval, startDate, endDate) {
    const allowed = new Set(["1s", "1m", "2m", "3m", "5m", "15m", "30m", "1h", "1d", "1w", "1mt"]);
    if (!allowed.has(interval)) {
      throw new Error(`Unsupported interval "${interval}". Allowed: ${Array.from(allowed).join(", ")}`);
    }

    if (interval !== "1s") return;

    if (env() !== "LIVE") {
      throw new Error("1s interval is supported only in LIVE/PROD.");
    }
    if (startDate !== endDate) {
      throw new Error("For 1s interval, start and end date must be the same day.");
    }

    const now = new Date();
    const todayIst = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const selectedIst = new Date(`${startDate}T00:00:00+05:30`);
    const todayIstMidnightMs = Date.UTC(todayIst.getUTCFullYear(), todayIst.getUTCMonth(), todayIst.getUTCDate());
    const selectedIstMidnightMs = Date.UTC(selectedIst.getUTCFullYear(), selectedIst.getUTCMonth(), selectedIst.getUTCDate());
    const dayDiff = Math.floor((todayIstMidnightMs - selectedIstMidnightMs) / (24 * 60 * 60 * 1000));
    if (!Number.isFinite(dayDiff) || dayDiff < 0 || dayDiff > 7) {
      throw new Error("For 1s interval in LIVE/PROD, date must be within the previous 7 days.");
    }
  }

  async function buildHistorical() {
    if (!isAuth()) throw new Error("Please login first.");
    const symbol = upper(U.historicalSymbolInput.value);
    const startDate = clean(U.historicalStartDateInput.value);
    const endDate = clean(U.historicalEndDateInput.value);
    const type = upper(U.historicalTypeSelect.value || "STOCK");
    const exchange = upper(U.historicalExchangeSelect.value || "NSE");
    const interval = clean(U.historicalIntervalSelect.value || "1m");
    if (!symbol) throw new Error("Stock/Index name is required.");
    if (!startDate || !endDate) throw new Error("Start and End date are required.");
    if (startDate > endDate) throw new Error("Start date cannot be greater than End date.");
    validateHistoricalInterval(interval, startDate, endDate);

    const body = {
      query: [
        {
          exchange,
          type,
          values: [symbol],
          fields: ["open", "high", "low", "close", "volume"],
          startDate: istDateToUtcIso(startDate, false),
          endDate: istDateToUtcIso(endDate, true),
          interval,
          intraDay: false,
          realTime: false,
        },
      ],
    };

    const data = await req("/charts/timeseries", { method: "POST", token: "session", body });
    const rows = buildHistoricalRows(data, symbol);
    await writeHistoricalSheet({ symbol, type, exchange, interval, startDate, endDate }, rows);
    lg(`Historical sheet updated: ${symbol} (${rows.length} candles).`);
  }

  function resetStream(st) {
    st.idx.clear();
    st.opt.clear();
    st.ob.clear();
    st.anchors = new Map();
    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = null;
    }
    if (st.pricePollTimer) {
      clearInterval(st.pricePollTimer);
      st.pricePollTimer = null;
    }
    st.pricePollBusy = false;
  }

  function resolveIndexSymbol(st, rawSymbol) {
    const direct = normalizeIndexSymbolToken(rawSymbol);
    const active = Array.isArray(st?.active?.indexSymbols) ? st.active.indexSymbols : [];
    if (direct) {
      const exact = active.find((s) => upper(s) === direct);
      if (exact) return upper(exact);
      const relaxed = active.find((s) => {
        const a = upper(s);
        return direct.startsWith(a) || a.startsWith(direct) || direct.includes(a) || a.includes(direct);
      });
      if (relaxed) return upper(relaxed);
      return direct;
    }
    if (active.length === 1) return upper(active[0]);
    return "";
  }

  function normalizeIndexSymbolToken(rawSymbol) {
    const token = upper(rawSymbol);
    if (!token) return "";
    const exchangeTags = new Set(["NSE", "BSE", "NFO", "BFO", "MCX", "CDS"]);
    if (token.includes("|")) {
      const parts = token.split("|").map((x) => upper(x)).filter(Boolean);
      if (parts.length >= 2) {
        if (exchangeTags.has(parts[0]) && !exchangeTags.has(parts[parts.length - 1])) return parts[parts.length - 1];
        if (exchangeTags.has(parts[parts.length - 1]) && !exchangeTags.has(parts[0])) return parts[0];
        return parts[parts.length - 1];
      }
    }
    if (token.includes(":")) {
      const parts = token.split(":").map((x) => upper(x)).filter(Boolean);
      if (parts.length >= 2) {
        if (exchangeTags.has(parts[0]) && !exchangeTags.has(parts[parts.length - 1])) return parts[parts.length - 1];
        if (exchangeTags.has(parts[parts.length - 1]) && !exchangeTags.has(parts[0])) return parts[0];
      }
    }
    return token;
  }

  function scheduleFlush(key) {
    const st = ws[key];
    if (!st || st.timer) return;
    st.timer = setTimeout(async () => {
      st.timer = null;
      try {
        await flushSheet(key);
      } catch (e) {
        lg(e.message || String(e), true);
      }
    }, 650);
  }

  function schedulePlaceOrderStreamRefresh() {
    if (placeOrderStreamRefreshTimer) return;
    if (!latestStrategyPreviewState?.payload && !latestTrackedStrategyState?.legs?.length && !latestDeployPreviewState?.flexi_order_request) return;
    const nowMs = Date.now();
    // Full PlaceOrder sheet rewrite is expensive with full OC depth; cap stream refresh rate.
    if (nowMs - lastPlaceOrderSheetStreamRefreshAt < 2500) return;
    placeOrderStreamRefreshTimer = setTimeout(async () => {
      placeOrderStreamRefreshTimer = null;
      try {
        await refreshPlaceOrderSheet(REFRESH_REASON.stream);
      } catch (_e) {
        // ignore stream refresh errors
      }
    }, 1200);
  }

  function scheduleActiveStrategyUiRefresh() {
    if (activeStrategyUiRefreshTimer) return;
    const hasTracked = Boolean(latestTrackedStrategyState?.legs?.length && !latestTrackedStrategyState?.closed);
    const hasLiveBook = Array.isArray(latestLiveStrategyBookState) && latestLiveStrategyBookState.some((item) => !item?.square_off_confirmed);
    if (!hasTracked && !hasLiveBook) return;
    activeStrategyUiRefreshTimer = setTimeout(() => {
      activeStrategyUiRefreshTimer = null;
      try {
        setActiveStrategiesResponse();
      } catch (_e) {
        // ignore ui-only refresh errors
      }
    }, 220);
  }

  function ingest(key, e) {
    const st = ws[key];
    if (!st) return;

    if (e.type === "text") {
      const t = clean(e.data);
      if (t) {
        lg(`WS ${key} text: ${t.length > 180 ? `${t.slice(0, 180)}...` : t}`);
      }
      return;
    }

    if (e.type === "index") {
      const d = e.data || {};
      const symbol = resolveIndexSymbol(st, d.symbol);
      if (!symbol) return;
      const exchange = upper(d.exchange || "NSE");
      const rowKey = `${exchange}|${symbol}`;
      const prev = st.idx.get(rowKey) || {};
      const eventTs = hasCellValue(d.ts) ? d.ts : Date.now();
      const mergedPrevClose = hasCellValue(d.prev_close) ? d.prev_close : (hasCellValue(d.prevClose) ? d.prevClose : prev.prev_close);
      const mergedChange = hasCellValue(d.change) ? d.change : (hasCellValue(d.changepercent) ? d.changepercent : prev.change);
      let mergedLtp = hasCellValue(d.ltp) ? d.ltp : (hasCellValue(d.index_value) ? d.index_value : (hasCellValue(d.indexValue) ? d.indexValue : prev.ltp));
      const prevCloseN = toNumberOrNull(mergedPrevClose);
      const changeN = toNumberOrNull(mergedChange);
      if (!hasCellValue(mergedLtp) && prevCloseN !== null && changeN !== null) {
        mergedLtp = Math.round(prevCloseN * (1 + changeN / 100));
      }
      st.idx.set(rowKey, {
        symbol: symbol || prev.symbol || "",
        exchange: exchange || prev.exchange || "",
        ltp: hasCellValue(mergedLtp) ? mergedLtp : "",
        prev_close: d.prev_close ?? prev.prev_close ?? "",
        change: d.change ?? prev.change ?? "",
        high: d.high ?? prev.high ?? "",
        low: d.low ?? prev.low ?? "",
        volume: d.volume ?? prev.volume ?? "",
        tick_volume: d.tick_volume ?? prev.tick_volume ?? "",
        volume_oi: d.volume_oi ?? prev.volume_oi ?? "",
        ts: eventTs,
      });
      scheduleFlush(key);
      if (key === STREAM.prices || key === STREAM.oc) scheduleMasterProjectionFlush();
      if (key === STREAM.prices || key === STREAM.oc) schedulePlaceOrderStreamRefresh();
      if (key === STREAM.prices || key === STREAM.oc) scheduleActiveStrategyUiRefresh();
      return;
    }

    if (e.type === "option") {
      const d = e.data || {};
      for (const it of Array.isArray(d.ce) ? d.ce : []) {
        const k = `${d.asset}|${d.expiry}|${it.sp}|CE`;
        const prev = st.opt.get(k) || {};
        st.opt.set(k, mergeDefined(prev, {
          side: "CE",
          asset: d.asset,
          exchange: d.exchange,
          expiry: d.expiry,
          atm: d.atm,
          cp: d.cp,
          ...it,
        }));
      }
      for (const it of Array.isArray(d.pe) ? d.pe : []) {
        const k = `${d.asset}|${d.expiry}|${it.sp}|PE`;
        const prev = st.opt.get(k) || {};
        st.opt.set(k, mergeDefined(prev, {
          side: "PE",
          asset: d.asset,
          exchange: d.exchange,
          expiry: d.expiry,
          atm: d.atm,
          cp: d.cp,
          ...it,
        }));
      }
      scheduleFlush(key);
      if (key === STREAM.prices || key === STREAM.oc) scheduleMasterProjectionFlush();
      if (key === STREAM.prices || key === STREAM.oc) schedulePlaceOrderStreamRefresh();
      if (key === STREAM.prices || key === STREAM.oc) scheduleActiveStrategyUiRefresh();
      return;
    }

    if (e.type === "greeks") {
      const d = e.data || {};
      let merged = false;
      const ref = d.ref_id;
      if (hasCellValue(ref)) {
        const refStr = String(ref);
        for (const [k, row] of st.opt.entries()) {
          if (String(row?.ref_id ?? "") === refStr) {
            st.opt.set(k, mergeDefined(row, d));
            merged = true;
          }
        }
      }
      if (!merged) {
        const k = `G|${d.ref_id ?? ""}`;
        const prev = st.opt.get(k) || {};
        st.opt.set(k, mergeDefined(prev, { side: "GREEKS", ...d }));
      }
      scheduleFlush(key);
      if (key === STREAM.prices || key === STREAM.oc) scheduleMasterProjectionFlush();
      if (key === STREAM.prices || key === STREAM.oc) schedulePlaceOrderStreamRefresh();
      if (key === STREAM.prices || key === STREAM.oc) scheduleActiveStrategyUiRefresh();
      return;
    }

    if (e.type === "orderbook") {
      const d = e.data || {};
      const k = String(d.ref_id || d.inst_id || "");
      if (k) {
        const prev = st.ob.get(k) || {};
        st.ob.set(k, mergeDefined(prev, d));
        scheduleFlush(key);
        if (key === STREAM.prices || key === STREAM.oc) scheduleMasterProjectionFlush();
        if (key === STREAM.prices || key === STREAM.oc) schedulePlaceOrderStreamRefresh();
        if (key === STREAM.prices || key === STREAM.oc) scheduleActiveStrategyUiRefresh();
      }
      return;
    }

    if (e.type === "status") {
      const closeCode = Number(e?.closeCode);
      const closeReason = clean(e?.closeReason || "");
      const statusSuffix = Number.isFinite(closeCode) && closeCode > 0
        ? ` (code=${closeCode}${closeReason ? `, reason=${closeReason}` : ""})`
        : "";
      lg(`WS ${key}: ${e.status}${statusSuffix}`);
      if (e.status === "connected") {
        const stConnected = ws[key];
        if (stConnected) {
          clearReconnectTimers(stConnected);
          stConnected.reconnectAttempt = 0;
        }
        setReconnectLabel(key, "");
        clearDotResetTimer(key);
        setWsDot(key, "running");
        scheduleFlush(key);
      } else if (e.status === "stopped") {
        clearActive(key);
        setStoppedThenReady(key, 1200);
      } else if (e.status === "connecting" || e.status === "reconnecting" || e.status === "idle") {
        clearDotResetTimer(key);
        setWsDot(key, "ready");
      } else if (e.status === "error" || e.status === "invalid_token" || e.status === "closed") {
        if (e.status === "invalid_token") {
          clearActive(key, false);
          void invalidateCurrentSession(`invalid token on ${key}`)
            .catch((err) => lg(err.message || String(err), true));
        }
        clearDotResetTimer(key);
        setWsDot(key, "stopped");
        setReconnectLabel(key, "");
      }
      return;
    }

    if (e.type === "decode_error") {
      lg(`WS ${key} decode error: ${e.data?.message || "unknown"}`, true);
      return;
    }

    if (e.type === "raw_type") {
      lg(`WS ${key} raw packet type: ${e.data?.type_url || "(empty)"}`);
    }
  }

  function openSse(key, streamId) {
    const st = ws[key];
    if (!st) return;
    if (st.sse) st.sse.close();
    clearReconnectTimers(st);
    setReconnectLabel(key, "");

    const sse = new EventSource(`/ws/events?streamId=${encodeURIComponent(streamId)}`);
    st.sse = sse;
    sse.onmessage = (ev) => {
      try {
        st.reconnectAttempt = 0;
        setReconnectLabel(key, "");
        ingest(key, JSON.parse(ev.data));
      } catch (e) {
        lg(`WS parse error (${key}): ${e.message || String(e)}`, true);
      }
    };
    sse.onerror = () => {
      lg(`WS SSE disconnected (${key}).`, true);
      if (!st.streamId || st.streamId !== streamId) return;
      if (st.reconnectTimer) return;
      st.reconnectAttempt = Number(st.reconnectAttempt || 0) + 1;
      const delayMs = Math.min(20000, 1000 * (2 ** Math.max(0, st.reconnectAttempt - 1)));
      let seconds = Math.max(1, Math.ceil(delayMs / 1000));
      setReconnectLabel(key, `Reconnecting in ${seconds}s...`);
      tlg(`WS ${key} reconnect scheduled in ${seconds}s (attempt ${st.reconnectAttempt}).`);
      st.reconnectTickTimer = setInterval(() => {
        seconds -= 1;
        if (seconds <= 0) return;
        setReconnectLabel(key, `Reconnecting in ${seconds}s...`);
      }, 1000);
      st.reconnectTimer = setTimeout(() => {
        clearReconnectTimers(st);
        if (!st.streamId || st.streamId !== streamId) return;
        setReconnectLabel(key, "Reconnecting...");
        openSse(key, streamId);
      }, delayMs);
    };
  }

  async function wsCommand(key, action, cfg) {
    const st = ws[key];
    if (!st || !st.streamId) throw new Error("WS stream is not started.");
    const res = await fetch("/ws/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId: st.streamId, action, ...cfg }),
    });
    const data = await jsonSafe(res);
    if (!res.ok) throw new Error(data.error || data.message || `Failed to ${action} WS subscription.`);
    return data;
  }

  async function startWs(key, cfg) {
    if (!isAuth()) throw new Error("Please login first.");
    const st = ws[key];
    if (!st) throw new Error("Unknown stream.");
    const currentEnv = env();

    if (st.streamId && st.environment && st.environment !== currentEnv) {
      lg(`WS ${key}: environment changed from ${st.environment} to ${currentEnv}. Restarting stream.`);
      await stopWs(key);
    }

    if (st.streamId) {
      try {
        const data = await wsCommand(key, "subscribe", cfg);
        setActiveFromServer(key, data);
        if (cfg.index && Array.isArray(cfg.index.symbols) && cfg.index.symbols.length) {
          st.active.indexSymbols = Array.from(new Set([
            ...(Array.isArray(st.active.indexSymbols) ? st.active.indexSymbols.map((x) => upper(x)).filter(Boolean) : []),
            ...cfg.index.symbols.map((x) => upper(x)).filter(Boolean),
          ]));
          st.active.indexExchange = upper(cfg.index.exchange || st.active.indexExchange || "NSE");
          persistStreamState();
        }
        if (cfg.index && Array.isArray(cfg.index.symbols) && cfg.index.symbols.length) {
          await seedIndexSnapshots(st, cfg.index.symbols, cfg.index.exchange || "NSE");
        }
        lg(`WS ${key} subscription added (${data.sent || 0} command(s)).`);
        const activateOnStart = !st.startedOnce || autoSwitchSheets();
        await flushSheet(key, { activateSheet: activateOnStart });
        st.startedOnce = true;
        if (key === STREAM.prices || key === STREAM.oc) {
          scheduleMasterProjectionFlush(!masterProjectionStarted);
        }
        return;
      } catch (e) {
        const msg = String(e.message || e);
        if (!/not connected|not started/i.test(msg)) throw e;
        lg(`WS ${key}: previous stream handle was stale, starting a new stream.`);
        st.streamId = "";
        st.environment = "";
        if (st.sse) {
          st.sse.close();
          st.sse = null;
        }
      }
    }

    clearDotResetTimer(key);
    setWsDot(key, "ready");

    const streamId = `${key}_${currentEnv.toLowerCase()}_${Date.now()}`;
    const currentMarketWsUrl = marketWsUrl(currentEnv);
    const res = await fetch("/ws/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streamId,
        environment: currentEnv,
        sessionToken: tok("session"),
        autoReconnect: true,
        marketWsUrl: currentMarketWsUrl || undefined,
        ...cfg,
      }),
    });
    const data = await jsonSafe(res);
    if (!res.ok) throw new Error(data.error || data.message || "Failed to start websocket stream.");
    if (typeof data.postMarket === "boolean") {
      const mode = data.postMarket ? "post-market (static)" : "live market";
      const auto = data.postMarketSource === "auto" ? " [auto]" : "";
      const when = data.istTime ? ` @ ${data.istTime}` : "";
      lg(`WS ${key} mode: ${mode}${auto}${when}.`);
    }
    setActiveFromServer(key, data);
    if (cfg.index && Array.isArray(cfg.index.symbols) && cfg.index.symbols.length) {
      st.active.indexSymbols = Array.from(new Set([
        ...(Array.isArray(st.active.indexSymbols) ? st.active.indexSymbols.map((x) => upper(x)).filter(Boolean) : []),
        ...cfg.index.symbols.map((x) => upper(x)).filter(Boolean),
      ]));
      st.active.indexExchange = upper(cfg.index.exchange || st.active.indexExchange || "NSE");
      persistStreamState(currentEnv);
    }
    if (cfg.index) {
      st.settings = {
        ...(st.settings || {}),
        exchange: upper(cfg.index.exchange || "NSE"),
        interval: clean(cfg.index.interval || "1s"),
      };
    }
    if (cfg.option) {
      st.settings = {
        ...(st.settings || {}),
        exchange: upper(cfg.option.exchange || "NSE"),
        interval: clean(cfg.option.interval || "1s"),
      };
    }
    persistStreamState(currentEnv);
    tlg(`WS ${key} started (${streamId}) in ${envLabel(currentEnv)}.`);

    st.streamId = streamId;
    st.environment = currentEnv;
    resetStream(st);

    if (cfg.index && Array.isArray(cfg.index.symbols) && cfg.index.symbols.length) {
      await seedIndexSnapshots(st, cfg.index.symbols, cfg.index.exchange || "NSE");
    }

    openSse(key, streamId);
    lg(`WS ${key} starting.`);
    const activateOnStart = !st.startedOnce || autoSwitchSheets();
    await flushSheet(key, { activateSheet: activateOnStart });
    st.startedOnce = true;
    if (key === STREAM.prices || key === STREAM.oc) {
      scheduleMasterProjectionFlush(!masterProjectionStarted);
    }
  }

  async function stopWs(key, options = {}) {
    const preserveSelections = Boolean(options.preserveSelections);
    const skipSheetRefresh = Boolean(options.skipSheetRefresh);
    const st = ws[key];
    if (!st || !st.streamId) return;
    const old = st.streamId;
    st.streamId = "";
    st.environment = "";
    resetStream(st);
    clearReconnectTimers(st);
    st.reconnectAttempt = 0;
    setReconnectLabel(key, "");
    if (st.sse) {
      st.sse.close();
      st.sse = null;
    }

    await fetch("/ws/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId: old }),
    }).catch(() => null);

    clearActive(key, !preserveSelections, { skipProjectionRefresh: skipSheetRefresh });
    lg(`WS ${key} stopped.`);
    tlg(`WS ${key} stopped (${old}).`);
    setStoppedThenReady(key, 1200);
    if (!preserveSelections) persistStreamState();
  }

  async function stopAllWs(options = {}) {
    await Promise.all([
      stopWs(STREAM.master, options),
      stopWs(STREAM.prices, options),
      stopWs(STREAM.oc, options),
    ]);
  }

  async function startMaster() {
    await flushMasterProjection({ activateSheet: true });
    lg("Master sheet opened/refreshed from active Live Prices and Live OC streams.");
  }

  async function startPrices() {
    const symbols = csv(U.livePricesSymbolsInput.value);
    if (!symbols.length) throw new Error("At least one symbol is required.");
    await startWs(STREAM.prices, {
      index: {
        symbols,
        exchange: upper(U.livePricesExchangeSelect.value || "NSE"),
        interval: clean(U.livePricesIntervalSelect.value || "1s"),
      },
    });
    await pollLivePriceSnapshots().catch(() => null);
  }

  async function startOc() {
    const asset = upper(U.liveOcAssetInput.value);
    const expiry = clean(U.liveOcExpiryInput.value);
    if (!asset || !expiry) throw new Error("Asset and expiry are required.");
    const ex = upper(U.liveOcExchangeSelect.value || "NSE");
    await startWs(STREAM.oc, {
      option: {
        interval: clean(U.liveOcIntervalSelect.value || "1s"),
        exchange: ex,
        items: [{ asset, expiry, exchange: ex }],
      },
    });
    const key = ocAnchorKey(asset, expiry, ex);
    setActiveOcViewKey(key);
    refreshOcViewSelector();
    await flushSheet(STREAM.oc, { activateSheet: false }).catch(() => null);
    scheduleMasterProjectionFlush(true);
  }

  async function waitForOptionChainRows(asset, expiry, exchange, timeoutMs = 7000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const rows = optionRawRowsForSelection(asset, expiry, exchange);
      if (rows.length) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return optionRawRowsForSelection(asset, expiry, exchange).length > 0;
  }

  async function ensureOptionChainForTrack() {
    const asset = upper(U?.strategyPreviewAssetInput?.value);
    const expiry = clean(U?.strategyPreviewExpiryInput?.value);
    const exchange = upper(U?.strategyPreviewExchangeSelect?.value || "NSE");
    if (!asset || !expiry) return;

    if (U?.liveOcAssetInput) U.liveOcAssetInput.value = asset;
    if (U?.liveOcExpiryInput) U.liveOcExpiryInput.value = expiry;
    if (U?.liveOcExchangeSelect) U.liveOcExchangeSelect.value = exchange;

    await startWs(STREAM.oc, {
      option: {
        interval: clean(U?.liveOcIntervalSelect?.value || ws[STREAM.oc]?.settings?.interval || "1s"),
        exchange,
        items: [{ asset, expiry, exchange }],
      },
    });

    const key = ocAnchorKey(asset, expiry, exchange);
    setActiveOcViewKey(key);
    refreshOcViewSelector();
    await flushSheet(STREAM.oc, { activateSheet: false }).catch(() => null);
    scheduleMasterProjectionFlush(false);

    let ready = await waitForOptionChainRows(asset, expiry, exchange, 7000);
    if (!ready) {
      // Retry once by re-subscribing to avoid race where stream starts but first snapshot is delayed.
      await startWs(STREAM.oc, {
        option: {
          interval: clean(U?.liveOcIntervalSelect?.value || ws[STREAM.oc]?.settings?.interval || "1s"),
          exchange,
          items: [{ asset, expiry, exchange }],
        },
      });
      ready = await waitForOptionChainRows(asset, expiry, exchange, 12000);
    }
    if (!ready) {
      lg(`Option chain warm-up still in progress for ${asset}:${expiry}:${exchange}. Continuing and retrying preview automatically.`, true);
    }
    return ready;
  }

  function isOcWarmupError(errorLike) {
    const msg = String(errorLike?.message || errorLike || "").toLowerCase();
    return msg.includes("no live option chain snapshot");
  }

  async function buildStrategyPreviewWithRetry(maxAttempts = 12, delayMs = 1000) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await buildStrategyPreview();
        return true;
      } catch (e) {
        lastError = e;
        if (!isOcWarmupError(e) || attempt === maxAttempts) {
          throw e;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    if (lastError) throw lastError;
    return false;
  }

  async function resolveOrderbookRefIdsFromOptionChain(asset, expiry, exchange, limit) {
    if (!isAuth()) return [];
    const ex = upper(exchange || "NSE");
    const qs = `?exchange=${encodeURIComponent(ex)}&expiry=${encodeURIComponent(expiry)}`;
    const d = await req(`/optionchains/${encodeURIComponent(asset)}${qs}`, { token: "session" });
    const chain = d.chain || {};
    const atm = Number(chain.atm || 0);
    const ce = Array.isArray(chain.ce) ? chain.ce : [];
    const pe = Array.isArray(chain.pe) ? chain.pe : [];
    const all = ce.concat(pe);

    if (!all.length) return [];

    const ranked = all
      .map((x) => ({
        ref_id: Number(x.ref_id),
        sp: Number(x.sp || 0),
      }))
      .filter((x) => Number.isInteger(x.ref_id) && x.ref_id > 0)
      .sort((a, b) => {
        if (atm > 0) {
          return Math.abs(a.sp - atm) - Math.abs(b.sp - atm);
        }
        return a.sp - b.sp;
      });

    const maxN = Math.max(1, Math.min(60, Number(limit || 24)));
    const picked = [];
    const seen = new Set();
    for (const it of ranked) {
      if (!seen.has(it.ref_id)) {
        seen.add(it.ref_id);
        picked.push(it.ref_id);
      }
      if (picked.length >= maxN) break;
    }
    return picked;
  }

  async function seedIndexSnapshots(st, symbols, exchange) {
    if (!st || !Array.isArray(symbols) || !symbols.length || !isAuth()) return;
    const ex = upper(exchange || "NSE");
    const uniq = Array.from(new Set(symbols.map((x) => upper(x)).filter(Boolean))).slice(0, 20);
    if (!uniq.length) return;

    const result = await Promise.all(
      uniq.map(async (sym) => {
        try {
          const q = ex && ex !== "NSE" ? `?exchange=${encodeURIComponent(ex)}` : "";
          const d = await req(`/optionchains/${encodeURIComponent(sym)}/price${q}`, { token: "session" });
          return {
            symbol: upper(sym),
            exchange: upper(d.exchange || ex),
            ltp: d.price,
            prev_close: d.prev_close,
            change: d.change,
          };
        } catch (_e) {
          return null;
        }
      })
    );

    let count = 0;
    for (const x of result) {
      if (!x) continue;
      const key = `${upper(x.exchange)}|${upper(x.symbol)}`;
      const prev = st.idx.get(key) || {};
      st.idx.set(key, {
        ...prev,
        symbol: x.symbol,
        exchange: x.exchange,
        ltp: x.ltp ?? prev.ltp ?? "",
        prev_close: x.prev_close ?? prev.prev_close ?? "",
        change: x.change ?? prev.change ?? "",
        ts: Date.now(),
      });
      count += 1;
    }
    if (count > 0) {
      lg(`Seeded index price snapshots for ${count} symbol(s).`);
    }
  }

  const INDEX_COLS = [
    { key: "symbol", header: "symbol", always: true },
    { key: "exchange", header: "exchange", always: true },
    { key: "ltp", header: "ltp", always: true },
    { key: "prev_close", header: "prev_close" },
    { key: "change", header: "change" },
    { key: "high", header: "high" },
    { key: "low", header: "low" },
    { key: "volume", header: "volume" },
    { key: "tick_volume", header: "tick_volume" },
    { key: "volume_oi", header: "volume_oi" },
    { key: "ts", header: "ts" },
  ];

  const OPTION_COLS = [
    { key: "asset", header: "asset", always: true },
    { key: "exchange", header: "exchange", always: true },
    { key: "expiry", header: "expiry", always: true },
    { key: "side", header: "side", always: true },
    { key: "ref_id", header: "ref_id" },
    { key: "inst_id", header: "inst_id" },
    { key: "strike", header: "strike", always: true },
    { key: "lot_size", header: "lot_size" },
    { key: "ltp", header: "ltp" },
    { key: "ltpchg", header: "ltpchg" },
    { key: "iv", header: "iv" },
    { key: "delta", header: "delta" },
    { key: "gamma", header: "gamma" },
    { key: "theta", header: "theta" },
    { key: "vega", header: "vega" },
    { key: "oi", header: "oi" },
    { key: "prev_oi", header: "prev_oi" },
    { key: "volume", header: "volume" },
    { key: "atm", header: "atm" },
    { key: "cp", header: "cp" },
    { key: "price_pcp", header: "price_pcp" },
    { key: "ts", header: "ts" },
  ];

  const ORDERBOOK_COLS = [
    { key: "ref_id", header: "ref_id", always: true },
    { key: "inst_id", header: "inst_id" },
    { key: "ltp", header: "ltp" },
    { key: "ltq", header: "ltq" },
    { key: "volume", header: "volume" },
    { key: "bid_p1", header: "bid_p1" },
    { key: "bid_q1", header: "bid_q1" },
    { key: "bid_o1", header: "bid_o1" },
    { key: "ask_p1", header: "ask_p1" },
    { key: "ask_q1", header: "ask_q1" },
    { key: "ask_o1", header: "ask_o1" },
    { key: "ts", header: "ts" },
  ];

  const MASTER_PRICE_COLS = [
    { key: "symbol", header: "symbol", always: true },
    { key: "exchange", header: "exchange", always: true },
    { key: "ltp", header: "ltp", always: true },
    { key: "change", header: "change" },
    { key: "prev_close", header: "prev_close" },
    { key: "ts", header: "ts" },
  ];

  const OPTION_CHAIN_PAIR_COLS = [
    { key: "ce_ltp", header: "ce_ltp" },
    { key: "ce_ltpchg", header: "ce_ltpchg" },
    { key: "ce_oi", header: "ce_oi" },
    { key: "ce_volume", header: "ce_volume" },
    { key: "ce_iv", header: "ce_iv" },
    { key: "ce_delta", header: "ce_delta" },
    { key: "strike", header: "strike", always: true },
    { key: "pe_delta", header: "pe_delta" },
    { key: "pe_iv", header: "pe_iv" },
    { key: "pe_volume", header: "pe_volume" },
    { key: "pe_oi", header: "pe_oi" },
    { key: "pe_ltpchg", header: "pe_ltpchg" },
    { key: "pe_ltp", header: "pe_ltp" },
    { key: "ts", header: "ts" },
  ];

  const PLACE_ORDER_OC_COLS = [
    { key: "ce_delta", header: "call_delta" },
    { key: "ce_oi", header: "call_oi" },
    { key: "ce_volume", header: "call_vol" },
    { key: "ce_ltp", header: "call_ltp" },
    { key: "ce_pair", header: "pair" },
    { key: "strike", header: "strike", always: true },
    { key: "pe_pair", header: "pair" },
    { key: "pe_ltp", header: "put_ltp" },
    { key: "pe_volume", header: "put_vol" },
    { key: "pe_oi", header: "put_oi" },
    { key: "pe_delta", header: "put_delta" },
  ];

  function toSectionRows(rows, columns) {
    let active = columns.filter((c) => c.always || rows.some((r) => hasCellValue(r[c.key])));
    if (!active.length) active = columns.slice(0, Math.min(3, columns.length));
    return {
      headers: active.map((c) => c.header),
      rows: rows.map((r) => active.map((c) => (hasCellValue(r[c.key]) ? r[c.key] : ""))),
    };
  }

  function rowsIndex(m, filterFn) {
    const asNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const source = Array.from(m.values());
    const filtered = typeof filterFn === "function" ? source.filter(filterFn) : source;
    return filtered
      .sort((a, b) => String(normalizeIndexSymbolToken(a.symbol) || "").localeCompare(String(normalizeIndexSymbolToken(b.symbol) || "")))
      .map((x) => {
        let ltp = x.ltp;
        if (ltp === "" || ltp === null || ltp === undefined) {
          const prev = asNum(x.prev_close);
          const chg = asNum(x.change);
          if (prev !== null && chg !== null) {
            ltp = Math.round(prev * (1 + chg / 100));
          } else {
            ltp = "";
          }
        }
        return {
          symbol: normalizeIndexSymbolToken(x.symbol ?? ""),
          exchange: x.exchange ?? "",
          ltp: paiseToRupee(ltp),
          prev_close: paiseToRupee(x.prev_close),
          change: x.change ?? "",
          high: paiseToRupee(x.high),
          low: paiseToRupee(x.low),
          volume: x.volume ?? "",
          tick_volume: x.tick_volume ?? "",
          volume_oi: x.volume_oi ?? "",
          ts: formatIstDateTime(x.ts),
        };
      });
  }

  function rowsOption(m, filterFn) {
    const source = Array.from(m.values());
    const filtered = typeof filterFn === "function" ? source.filter(filterFn) : source;
    return filtered
      .sort((a, b) => {
        const ac = String(a.asset || "").localeCompare(String(b.asset || ""));
        if (ac !== 0) return ac;
        const ec = String(a.expiry || "").localeCompare(String(b.expiry || ""));
        if (ec !== 0) return ec;
        return Number(a.sp || 0) - Number(b.sp || 0);
      })
      .map((x) => ({
        asset: x.asset ?? "",
        exchange: x.exchange ?? "",
        expiry: x.expiry ?? "",
        side: x.side ?? "",
        ref_id: x.ref_id ?? "",
        inst_id: x.inst_id ?? "",
        strike: paiseToRupee(x.sp),
        lot_size: x.ls ?? "",
        ltp: paiseToRupee(x.ltp),
        ltpchg: x.ltpchg ?? "",
        iv: x.iv ?? "",
        delta: x.delta ?? "",
        gamma: x.gamma ?? "",
        theta: x.theta ?? "",
        vega: x.vega ?? "",
        oi: x.oi ?? "",
        prev_oi: x.prev_oi ?? "",
        volume: x.volume ?? "",
        atm: paiseToRupee(x.atm),
        cp: paiseToRupee(x.cp),
        price_pcp: paiseToRupee(x.price_pcp),
        ts: formatIstDateTime(x.ts),
      }));
  }

  function rowsOptionPairs(rows) {
    const out = new Map();
    for (const r of Array.isArray(rows) ? rows : []) {
      const key = `${upper(r.asset)}|${clean(r.expiry)}|${upper(r.exchange)}|${r.strike}`;
      const prev = out.get(key) || {
        asset: r.asset,
        exchange: r.exchange,
        expiry: r.expiry,
        strike: r.strike,
        ce_ltp: "",
        ce_ltpchg: "",
        ce_oi: "",
        ce_volume: "",
        ce_iv: "",
        ce_delta: "",
        pe_ltp: "",
        pe_ltpchg: "",
        pe_oi: "",
        pe_volume: "",
        pe_iv: "",
        pe_delta: "",
        ts: "",
      };

      if (upper(r.side) === "CE") {
        prev.ce_ltp = r.ltp ?? prev.ce_ltp;
        prev.ce_ltpchg = r.ltpchg ?? prev.ce_ltpchg;
        prev.ce_oi = r.oi ?? prev.ce_oi;
        prev.ce_volume = r.volume ?? prev.ce_volume;
        prev.ce_iv = r.iv ?? prev.ce_iv;
        prev.ce_delta = r.delta ?? prev.ce_delta;
      } else if (upper(r.side) === "PE") {
        prev.pe_ltp = r.ltp ?? prev.pe_ltp;
        prev.pe_ltpchg = r.ltpchg ?? prev.pe_ltpchg;
        prev.pe_oi = r.oi ?? prev.pe_oi;
        prev.pe_volume = r.volume ?? prev.pe_volume;
        prev.pe_iv = r.iv ?? prev.pe_iv;
        prev.pe_delta = r.delta ?? prev.pe_delta;
      }
      if (hasCellValue(r.ts)) prev.ts = r.ts;
      out.set(key, prev);
    }
    return Array.from(out.values()).sort((a, b) => Number(a.strike || 0) - Number(b.strike || 0));
  }

  function trackedPairMarkers(trackedState) {
    const markers = new Map();
    if (!trackedState?.legs?.length) return markers;
    const pairToken = hasCellValue(trackedState.pair_number) ? String(trackedState.pair_number) : "1";
    for (const leg of trackedState.legs) {
      const strikeKey = hasCellValue(leg?.strike) ? String(leg.strike) : "";
      const side = upper(leg?.option_type || "");
      if (!strikeKey || !side) continue;
      markers.set(`${strikeKey}|${side}`, pairToken);
    }
    return markers;
  }

  function rowsOptionPairsForPlaceOrder(rows, trackedState) {
    const base = rowsOptionPairs(rows);
    const markers = trackedPairMarkers(trackedState);
    return base.map((row) => ({
      ...row,
      ce_pair: markers.get(`${row.strike}|CE`) || "",
      pe_pair: markers.get(`${row.strike}|PE`) || "",
    }));
  }

  function placeOrderOcSection() {
    const source = resolveTrackedSource(latestTrackedStrategyState || {});
    const fallback = resolveActiveOcItem();
    const asset = upper(source.asset || fallback?.asset || "");
    const expiry = clean(source.expiry || fallback?.expiry || "");
    const exchange = upper(source.exchange || fallback?.exchange || "NSE");
    if (!asset || !expiry) {
      return { title: "OPTION CHAIN FOCUS", headers: ["info"], rows: [["No tracked option chain context yet."]] };
    }
    const allRows = rowsOption(ws[STREAM.oc]?.opt || new Map(), (x) =>
      upper(x.asset) === asset && clean(x.expiry) === expiry && upper(x.exchange || "NSE") === exchange
    );
    if (!allRows.length) {
      return { title: `OPTION CHAIN FOCUS: ${asset} ${expiry} ${exchange}`, headers: ["info"], rows: [["No live option chain rows available."]] };
    }
    // Orders desk needs full option-chain depth from the websocket, not a nearest-ATM slice.
    const pairRows = rowsOptionPairsForPlaceOrder(allRows, latestTrackedStrategyState);
    const sec = toSectionRows(pairRows, PLACE_ORDER_OC_COLS);
    const first = allRows[0] || {};
    const meta = `ATM:${hasCellValue(first.atm) ? first.atm : "-"} CP:${hasCellValue(first.cp) ? first.cp : "-"}`;
    return {
      title: `OPTION CHAIN FOCUS: ${asset} ${expiry} ${exchange} (${meta})`,
      headers: sec.headers,
      rows: sec.rows,
    };
  }

  function buildLivePricesSections(st) {
    const sections = [];
    const activeSymbols = Array.isArray(st?.active?.indexSymbols) ? st.active.indexSymbols : [];
    const knownSymbols = Array.from(st?.idx?.keys?.() || []).map((x) => normalizeIndexSymbolToken(x)).filter(Boolean);
    const symbolThread = Array.from(new Set([...activeSymbols.map((x) => upper(x)).filter(Boolean), ...knownSymbols]));
    for (const sym of symbolThread) {
      const rows = rowsIndex(st.idx, (x) => normalizeIndexSymbolToken(x.symbol) === upper(sym));
      const sec = toSectionRows(rows, INDEX_COLS);
      sections.push({
        spacer: sections.length ? 1 : 0,
        anchorKey: priceAnchorKey(sym),
        title: `SYMBOL: ${sym}`,
        headers: sec.headers,
        rows: sec.rows,
      });
    }
    if (!sections.length) {
      const sec = toSectionRows(rowsIndex(st.idx), INDEX_COLS);
      sections.push({ title: "INDEX FEED", headers: sec.headers, rows: sec.rows });
    }
    return sections;
  }

  function buildLiveOcSections(st) {
    const item = resolveActiveOcItem();
    if (!item) {
      return [{ title: "OPTION FEED", headers: ["info"], rows: [["No active option chain selection."]] }];
    }
    const a = upper(item.asset);
    const e = clean(item.expiry);
    const ex = upper(item.exchange || "NSE");
    const sideRows = rowsOption(st.opt, (x) => {
      const assetMatch = upper(x.asset) === a;
      const expiryMatch = clean(x.expiry) === e;
      const exchangeMatch = upper(x.exchange || "NSE") === ex;
      return assetMatch && expiryMatch && exchangeMatch;
    });
    const pairRows = rowsOptionPairs(sideRows);
    const sec = toSectionRows(pairRows, OPTION_CHAIN_PAIR_COLS);
    return [{
      anchorKey: ocAnchorKey(a, e, ex),
      title: `CHAIN VIEW: ${a} ${e} ${ex}`,
      headers: sec.headers,
      rows: sec.rows,
    }];
  }

  function rowsOb(m) {
    const out = [];
    for (const x of m.values()) {
      const b1 = x.bid?.[0] || {};
      const a1 = x.ask?.[0] || {};
      out.push({
        ref_id: x.ref_id ?? "",
        inst_id: x.inst_id ?? "",
        ltp: paiseToRupee(x.ltp),
        ltq: x.ltq ?? "",
        volume: x.volume ?? "",
        bid_p1: paiseToRupee(b1.p),
        bid_q1: b1.q ?? "",
        bid_o1: b1.o ?? "",
        ask_p1: paiseToRupee(a1.p),
        ask_q1: a1.q ?? "",
        ask_o1: a1.o ?? "",
        ts: formatIstDateTime(x.ts),
      });
    }
    return out.sort((a, b) => Number(a.ref_id || 0) - Number(b.ref_id || 0));
  }

  function sectionMaxWidth(topRows, sections) {
    let w = 1;
    if (Array.isArray(topRows) && topRows.length) {
      w = Math.max(
        w,
        topRows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 1), 1)
      );
    }
    for (const sec of Array.isArray(sections) ? sections : []) {
      if (Array.isArray(sec.headers)) w = Math.max(w, sec.headers.length);
      if (Array.isArray(sec.rows) && sec.rows.length) {
        const rw = sec.rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 1), 1);
        w = Math.max(w, rw);
      }
    }
    return w;
  }

  function masterPriceRows() {
    const st = ws[STREAM.prices];
    const activeSymbols = Array.isArray(st?.active?.indexSymbols) ? st.active.indexSymbols : [];
    const knownSymbols = Array.from(st?.idx?.keys?.() || []).map((x) => normalizeIndexSymbolToken(x)).filter(Boolean);
    const symbolThread = Array.from(new Set([...activeSymbols.map((x) => upper(x)).filter(Boolean), ...knownSymbols]));
    const all = Array.from(st?.idx?.values?.() || []);
    const rows = [];
    const symMatch = (candidate, wanted) => {
      const a = upper(candidate);
      const b = upper(wanted);
      if (!a || !b) return false;
      if (a === b) return true;
      return a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a);
    };
    for (const sym of symbolThread) {
      let matches = all.filter((x) => upper(x.symbol) === upper(sym));
      if (!matches.length) {
        matches = all.filter((x) => symMatch(x.symbol, sym));
      }
      const pick = matches.find((x) => upper(x.exchange) === "NSE") || matches[0] || {};
      rows.push({
        symbol: sym,
        exchange: pick.exchange ?? "",
        ltp: paiseToRupee(pick.ltp),
        change: pick.change ?? "",
        prev_close: paiseToRupee(pick.prev_close),
        ts: formatIstDateTime(pick.ts),
      });
    }
    return rows;
  }

  function nearestAtmOptionRows(rows, maxStrikes) {
    const source = Array.isArray(rows) ? rows : [];
    if (!source.length) return [];
    const maxN = Math.max(1, Math.min(100, Number(maxStrikes || 20)));
    const numericRows = source
      .map((x) => ({ ...x, strikeN: Number(x.strike) }))
      .filter((x) => Number.isFinite(x.strikeN));
    if (!numericRows.length) return source.slice(0, maxN);

    const atmCandidate = numericRows.find((x) => Number.isFinite(Number(x.atm)));
    const cpCandidate = numericRows.find((x) => Number.isFinite(Number(x.cp)));
    const reference = atmCandidate ? Number(atmCandidate.atm) : cpCandidate ? Number(cpCandidate.cp) : numericRows[0].strikeN;

    const uniqueStrikes = Array.from(new Set(numericRows.map((x) => x.strikeN)))
      .sort((a, b) => {
        const da = Math.abs(a - reference);
        const db = Math.abs(b - reference);
        if (da !== db) return da - db;
        return a - b;
      })
      .slice(0, maxN);
    const picked = new Set(uniqueStrikes);

    const sideRank = (s) => {
      const v = upper(s);
      if (v === "CE") return 0;
      if (v === "PE") return 1;
      return 2;
    };

    return numericRows
      .filter((x) => picked.has(x.strikeN))
      .sort((a, b) => {
        if (a.strikeN !== b.strikeN) return a.strikeN - b.strikeN;
        return sideRank(a.side) - sideRank(b.side);
      });
  }

  function masterOcSections() {
    const st = ws[STREAM.oc];
    const item = resolveActiveOcItem();
    if (!item) return [];
    const a = upper(item.asset);
    const e = clean(item.expiry);
    const ex = upper(item.exchange || "NSE");
    const allRows = rowsOption(st.opt, (x) => upper(x.asset) === a && clean(x.expiry) === e && upper(x.exchange || "NSE") === ex);
    const limited = nearestAtmOptionRows(allRows, 20);
    const pairRows = rowsOptionPairs(limited);
    const sec = toSectionRows(pairRows, OPTION_CHAIN_PAIR_COLS);
    const first = limited[0] || {};
    const meta = `ATM:${hasCellValue(first.atm) ? first.atm : "-"} CP:${hasCellValue(first.cp) ? first.cp : "-"}`;
    return [{
      title: `OC SUMMARY VIEW: ${a} ${e} ${ex} (${meta})`,
      headers: sec.headers,
      rows: sec.rows,
    }];
  }

  async function flushMasterProjection(options, reason = REFRESH_REASON.stream) {
    if (!shouldRefreshSheet(STREAM.master, reason)) return;
    const activateSheet = options && typeof options.activateSheet === "boolean" ? options.activateSheet : autoSwitchSheets();
    const leftTopRows = [
      ["stream", "master_projection"],
      ["environment", env()],
      ["updated_at_ist", formatIstDateTime(new Date())],
      [],
    ];

    const priceSummary = toSectionRows(masterPriceRows(), MASTER_PRICE_COLS);
    const leftSections = [
      {
        title: "LIVE PRICES SUMMARY",
        headers: priceSummary.headers,
        rows: priceSummary.rows,
      },
    ];

    const ocSections = masterOcSections();
    const rightSections = ocSections.length
      ? ocSections
      : [{ title: "OPTION CHAIN SUMMARY", headers: ["info"], rows: [["No active option chains."]] }];
    const rightTopRows = [["OPTION CHAIN SUMMARY (Nearest ATM, Max 20 Strikes)"]];

    const leftWidth = sectionMaxWidth(leftTopRows, leftSections);
    const rightStartCol = leftWidth + 2;

    await writeSections("Master", leftTopRows, leftSections, { activateSheet: false, clearSheet: true, startCol: 0 });
    await writeSections("Master", rightTopRows, rightSections, { activateSheet, clearSheet: false, startCol: rightStartCol });
    await applyMasterConditionalColors({
      priceSummary,
      rightSections,
      leftTopRowsCount: leftTopRows.length,
      leftWidth,
      rightStartCol,
      rightTopRowsCount: rightTopRows.length,
      selectedSymbol: selectedMasterPriceSymbol,
    });
    masterProjectionStarted = true;
  }

  function classifyTone(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "neutral";
    if (v > 0) return "positive";
    if (v < 0) return "negative";
    return "neutral";
  }

  function toneStyle(tone) {
    if (tone === "positive") return { bg: "#E8F5E9", text: "#1B5E20" };
    if (tone === "negative") return { bg: "#FDECEC", text: "#B71C1C" };
    return { bg: "", text: "#111827" };
  }

  async function applyMasterConditionalColors(opts) {
    const priceSummary = opts?.priceSummary || { headers: [], rows: [] };
    const rightSections = Array.isArray(opts?.rightSections) ? opts.rightSections : [];
    const leftTopRowsCount = Number(opts?.leftTopRowsCount || 0);
    const leftWidth = Number(opts?.leftWidth || 0);
    const rightStartCol = Number(opts?.rightStartCol || 0);
    const rightTopRowsCount = Number(opts?.rightTopRowsCount || 0);
    const selectedSymbol = upper(opts?.selectedSymbol || "");
    if (!officeReady) return;

    await Excel.run(async (ctx) => {
      const sh = ctx.workbook.worksheets.getItem("Master");

      const pHeaders = Array.isArray(priceSummary.headers) ? priceSummary.headers : [];
      const pRows = Array.isArray(priceSummary.rows) ? priceSummary.rows : [];
      const pDataStartRow = leftTopRowsCount + 3; // topRows + title + header + first data row
      const pSymbolIdx = pHeaders.indexOf("symbol");
      const pChangeIdx = pHeaders.indexOf("change");

      if (pRows.length && leftWidth > 0) {
        const dataRange = sh.getRangeByIndexes(pDataStartRow - 1, 0, pRows.length, leftWidth);
        dataRange.format.fill.clear();
        dataRange.format.font.bold = false;
      }

      for (let i = 0; i < pRows.length; i += 1) {
        const row = Array.isArray(pRows[i]) ? pRows[i] : [];
        const symbol = pSymbolIdx >= 0 ? upper(row[pSymbolIdx]) : "";
        const change = pChangeIdx >= 0 ? row[pChangeIdx] : "";
        const tone = classifyTone(change);
        const style = toneStyle(tone);

        if (pChangeIdx >= 0 && style.bg) {
          const changeCell = sh.getCell(pDataStartRow - 1 + i, pChangeIdx);
          changeCell.format.fill.color = style.bg;
          changeCell.format.font.color = style.text;
          changeCell.format.font.bold = true;
        }

        if (selectedSymbol && symbol === selectedSymbol) {
          const rowRange = sh.getRangeByIndexes(pDataStartRow - 1 + i, 0, 1, leftWidth);
          const selectedStyle = style.bg ? style : { bg: "#ECFDF3", text: "#14532D" };
          rowRange.format.fill.color = selectedStyle.bg;
          rowRange.format.font.color = selectedStyle.text;
          rowRange.format.font.bold = true;
        }
      }

      const ocSection = rightSections[0];
      const ocHeaders = Array.isArray(ocSection?.headers) ? ocSection.headers : [];
      const ocRows = Array.isArray(ocSection?.rows) ? ocSection.rows : [];
      const ocDataStartRow = rightTopRowsCount + 3; // rightTopRows + title + header + first data row
      const strikeIdx = ocHeaders.indexOf("strike");
      const ceColIdxs = [];
      const peColIdxs = [];
      for (let i = 0; i < ocHeaders.length; i += 1) {
        const h = String(ocHeaders[i] || "").toLowerCase();
        if (h.startsWith("ce_")) ceColIdxs.push(i);
        if (h.startsWith("pe_")) peColIdxs.push(i);
      }
      let atmValue = null;
      const title = String(ocSection?.title || "");
      const m = title.match(/ATM:([0-9]+(?:\.[0-9]+)?)/i);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) atmValue = n;
      }

      if (ocRows.length && ocHeaders.length) {
        const ocDataRange = sh.getRangeByIndexes(ocDataStartRow - 1, rightStartCol, ocRows.length, ocHeaders.length);
        ocDataRange.format.fill.clear();
        ocDataRange.format.font.bold = false;
      }

      for (let i = 0; i < ocRows.length; i += 1) {
        const row = Array.isArray(ocRows[i]) ? ocRows[i] : [];
        const strikeVal = strikeIdx >= 0 ? Number(row[strikeIdx]) : null;

        if (Number.isFinite(strikeVal) && Number.isFinite(atmValue)) {
          if (Math.abs(strikeVal - atmValue) < 0.001 && strikeIdx >= 0) {
            const atmCell = sh.getCell(ocDataStartRow - 1 + i, rightStartCol + strikeIdx);
            atmCell.format.fill.color = "#FFF59D";
            atmCell.format.font.bold = true;
          } else if (strikeVal > atmValue) {
            for (const idx of ceColIdxs) {
              const ceBandCell = sh.getCell(ocDataStartRow - 1 + i, rightStartCol + idx);
              ceBandCell.format.fill.color = "#E8F5E9";
            }
          } else if (strikeVal < atmValue) {
            for (const idx of peColIdxs) {
              const peBandCell = sh.getCell(ocDataStartRow - 1 + i, rightStartCol + idx);
              peBandCell.format.fill.color = "#FDECEC";
            }
          }
        }
      }

      await ctx.sync();
    });
  }

  async function flushSheet(key, options, reason = REFRESH_REASON.stream) {
    const st = ws[key];
    if (!st) return;
    if (!shouldRefreshSheet(key, reason)) return;
    const activateSheet = options && typeof options.activateSheet === "boolean" ? options.activateSheet : autoSwitchSheets();

    if (key === STREAM.master) {
      await flushMasterProjection({ activateSheet }, reason);
      return;
    }

    let topRows = [
      ["stream", key],
      ["environment", env()],
      ["updated_at_ist", formatIstDateTime(new Date())],
      [],
    ];
    if (key === STREAM.oc) {
      const selected = resolveActiveOcItem();
      topRows = [
        ["oc_view", selected ? ocItemLabel(selected) : "None"],
        ["stream", key],
        ["environment", env()],
        ["updated_at_ist", formatIstDateTime(new Date())],
        [],
      ];
    }

    let sections = [];
    if (key === STREAM.prices) {
      sections = buildLivePricesSections(st);
    } else if (key === STREAM.oc) {
      sections = buildLiveOcSections(st);
    } else {
      const idx = toSectionRows(rowsIndex(st.idx), INDEX_COLS);
      const opt = toSectionRows(rowsOption(st.opt), OPTION_COLS);
      const ob = toSectionRows(rowsOb(st.ob), ORDERBOOK_COLS);
      sections = [
        { title: "INDEX FEED", headers: idx.headers, rows: idx.rows },
        { spacer: 1, title: "OPTION FEED", headers: opt.headers, rows: opt.rows },
        { spacer: 1, title: "ORDERBOOK FEED", headers: ob.headers, rows: ob.rows },
      ];
    }

    const anchors = new Map();
    await writeSections(st.sheetName, topRows, sections, { activateSheet, captureAnchors: anchors });
    st.anchors = anchors;
    if (key === STREAM.oc) {
      await applyOcSheetDropdown();
      await ensureOcSheetChangeListener();
    }
  }

  async function writeTable(sheet, headers, rows, topRows) {
    await writeSections(sheet, Array.isArray(topRows) ? topRows : [], [{ headers, rows }], { activateSheet: true });
  }

  async function writeSections(sheetName, topRows, sections, options) {
    if (!officeReady) throw new Error("Office is not ready.");
    const activateSheet = options?.activateSheet !== false;
    const clearSheet = options?.clearSheet !== false;
    const startCol = Number.isInteger(options?.startCol) ? options.startCol : 0;
    const captureAnchors = options?.captureAnchors instanceof Map ? options.captureAnchors : null;

    await Excel.run(async (ctx) => {
      const wb = ctx.workbook;
      let sh = wb.worksheets.getItemOrNullObject(sheetName);
      await ctx.sync();
      if (sh.isNullObject) sh = wb.worksheets.add(sheetName);

      if (clearSheet) {
        const used = sh.getUsedRangeOrNullObject(true);
        await ctx.sync();
        if (!used.isNullObject) used.clear("All");
      }

      let row = 1;
      if (Array.isArray(topRows) && topRows.length) {
        const w = topRows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 1), 1);
        const vals = topRows.map((r) => {
          const a = Array.isArray(r) ? r.slice(0, w) : [r];
          while (a.length < w) a.push("");
          return a;
        });
        sh.getRangeByIndexes(row - 1, startCol, vals.length, w).values = vals;
        row += vals.length;
      }

      for (const sec of sections) {
        let anchorRow = row;
        if (sec.title) {
          sh.getRangeByIndexes(row - 1, startCol, 1, 1).values = [[sec.title]];
          anchorRow = row;
          row += 1;
        }
        if (sec.spacer) {
          row += Number(sec.spacer);
          anchorRow = row;
        }

        const headers = Array.isArray(sec.headers) ? sec.headers : [];
        if (headers.length) {
          sh.getRangeByIndexes(row - 1, startCol, 1, headers.length).values = [headers];
          row += 1;
          anchorRow = row;
        }

        const rows = Array.isArray(sec.rows) ? sec.rows : [];
        if (rows.length) {
          const w = rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 1), 1);
          for (let i = 0; i < rows.length; i += BATCH) {
            const chunk = rows.slice(i, i + BATCH).map((r) => {
              const a = Array.isArray(r) ? r.slice(0, w) : [r];
              while (a.length < w) a.push("");
              return a;
            });
            sh.getRangeByIndexes(row - 1 + i, startCol, chunk.length, w).values = chunk;
          }
          row += rows.length;
        }
        if (captureAnchors && sec.anchorKey) {
          captureAnchors.set(String(sec.anchorKey), { row: anchorRow, col: startCol + 1 });
        }
        row += 1;
      }

      if (activateSheet) {
        sh.activate();
      }
      await ctx.sync();
    });
    tlg(`Sheet write ok: ${sheetName} (${Array.isArray(sections) ? sections.length : 0} section(s)) at ${formatIstDateTime(new Date())}.`);
  }

  function kvRowsFromObject(obj) {
    const src = obj && typeof obj === "object" ? obj : {};
    return Object.entries(src).map(([k, v]) => [k, hasCellValue(v) && typeof v === "object" ? JSON.stringify(v) : (hasCellValue(v) ? String(v) : "")]);
  }

  function placeOrderSheetLayout() {
    const leftSections = [];
    const rightSections = [];
    const tracked = latestTrackedStrategyState;
    const active = activeStrategyStateSnapshot();
    const trackedOpen = tracked?.legs?.length && !tracked?.closed;
    const trackedQty = Number(tracked?.requested_order_qty);
    const trackedLivePaise = trackedOpen ? signedEntryPriceFromTracked(tracked, "sell_positive") : null;
    const trackedLiveRupee = Number.isFinite(trackedLivePaise) ? paiseToRupee(trackedLivePaise) : null;

    if (active) {
      leftSections.push({
        title: "CURRENT STRATEGY",
        headers: ["metric", "value", "metric", "value"],
        rows: [
          ["symbol", active.symbol || "", "strategy", active.strategy || ""],
          ["qty", hasCellValue(active.order_qty) ? String(active.order_qty) : "", "delta", hasCellValue(active.target_delta) ? String(active.target_delta) : ""],
          ["entry_at", active.entry_at || "", "updated_at", active.updated_at || ""],
          ["entry_price", hasCellValue(active.entry_price_once) ? String(round2(Number(active.entry_price_once))) : "", "live_price", hasCellValue(active.live_strategy_ltp) ? String(round2(Number(active.live_strategy_ltp))) : ""],
          ["live_pnl", hasCellValue(active.live_pnl) ? String(round2(Number(active.live_pnl))) : "", "status", active.basket_status || active.statusText || ""],
          ["basket_id", hasCellValue(active.basket_id) ? String(active.basket_id) : "", "basket_tag", active.basket_tag || ""],
        ],
      });
    } else if (trackedOpen) {
      leftSections.push({
        title: "TRACKED PREVIEW",
        headers: ["metric", "value", "metric", "value"],
        rows: [
          ["symbol", tracked.symbol || "", "strategy", tracked.strategy || ""],
          ["qty", Number.isFinite(trackedQty) && trackedQty > 0 ? String(trackedQty) : "", "delta", hasCellValue(tracked.target_delta) ? String(tracked.target_delta) : ""],
          ["selected_at", tracked.selected_at || "", "pair_number", hasCellValue(tracked.pair_number) ? String(tracked.pair_number) : ""],
          ["live_price", Number.isFinite(trackedLiveRupee) ? String(round2(Number(trackedLiveRupee))) : "", "status", "Tracked only. Deploy basket to make this strategy live."],
        ],
      });
    } else {
      leftSections.push({
        spacer: 1,
        title: "TRACKED PREVIEW",
        headers: ["info"],
        rows: [["No tracked strategy yet."]],
      });
    }

    if (trackedOpen) {
      leftSections.push({
        spacer: 1,
        title: "ACTIVE LEGS",
        headers: ["leg", "side", "type", "strike", "ltp", "delta", "theta"],
        rows: tracked.legs.map((leg, idx) => [
          String(idx + 1),
          leg.side ?? "",
          leg.option_type ?? "",
          hasCellValue(leg.strike) ? String(leg.strike) : "",
          hasCellValue(leg.ltp) ? String(paiseToRupee(leg.ltp)) : "",
          hasCellValue(leg.delta) ? String(leg.delta) : "",
          hasCellValue(leg.theta) ? String(leg.theta) : "",
        ]),
      });
    } else {
      leftSections.push({
        spacer: 1,
        title: "ACTIVE LEGS",
        headers: ["info"],
        rows: [["No tracked legs yet."]],
      });
    }

    rightSections.push({
      ...placeOrderOcSection(),
    });

    return { leftSections, rightSections };
  }

  function computeSectionLayout(topRows, sections) {
    const layout = [];
    let row = (Array.isArray(topRows) ? topRows.length : 0) + 1;
    for (const sec of Array.isArray(sections) ? sections : []) {
      const item = {
        title: sec.title || "",
        titleRow: null,
        headerRow: null,
        dataStartRow: null,
        rowCount: 0,
        width: 1,
      };
      if (sec.title) {
        item.titleRow = row;
        row += 1;
      }
      if (sec.spacer) row += Number(sec.spacer);
      const headers = Array.isArray(sec.headers) ? sec.headers : [];
      if (headers.length) {
        item.headerRow = row;
        item.width = Math.max(item.width, headers.length);
        row += 1;
      }
      const rows = Array.isArray(sec.rows) ? sec.rows : [];
      if (rows.length) {
        item.dataStartRow = row;
        item.rowCount = rows.length;
        item.width = Math.max(item.width, rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 1), 1));
        row += rows.length;
      }
      layout.push(item);
      row += 1;
    }
    return layout;
  }

  async function applyPlaceOrderConditionalColors(opts) {
    if (!officeReady) return;
    const leftSections = Array.isArray(opts?.leftSections) ? opts.leftSections : [];
    const rightSections = Array.isArray(opts?.rightSections) ? opts.rightSections : [];
    const leftTopRows = Array.isArray(opts?.leftTopRows) ? opts.leftTopRows : [];
    const rightTopRows = Array.isArray(opts?.rightTopRows) ? opts.rightTopRows : [];
    const rightStartCol = Number(opts?.rightStartCol || 0);
    const leftLayout = computeSectionLayout(leftTopRows, leftSections);
    const rightLayout = computeSectionLayout(rightTopRows, rightSections);
    const active = activeStrategyStateSnapshot();

    await Excel.run(async (ctx) => {
      const sh = ctx.workbook.worksheets.getItem("PlaceOrder");
      const used = sh.getUsedRangeOrNullObject(true);
      await ctx.sync();
      const palettes = [
        { title: "#EAF2FF", header: "#F4F8FF" },
        { title: "#EEF7F0", header: "#F6FBF7" },
        { title: "#FFF4E8", header: "#FFF9F1" },
        { title: "#F5F0FF", header: "#FAF7FF" },
      ];

      const paintSectionBlock = (section, startCol, paletteIndex) => {
        const palette = palettes[paletteIndex % palettes.length];
        if (section.titleRow && section.width > 0) {
          const titleRange = sh.getRangeByIndexes(section.titleRow - 1, startCol, 1, section.width);
          titleRange.format.fill.color = palette.title;
          titleRange.format.font.bold = true;
          titleRange.format.font.color = "#173557";
        }
        if (section.headerRow && section.width > 0) {
          const headerRange = sh.getRangeByIndexes(section.headerRow - 1, startCol, 1, section.width);
          headerRange.format.fill.color = palette.header;
          headerRange.format.font.bold = true;
          headerRange.format.font.color = "#314051";
        }
      };

      leftLayout.forEach((section, idx) => paintSectionBlock(section, 0, idx));
      rightLayout.forEach((section, idx) => paintSectionBlock(section, rightStartCol, idx + 1));

      const fitColumn = (colIdx, width) => {
        sh.getRangeByIndexes(0, colIdx, 1, 1).format.columnWidth = width;
      };
      const paintInfoCell = (cell) => {
        if (!cell) return;
        cell.format.fill.color = "#DCEBFF";
        cell.format.font.color = "#0E3FA6";
        cell.format.font.bold = true;
      };
      const paintPendingCell = (cell) => {
        if (!cell) return;
        cell.format.fill.color = "#FFF8E1";
        cell.format.font.color = "#8A5A00";
        cell.format.font.bold = true;
      };
      const paintGoodCell = (cell) => {
        if (!cell) return;
        cell.format.fill.color = "#E8F5E9";
        cell.format.font.color = "#1B5E20";
        cell.format.font.bold = true;
      };
      const paintBadCell = (cell) => {
        if (!cell) return;
        cell.format.fill.color = "#FDECEC";
        cell.format.font.color = "#B71C1C";
        cell.format.font.bold = true;
      };
      if (!used.isNullObject) {
        used.format.autofitColumns();
      }
      fitColumn(0, 78);
      fitColumn(1, 108);
      fitColumn(2, 74);
      fitColumn(3, 150);
      fitColumn(4, 76);
      fitColumn(5, 72);
      fitColumn(6, 72);
      fitColumn(rightStartCol, 86);
      fitColumn(rightStartCol + 1, 96);
      fitColumn(rightStartCol + 2, 86);
      fitColumn(rightStartCol + 3, 86);
      fitColumn(rightStartCol + 4, 74);
      fitColumn(rightStartCol + 5, 74);

      const placeTitle = sh.getRangeByIndexes(0, 0, 5, 2);
      placeTitle.format.font.name = "Aptos";
      placeTitle.format.font.size = 11;
      placeTitle.format.font.bold = false;
      placeTitle.getCell(0, 0).format.font.bold = true;
      placeTitle.getCell(0, 1).format.font.bold = true;
      placeTitle.getCell(0, 1).format.fill.color = "#DCEBFF";
      placeTitle.getCell(0, 1).format.font.color = "#0E3FA6";
      placeTitle.getCell(1, 1).format.fill.color = "#DCEBFF";
      placeTitle.getCell(1, 1).format.font.color = "#0E3FA6";
      placeTitle.getCell(2, 1).format.fill.color = "#FFF8E1";
      placeTitle.getCell(2, 1).format.font.color = "#8A5A00";
      placeTitle.getCell(4, 1).format.fill.color = "#EAF2FF";
      placeTitle.getCell(4, 1).format.font.color = "#173557";

      const findMetricValueCell = (section, sectionRows, metricName) => {
        if (!section?.dataStartRow || !Array.isArray(sectionRows)) return null;
        for (let rowIdx = 0; rowIdx < sectionRows.length; rowIdx += 1) {
          const row = Array.isArray(sectionRows[rowIdx]) ? sectionRows[rowIdx] : [];
          for (let colIdx = 0; colIdx < row.length - 1; colIdx += 2) {
            if (clean(row[colIdx] || "") !== metricName) continue;
            return sh.getCell(section.dataStartRow - 1 + rowIdx, colIdx + 1);
          }
        }
        return null;
      };

      const currentStrategySection = leftLayout.find((x) => x.title === "CURRENT STRATEGY");
      if (currentStrategySection?.dataStartRow) {
        const currentSectionRows = leftSections.find((x) => x.title === "CURRENT STRATEGY")?.rows || [];
        const statusCell = findMetricValueCell(currentStrategySection, currentSectionRows, "status");
        const pnlCell = findMetricValueCell(currentStrategySection, currentSectionRows, "live_pnl");
        const basketIdCell = findMetricValueCell(currentStrategySection, currentSectionRows, "basket_id");
        const basketTagCell = findMetricValueCell(currentStrategySection, currentSectionRows, "basket_tag");
        const pnlTone = activeStrategyPnlClass(active?.live_pnl);
        if (pnlCell) {
          if (pnlTone === "good") {
            paintGoodCell(pnlCell);
          } else if (pnlTone === "bad") {
            paintBadCell(pnlCell);
          } else {
            pnlCell.format.fill.color = "#F4F8FF";
            pnlCell.format.font.color = "#1F2937";
            pnlCell.format.font.bold = true;
          }
        }

        if (statusCell) {
          const statusText = upper(active?.basket_status || "");
          if (statusText.includes("FILL") || statusText.includes("LIVE") || statusText.includes("OPEN")) {
            paintGoodCell(statusCell);
          } else if (statusText.includes("REJECT") || statusText.includes("CANCEL") || statusText.includes("FAIL")) {
            paintBadCell(statusCell);
          } else {
            paintPendingCell(statusCell);
          }
        }
        paintInfoCell(basketIdCell);
        paintInfoCell(basketTagCell);
      }

      const trackedPreviewSection = leftLayout.find((x) => x.title === "TRACKED PREVIEW");
      if (trackedPreviewSection?.dataStartRow) {
        const trackedRows = leftSections.find((x) => x.title === "TRACKED PREVIEW")?.rows || [];
        const statusCell = findMetricValueCell(trackedPreviewSection, trackedRows, "status");
        const livePriceCell = findMetricValueCell(trackedPreviewSection, trackedRows, "live_price");
        if (statusCell) {
          paintPendingCell(statusCell);
        }
        paintInfoCell(livePriceCell);
      }

      const activeLegsSection = leftLayout.find((x) => x.title === "ACTIVE LEGS");
      const activeLegsRows = leftSections.find((x) => x.title === "ACTIVE LEGS")?.rows || [];
      if (activeLegsSection?.dataStartRow && activeLegsRows.length) {
        for (let i = 0; i < activeLegsRows.length; i += 1) {
          const row = Array.isArray(activeLegsRows[i]) ? activeLegsRows[i] : [];
          if (row.length < 7) continue;
          const sideText = upper(row[1] || "");
          const deltaVal = Number(row[5]);
          const thetaVal = Number(row[6]);
          const sideCell = sh.getCell(activeLegsSection.dataStartRow - 1 + i, 1);
          const ltpCell = sh.getCell(activeLegsSection.dataStartRow - 1 + i, 4);
          const deltaCell = sh.getCell(activeLegsSection.dataStartRow - 1 + i, 5);
          const thetaCell = sh.getCell(activeLegsSection.dataStartRow - 1 + i, 6);
          if (sideText === "SELL") paintBadCell(sideCell);
          else if (sideText === "BUY") paintGoodCell(sideCell);
          paintInfoCell(ltpCell);
          if (Number.isFinite(deltaVal)) {
            if (deltaVal > 0) paintGoodCell(deltaCell);
            else if (deltaVal < 0) paintBadCell(deltaCell);
            else paintPendingCell(deltaCell);
          }
          if (Number.isFinite(thetaVal)) {
            if (thetaVal > 0) paintGoodCell(thetaCell);
            else if (thetaVal < 0) paintBadCell(thetaCell);
            else paintPendingCell(thetaCell);
          }
        }
      }

      const closedTradesSection = rightLayout.find((x) => x.title === "RECENT CLOSED TRADES");
      if (closedTradesSection?.dataStartRow && closedTradesSection.rowCount > 0) {
        for (let i = 0; i < closedTradesSection.rowCount; i += 1) {
          const pnlCell = sh.getCell(closedTradesSection.dataStartRow - 1 + i, rightStartCol + 6);
          const pnlVal = Number(latestClosedTradeHistoryState?.[i]?.booked_pnl);
          if (!Number.isFinite(pnlVal)) continue;
          if (pnlVal >= 0) paintGoodCell(pnlCell);
          else paintBadCell(pnlCell);
        }
      }

      const ocSection = rightLayout.find((x) => String(x.title || "").startsWith("OPTION CHAIN FOCUS"));
      const ocData = placeOrderOcSection();
      const ocHeaders = Array.isArray(ocData?.headers) ? ocData.headers : [];
      const ocRows = Array.isArray(ocData?.rows) ? ocData.rows : [];
      if (ocSection?.dataStartRow && ocRows.length && ocHeaders.length) {
        const strikeIdx = ocHeaders.indexOf("strike");
        const cePairIdx = ocHeaders.indexOf("pair");
        const secondPairIdx = ocHeaders.lastIndexOf("pair");
        const ceIdxs = [];
        const peIdxs = [];
        for (let i = 0; i < ocHeaders.length; i += 1) {
          const h = String(ocHeaders[i] || "").toLowerCase();
          if (h.startsWith("call_")) ceIdxs.push(i);
          if (h.startsWith("put_")) peIdxs.push(i);
        }
        let atmValue = null;
        const match = String(ocData.title || "").match(/ATM:([0-9]+(?:\.[0-9]+)?)/i);
        if (match) atmValue = Number(match[1]);

        for (let i = 0; i < ocRows.length; i += 1) {
          const row = Array.isArray(ocRows[i]) ? ocRows[i] : [];
          const strikeVal = strikeIdx >= 0 ? Number(row[strikeIdx]) : null;
          if (Number.isFinite(strikeVal) && Number.isFinite(atmValue)) {
            if (Math.abs(strikeVal - atmValue) < 0.001) {
              const strikeCell = sh.getCell(ocSection.dataStartRow - 1 + i, rightStartCol + strikeIdx);
              strikeCell.format.fill.color = "#FFF59D";
              strikeCell.format.font.bold = true;
            } else if (strikeVal > atmValue) {
              ceIdxs.forEach((idx) => {
                sh.getCell(ocSection.dataStartRow - 1 + i, rightStartCol + idx).format.fill.color = "#E8F5E9";
              });
            } else if (strikeVal < atmValue) {
              peIdxs.forEach((idx) => {
                sh.getCell(ocSection.dataStartRow - 1 + i, rightStartCol + idx).format.fill.color = "#FDECEC";
              });
            }
          }
          if (cePairIdx >= 0 && hasCellValue(row[cePairIdx])) {
            const cePairCell = sh.getCell(ocSection.dataStartRow - 1 + i, rightStartCol + cePairIdx);
            cePairCell.format.fill.color = "#DCEBFF";
            cePairCell.format.font.bold = true;
            cePairCell.format.font.color = "#0E3FA6";
          }
          if (secondPairIdx >= 0 && secondPairIdx !== cePairIdx && hasCellValue(row[secondPairIdx])) {
            const pePairCell = sh.getCell(ocSection.dataStartRow - 1 + i, rightStartCol + secondPairIdx);
            pePairCell.format.fill.color = "#DCEBFF";
            pePairCell.format.font.bold = true;
            pePairCell.format.font.color = "#0E3FA6";
          }
        }
      }

      if (!used.isNullObject) {
        used.format.horizontalAlignment = "Left";
        used.format.verticalAlignment = "Center";
        used.format.wrapText = false;
      }

      await ctx.sync();
    });
  }

  async function refreshPlaceOrderSheet(reason = REFRESH_REASON.manual) {
    if (!shouldRefreshSheet(SHEET.placeOrder, reason)) return;
    if (!officeReady) return;
    if (latestTrackedStrategyState?.legs?.length) {
      const hydrate = hydrateTrackedLegsFromLive(latestTrackedStrategyState);
      if (hydrate.updated) {
        saveScopedJson(S.trackedStrategyState, latestTrackedStrategyState, ORDER_ENV);
      }
    }
    const leftTopRows = [
      ["sheet", "PlaceOrder"],
      ["data_environment", envLabel(DATA_ENV)],
      ["order_environment", envLabel(ORDER_ENV)],
      ["updated_at_ist", formatIstDateTime(new Date())],
      ["layout", "order_desk_v3"],
      [],
    ];
    const { leftSections, rightSections } = placeOrderSheetLayout();
    const rightTopRows = [["ORDER FLOW SNAPSHOT"]];
    try {
      const leftWidth = sectionMaxWidth(leftTopRows, leftSections);
      const rightStartCol = leftWidth + 2;
      await writeSections("PlaceOrder", leftTopRows, leftSections, { activateSheet: false, clearSheet: true, startCol: 0 });
      await writeSections("PlaceOrder", rightTopRows, rightSections, { activateSheet: false, clearSheet: false, startCol: rightStartCol });
      await applyPlaceOrderConditionalColors({
        leftTopRows,
        leftSections,
        rightTopRows,
        rightSections,
        rightStartCol,
      });
      if (reason === REFRESH_REASON.stream) {
        lastPlaceOrderSheetStreamRefreshAt = Date.now();
      }
      tlg(`PlaceOrder sheet refreshed for ${envLabel(env())}.`);
    } catch (e) {
      tlg(`PlaceOrder refresh failed: ${e.message || String(e)}`, true);
    }
  }

  function setServerStatus(ok) {
    if (!U?.serverStatusButton) return;
    U.serverStatusButton.classList.toggle("connected", Boolean(ok));
    U.serverStatusButton.classList.toggle("disconnected", !ok);
    U.serverStatusButton.textContent = "Server";
    U.serverStatusButton.title = ok ? "Server OK" : "Server Down";
    U.serverStatusButton.setAttribute("aria-label", ok ? "Server OK" : "Server Down");
  }

  async function checkServer(options = {}) {
    const silent = Boolean(options.silent);
    try {
      const r = await fetch("/ws/status");
      if (!r.ok) throw new Error(`status ${r.status}`);
      const d = await jsonSafe(r);
      const count = Array.isArray(d?.streams) ? d.streams.length : (d?.streams ? Object.keys(d.streams).length : 0);
      setServerStatus(true);
      if (!silent || serverConnected !== true) {
        lg(`Local server reachable (${count} stream${count === 1 ? "" : "s"}).`);
      }
      serverConnected = true;
      return true;
    } catch (_e) {
      setServerStatus(false);
      if (!silent || serverConnected !== false) {
        lg("Local dev server is not reachable on https://localhost:3000.", true);
      }
      serverConnected = false;
      return false;
    }
  }

  async function resetServerStreamsOnLaunch() {
    try {
      const r = await fetch("/ws/reset", { method: "POST" });
      if (!r.ok) return;
      const d = await jsonSafe(r);
      const n = Number(d?.reset || 0);
      if (n > 0) lg(`Reset ${n} stale WS stream(s) on launch.`);
    } catch (_e) {
      // ignore
    }
  }

  async function refreshPlaceOrderSheetForEnvSwitch() {
    await refreshPlaceOrderSheet(REFRESH_REASON.env);
  }

  async function switchEnvironment(nextEnv) {
    const target = asEnv(nextEnv);
    const current = env();
    if (target === current) {
      authUi();
      return;
    }
    if (placeOrderStreamRefreshTimer) {
      clearTimeout(placeOrderStreamRefreshTimer);
      placeOrderStreamRefreshTimer = null;
    }

    await stopAllWs({ preserveSelections: true, skipSheetRefresh: !clearOnEnvSwitch() });
    setEnv(target);
    applyDailyAuthReset();
    masterProjectionStarted = false;
    setWorkspaceReady(false);
    setWorkspaceLoading(false);

    const c = loadInstruments(target);
    hydrateLists(c);
    applyPersistedUiState(target);
    refreshOcViewSelector();
    syncOrderStrategyStateFromStorage(ORDER_ENV);

    U.phoneInput.value = gScoped(S.phone, target, "");
    U.otpInput.value = "";
    U.pinInput.value = "";
    setFieldMessage(U.phoneFieldMsg, U.phoneInput, "", "error");
    setFieldMessage(U.otpFieldMsg, U.otpInput, "", "error");
    setFieldMessage(U.pinFieldMsg, U.pinInput, "", "error");
    clearAuthActionMessage();
    syncAuthStagesForCurrentEnv();
    authUi();
    lg(`Environment switched to ${envLabel(target)} (${envBaseUrl(target)}).`);
    await refreshPlaceOrderSheetForEnvSwitch();

    if (await validateStoredSession(target, { silent: true })) {
      setWorkspaceReady(true);
      lg(`${envLabel(target)} session restored. No auto-reload on environment switch.`);
    }

    if (!isAuthEnv(target)) {
      show(U.authCard);
      U.phoneInput.focus();
      lg(`${envLabel(target)} is not authenticated. Complete OTP + MPIN for this environment.`);
    }
  }

  async function logoutEnvironment(targetEnv) {
    const target = asEnv(targetEnv);
    if (!isAuthEnv(target)) {
      lg(`${envLabel(target)} already logged out.`);
      renderEnvAuthTags();
      refreshAuthControls();
      return;
    }
    clearAuthTokensForEnv(target);
    if (env() === target) {
      await stopAllWs({ preserveSelections: true, skipSheetRefresh: true }).catch(() => null);
      setWorkspaceReady(false);
      setWorkspaceLoading(false);
      show(U.otpStage);
      hide(U.mpinStage);
      U.otpInput.value = "";
      U.pinInput.value = "";
      setFieldMessage(U.phoneFieldMsg, U.phoneInput, "", "error");
      setFieldMessage(U.otpFieldMsg, U.otpInput, "", "error");
      setFieldMessage(U.pinFieldMsg, U.pinInput, "", "error");
      setAuthActionMessage(`${envLabel(target)} session logged out.`, "success");
      syncAuthStagesForCurrentEnv();
      authUi();
    } else {
      renderEnvAuthTags();
      refreshAuthControls();
    }
    lg(`${envLabel(target)} session logged out.`);
  }

  function toggleSettingsBody(forceOpen) {
    const open = typeof forceOpen === "boolean" ? forceOpen : U.settingsBody.classList.contains("hidden");
    if (open) {
      show(U.settingsBody);
      U.settingsToggleButton.classList.add("active");
      return;
    }
    hide(U.settingsBody);
    U.settingsToggleButton.classList.remove("active");
  }

  function wire() {
    U.masterPageButton?.addEventListener("click", () => {
      setActivePage(PAGE.master);
      hideOrdersAuthPopup();
      setAuthTargetEnv(DATA_ENV);
      syncAuthStagesForCurrentEnv();
      authUi();
    });
    U.realtimePageButton?.addEventListener("click", () => {
      setActivePage(PAGE.realtime);
      hideOrdersAuthPopup();
      setAuthTargetEnv(DATA_ENV);
      syncAuthStagesForCurrentEnv();
      authUi();
    });
    U.historicalPageButton?.addEventListener("click", () => {
      setActivePage(PAGE.historical);
      hideOrdersAuthPopup();
      setAuthTargetEnv(DATA_ENV);
      syncAuthStagesForCurrentEnv();
      authUi();
    });
    U.ordersPageButton?.addEventListener("click", () => {
      setAuthTargetEnv(ORDER_ENV);
      syncAuthStagesForCurrentEnv();
      authUi();
      if (!isAuthEnv(ORDER_ENV)) {
        const msg = "Please login to UAT to continue to Orders. PROD data streams continue uninterrupted.";
        pendingOrdersLoginRedirect = true;
        setActivePage(PAGE.master);
        setAuthActionMessage(msg, "info");
        if (U?.phoneInput) U.phoneInput.focus();
        return;
      }
      pendingOrdersLoginRedirect = false;
      setActivePage(PAGE.orders);
    });
    U.ordersAuthPopupClose?.addEventListener("click", () => {
      hideOrdersAuthPopup();
    });
    U.envUatButton.addEventListener("click", () => {
      setAuthTargetEnv(ORDER_ENV);
      syncAuthStagesForCurrentEnv();
      authUi();
    });
    U.envLiveButton.addEventListener("click", () => {
      setAuthTargetEnv(DATA_ENV);
      syncAuthStagesForCurrentEnv();
      authUi();
    });
    if (U.topLogoutButton) {
      U.topLogoutButton.addEventListener("click", () => busy(U.topLogoutButton, () => logoutEnvironment(authEnv())).catch((e) => lg(e.message || String(e), true)));
    }
    U.settingsToggleButton.addEventListener("click", () => toggleSettingsBody());
    U.serverStatusButton.addEventListener("click", () => busy(U.serverStatusButton, () => checkServer({ silent: false })).catch((e) => lg(e.message || String(e), true)));
    U.ocViewSelect.addEventListener("change", () => {
      const key = U.ocViewSelect.value || "";
      setActiveOcViewKey(key);
      renderMasterOcList(activeOcItems(), key);
      flushSheet(STREAM.oc, { activateSheet: false })
        .then(() => scheduleMasterProjectionFlush())
        .catch((e) => lg(e.message || String(e), true));
    });
    if (U.ocSearchInput) {
      U.ocSearchInput.addEventListener("input", () => {
        renderMasterOcList(activeOcItems(), U.ocViewSelect.value || "");
      });
    }
    if (U.masterOcList) {
      U.masterOcList.addEventListener("click", (ev) => {
        const btn = ev.target?.closest?.("button[data-oc-key]");
        if (!btn) return;
        const key = btn.getAttribute("data-oc-key") || "";
        if (!key || !U.ocViewSelect) return;
        U.ocViewSelect.value = key;
        U.ocViewSelect.dispatchEvent(new Event("change"));
      });
    }
    U.autoSwitchSheetsInput.addEventListener("change", () => {
      set(S.autoSwitchSheets, U.autoSwitchSheetsInput.checked ? "1" : "0");
      lg(`Auto-switch sheets is now ${U.autoSwitchSheetsInput.checked ? "ON" : "OFF"}.`);
    });
    if (U.clearOnEnvSwitchInput) {
      U.clearOnEnvSwitchInput.addEventListener("change", () => {
        set(S.clearOnEnvSwitch, U.clearOnEnvSwitchInput.checked ? "1" : "0");
        lg(`Clear sheets on env switch is now ${U.clearOnEnvSwitchInput.checked ? "ON" : "OFF"}.`);
      });
    }
    if (U.masterQuickStartPricesButton) {
      U.masterQuickStartPricesButton.addEventListener("click", () => busy(U.masterQuickStartPricesButton, startPrices).catch((e) => lg(e.message || String(e), true)));
    }
    if (U.masterQuickStartOcButton) {
      U.masterQuickStartOcButton.addEventListener("click", () => busy(U.masterQuickStartOcButton, startOc).catch((e) => lg(e.message || String(e), true)));
    }
    U.historicalTypeSelect.addEventListener("change", () => {
      applyHistoricalSymbolInputContext();
    });

    U.phoneInput.addEventListener("input", () => {
      const d = digits(U.phoneInput.value).slice(0, 10);
      if (U.phoneInput.value !== d) U.phoneInput.value = d;
      validatePhone(Boolean(d));
      clearAuthActionMessage();
      refreshAuthControls();
    });
    U.phoneInput.addEventListener("blur", () => {
      validatePhone(true);
      refreshAuthControls();
    });
    U.otpInput.addEventListener("input", () => {
      const d = digits(U.otpInput.value).slice(0, 6);
      if (U.otpInput.value !== d) U.otpInput.value = d;
      validateOtp(Boolean(d));
      clearAuthActionMessage();
      refreshAuthControls();
    });
    U.otpInput.addEventListener("blur", () => {
      validateOtp(true);
      refreshAuthControls();
    });
    U.pinInput.addEventListener("input", () => {
      const d = digits(U.pinInput.value).slice(0, 4);
      if (U.pinInput.value !== d) U.pinInput.value = d;
      validatePin(Boolean(d));
      clearAuthActionMessage();
      refreshAuthControls();
    });
    U.pinInput.addEventListener("blur", () => {
      validatePin(true);
      refreshAuthControls();
    });

    U.clearSessionButton.addEventListener("click", async () => {
      const targetAuth = authEnv();
      delTok("temp", targetAuth);
      delTok("auth", targetAuth);
      delTok("session", targetAuth);
      delTok("userId", targetAuth);
      if (targetAuth === DATA_ENV) {
        await stopAllWs({ preserveSelections: true });
        setWorkspaceReady(false);
        setWorkspaceLoading(false);
      }
      show(U.otpStage); hide(U.mpinStage);
      setFieldMessage(U.phoneFieldMsg, U.phoneInput, "", "error");
      setFieldMessage(U.otpFieldMsg, U.otpInput, "", "error");
      setFieldMessage(U.pinFieldMsg, U.pinInput, "", "error");
      clearAuthActionMessage();
      authUi();
      lg(`${envLabel(targetAuth)} tokens cleared.`);
    });

    U.sendOtpButton.addEventListener("click", () => busy(U.sendOtpButton, async () => {
      const phone = digits(U.phoneInput.value);
      if (!validatePhone(true)) {
        setAuthActionMessage("Fix phone number before sending OTP.");
        throw new Error("Enter a valid phone number.");
      }
      const skipTotpRequested = Boolean(U.skipTotpInput.checked);
      const targetAuth = authEnv();
      lg(`Sending OTP for ${envLabel(targetAuth)} (${envBaseUrl(targetAuth)}).`);
      // Step 1 from docs: get temp_token with skip_totp=false.
      const first = await req("/sendphoneotp", {
        method: "POST",
        envOverride: targetAuth,
        body: { phone, skip_totp: false },
      });
      let effective = first;
      let tempToken = pickToken(first, ["temp_token", "tempToken", "x_temp_token"]);
      const firstMessage = clean(first?.message || first?.error || "");
      const firstNext = upper(first?.next || "");
      const firstFlow = upper(first?.flow || "");
      const backendHintsTotp = /totp/i.test(`${firstMessage} ${firstNext} ${firstFlow}`);

      // Step 2 from docs: for TOTP-enabled users who want SMS OTP, call again with x-temp-token + skip_totp=true.
      if ((skipTotpRequested || backendHintsTotp) && tempToken) {
        const second = await req("/sendphoneotp", {
          method: "POST",
          envOverride: targetAuth,
          headers: { "x-temp-token": String(tempToken) },
          body: { phone, skip_totp: true },
        });
        effective = second;
        tempToken = pickToken(second, ["temp_token", "tempToken", "x_temp_token"]) || tempToken;
      }

      if (!tempToken) {
        const backendMsg = clean(effective?.error || effective?.message || first?.error || first?.message);
        setAuthActionMessage(backendMsg || `OTP API did not return temp token for ${envLabel(targetAuth)}.`);
        throw new Error(backendMsg || `OTP API did not return temp token for ${envLabel(targetAuth)}.`);
      }

      setTok("temp", String(tempToken), targetAuth);
      setTok("phone", phone, targetAuth);
      show(U.otpStage); hide(U.mpinStage);
      U.otpInput.value = "";
      const attempts = pickToken(effective, ["attempts_left", "attemptsLeft"]);
      const expiry = pickToken(effective, ["expiry", "otp_expiry"]);
      const backendMessage = clean(effective?.message || "");
      const statusMsg = backendMessage || "OTP initiated. Check SMS and enter 6-digit OTP.";
      setFieldMessage(U.phoneFieldMsg, U.phoneInput, statusMsg, "success");
      setFieldMessage(U.otpFieldMsg, U.otpInput, "", "error");
      setFieldMessage(U.pinFieldMsg, U.pinInput, "", "error");
      setAuthActionMessage(
        `OTP step ready for ${envLabel(targetAuth)}${hasCellValue(attempts) ? ` | attempts left: ${attempts}` : ""}${hasCellValue(expiry) ? ` | expires in: ${expiry}s` : ""}.`,
        "success"
      );
      U.otpInput.focus();
      lg(`OTP sent for ${envLabel(targetAuth)}. Attempts left: ${hasCellValue(attempts) ? attempts : "-"}`);
      refreshAuthControls();
    }).catch((e) => {
      setAuthActionMessage(e.message || String(e));
      refreshAuthControls();
      lg(e.message || String(e), true);
    }));

    U.verifyOtpButton.addEventListener("click", () => busy(U.verifyOtpButton, async () => {
      const targetAuth = authEnv();
      const phone = digits(U.phoneInput.value || gScoped(S.phone, targetAuth, ""));
      const otp = clean(U.otpInput.value);
      if (!validatePhone(true)) {
        setAuthActionMessage("Enter a valid phone number first.");
        throw new Error("Phone is required.");
      }
      if (!validateOtp(true)) {
        setAuthActionMessage("Enter a valid 6-digit OTP.");
        throw new Error("OTP is required.");
      }
      const d = await req("/verifyphoneotp", { method: "POST", envOverride: targetAuth, tempToken: true, body: { phone, otp } });
      const authToken = pickToken(d, ["auth_token", "authToken"]);
      if (!authToken) {
        setAuthActionMessage("OTP verification failed: auth token missing in response.");
        throw new Error("Auth token missing in OTP response.");
      }
      setTok("auth", String(authToken), targetAuth);
      hide(U.otpStage); show(U.mpinStage); U.pinInput.focus();
      setFieldMessage(U.otpFieldMsg, U.otpInput, "OTP verified.", "success");
      setFieldMessage(U.pinFieldMsg, U.pinInput, "", "error");
      setAuthActionMessage("OTP verified. Enter 4-digit MPIN.", "success");
      U.sessionState.textContent = "OTP verified. Enter MPIN.";
      U.sessionState.classList.remove("good"); U.sessionState.classList.add("bad");
      lg(`OTP verified. Next: ${d.next || "ENTER_MPIN"}`);
      refreshAuthControls();
    }).catch((e) => {
      setAuthActionMessage(e.message || String(e));
      refreshAuthControls();
      lg(e.message || String(e), true);
    }));

    U.verifyPinButton.addEventListener("click", () => busy(U.verifyPinButton, async () => {
      const pin = clean(U.pinInput.value);
      if (!validatePin(true)) {
        setAuthActionMessage("Enter valid 4-digit MPIN.");
        throw new Error("MPIN is required.");
      }
      const targetAuth = authEnv();
      const d = await req("/verifypin", { method: "POST", envOverride: targetAuth, token: "auth", body: { pin } });
      const sessionToken = pickToken(d, ["session_token", "sessionToken"]);
      if (!sessionToken) {
        setAuthActionMessage("MPIN verification failed: session token missing in response.");
        throw new Error("Session token missing in MPIN response.");
      }
      setTok("session", String(sessionToken), targetAuth);
      setTok("authDay", todayIst(), targetAuth);
      const userId = pickToken(d, ["userId", "user_id"]);
      if (hasCellValue(userId)) setTok("userId", userId, targetAuth);
      delTok("temp", targetAuth);
      await refreshEnvironmentInfo(targetAuth, { silent: true });
      setFieldMessage(U.pinFieldMsg, U.pinInput, "MPIN verified. Logged in.", "success");
      setAuthActionMessage("Login successful.", "success");
      setWorkspaceReady(false);
      authUi();
      lg(`Login successful. User ID: ${hasCellValue(userId) ? userId : "-"}`);
      if (targetAuth === DATA_ENV) {
        await bootstrapWorkspace("login");
        await ensureInstrumentsSheetOnLaunch().catch((e) => lg(`Instrument sync after login failed: ${e.message || String(e)}`, true));
        await restoreStreamsFromStorage("login");
      } else {
        setWorkspaceReady(true);
        if (pendingOrdersLoginRedirect && isAuthEnv(ORDER_ENV)) {
          pendingOrdersLoginRedirect = false;
          setActivePage(PAGE.orders);
          hideOrdersAuthPopup();
          setAuthActionMessage("UAT login successful. Orders is now unlocked.", "success");
        }
      }
      refreshAuthControls();
    }).catch((e) => {
      setAuthActionMessage(e.message || String(e));
      refreshAuthControls();
      lg(e.message || String(e), true);
    }));

    if (U.syncInstrumentsButton) {
      U.syncInstrumentsButton.addEventListener("click", () => busy(U.syncInstrumentsButton, syncInstruments).catch((e) => lg(e.message || String(e), true)));
    }
    U.refreshPositionsButton.addEventListener("click", () => busy(U.refreshPositionsButton, refreshPositions).catch((e) => lg(e.message || String(e), true)));
    U.buildHistoricalButton.addEventListener("click", () => busy(U.buildHistoricalButton, buildHistorical).catch((e) => lg(e.message || String(e), true)));
    U.resolveMarketRefButton?.addEventListener("click", () => {
      resolveMarketRefFromInputs({ silent: false });
    });
    U.marketOrderSymbolInput?.addEventListener("blur", () => {
      if (clean(U.marketOrderSymbolInput.value)) resolveMarketRefFromInputs({ silent: true, autoSyncOnMiss: true });
    });
    U.marketOrderExchangeSelect?.addEventListener("change", () => {
      if (clean(U.marketOrderSymbolInput?.value)) resolveMarketRefFromInputs({ silent: true, autoSyncOnMiss: true });
    });
    U.placeMarketOrderButton?.addEventListener("click", () => busy(U.placeMarketOrderButton, placeSingleMarketOrder).catch((e) => {
      setMarketOrderActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.fetchOrdersButton?.addEventListener("click", () => busy(U.fetchOrdersButton, fetchDayOrders).catch((e) => {
      setOrderLookupActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.fetchOrderByIdButton?.addEventListener("click", () => busy(U.fetchOrderByIdButton, fetchOrderById).catch((e) => {
      setOrderLookupActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.fetchBasketByTagButton?.addEventListener("click", () => busy(U.fetchBasketByTagButton, fetchBasketByTag).catch((e) => {
      setOrderLookupActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.toggleTradeHistoryButton?.addEventListener("click", () => {
      showCompletedTradeHistory = !showCompletedTradeHistory;
      setCompletedTradesResponse(latestClosedTradeHistoryState.length ? latestClosedTradeHistoryState : "No closed trades archived yet.");
    });
    U.resetActiveStrategyButton?.addEventListener("click", () => busy(U.resetActiveStrategyButton, resetActiveStrategyWorkspace).catch((e) => {
      setStrategyPreviewActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.buildStrategyPreviewButton?.addEventListener("click", () => busy(U.buildStrategyPreviewButton, buildStrategyPreview).catch((e) => {
      setStrategyPreviewActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.trackStrategyPreviewButton?.addEventListener("click", () => busy(U.trackStrategyPreviewButton, async () => {
      await openPlaceOrderSheet();
      await ensureOptionChainForTrack();
      await buildStrategyPreviewWithRetry(15, 1000);
      await trackStrategyPreview();
      await openPlaceOrderSheet();
      setStrategyPreviewActionMessage("Tracked current strategy legs.", "success");
    }).catch((e) => {
      setStrategyPreviewActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.masterDeployButton?.addEventListener("click", () => busy(U.masterDeployButton, async () => {
      const deployResult = await submitDeployBasket();
      const hasBasketId = hasCellValue(deployResult?.basketId);
      const verified = Boolean(deployResult?.verified);
      if (hasBasketId || verified) {
        setStrategyPreviewActionMessage(
          hasBasketId
            ? `Deploy submitted from master workspace. basket_id=${deployResult.basketId}.`
            : "Deploy submitted from master workspace and verified in basket lookup.",
          "success"
        );
      } else {
        setStrategyPreviewActionMessage("Deploy request sent, but basket lookup is still empty. Use Refresh Basket Monitor.", "error");
      }
    }).catch((e) => {
      setStrategyPreviewActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.clearTrackedStrategyButton?.addEventListener("click", () => busy(U.clearTrackedStrategyButton, clearTrackedStrategy).catch((e) => {
      setStrategyPreviewActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.openPlaceOrderSheetButton?.addEventListener("click", () => busy(U.openPlaceOrderSheetButton, openPlaceOrderSheet).catch((e) => {
      setStrategyPreviewActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.activeStrategiesResponse?.addEventListener("click", (ev) => {
      const btn = ev.target?.closest?.("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const tradeKey = clean(btn.getAttribute("data-trade-key") || "");
      if (action === "square-off-active") {
        busy(btn, () => squareOffActiveStrategyInline(tradeKey)).catch((e) => {
          setStrategyPreviewActionMessage(e.message || String(e));
          lg(e.message || String(e), true);
        });
        return;
      }
      if (action === "open-placeorder-sheet") {
        busy(btn, openPlaceOrderSheet).catch((e) => {
          setStrategyPreviewActionMessage(e.message || String(e));
          lg(e.message || String(e), true);
        });
      }
    });
    U.singleTradesResponse?.addEventListener("click", (ev) => {
      const btn = ev.target?.closest?.("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const tradeId = clean(btn.getAttribute("data-trade-id") || "");
      const card = btn.closest("[data-trade-id]");
      const targetInput = card?.querySelector?.('input[data-input="target"]');
      const slInput = card?.querySelector?.('input[data-input="sl"]');
      if (action === "save-single-target") {
        busy(btn, () => saveSingleTradeTarget(tradeId, targetInput?.value || "")).catch((e) => {
          setSingleTradeActionMessage(e.message || String(e));
          lg(e.message || String(e), true);
        });
        return;
      }
      if (action === "add-single-sl") {
        busy(btn, () => addSingleTradeStoploss(tradeId, slInput?.value || "")).catch((e) => {
          setSingleTradeActionMessage(e.message || String(e));
          lg(e.message || String(e), true);
        });
        return;
      }
      if (action === "exit-single-now") {
        busy(btn, () => exitSingleTradeNow(tradeId)).catch((e) => {
          setSingleTradeActionMessage(e.message || String(e));
          lg(e.message || String(e), true);
        });
        return;
      }
      if (action === "clear-single-target") {
        try {
          clearSingleTradeTarget(tradeId);
        } catch (e) {
          setSingleTradeActionMessage(e.message || String(e));
          lg(e.message || String(e), true);
        }
        return;
      }
    });
    U.buildDeployPreviewButton?.addEventListener("click", () => busy(U.buildDeployPreviewButton, buildDeployBasketPreview).catch((e) => {
      setDeployPreviewActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.submitDeployBasketButton?.addEventListener("click", () => busy(U.submitDeployBasketButton, submitDeployBasket).catch((e) => {
      setDeployPreviewActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.buildSquareOffPreviewButton?.addEventListener("click", () => busy(U.buildSquareOffPreviewButton, buildSquareOffPreview).catch((e) => {
      setSquareOffActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.submitSquareOffButton?.addEventListener("click", () => busy(U.submitSquareOffButton, submitSquareOff).catch((e) => {
      setSquareOffActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.refreshSquareOffStatusButton?.addEventListener("click", () => busy(U.refreshSquareOffStatusButton, reconcileSquareOffState).catch((e) => {
      setSquareOffActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));
    U.basketMonitorAutoRefreshInput?.addEventListener("change", () => {
      set(S.basketMonitorAutoRefresh, U.basketMonitorAutoRefreshInput.checked ? "1" : "0");
      lg(`Basket monitor auto refresh ${U.basketMonitorAutoRefreshInput.checked ? "enabled" : "disabled"}.`);
    });
    U.refreshBasketMonitorButton?.addEventListener("click", () => busy(U.refreshBasketMonitorButton, refreshBasketMonitor).catch((e) => {
      setBasketMonitorActionMessage(e.message || String(e));
      lg(e.message || String(e), true);
    }));

    if (U.startMasterWsButton) {
      U.startMasterWsButton.addEventListener("click", () => busy(U.startMasterWsButton, startMaster).catch((e) => lg(e.message || String(e), true)));
    }
    if (U.stopMasterWsButton) {
      U.stopMasterWsButton.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        busy(U.stopMasterWsButton, () => stopWs(STREAM.master)).catch((e) => lg(e.message || String(e), true));
      });
    }
    U.startLivePricesWsButton.addEventListener("click", () => busy(U.startLivePricesWsButton, startPrices).catch((e) => lg(e.message || String(e), true)));
    U.stopLivePricesWsButton.addEventListener("click", () => busy(U.stopLivePricesWsButton, () => stopWs(STREAM.prices)).catch((e) => lg(e.message || String(e), true)));
    U.startLiveOcWsButton.addEventListener("click", () => busy(U.startLiveOcWsButton, startOc).catch((e) => lg(e.message || String(e), true)));
    U.stopLiveOcWsButton.addEventListener("click", () => busy(U.stopLiveOcWsButton, () => stopWs(STREAM.oc)).catch((e) => lg(e.message || String(e), true)));

    U.livePricesActiveList.addEventListener("click", (ev) => {
      const btn = ev.target?.closest?.("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const sym = btn.getAttribute("data-symbol") || "";
      if (action === "stop-price") {
        busy(btn, () => stopSinglePrice(sym)).catch((e) => lg(e.message || String(e), true));
        return;
      }
      if (action === "goto-price") {
        busy(btn, () => goToPriceData(sym)).catch((e) => lg(e.message || String(e), true));
      }
    });

    U.liveOcActiveList.addEventListener("click", (ev) => {
      const btn = ev.target?.closest?.("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const asset = btn.getAttribute("data-asset") || "";
      const expiry = btn.getAttribute("data-expiry") || "";
      const exchange = btn.getAttribute("data-exchange") || "NSE";
      if (action === "stop-oc") {
        busy(btn, () => stopSingleOc(asset, expiry, exchange)).catch((e) => lg(e.message || String(e), true));
        return;
      }
      if (action === "goto-oc") {
        busy(btn, () => goToOcData(asset, expiry, exchange)).catch((e) => lg(e.message || String(e), true));
      }
    });
  }

  async function init() {
    setEnv(DATA_ENV);
    setAuthTargetEnv(DATA_ENV);
    bind();
    setWorkspaceReady(false);
    setWorkspaceLoading(false);
    bindUppercaseInputs();
    migrateLegacyScopedStorage();
    const clearedStrategyState = clearStrategyStateLocalStorageOnce();
    const clearedAuthState = clearAuthStateLocalStorageOnce();
    applyDailyAuthReset();
    wire();
    wireRankedSymbolAutocomplete();
    await ensureSheetActivationListener();
    renderActivePanels();
    refreshWsOverview();

    setWsDot(STREAM.master, "ready");
    setWsDot(STREAM.prices, "ready");
    setWsDot(STREAM.oc, "ready");
    setReconnectLabel(STREAM.master, "");
    setReconnectLabel(STREAM.prices, "");
    setReconnectLabel(STREAM.oc, "");
    refreshMasterProjectionDot();

    U.autoSwitchSheetsInput.checked = g(S.autoSwitchSheets, "0") === "1";
    if (U.clearOnEnvSwitchInput) U.clearOnEnvSwitchInput.checked = g(S.clearOnEnvSwitch, "0") === "1";
    U.deviceIdText.textContent = devId();
    if (U.instrumentDateInput) U.instrumentDateInput.value = todayIst();
      U.historicalStartDateInput.value = todayIst();
      U.historicalEndDateInput.value = todayIst();
    if (U.strategyPreviewTargetDeltaSelect) {
      replaceValueOptions(
        U.strategyPreviewTargetDeltaSelect,
        DEFAULT_TARGET_DELTAS,
        (delta) => Number(delta).toFixed(1)
      );
      U.strategyPreviewTargetDeltaSelect.value = "0";
    }
    if (U.marketOrderTagInput && !clean(U.marketOrderTagInput.value)) {
      U.marketOrderTagInput.value = "excel_market_order";
    }
    if (U.basketMonitorAutoRefreshInput) {
      U.basketMonitorAutoRefreshInput.checked = g(S.basketMonitorAutoRefresh, "1") !== "0";
    }
    setMarketOrderActionMessage("");
    setSingleTradeActionMessage("");
    setOrderLookupActionMessage("");
    setStrategyPreviewActionMessage("");
    setDeployPreviewActionMessage("");
    setSquareOffActionMessage("");
    setBasketMonitorActionMessage("");
    refreshOrderStrategyUi();
    U.phoneInput.value = gScoped(S.phone, authEnv(), "");
    U.otpInput.value = "";
    U.pinInput.value = "";
    setFieldMessage(U.phoneFieldMsg, U.phoneInput, "", "error");
    setFieldMessage(U.otpFieldMsg, U.otpInput, "", "error");
    setFieldMessage(U.pinFieldMsg, U.pinInput, "", "error");
    clearAuthActionMessage();
    toggleSettingsBody(false);

    syncAuthStagesForCurrentEnv();

    clearInstrumentCache();
    hydrateLists(null);
    applyPersistedUiState(env());
    applyInputContexts();
    refreshOcViewSelector();
    refreshMasterEmptyActions();
    syncOrderStrategyStateFromStorage(ORDER_ENV);
    if (clearedStrategyState) {
      lg("Cleared locally stored strategy and P&L state for a clean restart.");
    }
    if (clearedAuthState) {
      lg("Cleared legacy persistent auth storage from localStorage.");
    }
    tlg("Telemetry initialized.");

    authUi();
    refreshAuthControls();
    await checkServer({ silent: false });
    const liveSessionOk = await validateStoredSession(DATA_ENV, { silent: true });
    const uatSessionOk = await validateStoredSession(ORDER_ENV, { silent: true });
    if (liveSessionOk) {
      setWorkspaceReady(true);
      lg(`${envLabel(DATA_ENV)} session restored. Auto-reload is disabled until login.`);
    }
    if (liveSessionOk || uatSessionOk) {
      await ensureInstrumentsSheetOnLaunch().catch((e) => lg(`Instrument sync on launch failed: ${e.message || String(e)}`, true));
    }
    await refreshPlaceOrderSheet(REFRESH_REASON.system);
    await focusPanelForActiveSheet().catch(() => null);
    syncSingleTradeQuotePoller();
    if (serverStatusTimer) clearInterval(serverStatusTimer);
    serverStatusTimer = setInterval(async () => {
      if (applyDailyAuthReset()) {
        await stopAllWs({ preserveSelections: true }).catch(() => null);
        syncAuthStagesForCurrentEnv();
        authUi();
      }
      await checkServer({ silent: true }).catch(() => null);
      if (isAuthEnv(ORDER_ENV) && liveSingleTrades().length) {
        await reconcileSingleTradeBook({ silent: true }).catch(() => null);
      }
      if (isAuthEnv(ORDER_ENV) && basketMonitorAutoRefreshEnabled()) {
        const basketTag = clean(U?.basketMonitorTagInput?.value || latestDeployPreviewState?.flexi_order_request?.tag || latestBasketMonitorState?.tag || "");
        if (basketTag) {
          await refreshBasketMonitor({ tag: basketTag, silent: true, skipSheetRefresh: false }).catch(() => null);
        }
      }
      if (
        isAuthEnv(ORDER_ENV)
        && latestBasketSubmitState?.tag
        && (
          !Number.isFinite(Number(latestBasketSubmitState.entry_price_once))
          || !Boolean(latestBasketSubmitState?.entry_price_confirmed)
        )
      ) {
        await reconcileEntryBasketState({ silent: true, skipSheetRefresh: false }).catch(() => null);
      }
      if (isAuthEnv(ORDER_ENV) && latestSquareOffSubmitState?.status === "pending_fill" && latestSquareOffSubmitState?.exit_tag) {
        await reconcileSquareOffState({ silent: true, skipSheetRefresh: false }).catch(() => null);
      }
      if (latestTrackedStrategyState?.legs?.length && !latestTrackedStrategyState?.closed) {
        setActiveStrategiesResponse();
        await refreshPlaceOrderSheet(REFRESH_REASON.system).catch(() => null);
      }
    }, 15000);
  }

  window.addEventListener("beforeunload", () => {
    if (serverStatusTimer) {
      clearInterval(serverStatusTimer);
      serverStatusTimer = null;
    }
    stopSingleTradeQuotePoller();
  });

  if (typeof Office === "undefined") return;
  Office.onReady((i) => {
    if (!i || i.host !== Office.HostType.Excel) return;
    officeReady = true;
    init().catch((e) => lg(e.message || String(e), true));
  });
})();
