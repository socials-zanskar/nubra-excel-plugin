/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { URL, fileURLToPath } from "node:url";
import protobuf from "protobufjs";

const PORT = Number(process.env.PORT || 3000);
const HOME = process.env.USERPROFILE || process.env.HOME || "";
const CERT_PATH =
  process.env.NUBRA_CERT_PATH || path.join(HOME, ".office-addin-dev-certs", "localhost.crt");
const KEY_PATH = process.env.NUBRA_KEY_PATH || path.join(HOME, ".office-addin-dev-certs", "localhost.key");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;
const LOG_PATH = path.join(__dirname, "dev-server.log");
const LOOPBACK_HOST = "localhost";
const ALLOWED_CORS_ORIGINS = new Set([
  `https://localhost:${PORT}`,
  `https://127.0.0.1:${PORT}`,
  `https://[::1]:${PORT}`,
]);

const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=UTF-8",
  ".md": "text/markdown; charset=UTF-8",
};

const PROXY_TARGETS = {
  "/proxy/live": "https://api.nubra.io",
  "/proxy/uat": "https://uatapi.nubra.io",
};

const WS_TARGETS = {
  LIVE: "wss://api.nubra.io/apibatch/ws",
  UAT: "wss://uatapi.nubra.io/apibatch/ws",
};

const PROTO_SCHEMA = `
syntax = "proto3";
package nubrafrontend;

message GenericData {
  string key = 1;
  Any data = 2;
}

message Any {
  string type_url = 1;
  bytes value = 2;
}

message WebSocketMsgIndex {
  string indexname = 1;
  int64 timestamp = 2;
  int64 index_value = 3;
  int64 high_index_value = 4;
  int64 low_index_value = 5;
  int64 volume = 6;
  float changepercent = 7;
  int64 tick_volume = 8;
  int64 prev_close = 9;
  string exchange = 10;
  int64 volume_oi = 11;
}

message BatchWebSocketIndexMessage {
  int64 timestamp = 1;
  repeated WebSocketMsgIndex indexes = 2;
  repeated WebSocketMsgIndex instruments = 3;
}

message OrderBookLevel {
  int64 price = 1;
  int64 quantity = 2;
  int64 orders = 3;
}

message WebSocketMsgOrderBook {
  uint32 inst_id = 1;
  int64 timestamp = 2;
  repeated OrderBookLevel bids = 3;
  repeated OrderBookLevel asks = 4;
  int64 ltp = 5;
  int64 ltq = 6;
  int64 volume = 7;
  int64 ref_id = 8;
}

message BatchWebSocketOrderbookMessage {
  int64 timestamp = 1;
  repeated WebSocketMsgOrderBook instruments = 2;
}

message WebSocketMsgOptionChainItem {
  int64 inst_id = 1;
  int64 ts = 2;
  int64 sp = 3;
  int32 ls = 4;
  int64 ltp = 5;
  float ltpchg = 6;
  float iv = 7;
  float delta = 8;
  float gamma = 9;
  float theta = 10;
  float vega = 11;
  int64 oi = 12;
  int64 volume = 13;
  int64 ref_id = 14;
  int64 prev_oi = 15;
  int64 price_pcp = 16;
}

message BatchWebSocketGreeksMessage {
  int64 timestamp = 1;
  repeated WebSocketMsgOptionChainItem instruments = 2;
}

message WebSocketMsgOptionChainUpdate {
  string asset = 1;
  string expiry = 2;
  repeated WebSocketMsgOptionChainItem ce = 3;
  repeated WebSocketMsgOptionChainItem pe = 4;
  int64 atm = 5;
  int64 currentprice = 6;
  string exchange = 7;
}
`;

const protoRoot = protobuf.parse(PROTO_SCHEMA).root;
const GenericDataType = protoRoot.lookupType("nubrafrontend.GenericData");
const AnyType = protoRoot.lookupType("nubrafrontend.Any");
const BatchIndexType = protoRoot.lookupType("nubrafrontend.BatchWebSocketIndexMessage");
const BatchOrderbookType = protoRoot.lookupType("nubrafrontend.BatchWebSocketOrderbookMessage");
const BatchGreeksType = protoRoot.lookupType("nubrafrontend.BatchWebSocketGreeksMessage");
const OptionChainUpdateType = protoRoot.lookupType("nubrafrontend.WebSocketMsgOptionChainUpdate");

const streamStates = new Map();
const refdataCaches = new Map();

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "null") return "";
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch (_error) {
    return "";
  }
}

function resolveCorsOrigin(req) {
  const origin = normalizeOrigin(req?.headers?.origin);
  return ALLOWED_CORS_ORIGINS.has(origin) ? origin : "";
}

function corsHeaders(res) {
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-device-id, x-temp-token",
    "Access-Control-Max-Age": "600",
  };
  if (res?._corsOrigin) {
    headers["Access-Control-Allow-Origin"] = res._corsOrigin;
    headers.Vary = "Origin";
  }
  return headers;
}

function logLine(message) {
  const line = `${new Date().toISOString()} ${redactSensitiveText(message)}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (error) {
    console.error("Failed to write log:", error.message);
  }
}

function redactSensitiveText(message) {
  let text = String(message || "");
  text = text.replace(/(Bearer\s+)[^\s"']+/gi, "$1[REDACTED]");
  text = text.replace(/((?:batch_subscribe|batch_unsubscribe)\s+)[^\s]+/gi, "$1[REDACTED]");
  text = text.replace(
    /((?:session_token|sessionToken|auth_token|authToken|temp_token|tempToken|x-temp-token|Authorization)\s*[:=]\s*"?)([^",\s]+)/gi,
    "$1[REDACTED]"
  );
  return text;
}

function writeJson(res, statusCode, payload) {
  const headers = corsHeaders(res);
  headers["Content-Type"] = "application/json; charset=UTF-8";
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

function writeError(res, statusCode, message) {
  writeJson(res, statusCode, { error: message });
}

function todayIst() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch (_error) {
    return new Date().toISOString().slice(0, 10);
  }
}

function normalizeExpiryKey(value) {
  const raw = String(value || "").trim();
  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly.length >= 8) return digitsOnly.slice(0, 8);
  return raw.toUpperCase();
}

function normalizeOptionType(value) {
  const token = String(value || "").trim().toUpperCase();
  if (token === "CE" || token === "CALL" || token === "C") return "CE";
  if (token === "PE" || token === "PUT" || token === "P") return "PE";
  return token;
}

function normalizeStrikeForLookup(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const normalized = Math.abs(n) >= 100000 ? n / 100 : n;
  return Math.round(normalized * 100) / 100;
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
    nextAbs = raw >= 0 ? abs * (1 - ratio) : abs * (1 + ratio);
  } else {
    nextAbs = raw >= 0 ? abs * (1 + ratio) : abs * (1 - ratio);
  }
  const signed = raw >= 0 ? nextAbs : -nextAbs;
  return Math.round(signed);
}

function optionTupleKey(asset, expiry, optionType, strike, exchange) {
  const assetKey = String(asset || "").trim().toUpperCase();
  const expiryKey = normalizeExpiryKey(expiry);
  const optionTypeKey = normalizeOptionType(optionType);
  const strikeKey = normalizeStrikeForLookup(strike);
  const exchangeKey = String(exchange || "NSE").trim().toUpperCase();
  if (!assetKey || !expiryKey || !optionTypeKey || strikeKey === null || !exchangeKey) return "";
  return `${assetKey}|${expiryKey}|${optionTypeKey}|${strikeKey}|${exchangeKey}`;
}

function symbolLookupKey(symbol, exchange) {
  return `${String(symbol || "").trim().toUpperCase()}|${String(exchange || "NSE").trim().toUpperCase()}`;
}

function exchangeAliasKeys(exchange) {
  const ex = String(exchange || "NSE").trim().toUpperCase();
  const set = new Set([ex]);
  if (ex.includes("NSE") || ex.includes("NFO") || ex.includes("FO")) {
    set.add("NSE");
    set.add("NFO");
    set.add("NSE_FO");
  }
  if (ex.includes("BSE") || ex.includes("BFO")) {
    set.add("BSE");
    set.add("BFO");
    set.add("BSE_FO");
  }
  return Array.from(set);
}

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
  const weekly = `${String(asset).trim().toUpperCase()}${yy}${month}${String(day).padStart(2, "0")}${strikeText}${optionTypeKey}`;
  const monthly = monthlyCode ? `${String(asset).trim().toUpperCase()}${yy}${monthlyCode}${strikeText}${optionTypeKey}` : "";
  return Array.from(new Set([weekly, monthly].filter(Boolean)));
}

function upstreamJsonRequest(targetOrigin, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(targetOrigin);
    const headers = { ...(options.headers || {}) };
    const reqBody = options.body ? JSON.stringify(options.body) : "";
    if (reqBody) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(reqBody);
    }

    const upstream = https.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || 443,
        method: options.method || "GET",
        path: requestPath,
        headers,
      },
      (upstreamRes) => {
        let raw = "";
        upstreamRes.setEncoding("utf8");
        upstreamRes.on("data", (chunk) => {
          raw += chunk;
        });
        upstreamRes.on("end", () => {
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch (_error) {
            data = { _raw: raw };
          }
          resolve({
            statusCode: upstreamRes.statusCode || 500,
            data,
            raw,
          });
        });
      }
    );

    upstream.on("error", reject);
    if (reqBody) upstream.write(reqBody);
    upstream.end();
  });
}

function buildRefdataIndices(items) {
  const byTuple = new Map();
  const byTupleNoExchange = new Map();
  const bySymbol = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const refId = Number(item?.ref_id);
    if (!Number.isInteger(refId) || refId <= 0) continue;
    const asset = String(item?.asset || item?.stock_name || "").trim().toUpperCase();
    const exchange = String(item?.exchange || "NSE").trim().toUpperCase();
    const expiry = normalizeExpiryKey(item?.expiry || "");
    const optionType = normalizeOptionType(item?.option_type || "");
    const strike = normalizeStrikeForLookup(item?.strike_price);
    const tupleKey = optionTupleKey(asset, expiry, optionType, strike, exchange);
    const tupleNoExKey = `${asset}|${expiry}|${optionType}|${strike}`;
    const next = {
      ref_id: refId,
      asset,
      exchange,
      expiry,
      option_type: optionType,
      strike,
      symbol: String(item?.symbol || "").trim().toUpperCase(),
      stock_name: String(item?.stock_name || "").trim().toUpperCase(),
      lot_size: Number(item?.lot_size) || null,
    };
    if (tupleKey && !byTuple.has(tupleKey)) byTuple.set(tupleKey, next);
    if (tupleNoExKey && !byTupleNoExchange.has(tupleNoExKey)) byTupleNoExchange.set(tupleNoExKey, next);
    const aliases = exchangeAliasKeys(exchange);
    for (const alias of aliases) {
      const aliasTuple = optionTupleKey(asset, expiry, optionType, strike, alias);
      if (aliasTuple && !byTuple.has(aliasTuple)) byTuple.set(aliasTuple, next);
    }
    for (const symbol of [next.symbol, next.stock_name]) {
      if (!symbol) continue;
      for (const alias of aliases) {
        const key = symbolLookupKey(symbol, alias);
        if (!bySymbol.has(key)) bySymbol.set(key, next);
      }
    }
  }
  return { byTuple, byTupleNoExchange, bySymbol };
}

function optionRowKey(asset, expiry, exchange, strike, side) {
  return [
    String(asset || "").trim().toUpperCase(),
    normalizeExpiryKey(expiry),
    String(exchange || "NSE").trim().toUpperCase(),
    normalizeStrikeForLookup(strike),
    normalizeOptionType(side),
  ].join("|");
}

function ingestOptionEventIntoState(state, eventData) {
  if (!state?.optionRows || !eventData) return;
  const base = {
    asset: String(eventData.asset || "").trim().toUpperCase(),
    expiry: normalizeExpiryKey(eventData.expiry || ""),
    exchange: String(eventData.exchange || "NSE").trim().toUpperCase(),
    atm: asNumber(eventData.atm),
    cp: asNumber(eventData.cp),
  };
  for (const item of eventData.ce || []) {
    const key = optionRowKey(base.asset, base.expiry, base.exchange, item.sp, "CE");
    state.optionRows.set(key, { ...base, side: "CE", ...item });
  }
  for (const item of eventData.pe || []) {
    const key = optionRowKey(base.asset, base.expiry, base.exchange, item.sp, "PE");
    state.optionRows.set(key, { ...base, side: "PE", ...item });
  }
}

function optionRowsForSelection(environment, asset, expiry, exchange) {
  const rows = [];
  const envKey = String(environment || "UAT").trim().toUpperCase();
  const assetKey = String(asset || "").trim().toUpperCase();
  const expiryKey = normalizeExpiryKey(expiry);
  const exchangeKey = String(exchange || "NSE").trim().toUpperCase();
  for (const state of streamStates.values()) {
    if (String(state?.config?.environment || "").trim().toUpperCase() !== envKey) continue;
    for (const row of state.optionRows?.values?.() || []) {
      if (String(row.asset || "").trim().toUpperCase() !== assetKey) continue;
      if (normalizeExpiryKey(row.expiry) !== expiryKey) continue;
      if (String(row.exchange || "NSE").trim().toUpperCase() !== exchangeKey) continue;
      rows.push(row);
    }
  }
  return rows;
}

async function optionRowsFromRestSnapshot(environment, sessionToken, deviceId, asset, expiry, exchange) {
  const envKey = String(environment || "UAT").trim().toUpperCase();
  const targetOrigin = PROXY_TARGETS[envKey === "LIVE" ? "/proxy/live" : "/proxy/uat"];
  const assetKey = String(asset || "").trim().toUpperCase();
  const expiryKey = normalizeExpiryKey(expiry);
  const exchangeKey = String(exchange || "NSE").trim().toUpperCase();
  const path = `/optionchains/${encodeURIComponent(assetKey)}?exchange=${encodeURIComponent(exchangeKey)}&expiry=${encodeURIComponent(expiryKey)}`;
  const upstream = await upstreamJsonRequest(targetOrigin, path, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      "x-device-id": String(deviceId || "").trim(),
    },
  });
  if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
    const msg = String(upstream.data?.error || upstream.data?.message || upstream.raw || `HTTP ${upstream.statusCode}`).trim();
    throw new Error(`Option chain fetch failed: ${msg}`);
  }
  const chain = upstream.data?.chain || {};
  const ce = Array.isArray(chain.ce) ? chain.ce : [];
  const pe = Array.isArray(chain.pe) ? chain.pe : [];
  const mapLeg = (item, side) => ({
    asset: assetKey,
    expiry: expiryKey,
    exchange: exchangeKey,
    side,
    sp: Number(item?.sp),
    ref_id: Number(item?.ref_id),
    ltp: Number(item?.ltp),
    delta: Number(item?.delta),
    gamma: Number(item?.gamma),
    theta: Number(item?.theta),
    vega: Number(item?.vega),
    oi: Number(item?.oi),
    volume: Number(item?.volume),
    ls: Number(item?.ls ?? item?.lot_size),
    atm: Number(chain?.atm),
    cp: Number(chain?.cp ?? chain?.price ?? chain?.ltp),
  });
  return [
    ...ce.map((x) => mapLeg(x, "CE")).filter((x) => Number.isFinite(x.sp)),
    ...pe.map((x) => mapLeg(x, "PE")).filter((x) => Number.isFinite(x.sp)),
  ];
}

async function getRefdataCache(environment, sessionToken, date, exchange, deviceId = "") {
  const envKey = String(environment || "UAT").trim().toUpperCase();
  const dateKey = String(date || todayIst()).trim();
  const exchangeKey = String(exchange || "NSE").trim().toUpperCase();
  const cacheKey = `${envKey}|${dateKey}|${exchangeKey}`;
  const cached = refdataCaches.get(cacheKey);
  if (cached && (Date.now() - cached.cachedAt) < 15 * 60 * 1000) {
    return cached;
  }
  const targetOrigin = PROXY_TARGETS[envKey === "LIVE" ? "/proxy/live" : "/proxy/uat"];
  const requestPath = `/refdata/refdata/${encodeURIComponent(dateKey)}?exchange=${encodeURIComponent(exchangeKey)}`;
  const upstream = await upstreamJsonRequest(targetOrigin, requestPath, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      "x-device-id": deviceId,
    },
  });
  if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
    const msg = String(upstream.data?.error || upstream.data?.message || upstream.raw || `HTTP ${upstream.statusCode}`).trim();
    throw new Error(`Refdata fetch failed: ${msg}`);
  }
  const items = Array.isArray(upstream.data?.refdata) ? upstream.data.refdata : [];
  const entry = {
    cachedAt: Date.now(),
    environment: envKey,
    date: dateKey,
    exchange: exchangeKey,
    items,
    ...buildRefdataIndices(items),
  };
  refdataCaches.set(cacheKey, entry);
  return entry;
}

async function resolveOptionRefs(payload) {
  const environment = String(payload.environment || "UAT").trim().toUpperCase();
  const sessionToken = String(payload.sessionToken || "").trim();
  const deviceId = String(payload.deviceId || "").trim();
  const asset = String(payload.asset || "").trim().toUpperCase();
  const expiry = normalizeExpiryKey(payload.expiry || "");
  const exchange = String(payload.exchange || "NSE").trim().toUpperCase();
  const date = String(payload.date || todayIst()).trim();
  const legs = Array.isArray(payload.legs) ? payload.legs : [];
  const forceResolve = Boolean(payload.force_resolve || payload.forceResolve);
  if (!sessionToken) throw new Error("sessionToken is required");
  if (!asset || !expiry) throw new Error("asset and expiry are required");
  if (!legs.length) return { legs: [], resolved: 0, missing: 0, cacheDate: date };

  const cache = await getRefdataCache(environment, sessionToken, date, exchange, deviceId);
  const resolvedLegs = legs.map((leg) => {
    const currentRef = Number(leg?.ref_id);
    if (!forceResolve && Number.isInteger(currentRef) && currentRef > 0) {
      return { ...leg, ref_id: currentRef, resolution_source: "input" };
    }
    const optionType = normalizeOptionType(leg?.option_type || "");
    const strike = normalizeStrikeForLookup(leg?.strike ?? leg?.strike_raw);
    let match = null;
    let resolutionSource = "";
    for (const symbolCandidate of buildOptionCandidateSymbols(asset, expiry, strike, optionType)) {
      for (const exAlias of exchangeAliasKeys(exchange)) {
        match = cache.bySymbol.get(symbolLookupKey(symbolCandidate, exAlias)) || null;
        if (match) {
          resolutionSource = `symbol:${symbolCandidate}`;
          break;
        }
      }
      if (match) break;
    }
    if (!match) {
      for (const exAlias of exchangeAliasKeys(exchange)) {
        match = cache.byTuple.get(optionTupleKey(asset, expiry, optionType, strike, exAlias)) || null;
        if (match) {
          resolutionSource = "tuple";
          break;
        }
      }
    }
    if (!match) {
      const tupleNoExKey = `${asset}|${expiry}|${optionType}|${strike}`;
      match = cache.byTupleNoExchange.get(tupleNoExKey) || null;
      if (match) resolutionSource = "tuple_no_exchange";
    }
    return {
      ...leg,
      ref_id: match?.ref_id ?? null,
      lot_size: match?.lot_size ?? leg?.lot_size ?? null,
      resolved_symbol: match?.symbol || match?.stock_name || "",
      resolution_source: resolutionSource || "",
    };
  });

  const resolved = resolvedLegs.filter((leg) => Number.isInteger(Number(leg.ref_id)) && Number(leg.ref_id) > 0).length;
  return {
    cacheDate: cache.date,
    legs: resolvedLegs,
    resolved,
    missing: resolvedLegs.length - resolved,
  };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStrategySnapshotFromRows(asset, expiry, exchange, rows) {
  const calls = [];
  const puts = [];
  let atm = null;
  let currentPrice = null;
  for (const x of rows || []) {
    const strikeRaw = Number(x.sp);
    if (!Number.isFinite(strikeRaw)) continue;
    const leg = {
      option_type: normalizeOptionType(x.side),
      ref_id: Number.isInteger(Number(x.ref_id)) ? Number(x.ref_id) : null,
      strike: strikeRaw,
      ltp: toNumberOrNull(x.ltp),
      delta: toNumberOrNull(x.delta),
      gamma: toNumberOrNull(x.gamma),
      theta: toNumberOrNull(x.theta),
      vega: toNumberOrNull(x.vega),
      oi: toNumberOrNull(x.oi),
      vol: toNumberOrNull(x.volume),
      lot_size: Number.isFinite(Number(x.ls)) ? Number(x.ls) : null,
    };
    if (normalizeOptionType(x.side) === "CE") calls.push(leg);
    if (normalizeOptionType(x.side) === "PE") puts.push(leg);
    if (atm === null && Number.isFinite(Number(x.atm))) atm = Number(x.atm);
    if (currentPrice === null && Number.isFinite(Number(x.cp))) currentPrice = Number(x.cp);
    if (currentPrice === null && Number.isFinite(Number(x.price_pcp))) currentPrice = Number(x.price_pcp);
  }
  if (!calls.length && !puts.length) return null;
  return {
    asset: String(asset || "").trim().toUpperCase(),
    expiry: normalizeExpiryKey(expiry),
    exchange: String(exchange || "NSE").trim().toUpperCase(),
    atm,
    current_price: currentPrice,
    calls,
    puts,
  };
}

function snapshotCenter(snapshot) {
  if (Number.isFinite(snapshot?.atm)) return snapshot.atm;
  if (Number.isFinite(snapshot?.current_price)) return snapshot.current_price;
  const strikes = Array.from(new Set([...(snapshot?.calls || []), ...(snapshot?.puts || [])]
    .map((leg) => Number(leg.strike))
    .filter(Number.isFinite))).sort((a, b) => a - b);
  if (!strikes.length) return null;
  return strikes[Math.floor(strikes.length / 2)];
}

function selectStraddle(snapshot) {
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

function selectStrangle(snapshot, targetDelta, tolerance = 0.05) {
  const center = snapshotCenter(snapshot);
  if (!Number.isFinite(center)) return [];
  const calls = (snapshot.calls || []).filter((leg) => leg.delta !== null && leg.strike >= center).sort((a, b) => a.strike - b.strike);
  const puts = (snapshot.puts || []).filter((leg) => leg.delta !== null && leg.strike <= center).sort((a, b) => b.strike - a.strike);
  if (!calls.length || !puts.length) {
    const fallbackCalls = (snapshot.calls || []).filter((leg) => leg.strike > center).sort((a, b) => a.strike - b.strike);
    const fallbackPuts = (snapshot.puts || []).filter((leg) => leg.strike < center).sort((a, b) => b.strike - a.strike);
    return fallbackCalls.length && fallbackPuts.length ? [[fallbackCalls[0], fallbackPuts[0]]] : [];
  }
  const usedPutIndices = new Set();
  const pairs = [];
  for (const call of calls) {
    const callDelta = Math.abs(Number(call.delta));
    for (let j = 0; j < puts.length; j += 1) {
      if (usedPutIndices.has(j)) continue;
      const putDelta = -Math.abs(Number(puts[j].delta));
      const netDelta = -callDelta - putDelta;
      if (Math.abs(netDelta - targetDelta) <= tolerance) {
        pairs.push([call, puts[j]]);
        usedPutIndices.add(j);
        break;
      }
    }
  }
  return pairs;
}

function selectIronButterfly(snapshot, targetDelta) {
  const atmPair = selectStraddle(snapshot);
  if (!atmPair) return [];
  const [atmCall, atmPut] = atmPair;
  const atmStrike = atmCall.strike;
  const otmCalls = (snapshot.calls || []).filter((leg) => leg.delta !== null && leg.strike > atmStrike);
  const otmPuts = (snapshot.puts || []).filter((leg) => leg.delta !== null && leg.strike < atmStrike);
  if (!otmCalls.length || !otmPuts.length) {
    const fallbackCalls = (snapshot.calls || []).filter((leg) => leg.strike > atmStrike).sort((a, b) => a.strike - b.strike);
    const fallbackPuts = (snapshot.puts || []).filter((leg) => leg.strike < atmStrike).sort((a, b) => b.strike - a.strike);
    return fallbackCalls.length && fallbackPuts.length ? [[atmCall, atmPut], [fallbackCalls[0], fallbackPuts[0]]] : [];
  }
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

function selectIronCondor(snapshot, targetDelta) {
  const center = snapshotCenter(snapshot);
  if (!Number.isFinite(center)) return [];
  const shortCalls = (snapshot.calls || []).filter((leg) => leg.delta !== null && leg.strike > center).sort((a, b) => a.strike - b.strike);
  const shortPuts = (snapshot.puts || []).filter((leg) => leg.delta !== null && leg.strike < center).sort((a, b) => b.strike - a.strike);
  if (!shortCalls.length || !shortPuts.length) {
    const fallbackShortCalls = (snapshot.calls || []).filter((leg) => leg.strike > center).sort((a, b) => a.strike - b.strike);
    const fallbackShortPuts = (snapshot.puts || []).filter((leg) => leg.strike < center).sort((a, b) => b.strike - a.strike);
    if (!fallbackShortCalls.length || !fallbackShortPuts.length) return [];
    const shortCall = fallbackShortCalls[0];
    const shortPut = fallbackShortPuts[0];
    const longCalls = fallbackShortCalls.filter((leg) => leg.strike > shortCall.strike);
    const longPuts = fallbackShortPuts.filter((leg) => leg.strike < shortPut.strike);
    return longCalls.length && longPuts.length ? [[shortCall, shortPut], [longCalls[0], longPuts[0]]] : [];
  }
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

function pairGroups(strategy, pairs) {
  if (strategy === "iron_butterfly" || strategy === "iron_condor") {
    return pairs.length ? [pairs] : [];
  }
  return pairs.map((pair) => [pair]);
}

function computeStrategyGreeks(snapshot, legs) {
  const callMap = new Map((snapshot.calls || []).map((leg) => [leg.strike, leg]));
  const putMap = new Map((snapshot.puts || []).map((leg) => [leg.strike, leg]));
  const totals = { delta: 0, gamma: 0, theta: 0, vega: 0, ltp: 0 };
  const seen = { delta: false, gamma: false, theta: false, vega: false, ltp: false };
  for (const legSpec of legs || []) {
    const side = String(legSpec.side || "SELL").trim().toUpperCase();
    const optionType = normalizeOptionType(legSpec.option_type || "");
    const strike = Number(legSpec.strike_raw || (Number(legSpec.strike) * 100));
    const liveLeg = optionType === "CE" ? callMap.get(strike) : putMap.get(strike);
    if (!liveLeg) continue;
    const position = side === "BUY" ? 1 : -1;
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

function buildStrategyPayload(strategy, targetDelta, groups, pairNumber, snapshot) {
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
          ltp: entry.leg.ltp ?? null,
          delta: entry.leg.delta ?? null,
          gamma: entry.leg.gamma ?? null,
          theta: entry.leg.theta ?? null,
          vega: entry.leg.vega ?? null,
        });
      }
    }
  }
  const baseline = computeStrategyGreeks(snapshot, legs);
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

async function buildStrategyFromLivePayload(payload) {
  const environment = String(payload.environment || "UAT").trim().toUpperCase();
  const asset = String(payload.asset || "").trim().toUpperCase();
  const expiry = normalizeExpiryKey(payload.expiry || "");
  const exchange = String(payload.exchange || "NSE").trim().toUpperCase();
  const strategy = String(payload.strategy || "strangle").trim().toLowerCase();
  const targetDelta = Number(payload.target_delta ?? payload.targetDelta ?? 0);
  const pairNumberRaw = payload.pair_number ?? payload.pairNumber;
  const pairNumber = pairNumberRaw === "" || pairNumberRaw === null || pairNumberRaw === undefined ? null : Number(pairNumberRaw);
  let rows = optionRowsForSelection(environment, asset, expiry, exchange);
  if (!rows.length) {
    rows = await optionRowsFromRestSnapshot(
      environment,
      String(payload.sessionToken || "").trim(),
      String(payload.deviceId || "").trim(),
      asset,
      expiry,
      exchange
    ).catch(() => []);
  }
  if (!rows.length) throw new Error("No live option chain snapshot found for the selected asset/expiry/exchange.");
  const snapshot = toStrategySnapshotFromRows(asset, expiry, exchange, rows);
  if (!snapshot) throw new Error("No live option chain snapshot found for the selected asset/expiry/exchange.");
  let pairs = [];
  if (strategy === "straddle") {
    const pair = selectStraddle(snapshot);
    pairs = pair ? [pair] : [];
  } else if (strategy === "strangle") {
    pairs = selectStrangle(snapshot, targetDelta, 0.05);
  } else if (strategy === "iron_butterfly") {
    pairs = selectIronButterfly(snapshot, targetDelta);
  } else if (strategy === "iron_condor") {
    pairs = selectIronCondor(snapshot, targetDelta);
  } else {
    throw new Error(`Unsupported strategy '${strategy}' in backend deploy route.`);
  }
  const groups = pairGroups(strategy, pairs);
  if (!groups.length) throw new Error("No strategy legs found for this selection.");
  const payloadOut = buildStrategyPayload(strategy, targetDelta, groups, Number.isInteger(pairNumber) ? pairNumber : null, snapshot);
  const hasMissingRefs = (payloadOut.legs || []).some((leg) => !Number.isInteger(Number(leg?.ref_id)) || Number(leg.ref_id) <= 0);
  let resolved = { resolved: payloadOut.legs.length, missing: 0, cacheDate: todayIst(), legs: payloadOut.legs };
  if (hasMissingRefs) {
    resolved = await resolveOptionRefs({
      environment,
      sessionToken: payload.sessionToken,
      deviceId: payload.deviceId,
      asset,
      expiry,
      exchange,
      date: todayIst(),
      legs: payloadOut.legs,
    });
    payloadOut.legs = resolved.legs;
  }
  return {
    environment,
    generated_at_ist: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    source: { asset, expiry, exchange, live_rows: rows.length },
    strategy,
    target_delta: targetDelta,
    group_count: groups.length,
    payload: payloadOut,
    resolution: { resolved: resolved.resolved, missing: resolved.missing },
  };
}

async function deployStrategyFromLivePayload(payload) {
  const orderEnvironment = String(payload.environment || "UAT").trim().toUpperCase();
  const dataEnvironment = String(payload.data_environment || "LIVE").trim().toUpperCase();
  const asset = String(payload.asset || "").trim().toUpperCase();
  const expiry = normalizeExpiryKey(payload.expiry || "");
  const exchange = String(payload.exchange || "NSE").trim().toUpperCase();
  const preview = await buildStrategyFromLivePayload({
    ...payload,
    environment: dataEnvironment,
    sessionToken: String(payload.dataSessionToken || payload.sessionToken || "").trim(),
  });
  // Re-resolve refs in order environment (UAT) because ref_id can differ between LIVE and UAT.
  const orderResolved = await resolveOptionRefs({
    environment: orderEnvironment,
    sessionToken: String(payload.sessionToken || "").trim(),
    deviceId: String(payload.deviceId || "").trim(),
    asset,
    expiry,
    exchange,
    date: todayIst(),
    force_resolve: true,
    legs: Array.isArray(preview?.payload?.legs) ? preview.payload.legs : [],
  });
  if (Number(orderResolved?.missing || 0) > 0) {
    throw new Error(`Unable to resolve ${orderResolved.missing} leg ref_id(s) in ${orderEnvironment}.`);
  }
  if (Array.isArray(orderResolved?.legs) && orderResolved.legs.length) {
    preview.payload.legs = orderResolved.legs;
  }
  const orderQty = Number(payload.order_qty ?? payload.requested_order_qty);
  if (!Number.isInteger(orderQty) || orderQty <= 0) {
    throw new Error("Requested order quantity must be a positive integer.");
  }
  const missing = (preview.payload.legs || []).filter((leg) => !Number.isInteger(Number(leg.ref_id)) || Number(leg.ref_id) <= 0).length;
  if (missing > 0) throw new Error(`Unable to resolve ${missing} tracked leg ref_id(s) from broker refdata.`);
  const entryPriceRaw = (preview.payload.legs || []).reduce((sum, leg) => {
    const ltp = Number(leg.ltp);
    if (!Number.isFinite(ltp)) return sum;
    return sum + (String(leg.side || "").toUpperCase() === "SELL" ? ltp : -ltp);
  }, 0);
  const entryBufferBps = Number(payload.entry_ltp_buffer_bps || 0);
  const entryPriceBuffered = Number.isFinite(entryPriceRaw)
    ? applySignedPriceBuffer(entryPriceRaw, entryBufferBps, "sell_positive")
    : null;
  const basketBody = {
    exchange: preview.source.exchange,
    basket_name: `Dashboard_${preview.strategy}`,
    tag: preview.payload.entry_tag,
    orders: (preview.payload.legs || []).map((leg) => ({
      ref_id: Number(leg.ref_id),
      order_qty: orderQty,
      order_side: String(leg.side || "").toUpperCase() === "BUY" ? "ORDER_SIDE_BUY" : "ORDER_SIDE_SELL",
    })),
    basket_params: {
      order_side: "ORDER_SIDE_BUY",
      order_delivery_type: String(payload.delivery_type || "ORDER_DELIVERY_TYPE_CNC"),
      price_type: String(payload.price_type || "LIMIT").toUpperCase(),
      multiplier: Number(payload.multiplier || 1),
      entry_price: Number.isFinite(entryPriceBuffered) ? entryPriceBuffered : undefined,
    },
  };
  if (!Number.isFinite(Number(basketBody.basket_params.entry_price))) {
    delete basketBody.basket_params.entry_price;
  }
  const targetOrigin = PROXY_TARGETS[orderEnvironment === "LIVE" ? "/proxy/live" : "/proxy/uat"];
  const upstream = await upstreamJsonRequest(targetOrigin, "/orders/v2/basket", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${payload.sessionToken}`,
      "x-device-id": String(payload.deviceId || "").trim(),
    },
    body: basketBody,
  });
  if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
    const msg = String(upstream.data?.error || upstream.data?.message || upstream.raw || `HTTP ${upstream.statusCode}`).trim();
    throw new Error(msg || "Basket deploy failed.");
  }
  return {
    order_environment: orderEnvironment,
    data_environment: preview.environment,
    preview,
    flexi_order_request: basketBody,
    response: upstream.data,
    basket_id: upstream.data?.basket_id ?? upstream.data?.basketId ?? upstream.data?.id ?? null,
  };
}

function resolveStaticPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0]);
  const legacyPrefix = "/Excel plugin/";
  const requestedPath = decodedPath.startsWith(legacyPrefix)
    ? `/${decodedPath.slice(legacyPrefix.length)}`
    : decodedPath;
  const requested = requestedPath === "/" ? "/taskpane.html" : requestedPath;
  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.resolve(ROOT_DIR, "." + normalized);
  if (!absolutePath.startsWith(ROOT_DIR)) {
    return null;
  }
  return absolutePath;
}

function serveStatic(req, res) {
  const filePath = resolveStaticPath(req.url || "/");
  if (!filePath) {
    writeError(res, 403, "Forbidden");
    return;
  }

  let finalPath = filePath;
  if (fs.existsSync(finalPath) && fs.statSync(finalPath).isDirectory()) {
    finalPath = path.join(finalPath, "index.html");
  }
  if (!fs.existsSync(finalPath) || !fs.statSync(finalPath).isFile()) {
    writeError(res, 404, "Not Found");
    return;
  }

  const extension = path.extname(finalPath).toLowerCase();
  const headers = corsHeaders(res);
  headers["Content-Type"] = MIME_TYPES[extension] || "application/octet-stream";
  res.writeHead(200, headers);
  fs.createReadStream(finalPath).pipe(res);
}

function proxyRequest(req, res, prefix, targetOrigin) {
  const requestUrl = new URL(req.url, "https://localhost");
  const targetUrl = new URL(targetOrigin);
  const targetPath = requestUrl.pathname.slice(prefix.length) + requestUrl.search;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  headers["x-forwarded-host"] = req.headers.host || "";
  headers["x-forwarded-proto"] = "https";

  const options = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    method: req.method,
    path: targetPath,
    headers,
  };

  const upstream = https.request(options, (upstreamRes) => {
    const responseHeaders = { ...upstreamRes.headers };
    delete responseHeaders["access-control-allow-origin"];
    delete responseHeaders["access-control-allow-credentials"];
    delete responseHeaders["access-control-allow-headers"];
    delete responseHeaders["access-control-allow-methods"];
    const mergedHeaders = { ...responseHeaders, ...corsHeaders(res) };
    res.writeHead(upstreamRes.statusCode || 500, mergedHeaders);
    upstreamRes.pipe(res);
    logLine(
      `[PROXY] ${req.method} ${req.url} -> ${targetOrigin}${targetPath} | status=${upstreamRes.statusCode || 0}`
    );
  });

  upstream.on("error", (error) => {
    logLine(`[ERROR] Proxy ${req.method} ${req.url} | ${error.message}`);
    writeError(res, 502, "Upstream request failed");
  });

  req.pipe(upstream);
}

function routeProxy(req, res) {
  const pathname = new URL(req.url, "https://localhost").pathname;
  const match = Object.entries(PROXY_TARGETS).find(([prefix]) => pathname.startsWith(prefix + "/"));
  if (!match) {
    return false;
  }
  proxyRequest(req, res, match[0], match[1]);
  return true;
}

function ensureStreamState(streamId) {
  let state = streamStates.get(streamId);
  if (!state) {
    state = {
      streamId,
      config: null,
      ws: null,
      clients: new Set(),
      optionRows: new Map(),
      reconnectTimer: null,
      orphanTimer: null,
      retryCount: 0,
      status: "idle",
      manualStop: false,
      stopReason: "",
      lastMessageAt: 0,
      connectOpenedAt: 0,
      textMessageCount: 0,
      emptyCloseCount: 0,
    };
    streamStates.set(streamId, state);
  }
  return state;
}

function broadcastSse(state, payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of Array.from(state.clients)) {
    try {
      client.write(line);
    } catch (error) {
      state.clients.delete(client);
    }
  }
}

function asNumber(value) {
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value;
  }
  return value;
}

function pickField(obj, names) {
  if (!obj || !Array.isArray(names)) return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(obj, name)) {
      const v = obj[name];
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  const normalize = (v) => String(v || "").replace(/[_\s-]/g, "").toLowerCase();
  const wanted = new Set(names.map(normalize));
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (wanted.has(normalize(k))) return v;
  }
  return undefined;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeOptionItem(item) {
  return {
    inst_id: asNumber(item.inst_id ?? item.instrument_id),
    ts: asNumber(item.ts ?? item.timestamp),
    sp: asNumber(item.sp ?? item.strike_price),
    ls: asNumber(item.ls ?? item.lot_size),
    ltp: asNumber(item.ltp ?? item.last_traded_price ?? item.price),
    ltpchg: item.ltpchg ?? item.last_traded_price_change,
    iv: item.iv,
    delta: item.delta,
    gamma: item.gamma,
    theta: item.theta,
    vega: item.vega,
    oi: asNumber(item.oi ?? item.open_interest),
    volume: asNumber(item.volume ?? item.cumulative_volume),
    ref_id: asNumber(item.ref_id),
    prev_oi: asNumber(item.prev_oi ?? item.previous_open_interest),
    price_pcp: asNumber(item.price_pcp),
  };
}

function decodePayloadByHint(typeHint, payloadValue) {
  const events = [];
  const hint = String(typeHint || "");
  const lhint = hint.toLowerCase();
  const has = (x) => lhint.includes(x);

  if (
    hint.endsWith("BatchWebSocketIndexMessage") ||
    lhint === "index" ||
    lhint === "index_bucket" ||
    has("index")
  ) {
    const msg = BatchIndexType.decode(payloadValue);
    const data = BatchIndexType.toObject(msg, { longs: String });
    const all = [...(data.indexes || []), ...(data.instruments || [])];
    for (const item of all) {
      const prevClose = toFiniteNumber(pickField(item, ["prevClose", "prev_close", "previousClose", "previous_close"]));
      const changePct = toFiniteNumber(pickField(item, ["changepercent", "changePercent", "change_percent", "change"]));
      let ltp = pickField(item, ["indexValue", "index_value", "indexvalue", "last_traded_price", "lastTradedPrice", "currentprice", "currentPrice", "close", "price", "ltp", "value"]);
      if ((ltp === undefined || ltp === null || ltp === "") && prevClose !== null && changePct !== null) {
        ltp = Math.round(prevClose * (1 + changePct / 100));
      }
      events.push({
        type: "index",
        data: {
          symbol: String(pickField(item, ["indexname", "indexName", "symbol", "asset", "stock_name", "stockName", "name"]) || ""),
          exchange: String(pickField(item, ["exchange"]) || data.exchange || ""),
          ts: asNumber(pickField(item, ["timestamp"]) ?? data.timestamp),
          ltp: asNumber(ltp),
          high: asNumber(pickField(item, ["highIndexValue", "high_index_value", "high"])),
          low: asNumber(pickField(item, ["lowIndexValue", "low_index_value", "low"])),
          volume: asNumber(pickField(item, ["volume"])),
          change: pickField(item, ["changepercent", "changePercent", "change_percent", "change"]),
          tick_volume: asNumber(pickField(item, ["tickVolume", "tick_volume", "ticks"])),
          prev_close: asNumber(pickField(item, ["prevClose", "prev_close", "previousClose", "previous_close"])),
          volume_oi: asNumber(pickField(item, ["volumeOi", "volume_oi", "open_interest", "openInterest"])),
        },
      });
    }
    return events;
  }

  if (hint.endsWith("BatchWebSocketOrderbookMessage") || lhint === "orderbook" || has("orderbook")) {
    const msg = BatchOrderbookType.decode(payloadValue);
    const data = BatchOrderbookType.toObject(msg, { longs: String });
    for (const item of data.instruments || []) {
      events.push({
        type: "orderbook",
        data: {
          inst_id: asNumber(item.inst_id ?? item.instrument_id),
          ref_id: asNumber(item.ref_id),
          ts: asNumber(item.timestamp),
          ltp: asNumber(item.ltp ?? item.last_traded_price),
          ltq: asNumber(item.ltq ?? item.last_traded_quantity),
          volume: asNumber(item.volume),
          bid: (item.bids || []).map((b) => ({
            p: asNumber(b.price),
            q: asNumber(b.quantity),
            o: asNumber(b.orders ?? b.num_orders),
          })),
          ask: (item.asks || []).map((a) => ({
            p: asNumber(a.price),
            q: asNumber(a.quantity),
            o: asNumber(a.orders ?? a.num_orders),
          })),
        },
      });
    }
    return events;
  }

  if (hint.endsWith("WebSocketMsgOptionChainUpdate") || lhint === "option" || has("option")) {
    const msg = OptionChainUpdateType.decode(payloadValue);
    const data = OptionChainUpdateType.toObject(msg, { longs: String });
    events.push({
      type: "option",
      data: {
        asset: data.asset || "",
        exchange: data.exchange || "",
        expiry: data.expiry || "",
        atm: asNumber(data.atm),
        cp: asNumber(data.currentprice),
        ce: (data.ce || []).map(normalizeOptionItem),
        pe: (data.pe || []).map(normalizeOptionItem),
      },
    });
    return events;
  }

  if (hint.endsWith("BatchWebSocketGreeksMessage") || lhint === "greeks" || has("greeks")) {
    const msg = BatchGreeksType.decode(payloadValue);
    const data = BatchGreeksType.toObject(msg, { longs: String });
    for (const item of data.instruments || []) {
      events.push({
        type: "greeks",
        data: normalizeOptionItem(item),
      });
    }
    return events;
  }

  events.push({
    type: "raw_type",
    data: { type_url: hint || "" },
  });
  return events;
}

function decodePayloadByTrial(payloadValue) {
  // Fallback when hint/type_url is empty or unknown.
  try {
    const msg = OptionChainUpdateType.decode(payloadValue);
    const data = OptionChainUpdateType.toObject(msg, { longs: String });
    if ((data.ce && data.ce.length) || (data.pe && data.pe.length) || data.asset || data.expiry) {
      return decodePayloadByHint("option", payloadValue);
    }
  } catch (_error) {
    // no-op
  }

  try {
    const msg = BatchOrderbookType.decode(payloadValue);
    const data = BatchOrderbookType.toObject(msg, { longs: String });
    if (Array.isArray(data.instruments) && data.instruments.length > 0) {
      return decodePayloadByHint("orderbook", payloadValue);
    }
  } catch (_error) {
    // no-op
  }

  try {
    const msg = BatchGreeksType.decode(payloadValue);
    const data = BatchGreeksType.toObject(msg, { longs: String });
    if (Array.isArray(data.instruments) && data.instruments.length > 0) {
      return decodePayloadByHint("greeks", payloadValue);
    }
  } catch (_error) {
    // no-op
  }

  try {
    const msg = BatchIndexType.decode(payloadValue);
    const data = BatchIndexType.toObject(msg, { longs: String });
    if (
      (Array.isArray(data.indexes) && data.indexes.length > 0) ||
      (Array.isArray(data.instruments) && data.instruments.length > 0)
    ) {
      return decodePayloadByHint("index", payloadValue);
    }
  } catch (_error) {
    // no-op
  }

  return [
    {
      type: "raw_type",
      data: { type_url: "" },
    },
  ];
}

function decodeNubraPacket(rawData) {
  try {
    const generic = GenericDataType.decode(rawData);
    const dataAny = generic?.data;
    if (dataAny && dataAny.value && dataAny.value.length > 0) {
      const hint = dataAny.type_url || generic.key || "";
      const decoded = decodePayloadByHint(hint, dataAny.value);
      if (decoded.length === 1 && decoded[0].type === "raw_type" && !hint) {
        return decodePayloadByTrial(dataAny.value);
      }
      return decoded;
    }
  } catch (_error) {
    // try other envelope variants
  }

  try {
    const outer = AnyType.decode(rawData);
    if (outer && outer.value && outer.value.length > 0) {
      try {
        const inner = AnyType.decode(outer.value);
        const hint = inner.type_url || outer.type_url || "";
        const value = inner.value && inner.value.length > 0 ? inner.value : outer.value;
        const decoded = decodePayloadByHint(hint, value);
        if (decoded.length === 1 && decoded[0].type === "raw_type" && !hint) {
          return decodePayloadByTrial(value);
        }
        return decoded;
      } catch (_innerError) {
        const hint = outer.type_url || "";
        const decoded = decodePayloadByHint(hint, outer.value);
        if (decoded.length === 1 && decoded[0].type === "raw_type" && !hint) {
          return decodePayloadByTrial(outer.value);
        }
        return decoded;
      }
    }
  } catch (error) {
    return [
      {
        type: "decode_error",
        data: { message: error.message || String(error) },
      },
    ];
  }

  return [
    {
      type: "raw_type",
      data: { type_url: "" },
    },
  ];
}

function parseCsvList(value) {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseRefIds(value) {
  return parseCsvList(value)
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x > 0);
}

function uniqStrings(values) {
  return Array.from(new Set((values || []).map((x) => String(x).trim()).filter(Boolean)));
}

function normalizeIndexConfig(indexValue, fallbackExchange) {
  if (!indexValue) return null;
  const symbols = uniqStrings(parseCsvList(indexValue.symbols).map((x) => x.toUpperCase()));
  if (!symbols.length) return null;
  return {
    exchange: String(indexValue.exchange || fallbackExchange || "NSE").trim().toUpperCase(),
    symbols,
    interval: indexValue.interval ? String(indexValue.interval).trim() : "",
  };
}

function normalizeOptionConfig(optionValue, fallbackExchange) {
  if (!optionValue) return null;
  const exchangeFallback = String(optionValue.exchange || fallbackExchange || "NSE").trim().toUpperCase();
  const items = Array.isArray(optionValue.items)
    ? optionValue.items
        .map((x) => ({
          asset: String(x.asset || "").trim().toUpperCase(),
          expiry: String(x.expiry || "").trim(),
          exchange: String(x.exchange || exchangeFallback || "NSE").trim().toUpperCase(),
        }))
        .filter((x) => x.asset && x.expiry)
    : [];
  if (!items.length) return null;
  return {
    interval: optionValue.interval ? String(optionValue.interval).trim() : "",
    items,
  };
}

function normalizeOrderbookConfig(orderbookValue) {
  if (!orderbookValue) return null;
  const refIds = parseRefIds(orderbookValue.refIds);
  if (!refIds.length) return null;
  const depthRaw = Number.isInteger(orderbookValue.depth)
    ? orderbookValue.depth
    : Number(orderbookValue.depth || 5);
  const depth = Number.isFinite(depthRaw) ? Math.min(20, Math.max(1, Math.round(depthRaw))) : 5;
  return {
    refIds,
    depth,
    interval: orderbookValue.interval ? String(orderbookValue.interval).trim() : "",
  };
}

function optionItemKey(item) {
  return `${String(item.exchange || "").toUpperCase()}|${String(item.asset || "").toUpperCase()}|${String(item.expiry || "")}`;
}

function mergeOptionItems(existingItems, incomingItems) {
  const byKey = new Map();
  for (const item of existingItems || []) {
    byKey.set(optionItemKey(item), item);
  }
  for (const item of incomingItems || []) {
    byKey.set(optionItemKey(item), item);
  }
  return Array.from(byKey.values());
}

function mergeConfig(baseConfig, patchConfig) {
  const base = baseConfig || {};
  const patch = patchConfig || {};
  const out = {
    ...base,
    streamId: patch.streamId || base.streamId || "",
    environment: patch.environment || base.environment || "UAT",
    sessionToken: patch.sessionToken || base.sessionToken || "",
    marketWsUrl: patch.marketWsUrl || base.marketWsUrl || "",
    autoReconnect: patch.autoReconnect !== undefined ? patch.autoReconnect : base.autoReconnect !== false,
    postMarket: patch.postMarket !== undefined ? patch.postMarket : base.postMarket,
    index: base.index ? { ...base.index } : null,
    option: base.option ? { ...base.option, items: [...(base.option.items || [])] } : null,
    orderbook: base.orderbook ? { ...base.orderbook, refIds: [...(base.orderbook.refIds || [])] } : null,
  };

  if (patch.index) {
    if (!out.index) {
      out.index = {
        exchange: patch.index.exchange || "NSE",
        symbols: [...(patch.index.symbols || [])],
        interval: patch.index.interval || "",
      };
    } else {
      out.index.exchange = patch.index.exchange || out.index.exchange || "NSE";
      out.index.symbols = uniqStrings([...(out.index.symbols || []), ...(patch.index.symbols || [])]);
      if (patch.index.interval) out.index.interval = patch.index.interval;
    }
  }

  if (patch.option) {
    if (!out.option) {
      out.option = {
        interval: patch.option.interval || "",
        items: [...(patch.option.items || [])],
      };
    } else {
      out.option.items = mergeOptionItems(out.option.items || [], patch.option.items || []);
      if (patch.option.interval) out.option.interval = patch.option.interval;
    }
  }

  if (patch.orderbook) {
    if (!out.orderbook) {
      out.orderbook = {
        refIds: [...(patch.orderbook.refIds || [])],
        depth: patch.orderbook.depth || 5,
        interval: patch.orderbook.interval || "",
      };
    } else {
      out.orderbook.refIds = uniqStrings([...(out.orderbook.refIds || []), ...(patch.orderbook.refIds || [])]).map((x) => Number(x));
      if (Number.isInteger(patch.orderbook.depth)) out.orderbook.depth = patch.orderbook.depth;
      if (patch.orderbook.interval) out.orderbook.interval = patch.orderbook.interval;
    }
  }

  return out;
}

function subtractConfig(baseConfig, patchConfig) {
  const base = baseConfig || {};
  const patch = patchConfig || {};
  const out = {
    ...base,
    index: base.index ? { ...base.index, symbols: [...(base.index.symbols || [])] } : null,
    option: base.option ? { ...base.option, items: [...(base.option.items || [])] } : null,
    orderbook: base.orderbook ? { ...base.orderbook, refIds: [...(base.orderbook.refIds || [])] } : null,
  };

  if (patch.index && out.index) {
    const remove = new Set((patch.index.symbols || []).map((x) => String(x).toUpperCase()));
    out.index.symbols = (out.index.symbols || []).filter((x) => !remove.has(String(x).toUpperCase()));
    if (!out.index.symbols.length) out.index = null;
  }

  if (patch.option && out.option) {
    const remove = new Set((patch.option.items || []).map(optionItemKey));
    out.option.items = (out.option.items || []).filter((x) => !remove.has(optionItemKey(x)));
    if (!out.option.items.length) out.option = null;
  }

  if (patch.orderbook && out.orderbook) {
    const remove = new Set((patch.orderbook.refIds || []).map((x) => Number(x)));
    out.orderbook.refIds = (out.orderbook.refIds || []).filter((x) => !remove.has(Number(x)));
    if (!out.orderbook.refIds.length) out.orderbook = null;
  }

  return out;
}

function activeSummary(config) {
  const c = config || {};
  return {
    indexSymbols: c.index?.symbols || [],
    indexExchange: c.index?.exchange || "",
    optionItems: c.option?.items || [],
    orderbookRefIds: c.orderbook?.refIds || [],
  };
}

function getIstClock() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return {
    weekday: String(map.weekday || "").toLowerCase(),
    year: Number(map.year || 0),
    month: Number(map.month || 0),
    day: Number(map.day || 0),
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
    second: Number(map.second || 0),
  };
}

function isIndianMarketOpenNow(clock) {
  const c = clock || getIstClock();
  const isWeekend = c.weekday === "sat" || c.weekday === "sun";
  if (isWeekend) return false;

  const minuteOfDay = c.hour * 60 + c.minute;
  const openMinute = 9 * 60 + 15;
  const closeMinute = 15 * 60 + 30;
  return minuteOfDay >= openMinute && minuteOfDay < closeMinute;
}

function resolvePostMarketMode(requestedPostMarket) {
  const clock = getIstClock();
  const marketOpenNow = isIndianMarketOpenNow(clock);
  const autoPostMarket = !marketOpenNow;
  const hasRequested = typeof requestedPostMarket === "boolean";
  const postMarket = hasRequested ? requestedPostMarket : autoPostMarket;

  const pad2 = (n) => String(n).padStart(2, "0");
  const istTime = `${clock.year}-${pad2(clock.month)}-${pad2(clock.day)} ${pad2(clock.hour)}:${pad2(clock.minute)}:${pad2(clock.second)} IST`;

  return {
    postMarket,
    source: hasRequested ? "request" : "auto",
    marketOpenNow,
    istTime,
  };
}

function buildWsCommands(config, options = {}) {
  const action = options.action === "unsubscribe" ? "batch_unsubscribe" : "batch_subscribe";
  const token = String(config.sessionToken || "").trim();
  const commands = [];
  if (!token) return commands;

  if (config.index && Array.isArray(config.index.symbols) && config.index.symbols.length > 0) {
    const payload = { indexes: config.index.symbols };
    const exchange = config.index.exchange || "NSE";
    commands.push(`${action} ${token} index ${JSON.stringify(payload)} ${exchange}`);
  }

  if (config.option && Array.isArray(config.option.items) && config.option.items.length > 0) {
    const payload = config.option.items.map((item) => ({
      exchange: item.exchange || "NSE",
      asset: String(item.asset || "").trim().toUpperCase(),
      expiry: String(item.expiry || "").trim(),
    }));
    commands.push(`${action} ${token} option ${JSON.stringify(payload)}`);
  }

  if (config.orderbook && Array.isArray(config.orderbook.refIds) && config.orderbook.refIds.length > 0) {
    const payload = { instruments: config.orderbook.refIds };
    commands.push(`${action} ${token} orderbook ${JSON.stringify(payload)}`);
  }

  return commands;
}

function connectWs(state) {
  const config = state.config;
  const wsUrl = String(config.marketWsUrl || WS_TARGETS[config.environment] || "").trim();
  if (!wsUrl) {
    broadcastSse(state, { type: "status", status: "error", message: "Unsupported environment" });
    return;
  }

  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  state.manualStop = false;
  state.status = "connecting";
  broadcastSse(state, { type: "status", status: "connecting", streamId: state.streamId });

  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";
  state.ws = ws;
  state.lastMessageAt = 0;
  state.connectOpenedAt = 0;
  state.textMessageCount = 0;
  logLine(`[WS:${state.streamId}] CONNECT ${wsUrl}`);

  ws.onopen = () => {
    state.status = "connected";
    state.retryCount = 0;
    state.connectOpenedAt = Date.now();
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    broadcastSse(state, { type: "status", status: "connected", streamId: state.streamId });
    const commands = buildWsCommands(config);
    for (const command of commands) {
      ws.send(command);
      logLine(`[WS:${state.streamId}] SENT ${command}`);
    }
  };

  ws.onmessage = async (event) => {
    if (typeof event.data === "string") {
      const text = event.data.trim();
      if (text) {
        state.lastMessageAt = Date.now();
        state.textMessageCount += 1;
        logLine(`[WS:${state.streamId}] TEXT ${text.slice(0, 300)}`);
      }
      broadcastSse(state, { type: "text", data: text, streamId: state.streamId });
      if (text === "Invalid Token") {
        broadcastSse(state, { type: "status", status: "invalid_token", streamId: state.streamId });
        state.manualStop = true;
        state.stopReason = "invalid_token";
        if (state.reconnectTimer) {
          clearTimeout(state.reconnectTimer);
          state.reconnectTimer = null;
        }
        try {
          ws.close();
        } catch (_error) {
          // no-op
        }
      }
      return;
    }

    let raw;
    if (event.data instanceof ArrayBuffer) {
      raw = new Uint8Array(event.data);
    } else if (event.data && typeof event.data.arrayBuffer === "function") {
      raw = new Uint8Array(await event.data.arrayBuffer());
    } else if (Buffer.isBuffer(event.data)) {
      raw = event.data;
    } else {
      return;
    }

    const decodedEvents = decodeNubraPacket(raw);
    state.lastMessageAt = Date.now();
    if (decodedEvents.length > 0) {
      const typeCounts = decodedEvents.reduce((acc, x) => {
        const k = String(x.type || "unknown");
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      if (JSON.stringify(typeCounts) !== "{\"raw_type\":1}") {
        logLine(`[WS:${state.streamId}] EVENTS ${JSON.stringify(typeCounts)}`);
      }
    }
    const hasDecodeIssue = decodedEvents.some((x) => x.type === "decode_error" || x.type === "raw_type");
    if (hasDecodeIssue) {
      logLine(`[WS:${state.streamId}] DECODE_ISSUE ${JSON.stringify(decodedEvents).slice(0, 600)}`);
    }
    for (const decoded of decodedEvents) {
      if (decoded.type === "option") {
        ingestOptionEventIntoState(state, decoded.data);
      }
      broadcastSse(state, {
        ...decoded,
        streamId: state.streamId,
        receivedAt: Date.now(),
      });
    }
  };

  ws.onerror = () => {
    broadcastSse(state, { type: "status", status: "error", streamId: state.streamId });
  };

  ws.onclose = (code, reasonBuffer) => {
    state.ws = null;
    const wasManual = state.manualStop;
    state.status = wasManual ? state.stopReason || "stopped" : "closed";
    state.stopReason = "";
    const codeNum = Number.isFinite(Number(code)) ? Number(code) : 0;
    const reason = Buffer.isBuffer(reasonBuffer)
      ? reasonBuffer.toString("utf8")
      : String(reasonBuffer || "");
    const aliveMs = state.connectOpenedAt > 0 ? Math.max(0, Date.now() - state.connectOpenedAt) : 0;
    const likelyHandshakeOnly = !wasManual && state.lastMessageAt > 0 && state.textMessageCount > 0 && aliveMs < 3000;
    if (likelyHandshakeOnly) {
      state.emptyCloseCount += 1;
    } else {
      state.emptyCloseCount = 0;
    }
    logLine(
      `[WS:${state.streamId}] CLOSED manual=${wasManual} retry=${state.retryCount} code=${codeNum} reason=${JSON.stringify(reason)}`
    );
    broadcastSse(state, {
      type: "status",
      status: state.status,
      streamId: state.streamId,
      closeCode: codeNum,
      closeReason: reason,
    });

    if (!wasManual && config.autoReconnect !== false) {
      if (state.emptyCloseCount >= 3) {
        logLine(`[WS:${state.streamId}] reconnect suppressed after ${state.emptyCloseCount} handshake-only closes; relying on HTTP fallback.`);
        broadcastSse(state, {
          type: "status",
          status: "closed",
          streamId: state.streamId,
          fallback: true,
        });
        return;
      }
      state.retryCount += 1;
      const delayMs = Math.min(30000, Math.max(1000, 1000 * state.retryCount));
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
      }
      state.reconnectTimer = setTimeout(() => connectWs(state), delayMs);
      broadcastSse(state, {
        type: "status",
        status: "reconnecting",
        delayMs,
        streamId: state.streamId,
      });
    }
  };
}

function stopWsStream(streamId) {
  const state = streamStates.get(streamId);
  if (!state) {
    return;
  }
  state.manualStop = true;
  state.stopReason = "stopped";
  state.status = "stopped";
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.orphanTimer) {
    clearTimeout(state.orphanTimer);
    state.orphanTimer = null;
  }
  if (state.ws) {
    try {
      state.ws.close();
    } catch (error) {
      // No-op
    }
    state.ws = null;
  }
  broadcastSse(state, { type: "status", status: "stopped", streamId });
}

function dropStream(streamId) {
  const state = streamStates.get(streamId);
  if (!state) return;
  stopWsStream(streamId);
  streamStates.delete(streamId);
}

function streamFamilyInfo(streamId) {
  const m = String(streamId || "").match(/^(master|live_prices|live_oc)_(uat|live)_/i);
  if (!m) return null;
  return {
    key: m[1].toLowerCase(),
    env: m[2].toLowerCase(),
  };
}

function stopSiblingStreams(streamId) {
  const info = streamFamilyInfo(streamId);
  if (!info) return;
  for (const [id, state] of streamStates.entries()) {
    if (id === streamId) continue;
    const other = streamFamilyInfo(id);
    if (!other) continue;
    if (other.key === info.key && other.env === info.env) {
      // Keep only one stream per family/env to avoid orphaned upstream sockets.
      stopWsStream(id);
      if (!state.clients || state.clients.size === 0) {
        streamStates.delete(id);
      }
    }
  }
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString("utf8");
    if (body.length > 5_000_000) {
      throw new Error("Payload too large");
    }
  }
  if (!body.trim()) {
    return {};
  }
  return JSON.parse(body);
}

async function routeWsApi(req, res, urlObj) {
  const pathnameRaw = urlObj.pathname || "/";
  const pathname = pathnameRaw.length > 1 ? pathnameRaw.replace(/\/+$/, "") : pathnameRaw;
  const method = String(req.method || "GET").toUpperCase();

  if (pathname === "/ws/events" && method === "GET") {
    const streamId = (urlObj.searchParams.get("streamId") || "").trim();
    if (!streamId) {
      writeError(res, 400, "streamId is required");
      return true;
    }
    const state = ensureStreamState(streamId);
    if (state.orphanTimer) {
      clearTimeout(state.orphanTimer);
      state.orphanTimer = null;
    }
    const headers = corsHeaders(res);
    headers["Content-Type"] = "text/event-stream";
    headers["Cache-Control"] = "no-cache";
    headers.Connection = "keep-alive";
    res.writeHead(200, headers);
    res.write(`data: ${JSON.stringify({ type: "status", status: state.status, streamId })}\n\n`);
    state.clients.add(res);

    req.on("close", () => {
      state.clients.delete(res);
      if (state.clients.size === 0) {
        if (state.orphanTimer) clearTimeout(state.orphanTimer);
        state.orphanTimer = setTimeout(() => {
          const latest = streamStates.get(streamId);
          if (!latest) return;
          if (latest.clients.size === 0) {
            dropStream(streamId);
            logLine(`[WS:${streamId}] dropped orphan stream (no SSE clients).`);
          }
        }, 3000);
      }
    });
    return true;
  }

  if (pathname === "/ws/start" && method === "POST") {
    const payload = await readJsonBody(req);
    const streamId = String(payload.streamId || "").trim();
    const environment = String(payload.environment || "UAT").trim().toUpperCase();
    const sessionToken = String(payload.sessionToken || "").trim();
    const mode = resolvePostMarketMode(payload.postMarket);
    if (!streamId) {
      writeError(res, 400, "streamId is required");
      return true;
    }
    if (!sessionToken) {
      writeError(res, 400, "sessionToken is required");
      return true;
    }
    if (!WS_TARGETS[environment]) {
      writeError(res, 400, "Unsupported environment");
      return true;
    }

    stopSiblingStreams(streamId);
    const state = ensureStreamState(streamId);
    stopWsStream(streamId);
    state.config = mergeConfig({}, {
      streamId,
      environment,
      sessionToken,
      marketWsUrl: String(payload.marketWsUrl || "").trim(),
      autoReconnect: payload.autoReconnect !== false,
      postMarket: mode.postMarket,
      index: normalizeIndexConfig(payload.index),
      option: normalizeOptionConfig(payload.option),
      orderbook: normalizeOrderbookConfig(payload.orderbook),
    });

    connectWs(state);
    writeJson(res, 200, {
      ok: true,
      streamId,
      status: "starting",
      postMarket: state.config.postMarket,
      postMarketSource: mode.source,
      marketOpenNow: mode.marketOpenNow,
      istTime: mode.istTime,
      active: activeSummary(state.config),
    });
    return true;
  }

  if (pathname === "/ws/command" && method === "POST") {
    const payload = await readJsonBody(req);
    const streamId = String(payload.streamId || "").trim();
    const action = String(payload.action || "subscribe").trim().toLowerCase() === "unsubscribe" ? "unsubscribe" : "subscribe";
    if (!streamId) {
      writeError(res, 400, "streamId is required");
      return true;
    }
    const state = ensureStreamState(streamId);
    if (!state.config || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
      writeError(res, 409, "WS stream is not connected");
      return true;
    }

    const patch = {
      streamId: state.config.streamId,
      environment: state.config.environment,
      sessionToken: state.config.sessionToken,
      autoReconnect: state.config.autoReconnect !== false,
      index: normalizeIndexConfig(payload.index, state.config.index?.exchange || "NSE"),
      option: normalizeOptionConfig(payload.option),
      orderbook: normalizeOrderbookConfig(payload.orderbook),
    };

    if (typeof payload.postMarket === "boolean") {
      patch.postMarket = payload.postMarket;
    }

    if (!patch.index && !patch.option && !patch.orderbook && patch.postMarket === undefined) {
      writeError(res, 400, "No command payload provided");
      return true;
    }

    const nextConfig =
      action === "subscribe"
        ? mergeConfig(state.config, patch)
        : subtractConfig(state.config, patch);

    // Upstream subscribe semantics are effectively "set current subscription".
    // So for subscribe we send the full merged set; for unsubscribe we send only the patch.
    const commandConfig =
      action === "subscribe"
        ? nextConfig
        : mergeConfig({ sessionToken: state.config.sessionToken }, patch);

    const commands = buildWsCommands(commandConfig, {
      action,
    });
    for (const command of commands) {
      state.ws.send(command);
      logLine(`[WS:${state.streamId}] SENT ${command}`);
    }

    state.config = nextConfig;

    writeJson(res, 200, {
      ok: true,
      streamId,
      action,
      sent: commands.length,
      active: activeSummary(state.config),
    });
    return true;
  }

  if (pathname === "/ws/stop" && method === "POST") {
    const payload = await readJsonBody(req);
    const streamId = String(payload.streamId || "").trim();
    if (!streamId) {
      writeError(res, 400, "streamId is required");
      return true;
    }
    stopWsStream(streamId);
    writeJson(res, 200, { ok: true, streamId });
    return true;
  }

  if (pathname === "/ws/reset" && (method === "POST" || method === "GET")) {
    let count = 0;
    for (const streamId of Array.from(streamStates.keys())) {
      dropStream(streamId);
      count += 1;
    }
    writeJson(res, 200, { ok: true, reset: count });
    return true;
  }

  if (pathname === "/ws/status" && method === "GET") {
    const streams = Array.from(streamStates.values()).map((s) => ({
      streamId: s.streamId,
      status: s.status,
      clients: s.clients.size,
      connected: Boolean(s.ws),
      active: activeSummary(s.config || {}),
    }));
    writeJson(res, 200, { ok: true, streams });
    return true;
  }

  if (pathname.startsWith("/ws/")) {
    writeError(res, 404, "Unknown WS route");
    return true;
  }
  return false;
}

async function routeLocalApi(req, res, urlObj) {
  const pathnameRaw = urlObj.pathname || "/";
  const pathname = pathnameRaw.length > 1 ? pathnameRaw.replace(/\/+$/, "") : pathnameRaw;
  const method = String(req.method || "GET").toUpperCase();

  if (pathname === "/api/refdata/resolve-options" && method === "POST") {
    const payload = await readJsonBody(req);
    try {
      const resolved = await resolveOptionRefs(payload);
      writeJson(res, 200, { ok: true, ...resolved });
    } catch (error) {
      writeError(res, 400, error.message || String(error));
    }
    return true;
  }

  if (pathname === "/api/strategy/preview" && method === "POST") {
    const payload = await readJsonBody(req);
    try {
      const preview = await buildStrategyFromLivePayload(payload);
      writeJson(res, 200, { ok: true, ...preview });
    } catch (error) {
      writeError(res, 400, error.message || String(error));
    }
    return true;
  }

  if (pathname === "/api/strategy/deploy" && method === "POST") {
    const payload = await readJsonBody(req);
    try {
      const result = await deployStrategyFromLivePayload(payload);
      writeJson(res, 200, { ok: true, ...result });
    } catch (error) {
      writeError(res, 400, error.message || String(error));
    }
    return true;
  }

  return false;
}

async function requestHandler(req, res) {
  logLine(`[REQ] ${req.method} ${req.url}`);
  try {
    res._corsOrigin = resolveCorsOrigin(req);
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders(res));
      res.end();
      return;
    }

    const urlObj = new URL(req.url || "/", "https://localhost");
    if (await routeWsApi(req, res, urlObj)) {
      return;
    }
    if (await routeLocalApi(req, res, urlObj)) {
      return;
    }
    if (routeProxy(req, res)) {
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    logLine(`[ERROR] request ${req.method} ${req.url} | ${error.message || String(error)}`);
    writeError(res, 500, "Internal server error");
  }
}

function main() {
  if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
    console.error("Missing dev cert files.");
    console.error("Expected cert:", CERT_PATH);
    console.error("Expected key :", KEY_PATH);
    process.exit(1);
  }

  try {
    fs.writeFileSync(LOG_PATH, "");
  } catch (error) {
    console.error("Failed to reset log file:", error.message);
  }

  const server = https.createServer(
    {
      cert: fs.readFileSync(CERT_PATH),
      key: fs.readFileSync(KEY_PATH),
    },
    (req, res) => {
      requestHandler(req, res);
    }
  );

  server.listen(PORT, LOOPBACK_HOST, () => {
    console.log(`Nubra Excel dev server running: https://localhost:${PORT}`);
    console.log("Bind host:", LOOPBACK_HOST);
    console.log("Static root:", ROOT_DIR);
    console.log("REST proxy LIVE -> https://api.nubra.io");
    console.log("REST proxy UAT  -> https://uatapi.nubra.io");
    console.log("WS bridge LIVE   -> wss://api.nubra.io/apibatch/ws");
    console.log("WS bridge UAT    -> wss://uatapi.nubra.io/apibatch/ws");
  });

  const shutdown = () => {
    for (const streamId of streamStates.keys()) {
      stopWsStream(streamId);
    }
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
