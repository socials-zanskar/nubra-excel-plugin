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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-device-id, x-temp-token",
    "Access-Control-Max-Age": "600",
  };
}

function logLine(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (error) {
    console.error("Failed to write log:", error.message);
  }
}

function writeJson(res, statusCode, payload) {
  const headers = corsHeaders();
  headers["Content-Type"] = "application/json; charset=UTF-8";
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

function writeError(res, statusCode, message) {
  writeJson(res, statusCode, { error: message });
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
  const headers = corsHeaders();
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
    const mergedHeaders = { ...responseHeaders, ...corsHeaders() };
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
      reconnectTimer: null,
      orphanTimer: null,
      retryCount: 0,
      status: "idle",
      manualStop: false,
      stopReason: "",
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
  const includeSettings = options.includeSettings !== false;
  const token = config.sessionToken;
  const commands = [];

  if (includeSettings && config.postMarket !== undefined) {
    commands.push(`batch_subscribe ${token} post_market ${config.postMarket ? "true" : "false"}`);
  }

  if (includeSettings && config.orderbook && Number.isInteger(config.orderbook.depth)) {
    commands.push(`batch_subscribe ${token} orderbook_depth ${config.orderbook.depth}`);
  }

  if (includeSettings && config.index && config.index.interval) {
    commands.push(`batch_subscribe ${token} socket_interval index ${config.index.interval}`);
  }

  if (includeSettings && config.option && config.option.interval) {
    commands.push(`batch_subscribe ${token} socket_interval option ${config.option.interval}`);
  }

  if (includeSettings && config.orderbook && config.orderbook.interval) {
    commands.push(`batch_subscribe ${token} socket_interval orderbook ${config.orderbook.interval}`);
  }

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
  const wsUrl = WS_TARGETS[config.environment];
  if (!wsUrl) {
    broadcastSse(state, { type: "status", status: "error", message: "Unsupported environment" });
    return;
  }

  state.manualStop = false;
  state.status = "connecting";
  broadcastSse(state, { type: "status", status: "connecting", streamId: state.streamId });

  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";
  state.ws = ws;

  ws.onopen = () => {
    state.status = "connected";
    state.retryCount = 0;
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

  ws.onclose = () => {
    state.ws = null;
    const wasManual = state.manualStop;
    state.status = wasManual ? state.stopReason || "stopped" : "closed";
    state.stopReason = "";
    broadcastSse(state, { type: "status", status: state.status, streamId: state.streamId });

    if (!wasManual && config.autoReconnect !== false) {
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
    const headers = corsHeaders();
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
      includeSettings: action === "subscribe",
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

async function requestHandler(req, res) {
  logLine(`[REQ] ${req.method} ${req.url}`);
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    const urlObj = new URL(req.url || "/", "https://localhost");
    if (await routeWsApi(req, res, urlObj)) {
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Nubra Excel dev server running: https://localhost:${PORT}`);
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
