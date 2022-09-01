globalThis._importMeta_=globalThis._importMeta_||{url:"file:///_entry.js",env:process.env};import 'node-fetch-native/polyfill';
import { Server as Server$1 } from 'http';
import { Server } from 'https';
import destr from 'destr';
import { defineEventHandler, handleCacheHeaders, createEvent, eventHandler, createError, createApp, createRouter, lazyEventHandler } from 'h3';
import { createFetch as createFetch$1, Headers } from 'ohmyfetch';
import { createRouter as createRouter$1 } from 'radix3';
import { createCall, createFetch } from 'unenv/runtime/fetch/index';
import { createHooks } from 'hookable';
import { snakeCase } from 'scule';
import { hash } from 'ohash';
import { createStorage } from 'unstorage';
import { withQuery, withLeadingSlash, withoutTrailingSlash, parseURL } from 'ufo';
import { promises } from 'fs';
import { resolve, dirname } from 'pathe';
import { fileURLToPath } from 'url';

const _runtimeConfig = {"app":{"baseURL":"/","buildAssetsDir":"/_nuxt/","cdnURL":""},"nitro":{"routes":{},"envPrefix":"NUXT_"},"public":{}};
const ENV_PREFIX = "NITRO_";
const ENV_PREFIX_ALT = _runtimeConfig.nitro.envPrefix ?? process.env.NITRO_ENV_PREFIX ?? "_";
const getEnv = (key) => {
  const envKey = snakeCase(key).toUpperCase();
  return destr(process.env[ENV_PREFIX + envKey] ?? process.env[ENV_PREFIX_ALT + envKey]);
};
function isObject(input) {
  return typeof input === "object" && !Array.isArray(input);
}
function overrideConfig(obj, parentKey = "") {
  for (const key in obj) {
    const subKey = parentKey ? `${parentKey}_${key}` : key;
    const envValue = getEnv(subKey);
    if (isObject(obj[key])) {
      if (isObject(envValue)) {
        obj[key] = { ...obj[key], ...envValue };
      }
      overrideConfig(obj[key], subKey);
    } else {
      obj[key] = envValue ?? obj[key];
    }
  }
}
overrideConfig(_runtimeConfig);
const config = deepFreeze(_runtimeConfig);
const useRuntimeConfig = () => config;
function deepFreeze(object) {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    const value = object[name];
    if (value && typeof value === "object") {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

const globalTiming = globalThis.__timing__ || {
  start: () => 0,
  end: () => 0,
  metrics: []
};
function timingMiddleware(_req, res, next) {
  const start = globalTiming.start();
  const _end = res.end;
  res.end = (data, encoding, callback) => {
    const metrics = [["Generate", globalTiming.end(start)], ...globalTiming.metrics];
    const serverTiming = metrics.map((m) => `-;dur=${m[1]};desc="${encodeURIComponent(m[0])}"`).join(", ");
    if (!res.headersSent) {
      res.setHeader("Server-Timing", serverTiming);
    }
    _end.call(res, data, encoding, callback);
  };
  next();
}

const _assets = {

};

function normalizeKey(key) {
  if (!key) {
    return "";
  }
  return key.replace(/[/\\]/g, ":").replace(/:+/g, ":").replace(/^:|:$/g, "");
}

const assets$1 = {
  getKeys() {
    return Promise.resolve(Object.keys(_assets))
  },
  hasItem (id) {
    id = normalizeKey(id);
    return Promise.resolve(id in _assets)
  },
  getItem (id) {
    id = normalizeKey(id);
    return Promise.resolve(_assets[id] ? _assets[id].import() : null)
  },
  getMeta (id) {
    id = normalizeKey(id);
    return Promise.resolve(_assets[id] ? _assets[id].meta : {})
  }
};

const storage = createStorage({});

const useStorage = () => storage;

storage.mount('/assets', assets$1);

const defaultCacheOptions = {
  name: "_",
  base: "/cache",
  swr: true,
  maxAge: 1
};
function defineCachedFunction(fn, opts) {
  opts = { ...defaultCacheOptions, ...opts };
  const pending = {};
  const group = opts.group || "nitro";
  const name = opts.name || fn.name || "_";
  const integrity = hash([opts.integrity, fn, opts]);
  async function get(key, resolver) {
    const cacheKey = [opts.base, group, name, key].filter(Boolean).join(":").replace(/:\/$/, ":index");
    const entry = await useStorage().getItem(cacheKey) || {};
    const ttl = (opts.maxAge ?? opts.maxAge ?? 0) * 1e3;
    if (ttl) {
      entry.expires = Date.now() + ttl;
    }
    const expired = entry.integrity !== integrity || ttl && Date.now() - (entry.mtime || 0) > ttl;
    const _resolve = async () => {
      if (!pending[key]) {
        pending[key] = Promise.resolve(resolver());
      }
      entry.value = await pending[key];
      entry.mtime = Date.now();
      entry.integrity = integrity;
      delete pending[key];
      useStorage().setItem(cacheKey, entry).catch((error) => console.error("[nitro] [cache]", error));
    };
    const _resolvePromise = expired ? _resolve() : Promise.resolve();
    if (opts.swr && entry.value) {
      _resolvePromise.catch(console.error);
      return Promise.resolve(entry);
    }
    return _resolvePromise.then(() => entry);
  }
  return async (...args) => {
    const key = (opts.getKey || getKey)(...args);
    const entry = await get(key, () => fn(...args));
    let value = entry.value;
    if (opts.transform) {
      value = await opts.transform(entry, ...args) || value;
    }
    return value;
  };
}
const cachedFunction = defineCachedFunction;
function getKey(...args) {
  return args.length ? hash(args, {}) : "";
}
function defineCachedEventHandler(handler, opts = defaultCacheOptions) {
  const _opts = {
    ...opts,
    getKey: (event) => {
      return event.req.originalUrl || event.req.url;
    },
    group: opts.group || "nitro/handlers",
    integrity: [
      opts.integrity,
      handler
    ]
  };
  const _cachedHandler = cachedFunction(async (incomingEvent) => {
    const reqProxy = cloneWithProxy(incomingEvent.req, { headers: {} });
    const resHeaders = {};
    const resProxy = cloneWithProxy(incomingEvent.res, {
      statusCode: 200,
      getHeader(name) {
        return resHeaders[name];
      },
      setHeader(name, value) {
        resHeaders[name] = value;
        return this;
      },
      getHeaderNames() {
        return Object.keys(resHeaders);
      },
      hasHeader(name) {
        return name in resHeaders;
      },
      removeHeader(name) {
        delete resHeaders[name];
      },
      getHeaders() {
        return resHeaders;
      }
    });
    const event = createEvent(reqProxy, resProxy);
    event.context = incomingEvent.context;
    const body = await handler(event);
    const headers = event.res.getHeaders();
    headers.Etag = `W/"${hash(body)}"`;
    headers["Last-Modified"] = new Date().toUTCString();
    const cacheControl = [];
    if (opts.swr) {
      if (opts.maxAge) {
        cacheControl.push(`s-maxage=${opts.maxAge}`);
      }
      if (opts.staleMaxAge) {
        cacheControl.push(`stale-while-revalidate=${opts.staleMaxAge}`);
      } else {
        cacheControl.push("stale-while-revalidate");
      }
    } else if (opts.maxAge) {
      cacheControl.push(`max-age=${opts.maxAge}`);
    }
    if (cacheControl.length) {
      headers["Cache-Control"] = cacheControl.join(", ");
    }
    const cacheEntry = {
      code: event.res.statusCode,
      headers,
      body
    };
    return cacheEntry;
  }, _opts);
  return defineEventHandler(async (event) => {
    const response = await _cachedHandler(event);
    if (event.res.headersSent || event.res.writableEnded) {
      return response.body;
    }
    if (handleCacheHeaders(event, {
      modifiedTime: new Date(response.headers["Last-Modified"]),
      etag: response.headers.etag,
      maxAge: opts.maxAge
    })) {
      return;
    }
    event.res.statusCode = response.code;
    for (const name in response.headers) {
      event.res.setHeader(name, response.headers[name]);
    }
    return response.body;
  });
}
function cloneWithProxy(obj, overrides) {
  return new Proxy(obj, {
    get(target, property, receiver) {
      if (property in overrides) {
        return overrides[property];
      }
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (property in overrides) {
        overrides[property] = value;
        return true;
      }
      return Reflect.set(target, property, value, receiver);
    }
  });
}
const cachedEventHandler = defineCachedEventHandler;

const plugins = [
  
];

function hasReqHeader(req, header, includes) {
  const value = req.headers[header];
  return value && typeof value === "string" && value.toLowerCase().includes(includes);
}
function isJsonRequest(event) {
  return hasReqHeader(event.req, "accept", "application/json") || hasReqHeader(event.req, "user-agent", "curl/") || hasReqHeader(event.req, "user-agent", "httpie/") || event.req.url?.endsWith(".json") || event.req.url?.includes("/api/");
}
function normalizeError(error) {
  const cwd = process.cwd();
  const stack = (error.stack || "").split("\n").splice(1).filter((line) => line.includes("at ")).map((line) => {
    const text = line.replace(cwd + "/", "./").replace("webpack:/", "").replace("file://", "").trim();
    return {
      text,
      internal: line.includes("node_modules") && !line.includes(".cache") || line.includes("internal") || line.includes("new Promise")
    };
  });
  const statusCode = error.statusCode || 500;
  const statusMessage = error.statusMessage ?? (statusCode === 404 ? "Route Not Found" : "Internal Server Error");
  const message = error.message || error.toString();
  return {
    stack,
    statusCode,
    statusMessage,
    message
  };
}

const errorHandler = (async function errorhandler(_error, event) {
  const { stack, statusCode, statusMessage, message } = normalizeError(_error);
  const errorObject = {
    url: event.req.url,
    statusCode,
    statusMessage,
    message,
    description: "",
    data: _error.data
  };
  event.res.statusCode = errorObject.statusCode;
  event.res.statusMessage = errorObject.statusMessage;
  if (errorObject.statusCode !== 404) {
    console.error("[nuxt] [request error]", errorObject.message + "\n" + stack.map((l) => "  " + l.text).join("  \n"));
  }
  if (isJsonRequest(event)) {
    event.res.setHeader("Content-Type", "application/json");
    event.res.end(JSON.stringify(errorObject));
    return;
  }
  const url = withQuery("/__nuxt_error", errorObject);
  const html = await $fetch(url).catch((error) => {
    console.error("[nitro] Error while generating error response", error);
    return errorObject.statusMessage;
  });
  event.res.setHeader("Content-Type", "text/html;charset=UTF-8");
  event.res.end(html);
});

const assets = {
  "/branches.svg": {
    "type": "image/svg+xml",
    "etag": "\"1a40-q1FAH2/tPA6triQy/jQ0QfYnYsA\"",
    "mtime": "2022-06-23T19:47:55.452Z",
    "path": "../public/branches.svg"
  },
  "/chart.svg": {
    "type": "image/svg+xml",
    "etag": "\"16e2-alYRmeOhAbXS7KlrLrheYDaXpLU\"",
    "mtime": "2022-06-25T17:42:06.871Z",
    "path": "../public/chart.svg"
  },
  "/clients.svg": {
    "type": "image/svg+xml",
    "etag": "\"e82-sS4ImG/xPB2mwgMprG4T6/1eaYE\"",
    "mtime": "2022-06-23T19:48:21.773Z",
    "path": "../public/clients.svg"
  },
  "/favicon.ico": {
    "type": "image/vnd.microsoft.icon",
    "etag": "\"10be-C55WuIAyh7hKQVer/LFA+m9aKYY\"",
    "mtime": "2022-06-19T04:53:14.000Z",
    "path": "../public/favicon.ico"
  },
  "/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.480Z",
    "path": "../public/index.html"
  },
  "/logo.svg": {
    "type": "image/svg+xml",
    "etag": "\"1135-iox3W4z2ptwqR+JHm28B5UZcVHg\"",
    "mtime": "2022-06-18T06:06:20.196Z",
    "path": "../public/logo.svg"
  },
  "/mission.jpg": {
    "type": "image/jpeg",
    "etag": "\"12b2b-5iaYK6H6gg1Kn43ICm0+TbkFEFI\"",
    "mtime": "2022-06-21T17:03:16.912Z",
    "path": "../public/mission.jpg"
  },
  "/mobile.svg": {
    "type": "image/svg+xml",
    "etag": "\"b44-aWfz3mezu0ge6jvCPBk2J+PPPb0\"",
    "mtime": "2022-06-20T11:00:50.407Z",
    "path": "../public/mobile.svg"
  },
  "/projects.svg": {
    "type": "image/svg+xml",
    "etag": "\"d93-0SClRtt8XTPOOVXJPaAcy2itTXc\"",
    "mtime": "2022-06-23T19:48:10.161Z",
    "path": "../public/projects.svg"
  },
  "/security.svg": {
    "type": "image/svg+xml",
    "etag": "\"17a3-M2k9F7u9Risyvh/WKqg9eRJmpBQ\"",
    "mtime": "2022-06-20T11:42:31.166Z",
    "path": "../public/security.svg"
  },
  "/seo.svg": {
    "type": "image/svg+xml",
    "etag": "\"3743-5FKSEngiNNAHXu0Fpe9jvpwlclo\"",
    "mtime": "2022-06-20T11:18:25.186Z",
    "path": "../public/seo.svg"
  },
  "/teams.svg": {
    "type": "image/svg+xml",
    "etag": "\"14cc-bMg2MOF5k6H/z2kKiCVaJICMWlg\"",
    "mtime": "2022-06-23T19:47:07.667Z",
    "path": "../public/teams.svg"
  },
  "/true-client.svg": {
    "type": "image/svg+xml",
    "etag": "\"26f9-+aAF8CK7SpRe2B1slla6BgJi42s\"",
    "mtime": "2022-06-25T17:42:49.419Z",
    "path": "../public/true-client.svg"
  },
  "/website.svg": {
    "type": "image/svg+xml",
    "etag": "\"17d3-wwcW4F0BREc/CjWfLFZBimFDon4\"",
    "mtime": "2022-06-20T11:18:46.410Z",
    "path": "../public/website.svg"
  },
  "/white_logo.svg": {
    "type": "image/svg+xml",
    "etag": "\"e8f-z2kkymFZvfw015XQlzi5w2n8R5Q\"",
    "mtime": "2022-06-21T17:20:10.969Z",
    "path": "../public/white_logo.svg"
  },
  "/white_logo_name.svg": {
    "type": "image/svg+xml",
    "etag": "\"3043-JvbKV1/0udVYcGgCSL0bTSkqUnU\"",
    "mtime": "2022-06-21T17:34:34.646Z",
    "path": "../public/white_logo_name.svg"
  },
  "/200/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.483Z",
    "path": "../public/200/index.html"
  },
  "/404/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.485Z",
    "path": "../public/404/index.html"
  },
  "/about/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.438Z",
    "path": "../public/about/index.html"
  },
  "/blank/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.434Z",
    "path": "../public/blank/index.html"
  },
  "/contact/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.447Z",
    "path": "../public/contact/index.html"
  },
  "/op_projects/analysis.json": {
    "type": "application/json",
    "etag": "\"1b165-m8Gh5k+FPC39yS7hift6MKjCTHI\"",
    "mtime": "2022-07-11T07:14:40.108Z",
    "path": "../public/op_projects/analysis.json"
  },
  "/op_projects/bg-dark.avif": {
    "type": "image/avif",
    "etag": "\"1d212-ZMkWkC8xfw0+rZkLKsy6x+AjKpc\"",
    "mtime": "2022-07-13T14:52:32.197Z",
    "path": "../public/op_projects/bg-dark.avif"
  },
  "/op_projects/bg.avif": {
    "type": "image/avif",
    "etag": "\"12f9e-++NjJoM6eOCsz/5dryG2ealsqTk\"",
    "mtime": "2022-07-10T17:06:10.575Z",
    "path": "../public/op_projects/bg.avif"
  },
  "/op_projects/bg.png": {
    "type": "image/png",
    "etag": "\"54a54-P0EwDnuhQCQi4cc5cT21Ais/5Uo\"",
    "mtime": "2022-07-10T14:16:54.848Z",
    "path": "../public/op_projects/bg.png"
  },
  "/op_projects/bg.svg": {
    "type": "image/svg+xml",
    "etag": "\"451e7-lNBfBycVFlKuLBVis1L1A4urjp0\"",
    "mtime": "2022-07-10T14:12:38.338Z",
    "path": "../public/op_projects/bg.svg"
  },
  "/op_projects/Cookie-bg.png": {
    "type": "image/png",
    "etag": "\"d8b-9+E87qXv93e2fkmPVqMxGhXdMHw\"",
    "mtime": "2022-07-11T08:57:21.715Z",
    "path": "../public/op_projects/Cookie-bg.png"
  },
  "/op_projects/cookie.png": {
    "type": "image/png",
    "etag": "\"5c9c-xITN3Sd6/XdbyJPjSkryRElO4P4\"",
    "mtime": "2022-07-11T09:21:09.691Z",
    "path": "../public/op_projects/cookie.png"
  },
  "/op_projects/cookie.svg": {
    "type": "image/svg+xml",
    "etag": "\"10af-9c+1FembOXElYx8GEp1uLy89qjY\"",
    "mtime": "2022-07-11T09:16:52.074Z",
    "path": "../public/op_projects/cookie.svg"
  },
  "/op_projects/creative.json": {
    "type": "application/json",
    "etag": "\"2033f-TPF/kdDo04Hy26G3a45pdOi8YfI\"",
    "mtime": "2022-07-11T07:34:04.553Z",
    "path": "../public/op_projects/creative.json"
  },
  "/op_projects/data.svg": {
    "type": "image/svg+xml",
    "etag": "\"e22-SaW7jiiyHkGPTnLjYdaqL70mRgg\"",
    "mtime": "2022-07-10T17:31:09.405Z",
    "path": "../public/op_projects/data.svg"
  },
  "/op_projects/deal.json": {
    "type": "application/json",
    "etag": "\"292d4-aleWoMms5gWbQhENOWk2pcfoXso\"",
    "mtime": "2022-07-11T07:16:10.379Z",
    "path": "../public/op_projects/deal.json"
  },
  "/op_projects/document.json": {
    "type": "application/json",
    "etag": "\"20fdb-XQFB2CM+XT0vWLZ9cMxuik0X5P4\"",
    "mtime": "2022-07-11T07:59:41.062Z",
    "path": "../public/op_projects/document.json"
  },
  "/op_projects/factory.svg": {
    "type": "image/svg+xml",
    "etag": "\"3cf-3EKYaZ3PaKH0zTZCYTtKhJ2AsT8\"",
    "mtime": "2022-07-10T17:54:13.114Z",
    "path": "../public/op_projects/factory.svg"
  },
  "/op_projects/footer-map.svg": {
    "type": "image/svg+xml",
    "etag": "\"10ea4c-VOSjFaHdGrq4XdpyneVJlrWZL7o\"",
    "mtime": "2022-07-11T10:13:54.102Z",
    "path": "../public/op_projects/footer-map.svg"
  },
  "/op_projects/Glysis-home.svg": {
    "type": "image/svg+xml",
    "etag": "\"34ebe-rLcPazZXQUPG8/UzRE0aDwgzDXw\"",
    "mtime": "2022-07-10T09:03:36.259Z",
    "path": "../public/op_projects/Glysis-home.svg"
  },
  "/op_projects/hero.json": {
    "type": "application/json",
    "etag": "\"5248e-8P2bx6kGq4P7DMH+/6GwbBRfZ9Y\"",
    "mtime": "2022-07-10T10:59:52.937Z",
    "path": "../public/op_projects/hero.json"
  },
  "/op_projects/loud-speaker-alert.json": {
    "type": "application/json",
    "etag": "\"16eb3-tnJrL40DdRAHYHXmzQ/1Uw9cThw\"",
    "mtime": "2022-07-10T14:04:00.097Z",
    "path": "../public/op_projects/loud-speaker-alert.json"
  },
  "/op_projects/mobile.json": {
    "type": "application/json",
    "etag": "\"15b19-SipHATMGxHb3snU2M2p7/YjC8Po\"",
    "mtime": "2022-07-10T14:47:23.871Z",
    "path": "../public/op_projects/mobile.json"
  },
  "/op_projects/presentation.json": {
    "type": "application/json",
    "etag": "\"3d82e-QRUi/YH4hXdhS9HwQ1r+W+ydR1E\"",
    "mtime": "2022-07-11T07:15:55.104Z",
    "path": "../public/op_projects/presentation.json"
  },
  "/op_projects/quality.svg": {
    "type": "image/svg+xml",
    "etag": "\"e37-Nu547FzADhJEsmcxcEH/Xgejvr0\"",
    "mtime": "2022-07-10T17:31:28.588Z",
    "path": "../public/op_projects/quality.svg"
  },
  "/op_projects/ratings.svg": {
    "type": "image/svg+xml",
    "etag": "\"2cf-UvQwv59HvxLi/M2YLzCXbXmD5+g\"",
    "mtime": "2022-07-10T17:51:33.218Z",
    "path": "../public/op_projects/ratings.svg"
  },
  "/op_projects/Screenshot 2022-06-26 124119.png": {
    "type": "image/png",
    "etag": "\"2554c-t+wZzZAhnu6cRnHiXBSvoVl6gtc\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 124119.png"
  },
  "/op_projects/Screenshot 2022-06-26 124158.png": {
    "type": "image/png",
    "etag": "\"1b4a2-7mQCAy1QCf2KiAkYIRaTbKq9lPc\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 124158.png"
  },
  "/op_projects/Screenshot 2022-06-26 124244.png": {
    "type": "image/png",
    "etag": "\"1b05a-PNFm1zKMfvelRXvxDHlf4aUFeqM\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 124244.png"
  },
  "/op_projects/Screenshot 2022-06-26 124417.png": {
    "type": "image/png",
    "etag": "\"3ced-SwbNzMiVZLeemO8lygZ5o1WO+Q8\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 124417.png"
  },
  "/op_projects/Screenshot 2022-06-26 124633.png": {
    "type": "image/png",
    "etag": "\"c476-gMt3mn30d5udHxdks2O0v7LBp90\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 124633.png"
  },
  "/op_projects/Screenshot 2022-06-26 124723.png": {
    "type": "image/png",
    "etag": "\"780a-bbssloebSvPTgpdxqY1jUJcS8So\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 124723.png"
  },
  "/op_projects/Screenshot 2022-06-26 124819.png": {
    "type": "image/png",
    "etag": "\"1ea26-5AtONAPLDoSqL/IoydiCGTSaC+s\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 124819.png"
  },
  "/op_projects/Screenshot 2022-06-26 125000.png": {
    "type": "image/png",
    "etag": "\"679a-AEQlr3heZBWQFtu1F7+sl+7KLzk\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125000.png"
  },
  "/op_projects/Screenshot 2022-06-26 125045.png": {
    "type": "image/png",
    "etag": "\"27d8-sEreOBIOsTZV2zFUulH6f75HwCs\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125045.png"
  },
  "/op_projects/Screenshot 2022-06-26 125301.png": {
    "type": "image/png",
    "etag": "\"6f444-g3H2hib6KkkoMtqkr115coWdLuc\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125301.png"
  },
  "/op_projects/Screenshot 2022-06-26 125403.png": {
    "type": "image/png",
    "etag": "\"78d2b-D815Wsoeg4DwBUQu1DshxhcUoas\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125403.png"
  },
  "/op_projects/Screenshot 2022-06-26 125529.png": {
    "type": "image/png",
    "etag": "\"e715-+LulCqQ1bMQtuztfsSmx+RlFqng\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125529.png"
  },
  "/op_projects/Screenshot 2022-06-26 125547.png": {
    "type": "image/png",
    "etag": "\"141c2-MrB+QEc/Zgi2B9RkztEbqZgZHGE\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125547.png"
  },
  "/op_projects/Screenshot 2022-06-26 125605.png": {
    "type": "image/png",
    "etag": "\"26733-i6E6jFuNDpeDpWZl7g4Sjwc1LzQ\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125605.png"
  },
  "/op_projects/Screenshot 2022-06-26 125629.png": {
    "type": "image/png",
    "etag": "\"6b88-BzToOJaO2RM/YhRvbZvhCowojn0\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125629.png"
  },
  "/op_projects/Screenshot 2022-06-26 125658.png": {
    "type": "image/png",
    "etag": "\"50aa-vlsv7fw2Im1ydx9hTmZ1+YOApq4\"",
    "mtime": "2022-06-26T02:45:06.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125658.png"
  },
  "/op_projects/Screenshot 2022-06-26 125722.png": {
    "type": "image/png",
    "etag": "\"5697-5nyO/Yr8DBfoQ8oM5/slWomCyik\"",
    "mtime": "2022-06-26T02:45:08.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125722.png"
  },
  "/op_projects/Screenshot 2022-06-26 125745.png": {
    "type": "image/png",
    "etag": "\"fc3c-GFKZS9mcutRtJgTMwXuDuz2WDKM\"",
    "mtime": "2022-06-26T02:45:08.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125745.png"
  },
  "/op_projects/Screenshot 2022-06-26 125826.png": {
    "type": "image/png",
    "etag": "\"80d8-NA8+S44LggcVUZfjed9Eb2G2xVY\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125826.png"
  },
  "/op_projects/Screenshot 2022-06-26 125902.png": {
    "type": "image/png",
    "etag": "\"68de-Jp9H2Wi8uFCiKyyq708h6/3dTo0\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125902.png"
  },
  "/op_projects/Screenshot 2022-06-26 125919.png": {
    "type": "image/png",
    "etag": "\"7944-XjsHi8vX9rn6HJIWaIeRzeES7fI\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125919.png"
  },
  "/op_projects/Screenshot 2022-06-26 125934.png": {
    "type": "image/png",
    "etag": "\"938a-7Ydi2dbJ2+eXkCXKJLZ93zMQi3U\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125934.png"
  },
  "/op_projects/Screenshot 2022-06-26 125948.png": {
    "type": "image/png",
    "etag": "\"aa4d-kzFKTwGHADQk8sGEl45XKN8eEFM\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 125948.png"
  },
  "/op_projects/Screenshot 2022-06-26 130000.png": {
    "type": "image/png",
    "etag": "\"ace0-EycyKHTqxz+4T4Vm8tg0PZhbTCo\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 130000.png"
  },
  "/op_projects/Screenshot 2022-06-26 131341.png": {
    "type": "image/png",
    "etag": "\"1851e-/+vdTmP02r4x6PT1LNsPE/mkKio\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 131341.png"
  },
  "/op_projects/Screenshot 2022-06-26 131630.png": {
    "type": "image/png",
    "etag": "\"26efd-fE7unmSDHlgUu91V98YllJ9i/Gg\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 131630.png"
  },
  "/op_projects/Screenshot 2022-06-26 131859.png": {
    "type": "image/png",
    "etag": "\"65b8c-NvGxmOtwi1snFYXD3nysiPvCJJs\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 131859.png"
  },
  "/op_projects/Screenshot 2022-06-26 131940.png": {
    "type": "image/png",
    "etag": "\"85d69-nbXIIAukfdIoqQeUWv+Nvk6SQoQ\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 131940.png"
  },
  "/op_projects/Screenshot 2022-06-26 131952.png": {
    "type": "image/png",
    "etag": "\"331df-XEyNkxwAY/gOoqBZkCfjVbBSPgc\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 131952.png"
  },
  "/op_projects/Screenshot 2022-06-26 132039.png": {
    "type": "image/png",
    "etag": "\"4afc1-WSmqpulHEOQVw0rV9bFZP6IIQGs\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 132039.png"
  },
  "/op_projects/Screenshot 2022-06-26 132550.png": {
    "type": "image/png",
    "etag": "\"5553-CHoKRWDVI98LcwbrnxBbD9bPcnE\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 132550.png"
  },
  "/op_projects/Screenshot 2022-06-26 132635.png": {
    "type": "image/png",
    "etag": "\"183ab-x8LNzigYpu+CqwbJPq2h/0f8ya0\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 132635.png"
  },
  "/op_projects/Screenshot 2022-06-26 132726.png": {
    "type": "image/png",
    "etag": "\"15146-VgX4O9+befasNIO0UfUbUF2A0ZY\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 132726.png"
  },
  "/op_projects/Screenshot 2022-06-26 132738.png": {
    "type": "image/png",
    "etag": "\"1168c-VF1/LuMUdFm+1AYE6ulv2Sn+js0\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 132738.png"
  },
  "/op_projects/Screenshot 2022-06-26 132808.png": {
    "type": "image/png",
    "etag": "\"10f75-ehiYChLX/tlVoByD3xr0hJ0MEFc\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 132808.png"
  },
  "/op_projects/Screenshot 2022-06-26 132822.png": {
    "type": "image/png",
    "etag": "\"1669f-z8xcccOKu9vHlHJ3/z0Wdp6Qyxg\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 132822.png"
  },
  "/op_projects/Screenshot 2022-06-26 132834.png": {
    "type": "image/png",
    "etag": "\"119f4-vxeN93IqejXXvbl6LagJa4EjmA0\"",
    "mtime": "2022-06-26T02:46:18.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 132834.png"
  },
  "/op_projects/Screenshot 2022-06-26 132855.png": {
    "type": "image/png",
    "etag": "\"12f0a-AFpUUBR5CzboWTjc44kLfYXYeTQ\"",
    "mtime": "2022-06-26T02:47:34.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 132855.png"
  },
  "/op_projects/Screenshot 2022-06-26 133528.png": {
    "type": "image/png",
    "etag": "\"198c3-E4wt+lHd2cEVYXzl6CwY5PT906s\"",
    "mtime": "2022-06-26T02:47:34.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 133528.png"
  },
  "/op_projects/Screenshot 2022-06-26 133602.png": {
    "type": "image/png",
    "etag": "\"1c7f7-4BV6YAFBnS/3f2kiscvgV+DdWbM\"",
    "mtime": "2022-06-26T02:47:34.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 133602.png"
  },
  "/op_projects/Screenshot 2022-06-26 134138.png": {
    "type": "image/png",
    "etag": "\"36bb-8UKuvgNtK9pxmAMIAbz8AEAqvj4\"",
    "mtime": "2022-06-26T02:47:34.000Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 134138.png"
  },
  "/op_projects/Screenshot 2022-06-26 143147.png": {
    "type": "image/png",
    "etag": "\"3d95a-OV+4L+eW0Am0JlTmNvFPG6U3d2g\"",
    "mtime": "2022-06-26T09:01:54.081Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 143147.png"
  },
  "/op_projects/Screenshot 2022-06-26 143229.png": {
    "type": "image/png",
    "etag": "\"3c2f1-vqUMQSa4oR0zYIahX9R5AbnpWc8\"",
    "mtime": "2022-06-26T09:02:32.347Z",
    "path": "../public/op_projects/Screenshot 2022-06-26 143229.png"
  },
  "/op_projects/security.json": {
    "type": "application/json",
    "etag": "\"e835-vsKNBRVBH7bQ10KyexhGzlL6lyU\"",
    "mtime": "2022-07-10T14:28:54.063Z",
    "path": "../public/op_projects/security.json"
  },
  "/op_projects/seo.json": {
    "type": "application/json",
    "etag": "\"12bf2-rQ4muSur5p5IDAWlCV210GjWg3w\"",
    "mtime": "2022-07-10T14:28:32.332Z",
    "path": "../public/op_projects/seo.json"
  },
  "/op_projects/technology.json": {
    "type": "application/json",
    "etag": "\"7fc25-2mNY5jP+z48sOdtkOK0d9uNobe8\"",
    "mtime": "2022-07-11T07:15:21.696Z",
    "path": "../public/op_projects/technology.json"
  },
  "/op_projects/Untitled.png": {
    "type": "image/png",
    "etag": "\"b57f-QElyQp4Vt6V51iJGdW+ByXCdxCs\"",
    "mtime": "2022-06-26T02:47:34.000Z",
    "path": "../public/op_projects/Untitled.png"
  },
  "/op_projects/website.json": {
    "type": "application/json",
    "etag": "\"2fd1-miEgKCDJ//2jM6Cv9I3NTtId3hU\"",
    "mtime": "2022-07-10T14:28:02.175Z",
    "path": "../public/op_projects/website.json"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.08 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"b0ae-8LbWDGOl26c9j5XxrECvsECazVE\"",
    "mtime": "2022-06-26T02:47:34.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.08 PM (1).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.08 PM (2).jpeg": {
    "type": "image/jpeg",
    "etag": "\"bf25-yWrI7oTr4axga+iPGV/usNVKeIg\"",
    "mtime": "2022-06-26T02:47:34.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.08 PM (2).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.08 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"bbeb-ms5UzTTm39nzLsAzrG2Dg7svhro\"",
    "mtime": "2022-06-26T02:47:36.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.08 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.09 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"f8b4-j3D29LnXdhm+oFHtp5Hs7geeQkE\"",
    "mtime": "2022-06-26T02:47:36.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.09 PM (1).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.09 PM (2).jpeg": {
    "type": "image/jpeg",
    "etag": "\"f8b4-j3D29LnXdhm+oFHtp5Hs7geeQkE\"",
    "mtime": "2022-06-26T02:47:36.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.09 PM (2).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.09 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"5519-Qo/18EJWP701d0DT8UeUf57Cpng\"",
    "mtime": "2022-06-26T02:47:36.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.09 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.10 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"a9b8-To5X6YSc3EHe1+YWZxD6KGMWeT4\"",
    "mtime": "2022-06-26T02:47:36.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.10 PM (1).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.10 PM (2).jpeg": {
    "type": "image/jpeg",
    "etag": "\"7b3e-y+K1uJr7yJC+DFlQMu1ST0t2sKw\"",
    "mtime": "2022-06-26T02:47:36.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.10 PM (2).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.11 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"105cb-iMQR9gIxRz9YCJfY3D7ompuKogE\"",
    "mtime": "2022-06-26T02:48:36.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.11 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.12 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"1add1-dwAQvdZG41XFC/owPpb/zzJdnao\"",
    "mtime": "2022-06-26T02:48:36.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.12 PM (1).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.12 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"f296-7NuEsif1vgMPJ9aaN3ZdJEGbIBI\"",
    "mtime": "2022-06-26T02:49:26.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.12 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.13 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"7d32-KrDhDptb2Pf1030HLSi+IiEZ/bg\"",
    "mtime": "2022-06-26T02:48:36.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.13 PM (1).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.13 PM (2).jpeg": {
    "type": "image/jpeg",
    "etag": "\"dd0f-xPiKOsazol297N3vHXtMBBXGQnE\"",
    "mtime": "2022-06-26T02:49:26.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.13 PM (2).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.13 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"a7ea-b9uCZsQfAi4L+ZGhEPgmZSuTTlA\"",
    "mtime": "2022-06-26T02:49:26.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.13 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.05.14 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"ea4f-Rf/hobqHqCBCUOMQlnCFdNZQ52Q\"",
    "mtime": "2022-06-26T02:49:26.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.05.14 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.33.51 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"10a4b-kGtTRpr2vksdjAU16MTQzG5sg0Y\"",
    "mtime": "2022-06-26T02:49:26.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.33.51 PM (1).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.33.52 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"97a2-5pgTeQlOBVbMHDljHx9Kl7dgvZw\"",
    "mtime": "2022-06-26T02:49:26.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.33.52 PM (1).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.33.52 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"e1e3-ff/QJ2xwiSJU/wpmXizOR2wYyPw\"",
    "mtime": "2022-06-26T02:49:26.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.33.52 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.33.53 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"1cefa-BpAIkzNxzBth8wulR3XZHIrE+Bc\"",
    "mtime": "2022-06-26T02:50:16.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.33.53 PM (1).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.33.53 PM (2).jpeg": {
    "type": "image/jpeg",
    "etag": "\"10593-3JGlYb1KSi8RV1ZGuP4ZD6jVqtA\"",
    "mtime": "2022-06-26T02:50:16.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.33.53 PM (2).jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.33.53 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"a58d-kVhICv3tN7XvrAg6r+lNgu0MCtQ\"",
    "mtime": "2022-06-26T02:50:16.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.33.53 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.37.23 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"f710-4P0a1fiVzssve81Brqvz5iF01d0\"",
    "mtime": "2022-06-26T02:50:16.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.37.23 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.38.17 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"d976-9iHgjda0SweeM4YeSixiR9ilKdU\"",
    "mtime": "2022-06-26T02:50:16.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.38.17 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.38.46 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"174be-SP8EXMwTyVyTcGBXMTwFDK2aJdQ\"",
    "mtime": "2022-06-26T02:50:16.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.38.46 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.39.18 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"186e4-BUzLn1CqsADf570+LKUrI1IJaZ0\"",
    "mtime": "2022-06-26T02:50:16.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.39.18 PM.jpeg"
  },
  "/op_projects/WhatsApp Image 2022-06-26 at 1.39.26 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"110d5-NO+mmQ5ib99BU8to3jvCgeFbXZw\"",
    "mtime": "2022-06-26T02:50:16.000Z",
    "path": "../public/op_projects/WhatsApp Image 2022-06-26 at 1.39.26 PM.jpeg"
  },
  "/project/Screenshot 2022-06-26 124119.png": {
    "type": "image/png",
    "etag": "\"7c5a6-FyepWBD83/F+2LMae2+VT8VYHE0\"",
    "mtime": "2022-06-26T07:11:37.695Z",
    "path": "../public/project/Screenshot 2022-06-26 124119.png"
  },
  "/project/Screenshot 2022-06-26 124158.png": {
    "type": "image/png",
    "etag": "\"6ae6a-cA0gawORCKZP8Pc1ypD6dbdMOrA\"",
    "mtime": "2022-06-26T07:12:01.236Z",
    "path": "../public/project/Screenshot 2022-06-26 124158.png"
  },
  "/project/Screenshot 2022-06-26 124244.png": {
    "type": "image/png",
    "etag": "\"691a7-IdakPTv8XwUYZFVDxcqEB06scl8\"",
    "mtime": "2022-06-26T07:12:46.065Z",
    "path": "../public/project/Screenshot 2022-06-26 124244.png"
  },
  "/project/Screenshot 2022-06-26 124417.png": {
    "type": "image/png",
    "etag": "\"a653-YPaC/l+BNfLel9qSFe/+pxbPOoU\"",
    "mtime": "2022-06-26T07:14:19.376Z",
    "path": "../public/project/Screenshot 2022-06-26 124417.png"
  },
  "/project/Screenshot 2022-06-26 124633.png": {
    "type": "image/png",
    "etag": "\"24864-nYbAUy3iSKPLACX8IgPOTzqKGLk\"",
    "mtime": "2022-06-26T07:16:44.941Z",
    "path": "../public/project/Screenshot 2022-06-26 124633.png"
  },
  "/project/Screenshot 2022-06-26 124723.png": {
    "type": "image/png",
    "etag": "\"17f86-6aP1o2BqZxV4zv3yET4ZuGDFdLI\"",
    "mtime": "2022-06-26T07:17:26.710Z",
    "path": "../public/project/Screenshot 2022-06-26 124723.png"
  },
  "/project/Screenshot 2022-06-26 124819.png": {
    "type": "image/png",
    "etag": "\"8f521-spqHX8AblfJzQUaF91a5+0hfrlc\"",
    "mtime": "2022-06-26T07:18:22.431Z",
    "path": "../public/project/Screenshot 2022-06-26 124819.png"
  },
  "/project/Screenshot 2022-06-26 125000.png": {
    "type": "image/png",
    "etag": "\"1216e-vNKO52VbfoGM6euPMav1PsffraQ\"",
    "mtime": "2022-06-26T07:20:02.735Z",
    "path": "../public/project/Screenshot 2022-06-26 125000.png"
  },
  "/project/Screenshot 2022-06-26 125045.png": {
    "type": "image/png",
    "etag": "\"58ba-EN3cp2mdctbO8Qtag5LEIM5OCME\"",
    "mtime": "2022-06-26T07:20:48.128Z",
    "path": "../public/project/Screenshot 2022-06-26 125045.png"
  },
  "/project/Screenshot 2022-06-26 125301.png": {
    "type": "image/png",
    "etag": "\"1a0434-cdDb0wGrp+EAjguO7gqRQaZOFJM\"",
    "mtime": "2022-06-26T07:23:03.644Z",
    "path": "../public/project/Screenshot 2022-06-26 125301.png"
  },
  "/project/Screenshot 2022-06-26 125403.png": {
    "type": "image/png",
    "etag": "\"1c9061-mMkWYVfs5MvTLqg9dOUZS/XDczQ\"",
    "mtime": "2022-06-26T07:24:05.296Z",
    "path": "../public/project/Screenshot 2022-06-26 125403.png"
  },
  "/project/Screenshot 2022-06-26 125529.png": {
    "type": "image/png",
    "etag": "\"3ec5f-KNg96GhmTDXFCbG4nscAAwS44HQ\"",
    "mtime": "2022-06-26T07:25:31.710Z",
    "path": "../public/project/Screenshot 2022-06-26 125529.png"
  },
  "/project/Screenshot 2022-06-26 125547.png": {
    "type": "image/png",
    "etag": "\"5096b-P1xZSu9NYsjCw2ywZelF0uVFMis\"",
    "mtime": "2022-06-26T07:25:49.681Z",
    "path": "../public/project/Screenshot 2022-06-26 125547.png"
  },
  "/project/Screenshot 2022-06-26 125605.png": {
    "type": "image/png",
    "etag": "\"9545d-z8apzrgaLbvOe7nQTMK1T+wyt7Q\"",
    "mtime": "2022-06-26T07:26:07.117Z",
    "path": "../public/project/Screenshot 2022-06-26 125605.png"
  },
  "/project/Screenshot 2022-06-26 125629.png": {
    "type": "image/png",
    "etag": "\"1687b-mXzxHEq/Jbb369BtMtLQl1WT/E8\"",
    "mtime": "2022-06-26T07:26:31.312Z",
    "path": "../public/project/Screenshot 2022-06-26 125629.png"
  },
  "/project/Screenshot 2022-06-26 125658.png": {
    "type": "image/png",
    "etag": "\"1070f-LKrogjkR5TAKbJsKSmU7cI5K2Rc\"",
    "mtime": "2022-06-26T07:27:00.632Z",
    "path": "../public/project/Screenshot 2022-06-26 125658.png"
  },
  "/project/Screenshot 2022-06-26 125722.png": {
    "type": "image/png",
    "etag": "\"eba3-cgPe/dq7GtW8mhzDqSsb/lgy1Bw\"",
    "mtime": "2022-06-26T07:27:24.749Z",
    "path": "../public/project/Screenshot 2022-06-26 125722.png"
  },
  "/project/Screenshot 2022-06-26 125745.png": {
    "type": "image/png",
    "etag": "\"41353-tKROTENEYeWvUnZHhZ58tHOmC0w\"",
    "mtime": "2022-06-26T07:27:48.628Z",
    "path": "../public/project/Screenshot 2022-06-26 125745.png"
  },
  "/project/Screenshot 2022-06-26 125805.png": {
    "type": "image/png",
    "etag": "\"2c397-0P9hHDXep2GvvxCBhIOkH0ABYR0\"",
    "mtime": "2022-06-26T07:28:07.868Z",
    "path": "../public/project/Screenshot 2022-06-26 125805.png"
  },
  "/project/Screenshot 2022-06-26 125826.png": {
    "type": "image/png",
    "etag": "\"1b4bc-jHaLyLkoNq6zTnyRXp0U+eX8wGg\"",
    "mtime": "2022-06-26T07:28:27.864Z",
    "path": "../public/project/Screenshot 2022-06-26 125826.png"
  },
  "/project/Screenshot 2022-06-26 125902.png": {
    "type": "image/png",
    "etag": "\"15a4b-0dO7mmTFfA8LLoqK+7sgFlQA4OM\"",
    "mtime": "2022-06-26T07:29:05.313Z",
    "path": "../public/project/Screenshot 2022-06-26 125902.png"
  },
  "/project/Screenshot 2022-06-26 125919.png": {
    "type": "image/png",
    "etag": "\"21dfd-kNT0Lf5Esegul3JqWoxdVuXmVbM\"",
    "mtime": "2022-06-26T07:29:21.740Z",
    "path": "../public/project/Screenshot 2022-06-26 125919.png"
  },
  "/project/Screenshot 2022-06-26 125934.png": {
    "type": "image/png",
    "etag": "\"267db-fB2YAlbwKcI5/9sgJiKpTGROZjc\"",
    "mtime": "2022-06-26T07:29:36.834Z",
    "path": "../public/project/Screenshot 2022-06-26 125934.png"
  },
  "/project/Screenshot 2022-06-26 125948.png": {
    "type": "image/png",
    "etag": "\"2697c-B0OBsc+5GAnD4XBQkiHPCCOQawc\"",
    "mtime": "2022-06-26T07:29:50.111Z",
    "path": "../public/project/Screenshot 2022-06-26 125948.png"
  },
  "/project/Screenshot 2022-06-26 130000.png": {
    "type": "image/png",
    "etag": "\"270f1-Ks+fnkAFbqlo7o53dCTAdmI8kXY\"",
    "mtime": "2022-06-26T07:30:01.979Z",
    "path": "../public/project/Screenshot 2022-06-26 130000.png"
  },
  "/project/Screenshot 2022-06-26 131341.png": {
    "type": "image/png",
    "etag": "\"5e76a-n5P1lBAjsqAUaQm9Vvk72Y6ksA0\"",
    "mtime": "2022-06-26T07:43:44.335Z",
    "path": "../public/project/Screenshot 2022-06-26 131341.png"
  },
  "/project/Screenshot 2022-06-26 131630.png": {
    "type": "image/png",
    "etag": "\"702ab-sNoxa+Ovp0g7cTDpPvrUEsPHoKM\"",
    "mtime": "2022-06-26T07:46:33.143Z",
    "path": "../public/project/Screenshot 2022-06-26 131630.png"
  },
  "/project/Screenshot 2022-06-26 131859.png": {
    "type": "image/png",
    "etag": "\"1bab18-wdiLOx/X7WjCJx8gLzDpZrydL4k\"",
    "mtime": "2022-06-26T07:49:02.195Z",
    "path": "../public/project/Screenshot 2022-06-26 131859.png"
  },
  "/project/Screenshot 2022-06-26 131940.png": {
    "type": "image/png",
    "etag": "\"1ae0ea-dyx7U62VO/x6hIqbIlc7uChzvjI\"",
    "mtime": "2022-06-26T07:49:42.907Z",
    "path": "../public/project/Screenshot 2022-06-26 131940.png"
  },
  "/project/Screenshot 2022-06-26 131952.png": {
    "type": "image/png",
    "etag": "\"a95cf-iUhvYXq2qbd4QVR8cSOD9NPZ+84\"",
    "mtime": "2022-06-26T07:49:54.644Z",
    "path": "../public/project/Screenshot 2022-06-26 131952.png"
  },
  "/project/Screenshot 2022-06-26 132039.png": {
    "type": "image/png",
    "etag": "\"101a17-ZWFQsWzkLiJcdpeMF7hAS8K21zo\"",
    "mtime": "2022-06-26T07:50:42.345Z",
    "path": "../public/project/Screenshot 2022-06-26 132039.png"
  },
  "/project/Screenshot 2022-06-26 132550.png": {
    "type": "image/png",
    "etag": "\"d0e5-I+u9bVAyie/4GhlG0ivXvxUCb88\"",
    "mtime": "2022-06-26T07:56:03.510Z",
    "path": "../public/project/Screenshot 2022-06-26 132550.png"
  },
  "/project/Screenshot 2022-06-26 132635.png": {
    "type": "image/png",
    "etag": "\"370cf-Oa/0qu80lersE5n5ENTdww7uQDg\"",
    "mtime": "2022-06-26T07:56:38.166Z",
    "path": "../public/project/Screenshot 2022-06-26 132635.png"
  },
  "/project/Screenshot 2022-06-26 132726.png": {
    "type": "image/png",
    "etag": "\"3088d-kKSaq3gBVJkmVGPecIJ+JZ3f6wo\"",
    "mtime": "2022-06-26T07:57:28.491Z",
    "path": "../public/project/Screenshot 2022-06-26 132726.png"
  },
  "/project/Screenshot 2022-06-26 132738.png": {
    "type": "image/png",
    "etag": "\"29557-jKtHQ+XosSH1JC3nph3HYx4Be9A\"",
    "mtime": "2022-06-26T07:57:41.256Z",
    "path": "../public/project/Screenshot 2022-06-26 132738.png"
  },
  "/project/Screenshot 2022-06-26 132808.png": {
    "type": "image/png",
    "etag": "\"28912-qykGHoLBvDBldp9vBB3UVJ3DOd4\"",
    "mtime": "2022-06-26T07:58:10.062Z",
    "path": "../public/project/Screenshot 2022-06-26 132808.png"
  },
  "/project/Screenshot 2022-06-26 132822.png": {
    "type": "image/png",
    "etag": "\"32e37-iXvZG8m3Hrs4fupOCs15xVsWXzk\"",
    "mtime": "2022-06-26T07:58:23.986Z",
    "path": "../public/project/Screenshot 2022-06-26 132822.png"
  },
  "/project/Screenshot 2022-06-26 132834.png": {
    "type": "image/png",
    "etag": "\"280fa-Pj79UjIZ3+nzjfb+YqjWntwuZ94\"",
    "mtime": "2022-06-26T07:58:36.539Z",
    "path": "../public/project/Screenshot 2022-06-26 132834.png"
  },
  "/project/Screenshot 2022-06-26 132855.png": {
    "type": "image/png",
    "etag": "\"2e341-ZgJ0p91A0tlgMzA97GN2arF5rEc\"",
    "mtime": "2022-06-26T07:58:56.931Z",
    "path": "../public/project/Screenshot 2022-06-26 132855.png"
  },
  "/project/Screenshot 2022-06-26 133528.png": {
    "type": "image/png",
    "etag": "\"5d825-Hp0WsbqzPOkjp+avyBWvDgVWJ/U\"",
    "mtime": "2022-06-26T08:05:31.127Z",
    "path": "../public/project/Screenshot 2022-06-26 133528.png"
  },
  "/project/Screenshot 2022-06-26 133602.png": {
    "type": "image/png",
    "etag": "\"49c15-p95l7NoqmSnAZ/77yhuKV8K5TK0\"",
    "mtime": "2022-06-26T08:06:04.274Z",
    "path": "../public/project/Screenshot 2022-06-26 133602.png"
  },
  "/project/Screenshot 2022-06-26 134138.png": {
    "type": "image/png",
    "etag": "\"a0f3-N0/ZmpWcBNvblaK7v3tCIuH5MU8\"",
    "mtime": "2022-06-26T08:11:41.013Z",
    "path": "../public/project/Screenshot 2022-06-26 134138.png"
  },
  "/project/Untitled.png": {
    "type": "image/png",
    "etag": "\"1c90a-Vb7scvDbUzm87J66jMv5h2zRudo\"",
    "mtime": "2022-06-26T07:38:04.979Z",
    "path": "../public/project/Untitled.png"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.08 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"20229-DY74mU5TqrlVXGZojejIhXYVyxA\"",
    "mtime": "2022-06-26T07:38:35.285Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.08 PM (1).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.08 PM (2).jpeg": {
    "type": "image/jpeg",
    "etag": "\"24d29-MI39u5YqHjU4mDUfK++cMQYsxpo\"",
    "mtime": "2022-06-26T07:38:37.923Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.08 PM (2).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.08 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"2272e-QRNnlzWZF6bauUTxQsIHw8Foir8\"",
    "mtime": "2022-06-26T07:38:31.578Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.08 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.09 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"2d7ff-11ZPFFZUDrnWkDiZ2q/fBxtwDF8\"",
    "mtime": "2022-06-26T07:38:41.823Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.09 PM (1).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.09 PM (2).jpeg": {
    "type": "image/jpeg",
    "etag": "\"2d7ff-11ZPFFZUDrnWkDiZ2q/fBxtwDF8\"",
    "mtime": "2022-06-26T07:38:44.165Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.09 PM (2).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.09 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"9257-Wt0zpI8ByaL1xvnUA4OAQp9VQro\"",
    "mtime": "2022-06-26T07:38:40.079Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.09 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.10 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"10f5e-oGpMDudcZkmJhhJYu4FmjSrGNMo\"",
    "mtime": "2022-06-26T07:38:48.643Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.10 PM (1).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.10 PM (2).jpeg": {
    "type": "image/jpeg",
    "etag": "\"15948-/yNej7rjnwP5XExSoqJfcRO9f4U\"",
    "mtime": "2022-06-26T07:39:06.507Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.10 PM (2).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.10 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"1255d-d0NtyYHmfePS4zKPOXJ5o79/210\"",
    "mtime": "2022-06-26T07:38:46.210Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.10 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.11 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"1111d-0g0Xfmbp0Ro+5CzaLb/VAgVYZgA\"",
    "mtime": "2022-06-26T07:39:11.128Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.11 PM (1).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.11 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"1b983-r7GYQ0a+d7nnScwsaV7ui/z3QJI\"",
    "mtime": "2022-06-26T07:39:08.722Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.11 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.12 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"2ea80-cLKE+hYTj2Vvy6+3wu/G4z+Y0lk\"",
    "mtime": "2022-06-26T07:39:15.675Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.12 PM (1).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.12 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"2bf9b-bl/LmT0GOqHpZGLsoyoMC9V7WBM\"",
    "mtime": "2022-06-26T07:39:13.378Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.12 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.13 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"c545-4YLzbPLUsREulw0e9R9hVOQwuRc\"",
    "mtime": "2022-06-26T07:39:20.239Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.13 PM (1).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.13 PM (2).jpeg": {
    "type": "image/jpeg",
    "etag": "\"17e01-qTGGYWgyrt0tfYrIJqIGbHEFPNY\"",
    "mtime": "2022-06-26T07:39:22.582Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.13 PM (2).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.13 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"108b2-yyAEg0HlosWZZ6Tg1eoYT5b+Tuk\"",
    "mtime": "2022-06-26T07:39:18.094Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.13 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.05.14 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"19fc6-p0o5Rhi3mX8t2cXkubIvhFnyRS8\"",
    "mtime": "2022-06-26T07:39:25.229Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.05.14 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.33.51 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"1e488-hi9wCLlaakOh3HgZCuUeCnST7MM\"",
    "mtime": "2022-06-26T08:10:13.747Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.33.51 PM (1).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.33.52 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"1223c-uWDp+UHlvBEgDDj70EjeMC+eDAs\"",
    "mtime": "2022-06-26T08:10:20.924Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.33.52 PM (1).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.33.52 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"2c890-BBT5jlTkzypbyLvJAnEuT7h1Py0\"",
    "mtime": "2022-06-26T08:10:17.156Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.33.52 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.33.53 PM (1).jpeg": {
    "type": "image/jpeg",
    "etag": "\"1f23e-GEdayLVnZ+Y1wgAeJTYzjBE0q/M\"",
    "mtime": "2022-06-26T08:10:26.866Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.33.53 PM (1).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.33.53 PM (2).jpeg": {
    "type": "image/jpeg",
    "etag": "\"135d0-FTbFqSmQZpeSb10gI7Y9yuA6cEA\"",
    "mtime": "2022-06-26T08:10:28.831Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.33.53 PM (2).jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.33.53 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"12f5c-jRaQb+BTLtymkylDcr+78/WB9f8\"",
    "mtime": "2022-06-26T08:10:24.696Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.33.53 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.37.23 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"22cd9-FWBn87iv6POqvsbE2JnNcfnQ07M\"",
    "mtime": "2022-06-26T08:10:33.252Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.37.23 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.38.17 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"1e329-lcQdV03U1GrqfR/BVit5PCXeS3w\"",
    "mtime": "2022-06-26T08:10:35.996Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.38.17 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.38.46 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"33eab-aqRzrod4gcru3eeAzuST4mzdve8\"",
    "mtime": "2022-06-26T08:10:38.663Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.38.46 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.39.18 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"33c7d-ZajmOmv3pHYEgKpxHwoLJfznS+8\"",
    "mtime": "2022-06-26T08:10:45.302Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.39.18 PM.jpeg"
  },
  "/project/WhatsApp Image 2022-06-26 at 1.39.26 PM.jpeg": {
    "type": "image/jpeg",
    "etag": "\"2b088-keZS5D6lS0LZK0QZ7fKV4Iva+W8\"",
    "mtime": "2022-06-26T08:10:48.189Z",
    "path": "../public/project/WhatsApp Image 2022-06-26 at 1.39.26 PM.jpeg"
  },
  "/setting/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.441Z",
    "path": "../public/setting/index.html"
  },
  "/test/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.444Z",
    "path": "../public/test/index.html"
  },
  "/_nuxt/404-a33381dc.mjs": {
    "type": "application/javascript",
    "etag": "\"c8d-814oz46dwQ5QmcGce5g1mlSoB58\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/404-a33381dc.mjs"
  },
  "/_nuxt/about-bc62a148.mjs": {
    "type": "application/javascript",
    "etag": "\"3f5-mTaRO9JRNbdsGpY/kc+ZMFILxYE\"",
    "mtime": "2022-09-01T06:26:22.633Z",
    "path": "../public/_nuxt/about-bc62a148.mjs"
  },
  "/_nuxt/Anchor-ba2e7e32.mjs": {
    "type": "application/javascript",
    "etag": "\"394-34syR2l6P692NGC2hxOopf/o45Y\"",
    "mtime": "2022-09-01T06:26:22.635Z",
    "path": "../public/_nuxt/Anchor-ba2e7e32.mjs"
  },
  "/_nuxt/blank-4b506b8a.mjs": {
    "type": "application/javascript",
    "etag": "\"316-RPycoIBMQtMWridlaxQ3gAYvvlw\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/blank-4b506b8a.mjs"
  },
  "/_nuxt/Button-f8ff6187.mjs": {
    "type": "application/javascript",
    "etag": "\"79e-zIjSLhQ9WgXVM1W9tvv0ITYaig4\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/Button-f8ff6187.mjs"
  },
  "/_nuxt/contact-05232d2a.mjs": {
    "type": "application/javascript",
    "etag": "\"2b25-pS6mNPRWGHN7T7VqVDOKSz8uWo0\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/contact-05232d2a.mjs"
  },
  "/_nuxt/cookie.5ee6cfbe.png": {
    "type": "image/png",
    "etag": "\"5c9c-xITN3Sd6/XdbyJPjSkryRElO4P4\"",
    "mtime": "2022-09-01T06:26:22.633Z",
    "path": "../public/_nuxt/cookie.5ee6cfbe.png"
  },
  "/_nuxt/dashboard-00aeac3c.mjs": {
    "type": "application/javascript",
    "etag": "\"1350-hrE7ePabnKYoACPk9fB+GwtvmNI\"",
    "mtime": "2022-09-01T06:26:22.635Z",
    "path": "../public/_nuxt/dashboard-00aeac3c.mjs"
  },
  "/_nuxt/entry-9b9d7b16.mjs": {
    "type": "application/javascript",
    "etag": "\"e110c-b9hPPfbVfTcckUjpeFn/BfdacsE\"",
    "mtime": "2022-09-01T06:26:22.641Z",
    "path": "../public/_nuxt/entry-9b9d7b16.mjs"
  },
  "/_nuxt/entry.5a7d4f14.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"2c3af-uHavUmC/tIcoDxE/9PYvLrseCl0\"",
    "mtime": "2022-09-01T06:26:22.643Z",
    "path": "../public/_nuxt/entry.5a7d4f14.css"
  },
  "/_nuxt/Footer-debe466b.mjs": {
    "type": "application/javascript",
    "etag": "\"6d01-v+paUDLH4BF742C+9HJGc8Z9t0w\"",
    "mtime": "2022-09-01T06:26:22.635Z",
    "path": "../public/_nuxt/Footer-debe466b.mjs"
  },
  "/_nuxt/Footer.cc8d9db6.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"264-7ZPAOjb9jWEIyY8zoFl6DemP+lY\"",
    "mtime": "2022-09-01T06:26:22.641Z",
    "path": "../public/_nuxt/Footer.cc8d9db6.css"
  },
  "/_nuxt/index-401637c1.mjs": {
    "type": "application/javascript",
    "etag": "\"7cc-bntsvgVWHp7ozQDrVicaSPvUa74\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/index-401637c1.mjs"
  },
  "/_nuxt/index-43dd643d.mjs": {
    "type": "application/javascript",
    "etag": "\"d3-iACEkCDtDd2simaGB2/FHwPW/fk\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/index-43dd643d.mjs"
  },
  "/_nuxt/index-afbc6706.mjs": {
    "type": "application/javascript",
    "etag": "\"19e4e6-tgGFMY5RpIgey0gKzTOfLRQ7btg\"",
    "mtime": "2022-09-01T06:26:22.657Z",
    "path": "../public/_nuxt/index-afbc6706.mjs"
  },
  "/_nuxt/index-bc4492c6.mjs": {
    "type": "application/javascript",
    "etag": "\"425-JZulsnrHpJ9HDdFhGgyG5+uwYus\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/index-bc4492c6.mjs"
  },
  "/_nuxt/index-fb54ca8d.mjs": {
    "type": "application/javascript",
    "etag": "\"978-bp6XGGXQRiGcHJ00P8E4YTNaJj0\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/index-fb54ca8d.mjs"
  },
  "/_nuxt/manifest.json": {
    "type": "application/json",
    "etag": "\"17a0-hrWm0d9ZR0jY6O7VJLR4TEgvLd8\"",
    "mtime": "2022-09-01T06:26:22.640Z",
    "path": "../public/_nuxt/manifest.json"
  },
  "/_nuxt/page-e831bbba.mjs": {
    "type": "application/javascript",
    "etag": "\"4664-m4bM8+KI6Ev9Ab5DMat/PSElc+0\"",
    "mtime": "2022-09-01T06:26:22.640Z",
    "path": "../public/_nuxt/page-e831bbba.mjs"
  },
  "/_nuxt/page.941d8c73.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"c6-kLjmBt4cVUoxL/DNn8+6+UHEPWc\"",
    "mtime": "2022-09-01T06:26:22.641Z",
    "path": "../public/_nuxt/page.941d8c73.css"
  },
  "/_nuxt/setting-ad564031.mjs": {
    "type": "application/javascript",
    "etag": "\"cf7-6hCqZqmcpIqcC7Wdry9JJw07+0g\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/setting-ad564031.mjs"
  },
  "/_nuxt/StarIcon-dd96e3e0.mjs": {
    "type": "application/javascript",
    "etag": "\"238-h6I+itkRHGhZOUisqxXEbcrjC8c\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/StarIcon-dd96e3e0.mjs"
  },
  "/_nuxt/test-763e54e2.mjs": {
    "type": "application/javascript",
    "etag": "\"b6b-ltQRB67yKw6pSS5KcoS6TumeGJM\"",
    "mtime": "2022-09-01T06:26:22.635Z",
    "path": "../public/_nuxt/test-763e54e2.mjs"
  },
  "/_nuxt/TextInput-1a224ba0.mjs": {
    "type": "application/javascript",
    "etag": "\"68e-1RBSnWyCbAMKwKsI3Gaetsbbu68\"",
    "mtime": "2022-09-01T06:26:22.635Z",
    "path": "../public/_nuxt/TextInput-1a224ba0.mjs"
  },
  "/_nuxt/useLang-784e82db.mjs": {
    "type": "application/javascript",
    "etag": "\"62-Ui6IWbaSV28e7QvurNL9pCPxGZk\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/useLang-784e82db.mjs"
  },
  "/_nuxt/useSetting-934bff9b.mjs": {
    "type": "application/javascript",
    "etag": "\"e0-eSiZWna3Wm/fO9gseepHQoaKaNc\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/useSetting-934bff9b.mjs"
  },
  "/_nuxt/Wrapper-cd4e6588.mjs": {
    "type": "application/javascript",
    "etag": "\"2a0-PdcgS01UDhLJ+U2j1PYTRq94PEc\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/Wrapper-cd4e6588.mjs"
  },
  "/_nuxt/_slug_-5e3417d0.mjs": {
    "type": "application/javascript",
    "etag": "\"4bd-MApndcbgJdSQWAq/nQdJR1vjnvs\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/_slug_-5e3417d0.mjs"
  },
  "/_nuxt/_slug_-a8892f0b.mjs": {
    "type": "application/javascript",
    "etag": "\"4bc-D2emPoxBdNCYh2lfpl3JczrpxeE\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/_slug_-a8892f0b.mjs"
  },
  "/_nuxt/_slug_-c41a501c.mjs": {
    "type": "application/javascript",
    "etag": "\"4cf-Xl5q2grivzMKhXnXcwMKXsZ/Gf8\"",
    "mtime": "2022-09-01T06:26:22.634Z",
    "path": "../public/_nuxt/_slug_-c41a501c.mjs"
  },
  "/pages/all/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.462Z",
    "path": "../public/pages/all/index.html"
  },
  "/portfolio/index/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.473Z",
    "path": "../public/portfolio/index/index.html"
  },
  "/portfolio/property-listing-mobile-app/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.476Z",
    "path": "../public/portfolio/property-listing-mobile-app/index.html"
  },
  "/services/all/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.453Z",
    "path": "../public/services/all/index.html"
  },
  "/services/application_development/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.470Z",
    "path": "../public/services/application_development/index.html"
  },
  "/services/index/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.450Z",
    "path": "../public/services/index/index.html"
  },
  "/services/web_development/index.html": {
    "type": "text/html; charset=utf-8",
    "etag": "\"164-ZyCqSkCvbK0VId4fTrVs6p0uEPk\"",
    "mtime": "2022-09-01T06:26:34.467Z",
    "path": "../public/services/web_development/index.html"
  }
};

function readAsset (id) {
  const serverDir = dirname(fileURLToPath(globalThis._importMeta_.url));
  return promises.readFile(resolve(serverDir, assets[id].path))
}

const publicAssetBases = ["/_nuxt"];

function isPublicAssetURL(id = '') {
  if (assets[id]) {
    return
  }
  for (const base of publicAssetBases) {
    if (id.startsWith(base)) { return true }
  }
  return false
}

function getAsset (id) {
  return assets[id]
}

const METHODS = ["HEAD", "GET"];
const _152570 = eventHandler(async (event) => {
  if (event.req.method && !METHODS.includes(event.req.method)) {
    return;
  }
  let id = decodeURIComponent(withLeadingSlash(withoutTrailingSlash(parseURL(event.req.url).pathname)));
  let asset;
  for (const _id of [id, id + "/index.html"]) {
    const _asset = getAsset(_id);
    if (_asset) {
      asset = _asset;
      id = _id;
      break;
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) {
      throw createError({
        statusMessage: "Cannot find static asset " + id,
        statusCode: 404
      });
    }
    return;
  }
  const ifNotMatch = event.req.headers["if-none-match"] === asset.etag;
  if (ifNotMatch) {
    event.res.statusCode = 304;
    event.res.end("Not Modified (etag)");
    return;
  }
  const ifModifiedSinceH = event.req.headers["if-modified-since"];
  if (ifModifiedSinceH && asset.mtime) {
    if (new Date(ifModifiedSinceH) >= new Date(asset.mtime)) {
      event.res.statusCode = 304;
      event.res.end("Not Modified (mtime)");
      return;
    }
  }
  if (asset.type) {
    event.res.setHeader("Content-Type", asset.type);
  }
  if (asset.etag) {
    event.res.setHeader("ETag", asset.etag);
  }
  if (asset.mtime) {
    event.res.setHeader("Last-Modified", asset.mtime);
  }
  const contents = await readAsset(id);
  event.res.end(contents);
});

const _lazy_339400 = () => import('./renderer.mjs');

const handlers = [
  { route: '', handler: _152570, lazy: false, middleware: true, method: undefined },
  { route: '/__nuxt_error', handler: _lazy_339400, lazy: true, middleware: false, method: undefined },
  { route: '/**', handler: _lazy_339400, lazy: true, middleware: false, method: undefined }
];

function createNitroApp() {
  const config = useRuntimeConfig();
  const hooks = createHooks();
  const h3App = createApp({
    debug: destr(false),
    onError: errorHandler
  });
  h3App.use(config.app.baseURL, timingMiddleware);
  const router = createRouter();
  const routerOptions = createRouter$1({ routes: config.nitro.routes });
  for (const h of handlers) {
    let handler = h.lazy ? lazyEventHandler(h.handler) : h.handler;
    const referenceRoute = h.route.replace(/:\w+|\*\*/g, "_");
    const routeOptions = routerOptions.lookup(referenceRoute) || {};
    if (routeOptions.swr) {
      handler = cachedEventHandler(handler, {
        group: "nitro/routes"
      });
    }
    if (h.middleware || !h.route) {
      const middlewareBase = (config.app.baseURL + (h.route || "/")).replace(/\/+/g, "/");
      h3App.use(middlewareBase, handler);
    } else {
      router.use(h.route, handler, h.method);
    }
  }
  h3App.use(config.app.baseURL, router);
  const localCall = createCall(h3App.nodeHandler);
  const localFetch = createFetch(localCall, globalThis.fetch);
  const $fetch = createFetch$1({ fetch: localFetch, Headers, defaults: { baseURL: config.app.baseURL } });
  globalThis.$fetch = $fetch;
  const app = {
    hooks,
    h3App,
    localCall,
    localFetch
  };
  for (const plugin of plugins) {
    plugin(app);
  }
  return app;
}
const nitroApp = createNitroApp();

const cert = process.env.NITRO_SSL_CERT;
const key = process.env.NITRO_SSL_KEY;
const server = cert && key ? new Server({ key, cert }, nitroApp.h3App.nodeHandler) : new Server$1(nitroApp.h3App.nodeHandler);
const port = destr(process.env.NITRO_PORT || process.env.PORT) || 3e3;
const hostname = process.env.NITRO_HOST || process.env.HOST || "0.0.0.0";
server.listen(port, hostname, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const protocol = cert && key ? "https" : "http";
  console.log(`Listening on ${protocol}://${hostname}:${port}${useRuntimeConfig().app.baseURL}`);
});
{
  process.on("unhandledRejection", (err) => console.error("[nitro] [dev] [unhandledRejection] " + err));
  process.on("uncaughtException", (err) => console.error("[nitro] [dev] [uncaughtException] " + err));
}
const nodeServer = {};

export { nodeServer as n, useRuntimeConfig as u };
//# sourceMappingURL=node-server.mjs.map
