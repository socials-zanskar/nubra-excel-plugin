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
    instruments: "nubra.excel.instruments",
    streamState: "nubra.excel.stream_state",
  };

  const BASE = { LIVE: "/proxy/live", UAT: "/proxy/uat" };
  const STREAM = { master: "master", prices: "live_prices", oc: "live_oc" };
  const SHEET = { placeOrder: "place_order" };
  const BATCH = 4000;
  const REFRESH_REASON = { manual: "manual", stream: "stream", env: "env", system: "system" };
  const SHEET_REFRESH_POLICY = {
    [STREAM.master]: { [REFRESH_REASON.manual]: true, [REFRESH_REASON.stream]: true, [REFRESH_REASON.env]: false, [REFRESH_REASON.system]: true },
    [STREAM.prices]: { [REFRESH_REASON.manual]: false, [REFRESH_REASON.stream]: true, [REFRESH_REASON.env]: false, [REFRESH_REASON.system]: true },
    [STREAM.oc]: { [REFRESH_REASON.manual]: false, [REFRESH_REASON.stream]: true, [REFRESH_REASON.env]: false, [REFRESH_REASON.system]: true },
    [SHEET.placeOrder]: { [REFRESH_REASON.manual]: true, [REFRESH_REASON.stream]: false, [REFRESH_REASON.env]: true, [REFRESH_REASON.system]: true },
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
  let ocSheetChangeBound = false;
  let sheetActivationBound = false;
  let bootstrapPromise = null;
  let suppressOcSheetSelectorEvent = false;
  let selectedMasterPriceSymbol = "";
  let workspaceReady = false;
  let authInvalidationInProgress = false;
  let symbolUniverse = [];

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

  function devId() {
    let id = g(S.device, "");
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID ? `EXCEL-${crypto.randomUUID()}` : `EXCEL-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      set(S.device, id);
    }
    return id;
  }

  const ENV_SUFFIX = { UAT: "uat", LIVE: "live" };
  const PER_ENV_STORAGE_BASES = new Set([S.authDay, S.ocView, S.phone, S.temp, S.auth, S.session, S.userId, S.instruments, S.streamState]);
  const envLabel = (v) => (asEnv(v) === "LIVE" ? "PROD" : "UAT");
  const envBaseUrl = (v) => (asEnv(v) === "LIVE" ? "https://api.nubra.io" : "https://uatapi.nubra.io");

  function scopedKey(base, envValue) {
    const e = asEnv(envValue);
    return `${base}.${ENV_SUFFIX[e]}`;
  }

  function gScoped(base, envValue, d = "") {
    if (!PER_ENV_STORAGE_BASES.has(base)) return g(base, d);
    const val = g(scopedKey(base, envValue), "");
    return val === "" ? d : val;
  }

  function setScoped(base, envValue, value) {
    if (!PER_ENV_STORAGE_BASES.has(base)) return set(base, value);
    const ok = set(scopedKey(base, envValue), value);
    if (ok) del(base);
    return ok;
  }

  function delScoped(base, envValue) {
    if (!PER_ENV_STORAGE_BASES.has(base)) {
      del(base);
      return;
    }
    del(scopedKey(base, envValue));
  }

  function migrateLegacyScopedStorage() {
    const current = env();
    const keys = [S.authDay, S.ocView, S.phone, S.temp, S.auth, S.session, S.userId, S.instruments, S.streamState];
    for (const base of keys) {
      const legacy = g(base, "");
      if (legacy === "") continue;
      const sk = scopedKey(base, current);
      if (g(sk, "") === "") {
        set(sk, legacy);
      }
      del(base);
    }
  }

  function applyDailyAuthReset() {
    // Keep sessions persistent across add-in restarts and day boundaries.
    // Token expiration is handled by backend invalidation responses.
    return false;
  }

  const env = () => asEnv(g(S.env, "UAT"));
  const setEnv = (v) => set(S.env, asEnv(v));
  const tok = (k, envValue = env()) => gScoped(S[k], envValue, "");
  const setTok = (k, v, envValue = env()) => setScoped(S[k], envValue, v);
  const delTok = (k, envValue = env()) => delScoped(S[k], envValue);
  const isAuthEnv = (envValue) => Boolean(tok("session", envValue));
  const isAuth = () => isAuthEnv(env());
  const autoSwitchSheets = () => Boolean(U?.autoSwitchSheetsInput?.checked);
  const clearOnEnvSwitch = () => Boolean(U?.clearOnEnvSwitchInput?.checked);
  const confirmProdOrder = () => U?.confirmProdOrderInput ? Boolean(U.confirmProdOrderInput.checked) : true;

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
    const current = env();
    U.envUatButton.classList.toggle("active", current === "UAT");
    U.envLiveButton.classList.toggle("active", current === "LIVE");
    if (U.activeEnvChip) {
      U.activeEnvChip.textContent = `Active Env: ${envLabel(current)}`;
    }
    if (U.topLogoutButton) {
      const canLogout = isAuthEnv(current);
      U.topLogoutButton.classList.toggle("hidden", !canLogout);
      U.topLogoutButton.textContent = canLogout ? `Logout ${envLabel(current)}` : "Logout";
    }
    document.body.classList.toggle("env-uat", current === "UAT");
    document.body.classList.toggle("env-live", current === "LIVE");
  }

  function syncAuthStagesForCurrentEnv() {
    if (tok("auth") && !tok("session")) {
      hide(U.otpStage);
      show(U.mpinStage);
      refreshAuthControls();
      return;
    }
    show(U.otpStage);
    if (!tok("session")) hide(U.mpinStage);
    refreshAuthControls();
  }

  function authUi() {
    const e = env();
    const eLabel = envLabel(e);
    const ok = isAuth();
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
  }

  async function invalidateCurrentSession(reason) {
    if (authInvalidationInProgress) return;
    authInvalidationInProgress = true;
    try {
      const currentEnv = env();
      clearAuthTokensForEnv(currentEnv);
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
      authUi();
      if (U?.phoneInput) U.phoneInput.focus();
      const why = clean(reason);
      setAuthActionMessage(`Session expired${why ? `: ${why}` : ""}. Please login again.`);
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
      msgEl.classList.remove("error", "success");
      if (inputEl) inputEl.classList.remove("input-invalid");
      return;
    }
    msgEl.textContent = text;
    msgEl.classList.remove("hidden");
    msgEl.classList.toggle("error", kind !== "success");
    msgEl.classList.toggle("success", kind === "success");
    if (inputEl) inputEl.classList.toggle("input-invalid", kind !== "success");
  }

  function setAuthActionMessage(message, kind = "error") {
    setFieldMessage(U?.authActionMsg, null, message, kind);
  }

  function clearAuthActionMessage() {
    setAuthActionMessage("", "error");
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
    const isLoggedIn = isAuth();
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
    const opts = [`<option value="">OC View: None</option>`];
    for (const x of items) {
      const key = ocAnchorKey(x.asset, x.expiry, x.exchange);
      const lbl = ocItemLabel(x);
      opts.push(`<option value="${key}">${lbl}</option>`);
    }
    U.ocViewSelect.innerHTML = opts.join("");
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

    if (!filtered.length) {
      U.masterOcList.innerHTML = `<div class="master-oc-empty">${query ? "No matching active OC." : "No active OC chains."}</div>`;
      return;
    }

    U.masterOcList.innerHTML = filtered
      .map((x) => {
        const key = ocAnchorKey(x.asset, x.expiry, x.exchange);
        const active = key === selectedKey ? "active" : "";
        return `<button class="master-oc-item ${active}" data-oc-key="${key}" type="button" role="option" aria-selected="${active ? "true" : "false"}">${ocItemLabel(x)}</button>`;
      })
      .join("");
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
        const cached = loadInstruments();
        const shouldSyncInstruments = reason === "login" || !cached;
        if (shouldSyncInstruments) {
          await syncInstruments();
        } else {
          hydrateLists(cached);
          lg("Bootstrap: using cached instruments.");
        }
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
    if (!prices.length) {
      U.livePricesActiveList.innerHTML = `<div class="active-empty">No active symbols.</div>`;
    } else {
      U.livePricesActiveList.innerHTML = prices
        .map(
          (sym) =>
            `<div class="active-item"><code>${sym}</code><div class="actions"><button class="mini-btn" data-action="goto-price" data-symbol="${sym}">Go</button><button class="mini-btn secondary" data-action="stop-price" data-symbol="${sym}">Stop</button></div></div>`
        )
        .join("");
    }

    const options = ws[STREAM.oc]?.active?.optionItems || [];
    U.liveOcActiveCount.textContent = String(options.length);
    if (!options.length) {
      U.liveOcActiveList.innerHTML = `<div class="active-empty">No active option chains.</div>`;
    } else {
      U.liveOcActiveList.innerHTML = options
        .map(
          (x) =>
            `<div class="active-item"><code>${x.asset} ${x.expiry} ${x.exchange}</code><div class="actions"><button class="mini-btn" data-action="goto-oc" data-asset="${x.asset}" data-expiry="${x.expiry}" data-exchange="${x.exchange}">Go</button><button class="mini-btn secondary" data-action="stop-oc" data-asset="${x.asset}" data-expiry="${x.expiry}" data-exchange="${x.exchange}">Stop</button></div></div>`
        )
        .join("");
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
      workspaceLoader: document.getElementById("workspaceLoader"),
      workspaceLoaderText: document.getElementById("workspaceLoaderText"),
      authRequiredBlocks: Array.from(document.querySelectorAll(".auth-required")),
    };
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
    try { return JSON.parse(t); } catch (_e) { return { message: t }; }
  }

  async function req(path, o = {}) {
    const method = upper(o.method || "GET");
    const pathNorm = String(path || "").toLowerCase();
    const prodOrderAction = env() === "LIVE" && confirmProdOrder() && (method === "POST" || method === "PUT" || method === "DELETE")
      && (/\/orders?(\/|$)/.test(pathNorm) || pathNorm.includes("placeorder"));
    if (prodOrderAction) {
      let ok = true;
      try {
        ok = window.confirm(`PROD order action detected (${method} ${path}). Continue?`);
      } catch (_e) {
        // Office WebView can block modal dialogs in some runtimes.
        ok = true;
      }
      if (!ok) throw new Error("Cancelled PROD order action.");
    }

    const hdr = { "x-device-id": devId(), ...(o.headers || {}) };
    if (o.token === "session") {
      if (!tok("session")) throw new Error(`Session token missing for ${envLabel(env())}. Login again.`);
      hdr.Authorization = `Bearer ${tok("session")}`;
    }
    if (o.token === "auth") {
      if (!tok("auth")) throw new Error(`Auth token missing for ${envLabel(env())}. Verify OTP first.`);
      hdr.Authorization = `Bearer ${tok("auth")}`;
    }
    if (o.tempToken) {
      if (!tok("temp")) throw new Error(`Temp token missing for ${envLabel(env())}. Send OTP first.`);
      hdr["x-temp-token"] = tok("temp");
    }
    const init = { method: method || "GET", headers: hdr };
    if (o.body !== undefined) {
      hdr["Content-Type"] = "application/json";
      init.body = JSON.stringify(o.body);
    }
    const url = `${BASE[env()]}${path.startsWith("/") ? path : `/${path}`}`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, init);
      const data = await jsonSafe(res);
      const ms = Date.now() - t0;
      tlg(`API ${init.method} ${path} -> ${res.status} in ${ms}ms`);
      if (!res.ok && (res.status === 401 || res.status === 403) && o.token === "session") {
        void invalidateCurrentSession(`HTTP ${res.status} on ${init.method} ${path}`)
          .catch((err) => lg(err.message || String(err), true));
      }
      if (!res.ok) throw new Error(data.error || data.message || `${init.method} ${path} failed (${res.status})`);
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
    U.symbolList.innerHTML = ranked
      .map((s) => `<option value="${String(s).replaceAll('"', '&quot;')}"></option>`)
      .join("");
  }

  function wireRankedSymbolAutocomplete() {
    const inputs = [U?.livePricesSymbolsInput, U?.liveOcAssetInput, U?.historicalSymbolInput].filter(Boolean);
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

  function cacheInstruments(obj, envValue = env()) {
    if (!setScoped(S.instruments, envValue, JSON.stringify(obj))) {
      throw new Error("Storage quota exceeded while caching instruments.");
    }
  }

  function loadInstruments(envValue = env()) {
    const raw = gScoped(S.instruments, envValue, "");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_e) { return null; }
  }

  function hydrateLists(cache) {
    const c = cache?.categories || {};
    const allSyms = uniqSorted(Array.isArray(c.allSymbols) ? c.allSymbols : (Array.isArray(cache?.symbols) ? cache.symbols : []));
    const indexes = uniqSorted(Array.isArray(c.indexes) ? c.indexes : []);
    const stocks = uniqSorted(Array.isArray(c.stocks) ? c.stocks : []);
    const options = uniqSorted(Array.isArray(c.options) ? c.options : []);
    const optionUnderlyings = uniqSorted(Array.isArray(c.optionUnderlyings) ? c.optionUnderlyings : []);
    const asOptions = (arr) => arr.slice(0, 6000).map((s) => `<option value="${String(s).replaceAll('"', '&quot;')}"></option>`).join("");

    symbolUniverse = allSyms;
    refreshSymbolSuggestions("");
    if (U.indexList) U.indexList.innerHTML = asOptions(indexes);
    if (U.stockList) U.stockList.innerHTML = asOptions(stocks);
    if (U.optionList) U.optionList.innerHTML = asOptions(options);
    if (U.optionUnderlyingList) U.optionUnderlyingList.innerHTML = asOptions(optionUnderlyings);
    const exps = new Set();
    for (const x of Object.values(cache?.expiriesBySymbol || {})) {
      for (const y of x || []) exps.add(String(y));
    }
    U.expiryList.innerHTML = Array.from(exps).sort().map((e) => `<option value="${String(e).replaceAll('"', '&quot;')}"></option>`).join("");
    applyInputContexts();
  }

  async function syncInstruments() {
    if (!isAuth()) throw new Error("Please login first.");
    const d = U.instrumentDateInput?.value || todayIst();
    const ex = upper(U.instrumentExchangeSelect?.value || "NSE");
    const data = await req(`/refdata/refdata/${encodeURIComponent(d)}?exchange=${ex}`, { token: "session" });
    const list = Array.isArray(data.refdata) ? data.refdata : [];
    if (!list.length) throw new Error("No instruments returned.");

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
      date: d,
      exchange: ex,
      count: list.length,
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
    cacheInstruments(cache);
    hydrateLists(cache);

    await writeTable("Instruments", ["ref_id", "asset", "symbol", "stock_name", "exchange", "expiry", "derivative_type", "option_type", "strike_price", "lot_size", "token"], rows);
    lg(`Instruments synced: ${list.length} rows, ${cache.symbols.length} symbols (${ex}).`);
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
    const direct = upper(rawSymbol);
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
      }
      return;
    }

    if (e.type === "status") {
      lg(`WS ${key}: ${e.status}`);
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
    const res = await fetch("/ws/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId, environment: currentEnv, sessionToken: tok("session"), autoReconnect: true, ...cfg }),
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
        ts: prev.ts ?? Date.now(),
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
      .sort((a, b) => String(a.symbol || "").localeCompare(String(b.symbol || "")))
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
          symbol: x.symbol ?? "",
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

  function buildLivePricesSections(st) {
    const sections = [];
    const activeSymbols = Array.isArray(st?.active?.indexSymbols) ? st.active.indexSymbols : [];
    for (const sym of activeSymbols) {
      const rows = rowsIndex(st.idx, (x) => upper(x.symbol) === upper(sym));
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
    const all = Array.from(st?.idx?.values?.() || []);
    const rows = [];
    for (const sym of activeSymbols) {
      const matches = all.filter((x) => upper(x.symbol) === upper(sym));
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
    if (!shouldRefreshSheet(SHEET.placeOrder, REFRESH_REASON.env)) return;
    if (!officeReady) return;
    try {
      await Excel.run(async (ctx) => {
        const sh = ctx.workbook.worksheets.getItemOrNullObject("PlaceOrder");
        await ctx.sync();
        if (sh.isNullObject) return;
        sh.getRange("A1:B2").values = [
          ["environment", env()],
          ["updated_at_ist", formatIstDateTime(new Date())],
        ];
        await ctx.sync();
      });
      tlg(`PlaceOrder sheet context refreshed for ${envLabel(env())}.`);
    } catch (e) {
      tlg(`PlaceOrder env refresh failed: ${e.message || String(e)}`, true);
    }
  }

  async function switchEnvironment(nextEnv) {
    const target = asEnv(nextEnv);
    const current = env();
    if (target === current) {
      authUi();
      return;
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

    if (isAuthEnv(target)) {
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
    U.envUatButton.addEventListener("click", () => busy(U.envUatButton, () => switchEnvironment("UAT")).catch((e) => lg(e.message || String(e), true)));
    U.envLiveButton.addEventListener("click", () => busy(U.envLiveButton, () => switchEnvironment("LIVE")).catch((e) => lg(e.message || String(e), true)));
    if (U.topLogoutButton) {
      U.topLogoutButton.addEventListener("click", () => busy(U.topLogoutButton, () => logoutEnvironment(env())).catch((e) => lg(e.message || String(e), true)));
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
    if (U.confirmProdOrderInput) {
      U.confirmProdOrderInput.addEventListener("change", () => {
        set(S.confirmProdOrder, U.confirmProdOrderInput.checked ? "1" : "0");
        lg(`PROD order confirmation is now ${U.confirmProdOrderInput.checked ? "ON" : "OFF"}.`);
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
      delTok("temp");
      delTok("auth");
      delTok("session");
      delTok("userId");
      await stopAllWs({ preserveSelections: true });
      setWorkspaceReady(false);
      setWorkspaceLoading(false);
      show(U.otpStage); hide(U.mpinStage);
      setFieldMessage(U.phoneFieldMsg, U.phoneInput, "", "error");
      setFieldMessage(U.otpFieldMsg, U.otpInput, "", "error");
      setFieldMessage(U.pinFieldMsg, U.pinInput, "", "error");
      clearAuthActionMessage();
      authUi();
      lg(`${envLabel(env())} tokens cleared.`);
    });

    U.sendOtpButton.addEventListener("click", () => busy(U.sendOtpButton, async () => {
      const phone = digits(U.phoneInput.value);
      if (!validatePhone(true)) {
        setAuthActionMessage("Fix phone number before sending OTP.");
        throw new Error("Enter a valid phone number.");
      }
      const skipTotpRequested = Boolean(U.skipTotpInput.checked);
      lg(`Sending OTP for ${envLabel(env())} (${envBaseUrl(env())}).`);
      // Step 1 from docs: get temp_token with skip_totp=false.
      const first = await req("/sendphoneotp", {
        method: "POST",
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
          headers: { "x-temp-token": String(tempToken) },
          body: { phone, skip_totp: true },
        });
        effective = second;
        tempToken = pickToken(second, ["temp_token", "tempToken", "x_temp_token"]) || tempToken;
      }

      if (!tempToken) {
        const backendMsg = clean(effective?.error || effective?.message || first?.error || first?.message);
        setAuthActionMessage(backendMsg || `OTP API did not return temp token for ${envLabel(env())}.`);
        throw new Error(backendMsg || `OTP API did not return temp token for ${envLabel(env())}.`);
      }

      setTok("temp", String(tempToken));
      setTok("phone", phone);
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
        `OTP step ready for ${envLabel(env())}${hasCellValue(attempts) ? ` | attempts left: ${attempts}` : ""}${hasCellValue(expiry) ? ` | expires in: ${expiry}s` : ""}.`,
        "success"
      );
      U.otpInput.focus();
      lg(`OTP sent for ${envLabel(env())}. Attempts left: ${hasCellValue(attempts) ? attempts : "-"}`);
      refreshAuthControls();
    }).catch((e) => {
      setAuthActionMessage(e.message || String(e));
      refreshAuthControls();
      lg(e.message || String(e), true);
    }));

    U.verifyOtpButton.addEventListener("click", () => busy(U.verifyOtpButton, async () => {
      const phone = digits(U.phoneInput.value || gScoped(S.phone, env(), ""));
      const otp = clean(U.otpInput.value);
      if (!validatePhone(true)) {
        setAuthActionMessage("Enter a valid phone number first.");
        throw new Error("Phone is required.");
      }
      if (!validateOtp(true)) {
        setAuthActionMessage("Enter a valid 6-digit OTP.");
        throw new Error("OTP is required.");
      }
      const d = await req("/verifyphoneotp", { method: "POST", tempToken: true, body: { phone, otp } });
      const authToken = pickToken(d, ["auth_token", "authToken"]);
      if (!authToken) {
        setAuthActionMessage("OTP verification failed: auth token missing in response.");
        throw new Error("Auth token missing in OTP response.");
      }
      setTok("auth", String(authToken));
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
      const d = await req("/verifypin", { method: "POST", token: "auth", body: { pin } });
      const sessionToken = pickToken(d, ["session_token", "sessionToken"]);
      if (!sessionToken) {
        setAuthActionMessage("MPIN verification failed: session token missing in response.");
        throw new Error("Session token missing in MPIN response.");
      }
      setTok("session", String(sessionToken));
      setTok("authDay", todayIst());
      const userId = pickToken(d, ["userId", "user_id"]);
      if (hasCellValue(userId)) setTok("userId", userId);
      delTok("temp");
      setFieldMessage(U.pinFieldMsg, U.pinInput, "MPIN verified. Logged in.", "success");
      setAuthActionMessage("Login successful.", "success");
      setWorkspaceReady(false);
      authUi();
      lg(`Login successful. User ID: ${hasCellValue(userId) ? userId : "-"}`);
      await bootstrapWorkspace("login");
      await restoreStreamsFromStorage("login");
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
    bind();
    setWorkspaceReady(false);
    setWorkspaceLoading(false);
    bindUppercaseInputs();
    migrateLegacyScopedStorage();
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
    if (U.confirmProdOrderInput) U.confirmProdOrderInput.checked = g(S.confirmProdOrder, "1") !== "0";
    U.deviceIdText.textContent = devId();
    if (U.instrumentDateInput) U.instrumentDateInput.value = todayIst();
    U.historicalStartDateInput.value = todayIst();
    U.historicalEndDateInput.value = todayIst();
    U.phoneInput.value = gScoped(S.phone, env(), "");
    U.otpInput.value = "";
    U.pinInput.value = "";
    setFieldMessage(U.phoneFieldMsg, U.phoneInput, "", "error");
    setFieldMessage(U.otpFieldMsg, U.otpInput, "", "error");
    setFieldMessage(U.pinFieldMsg, U.pinInput, "", "error");
    clearAuthActionMessage();
    toggleSettingsBody(false);

    syncAuthStagesForCurrentEnv();

    const c = loadInstruments();
    hydrateLists(c);
    applyPersistedUiState(env());
    applyInputContexts();
    refreshOcViewSelector();
    refreshMasterEmptyActions();
    tlg("Telemetry initialized.");

    authUi();
    refreshAuthControls();
    await checkServer({ silent: false });
    if (isAuth()) {
      setWorkspaceReady(true);
      lg(`${envLabel(env())} session restored. Auto-reload is disabled until login.`);
    }
    await focusPanelForActiveSheet().catch(() => null);
    if (serverStatusTimer) clearInterval(serverStatusTimer);
    serverStatusTimer = setInterval(async () => {
      if (applyDailyAuthReset()) {
        await stopAllWs({ preserveSelections: true }).catch(() => null);
        syncAuthStagesForCurrentEnv();
        authUi();
      }
      await checkServer({ silent: true }).catch(() => null);
    }, 15000);
  }

  window.addEventListener("beforeunload", () => {
    if (serverStatusTimer) {
      clearInterval(serverStatusTimer);
      serverStatusTimer = null;
    }
  });

  if (typeof Office === "undefined") return;
  Office.onReady((i) => {
    if (!i || i.host !== Office.HostType.Excel) return;
    officeReady = true;
    init().catch((e) => lg(e.message || String(e), true));
  });
})();
