const $ = (id) => document.getElementById(id);

function formatDuration(value) {
  return Number.isFinite(value) && value > 0 ? `${(value / 1000).toFixed(2)} s` : "Not available";
}

function setText(id, value) { $(id).textContent = value; }

function displayList(values) {
  return values?.length ? values.join(", ") : "Unavailable";
}

function renderNetwork(network) {
  const responseStatus = $("responseStatus");
  const status = network.response.status;
  responseStatus.textContent = status ? `${status} ${network.response.statusText}`.trim() : "No response";
  responseStatus.classList.toggle("is-error", !status || status >= 400);
  setText("ipv4", network.ipv4);
  setText("ipv6", network.ipv6);
  setText("server", network.server);
  setText("cdn", network.cdn.name);
  setText("isp", network.provider.isp);
  setText("asn", network.provider.asn);
  setText("cdnEvidence", network.cdn.evidence);
  setText("dnsA", displayList(network.dns.a));
  setText("dnsAAAA", displayList(network.dns.aaaa));
  setText("dnsCname", displayList(network.dns.cname));
  setText("responseSource", network.response.source);
  setText("responseUrl", network.response.url);
  setText("headerCount", network.response.headers.length);
  $("headers").replaceChildren(...network.response.headers.map(({ name, value }) => {
    const row = document.createElement("div");
    const key = document.createElement("dt");
    const content = document.createElement("dd");
    key.textContent = name;
    content.textContent = value;
    row.append(key, content);
    return row;
  }));
}

function showError(message) {
  $("loading").hidden = true;
  $("results").hidden = true;
  $("error").hidden = false;
  $("error").textContent = message;
}

function render(data) {
  setText("domain", data.domain);
  setText("url", data.url);
  setText("protocol", data.protocol);
  setText("title", data.title);
  Object.entries(data.counts).forEach(([key, value]) => setText(key, value.toLocaleString()));
  setText("load", formatDuration(data.timing.load));
  setText("domReady", formatDuration(data.timing.domReady));
  setText("browser", data.browser);
  setText("userAgent", data.userAgent);
  if (data.network) renderNetwork(data.network);
  $("loading").hidden = true;
  $("error").hidden = true;
  $("results").hidden = false;
}

function scan() {
  $("loading").hidden = false;
  $("results").hidden = true;
  $("error").hidden = true;
  chrome.runtime.sendMessage({ type: "WEBSCOPE_SCAN" }, (response) => {
    if (chrome.runtime.lastError) return showError(chrome.runtime.lastError.message);
    if (!response?.ok) return showError(response?.error || "WebScope could not analyze this page.");
    render(response.data);
  });
}

$("refresh").addEventListener("click", scan);
scan();
