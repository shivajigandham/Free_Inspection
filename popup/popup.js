const $ = (id) => document.getElementById(id);
let currentScan = null;

function formatDuration(value) {
  return Number.isFinite(value) && value > 0 ? `${(value / 1000).toFixed(2)} s` : "Not available";
}

function setText(id, value) { $(id).textContent = value; }

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "Not available";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** unit)).toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

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

function renderTechnologies(technologies = []) {
  setText("technologyCount", `${technologies.length} detected`);
  $("technologyEmpty").hidden = technologies.length > 0;
  $("technologyList").replaceChildren(...technologies.map((technology) => {
    const item = document.createElement("article");
    item.className = "tech-item";
    const head = document.createElement("div");
    head.className = "tech-head";
    const name = document.createElement("span");
    name.className = "tech-name";
    name.textContent = technology.name;
    const category = document.createElement("span");
    category.className = "tech-category";
    category.textContent = technology.category;
    const evidence = document.createElement("p");
    evidence.className = "tech-evidence";
    evidence.textContent = technology.evidence.join(" • ");
    head.append(name, category);
    item.append(head, evidence);
    return item;
  }));
}

function renderResourceSummary(summary = {}) {
  setText("resourceTotal", (summary.total || 0).toLocaleString());
  setText("transferSize", formatBytes(summary.transferSize));
  setText("resourceScripts", (summary.scripts || 0).toLocaleString());
  setText("resourceImages", (summary.images || 0).toLocaleString());
  setText("resourceStylesheets", (summary.stylesheets || 0).toLocaleString());
  setText("resourceOther", `${summary.fonts || 0} / ${summary.other || 0}`);
}

function renderSecurity(security = []) {
  const configured = security.filter((check) => check.present).length;
  setText("securityCount", security.length ? `${configured}/${security.length} set` : "Unavailable");
  $("securityList").replaceChildren(...security.map((check) => {
    const item = document.createElement("div");
    item.className = "security-item";
    const name = document.createElement("span");
    name.className = "security-name";
    name.title = check.evidence;
    name.textContent = check.name;
    const state = document.createElement("span");
    state.className = `security-state ${check.present ? "is-present" : "is-missing"}`;
    state.textContent = check.present ? "Configured" : "Not found";
    item.append(name, state);
    return item;
  }));
}

function buildReport(data) {
  const network = data.network || {};
  const response = network.response || {};
  const technologyLines = (data.technologies || []).length
    ? data.technologies.map((item) => `- ${item.name} (${item.category}): ${item.evidence.join("; ")}`).join("\n")
    : "- No public technology signatures detected";
  const securityLines = (network.security || []).length
    ? network.security.map((check) => `- ${check.name}: ${check.present ? "Configured" : "Not found"}`).join("\n")
    : "- Unavailable";

  return [
    "WebScope scan report",
    `URL: ${data.url}`,
    `Title: ${data.title}`,
    `Protocol: ${data.protocol}`,
    "",
    "Overview",
    `- Links: ${data.counts.links}`,
    `- Images: ${data.counts.images}`,
    `- Scripts: ${data.counts.scripts}`,
    `- DOM elements: ${data.counts.elements}`,
    `- Page load: ${formatDuration(data.timing.load)}`,
    `- DOM ready: ${formatDuration(data.timing.domReady)}`,
    "",
    "Network",
    `- Response: ${response.status || "Unavailable"} ${response.statusText || ""}`.trim(),
    `- IPv4: ${network.ipv4 || "Unavailable"}`,
    `- Server: ${network.server || "Unavailable"}`,
    `- CDN: ${network.cdn?.name || "Unavailable"}`,
    "",
    "Technology evidence",
    technologyLines,
    "",
    "Security snapshot",
    securityLines
  ].join("\n");
}

function showError(message) {
  $("loading").hidden = true;
  $("results").hidden = true;
  $("error").hidden = false;
  $("error").textContent = message;
}

function render(data) {
  currentScan = data;
  setText("domain", data.domain);
  setText("url", data.url);
  setText("protocol", data.protocol);
  setText("title", data.title);
  Object.entries(data.counts).forEach(([key, value]) => setText(key, value.toLocaleString()));
  setText("load", formatDuration(data.timing.load));
  setText("domReady", formatDuration(data.timing.domReady));
  setText("browser", data.browser);
  setText("userAgent", data.userAgent);
  renderResourceSummary(data.resourceSummary);
  renderTechnologies(data.technologies);
  if (data.network) {
    renderNetwork(data.network);
    renderSecurity(data.network.security);
  } else {
    renderSecurity();
  }
  $("copyReport").disabled = false;
  $("loading").hidden = true;
  $("error").hidden = true;
  $("results").hidden = false;
}

function scan() {
  $("copyReport").disabled = true;
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
$("copyReport").addEventListener("click", async () => {
  if (!currentScan) return;
  const button = $("copyReport");
  try {
    await navigator.clipboard.writeText(buildReport(currentScan));
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => { button.textContent = "Copy report"; }, 1400);
});
scan();
