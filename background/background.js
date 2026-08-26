const HEADER_CACHE_PREFIX = "webscope:headers:";
const REQUEST_TIMEOUT = 6000;

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type !== "main_frame" || details.tabId < 0) return;

    chrome.storage.session.set({
      [`${HEADER_CACHE_PREFIX}${details.tabId}`]: {
        url: details.url,
        status: details.statusCode,
        statusText: details.statusLine || "",
        headers: (details.responseHeaders || []).map(({ name, value }) => ({ name, value: value || "" })),
        capturedAt: Date.now()
      }
    });
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["responseHeaders"]
);

function headerValue(headers, name) {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function unavailable(value) {
  return value || "Unavailable";
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getCapturedHeaders(tab) {
  const key = `${HEADER_CACHE_PREFIX}${tab.id}`;
  const stored = (await chrome.storage.session.get(key))[key];
  const samePage = stored && new URL(stored.url).origin === new URL(tab.url).origin;
  if (samePage && Date.now() - stored.capturedAt < 15 * 60 * 1000) return stored;

  try {
    const response = await fetchWithTimeout(tab.url, { cache: "no-store", redirect: "follow" });
    return {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()].map(([name, value]) => ({ name, value })),
      capturedAt: Date.now(),
      source: "Live request"
    };
  } catch {
    return { url: tab.url, status: null, statusText: "", headers: [], capturedAt: Date.now(), source: "Unavailable" };
  }
}

async function resolveDnsRecord(hostname, type) {
  try {
    const response = await fetchWithTimeout(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { Accept: "application/dns-json" }, cache: "no-store" }
    );
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.Answer || []).filter((record) => record.type === type).map((record) => record.data);
  } catch {
    return [];
  }
}

async function getDns(hostname) {
  const [a, aaaa, cname] = await Promise.all([
    resolveDnsRecord(hostname, 1),
    resolveDnsRecord(hostname, 28),
    resolveDnsRecord(hostname, 5)
  ]);
  return { a, aaaa, cname };
}

async function getProvider(ip) {
  if (!ip) return { isp: "Unavailable", asn: "Unavailable" };
  try {
    const response = await fetchWithTimeout(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { cache: "no-store" });
    if (!response.ok) throw new Error("Provider lookup failed");
    const data = await response.json();
    return {
      isp: unavailable(data.org || data.network),
      asn: unavailable(data.asn)
    };
  } catch {
    return { isp: "Unavailable", asn: "Unavailable" };
  }
}

function detectCdn(headers, cname) {
  const normalizedHeaders = headers.map((header) => `${header.name}: ${header.value}`.toLowerCase()).join("\n");
  const normalizedDns = cname.join(" ").toLowerCase();
  const signals = `${normalizedHeaders}\n${normalizedDns}`;
  const providers = [
    ["Cloudflare", /cf-ray|cloudflare/],
    ["CloudFront", /cloudfront|x-amz-cf/],
    ["Fastly", /fastly|x-served-by/],
    ["Akamai", /akamai|akamaiedge/],
    ["Vercel", /vercel/],
    ["Netlify", /netlify/]
  ];
  const match = providers.find(([, pattern]) => pattern.test(signals));
  return match
    ? { name: match[0], evidence: "Response header or DNS signature" }
    : { name: "Not detected", evidence: "No recognized CDN signature" };
}

function detectHeaderTechnologies(headers) {
  const server = headerValue(headers, "server");
  const poweredBy = headerValue(headers, "x-powered-by");
  const generator = headerValue(headers, "x-generator");
  const findings = [];

  function add(name, category, evidence) {
    findings.push({ name, category, evidence: [evidence] });
  }

  if (/nginx/i.test(server)) add("Nginx", "Server", `Server header: ${server}`);
  if (/apache/i.test(server)) add("Apache", "Server", `Server header: ${server}`);
  if (/microsoft-iis/i.test(server)) add("Microsoft IIS", "Server", `Server header: ${server}`);
  if (/express/i.test(poweredBy)) add("Express", "Server", `X-Powered-By header: ${poweredBy}`);
  if (/php/i.test(poweredBy)) add("PHP", "Runtime", `X-Powered-By header: ${poweredBy}`);
  if (/wordpress/i.test(generator)) add("WordPress", "CMS", `X-Generator header: ${generator}`);
  if (/drupal/i.test(generator)) add("Drupal", "CMS", `X-Generator header: ${generator}`);

  return findings;
}

function getSecuritySnapshot(url, headers) {
  const secure = new URL(url).protocol === "https:";
  const checks = [
    ["HTTPS", secure, secure ? "The page is served over HTTPS" : "The page is not served over HTTPS"],
    ["HSTS", Boolean(headerValue(headers, "strict-transport-security")), "Strict-Transport-Security response header"],
    ["CSP", Boolean(headerValue(headers, "content-security-policy")), "Content-Security-Policy response header"],
    ["Frame protection", Boolean(headerValue(headers, "x-frame-options") || headerValue(headers, "content-security-policy").includes("frame-ancestors")), "X-Frame-Options or CSP frame-ancestors"],
    ["Referrer policy", Boolean(headerValue(headers, "referrer-policy")), "Referrer-Policy response header"],
    ["Permissions policy", Boolean(headerValue(headers, "permissions-policy")), "Permissions-Policy response header"]
  ];
  return checks.map(([name, present, evidence]) => ({ name, present, evidence }));
}

function mergeTechnologies(...groups) {
  const merged = new Map();
  groups.filter(Array.isArray).flat().forEach((item) => {
    const key = `${item.category}:${item.name}`;
    if (!merged.has(key)) merged.set(key, { name: item.name, category: item.category, evidence: [] });
    const result = merged.get(key);
    (item.evidence || []).forEach((evidence) => {
      if (!result.evidence.includes(evidence)) result.evidence.push(evidence);
    });
  });
  return [...merged.values()]
    .map((item) => ({ ...item, evidence: item.evidence.sort() }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

// This function runs in the inspected page's main JavaScript world so it can
// see framework runtime markers that are intentionally isolated from extension
// content scripts. It returns plain data only; it never modifies the page.
function collectMainWorldTechnologies() {
  const findings = new Map();
  const urls = [
    ...[...document.scripts].map((script) => script.src),
    ...performance.getEntriesByType("resource").map((entry) => entry.name)
  ].filter(Boolean).join("\n").toLowerCase();

  function add(name, category, evidence) {
    const key = `${category}:${name}`;
    if (!findings.has(key)) findings.set(key, { name, category, evidence: [] });
    const item = findings.get(key);
    if (!item.evidence.includes(evidence)) item.evidence.push(evidence);
  }

  function safe(check) {
    try {
      return Boolean(check());
    } catch {
      return false;
    }
  }

  function hasUrl(pattern) {
    return pattern.test(urls);
  }

  function hasElementProperty(pattern) {
    const nodes = [document.documentElement, document.body, ...[...document.querySelectorAll("body *")].slice(0, 750)].filter(Boolean);
    return nodes.some((node) => {
      try {
        return Object.getOwnPropertyNames(node).some((name) => pattern.test(name));
      } catch {
        return false;
      }
    });
  }

  if (document.getElementById("__NEXT_DATA__") || safe(() => window.next?.router) || hasUrl(/\/_next\//)) {
    add("Next.js", "Framework", document.getElementById("__NEXT_DATA__") ? "#__NEXT_DATA__ page payload" : hasUrl(/\/_next\//) ? "Loaded resource path contains /_next/" : "Next.js runtime global");
  }

  if (safe(() => window.__REACT_DEVTOOLS_GLOBAL_HOOK__) || hasElementProperty(/^__(?:reactFiber|reactProps|reactContainer)\$/) || document.querySelector("[data-reactroot], [data-reactid]")) {
    add("React", "Framework", hasElementProperty(/^__(?:reactFiber|reactProps|reactContainer)\$/) ? "React runtime property attached to a DOM node" : safe(() => window.__REACT_DEVTOOLS_GLOBAL_HOOK__) ? "React runtime global hook" : "React root attribute in DOM");
  }

  if (document.querySelector("[ng-version]") || safe(() => window.getAllAngularRootElements || window.ng?.getComponent) || hasElementProperty(/^__ngContext__$/)) {
    add("Angular", "Framework", document.querySelector("[ng-version]") ? "ng-version attribute in DOM" : hasElementProperty(/^__ngContext__$/) ? "Angular context property attached to a DOM node" : "Angular runtime global API");
  }

  if (document.querySelector("[data-v-app]") || safe(() => window.__VUE__ || window.__VUE_DEVTOOLS_GLOBAL_HOOK__) || hasElementProperty(/^__(?:vue_app__|vueParentComponent)$/)) {
    add("Vue.js", "Framework", document.querySelector("[data-v-app]") ? "data-v-app root attribute in DOM" : hasElementProperty(/^__(?:vue_app__|vueParentComponent)$/) ? "Vue runtime property attached to a DOM node" : "Vue runtime global hook");
  }

  if (safe(() => window.jQuery?.fn?.jquery || window.$?.fn?.jquery)) {
    const version = window.jQuery?.fn?.jquery || window.$?.fn?.jquery;
    add("jQuery", "Library", `jQuery global API (v${version})`);
  }
  if (safe(() => window.bootstrap?.Modal)) add("Bootstrap", "Library", "Bootstrap runtime global API");

  if (safe(() => window.drupalSettings)) add("Drupal", "CMS", "drupalSettings runtime global");
  if (safe(() => window.Shopify?.theme || window.Shopify?.shop)) add("Shopify", "CMS", "Shopify runtime global");
  if (safe(() => window.wp?.api || window.wpApiSettings)) add("WordPress", "CMS", "WordPress runtime global");

  if (safe(() => typeof window.gtag === "function" || typeof window.ga === "function")) add("Google Analytics", "Analytics", "gtag or ga runtime global");
  if (safe(() => Array.isArray(window.dataLayer) && window.dataLayer.some((item) => item?.event === "gtm.js"))) add("Google Tag Manager", "Analytics", "GTM runtime data layer");

  return [...findings.values()]
    .map((item) => ({ ...item, evidence: item.evidence.sort() }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function getMainWorldTechnologies(tabId, callback) {
  chrome.scripting.executeScript(
    { target: { tabId }, func: collectMainWorldTechnologies, world: "MAIN" },
    (results) => {
      if (chrome.runtime.lastError) {
        callback([]);
        return;
      }
      callback(results?.[0]?.result || []);
    }
  );
}

async function scanNetwork(tab) {
  const hostname = new URL(tab.url).hostname;
  const [response, dns] = await Promise.all([getCapturedHeaders(tab), getDns(hostname)]);
  const provider = await getProvider(dns.a[0] || dns.aaaa[0]);
  const server = headerValue(response.headers, "server");

  return {
    ipv4: dns.a[0] || "Unavailable",
    ipv6: dns.aaaa[0] || "Unavailable",
    dns,
    provider,
    server: unavailable(server),
    cdn: detectCdn(response.headers, dns.cname),
    response: {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      source: response.source || "Captured from page load",
      headers: response.headers.sort((a, b) => a.name.localeCompare(b.name))
    },
    technologies: detectHeaderTechnologies(response.headers),
    security: getSecuritySnapshot(response.url, response.headers)
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "WEBSCOPE_SCAN") return;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
      sendResponse({ ok: false, error: "Open a regular HTTP or HTTPS webpage, then try again." });
      return;
    }

    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/technology.js", "content/performance.js", "content/content.js"] }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      getMainWorldTechnologies(tab.id, (mainWorldTechnologies) => {
        chrome.tabs.sendMessage(tab.id, { type: "WEBSCOPE_COLLECT_V5" }, async (page) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          try {
            const network = await scanNetwork(tab);
            sendResponse({
              ok: true,
              data: {
                ...page,
                network,
                technologies: mergeTechnologies(page.technologies, mainWorldTechnologies, network.technologies)
              }
            });
          } catch {
            sendResponse({ ok: true, data: { ...page, network: null, technologies: mergeTechnologies(page.technologies, mainWorldTechnologies) } });
          }
        });
      });
    });
  });

  return true;
});
