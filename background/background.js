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
    }
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "WEBSCOPE_SCAN") return;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
      sendResponse({ ok: false, error: "Open a regular HTTP or HTTPS webpage, then try again." });
      return;
    }

    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/content.js"] }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "WEBSCOPE_COLLECT" }, async (page) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        try {
          sendResponse({ ok: true, data: { ...page, network: await scanNetwork(tab) } });
        } catch {
          sendResponse({ ok: true, data: { ...page, network: null } });
        }
      });
    });
  });

  return true;
});
