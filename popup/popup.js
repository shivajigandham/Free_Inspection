const $ = (id) => document.getElementById(id);
let currentScan = null;

function formatDuration(value) {
  if (!Number.isFinite(value) || value < 0) return "Unavailable";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
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

function formatDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toISOString().slice(0, 10);
}

function formatDomainAge(days) {
  if (!Number.isFinite(days) || days < 0) return "Unavailable";
  const years = Math.floor(days / 365.25);
  const remainingDays = Math.floor(days - years * 365.25);
  return years ? `${years}y ${remainingDays}d` : `${days}d`;
}

function formatCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
    : "Unavailable";
}

function formatNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value.toLocaleString() : "Unavailable";
}

function trafficDomain(scan = currentScan) {
  const registeredDomain = scan?.network?.domain?.domain;
  if (registeredDomain && registeredDomain !== "Unavailable") return registeredDomain.toLowerCase();
  return scan?.domain?.toLowerCase().replace(/^www\./, "") || "";
}

function trafficStorageKey(scan = currentScan) {
  const domain = trafficDomain(scan);
  return domain ? "webscope:traffic:" + domain : "";
}

function parseTrafficBreakdown(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      return separator > 0
        ? { label: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() }
        : { label: line, value: "" };
    })
    .filter((item) => item.label)
    .slice(0, 6);
}

function formatTrafficBreakdown(items = []) {
  return items.map((item) => item.value ? item.label + ": " + item.value : item.label).join("\n");
}

function renderTrafficList(id, items = []) {
  const list = $(id);
  list.replaceChildren(...(items.length ? items : [{ label: "Not provided", value: "" }]).map((item) => {
    const row = document.createElement("li");
    const label = document.createElement("span");
    const value = document.createElement("span");
    label.textContent = item.label;
    value.textContent = item.value;
    row.append(label, value);
    return row;
  }));
}

function renderTraffic(traffic) {
  const available = Boolean(traffic?.provider);
  setText("trafficStatus", available ? "Imported estimate" : "Provider required");
  setText("trafficVisits", formatNumber(traffic?.monthlyVisits));
  setText("trafficRank", Number.isFinite(traffic?.globalRank) ? "#" + traffic.globalRank.toLocaleString() : "Unavailable");
  setText("trafficProvider", traffic?.provider || "Not configured");
  setText("trafficUpdated", formatDate(traffic?.updatedAt));
  renderTrafficList("trafficCountries", traffic?.countries);
  renderTrafficList("trafficChannels", traffic?.channels);
  setText(
    "trafficFootnote",
    available
      ? "Estimate imported from " + traffic.provider + " (" + (traffic.confidence || "confidence not provided") + ") on " + formatDate(traffic.updatedAt) + ". It is not a live visitor count."
      : "Traffic figures require an external provider. Import an estimate to store it locally for this domain."
  );
}

async function loadTraffic(scan) {
  const key = trafficStorageKey(scan);
  if (!key) {
    renderTraffic(null);
    return;
  }
  const stored = await chrome.storage.local.get(key);
  if (currentScan !== scan) return;
  scan.traffic = stored[key] || null;
  renderTraffic(scan.traffic);
}

function fillTrafficForm(traffic = currentScan?.traffic) {
  $("trafficProviderInput").value = traffic?.provider || "";
  $("trafficVisitsInput").value = Number.isFinite(traffic?.monthlyVisits) ? traffic.monthlyVisits : "";
  $("trafficRankInput").value = Number.isFinite(traffic?.globalRank) ? traffic.globalRank : "";
  $("trafficConfidenceInput").value = traffic?.confidence || "Not provided";
  $("trafficCountriesInput").value = formatTrafficBreakdown(traffic?.countries || []);
  $("trafficChannelsInput").value = formatTrafficBreakdown(traffic?.channels || []);
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

function renderGeolocation(geolocation = {}) {
  setText("geoStatus", geolocation.available ? geolocation.source || "IP lookup" : "Lookup unavailable");
  setText("geoCountry", geolocation.country || "Unavailable");
  setText("geoRegion", geolocation.region || "Unavailable");
  setText("geoCity", geolocation.city || "Unavailable");
  setText("geoTimezone", geolocation.timezone || "Unavailable");
  setText("geoCoordinates", formatCoordinates(geolocation.latitude, geolocation.longitude));
  setText(
    "geoFootnote",
    geolocation.available
      ? `Approximate ${geolocation.source || "IP"} data for ${geolocation.ip || "the resolved endpoint"}; CDN or hosting locations often differ from the website owner.`
      : `${geolocation.status || "Location data was unavailable"} for the resolved endpoint.`
  );
}

function renderDomain(domain = {}) {
  setText("domainStatus", domain.available ? domain.source || "RDAP" : "Lookup unavailable");
  setText("registeredDomain", domain.domain || "Unavailable");
  setText("registeredOn", formatDate(domain.registeredOn));
  setText("domainAge", formatDomainAge(domain.ageDays));
  setText("lastChangedOn", formatDate(domain.lastChangedOn));
  setText("expiresOn", formatDate(domain.expiresOn));
  setText("registrar", domain.registrar || "Unavailable");
  setText("nameservers", displayList(domain.nameservers));
  setText(
    "domainFootnote",
    domain.available
      ? `RDAP registration data for ${domain.domain}. Registration age is not evidence of when a website first became live.`
      : domain.status || "No RDAP registration record was available for this hostname."
  );
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
  const detailedResources = currentScan?.performanceAnalysis?.resources;
  setText("resourceTotal", (summary.total || 0).toLocaleString());
  setText("transferSize", formatBytes(summary.transferSize));
  setText("javascriptSize", formatBytes(detailedResources?.javascript?.transferSize));
  setText("cssSize", formatBytes(detailedResources?.css?.transferSize));
  setText("imageSize", formatBytes(detailedResources?.images?.transferSize));
  setText("fontSize", formatBytes(detailedResources?.fonts?.transferSize));
  setText(
    "resourceFootnote",
    detailedResources?.sizeAvailability
      ? "Sizes use Resource Timing transfer data; cached and cross-origin resources can be reported as 0 bytes."
      : "This page did not expose resource-size data. Cached or cross-origin resources commonly omit it."
  );
}

function renderPerformance(analysis) {
  const navigation = analysis?.navigation;
  const paint = analysis?.paint;
  setText("performanceStatus", navigation ? "Navigation timing" : "Timing unavailable");
  setText("dnsTime", formatDuration(navigation?.dns));
  setText("tcpTime", formatDuration(navigation?.tcp));
  setText("tlsTime", formatDuration(navigation?.tls));
  setText("serverResponseTime", formatDuration(navigation?.serverResponse));
  setText("domProcessingTime", formatDuration(navigation?.domProcessing));
  setText("domInteractiveTime", formatDuration(navigation?.domInteractive));
  setText("firstPaintTime", formatDuration(paint?.firstPaint));
  setText("fcpTime", formatDuration(paint?.firstContentfulPaint));
}

function renderRuntimeHealth(analysis) {
  const runtime = analysis?.runtime;
  const longTasks = runtime?.longTasks;
  const heap = runtime?.heap;
  setText("runtimeStatus", longTasks?.supported ? "Runtime signals" : "Long-task API unavailable");
  setText("jsActivity", runtime?.activity || "Unavailable");
  setText("responsiveness", runtime?.responsiveness || "Unavailable");
  setText("longTaskCount", longTasks?.supported ? `${longTasks.count}` : "Unavailable");
  setText("longTaskDuration", longTasks?.supported ? formatDuration(longTasks.totalDuration) : "Unavailable");
  setText("longestTask", longTasks?.supported ? formatDuration(longTasks.longestDuration) : "Unavailable");
  setText("heapUsed", heap?.supported ? formatBytes(heap.used) : "Unavailable");
  setText("heapLimit", heap?.supported ? formatBytes(heap.limit) : "Unavailable");
  setText("logicalProcessors", runtime?.hardware?.logicalProcessors ? `${runtime.hardware.logicalProcessors}` : "Unavailable");
  setText(
    "runtimeFootnote",
    heap?.supported
      ? `JS heap uses ${heap.utilization ?? "?"}% of Chrome's reported heap limit. This is not total device memory.`
      : "Long tasks estimate page blocking; browsers do not expose trustworthy total device CPU or RAM usage to extensions."
  );
}

function renderSecurityAnalysis(security = {}) {
  const checks = Array.isArray(security) ? security : security.checks || [];
  const summary = security.summary || {
    pass: checks.filter((check) => check.state === "pass" || check.present).length,
    review: checks.filter((check) => check.state === "review").length,
    missing: checks.filter((check) => check.state === "missing" || (!check.present && !check.state)).length
  };
  const cookies = security.cookies || {};
  const labels = { pass: "Good", review: "Review", missing: "Missing", info: "Info" };
  setText("securityCount", checks.length ? summary.pass + " good / " + summary.review + " review" : "Unavailable");
  setText("securityPasses", Number.isFinite(summary.pass) ? String(summary.pass) : "Unavailable");
  setText("securityReviews", Number.isFinite(summary.review) ? String(summary.review) : "Unavailable");
  setText("securityMissing", Number.isFinite(summary.missing) ? String(summary.missing) : "Unavailable");
  setText("securityCookies", Number.isFinite(cookies.total) ? String(cookies.total) : "Unavailable");
  $("securityList").replaceChildren(...checks.map((check) => {
    const item = document.createElement("article");
    item.className = "security-item";
    const copy = document.createElement("div");
    copy.className = "security-copy";
    const name = document.createElement("span");
    name.className = "security-name";
    name.textContent = check.name;
    const evidence = document.createElement("p");
    evidence.className = "security-evidence";
    evidence.textContent = check.evidence;
    const state = document.createElement("span");
    const stateName = check.state || (check.present ? "pass" : "missing");
    state.className = "security-state is-" + stateName;
    state.textContent = labels[stateName] || "Info";
    copy.append(name, evidence);
    item.append(copy, state);
    return item;
  }));
  setText(
    "securityFootnote",
    checks.length
      ? "Cookie results cover Set-Cookie headers observed on the main document only. These are configuration signals, not a vulnerability assessment."
      : "Security evidence was unavailable for this response."
  );
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
  const securityChecks = Array.isArray(network.security) ? network.security : network.security?.checks || [];
  const securityLines = securityChecks.length
    ? securityChecks.map((check) => `- ${check.name}: ${check.state || (check.present ? "pass" : "missing")} — ${check.evidence}`).join("\n")
    : "- Unavailable";
  const performance = data.performanceAnalysis || {};
  const navigation = performance.navigation || {};
  const resources = performance.resources || {};
  const runtime = performance.runtime || {};
 const geolocation = network.geolocation || {};
 const domain = network.domain || {};
  const traffic = data.traffic || {};

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
    "Performance",
    `- DNS lookup: ${formatDuration(navigation.dns)}`,
    `- TCP connect: ${formatDuration(navigation.tcp)}`,
    `- TLS handshake: ${formatDuration(navigation.tls)}`,
    `- Server response: ${formatDuration(navigation.serverResponse)}`,
    `- First contentful paint: ${formatDuration(performance.paint?.firstContentfulPaint)}`,
    "",
    "Resource footprint",
    `- Total resources: ${data.resourceSummary?.total ?? "Unavailable"}`,
    `- Total transfer: ${formatBytes(data.resourceSummary?.transferSize)}`,
    `- JavaScript transfer: ${formatBytes(resources.javascript?.transferSize)}`,
    `- CSS transfer: ${formatBytes(resources.css?.transferSize)}`,
    `- Image transfer: ${formatBytes(resources.images?.transferSize)}`,
    "",
    "Client runtime health",
    `- JavaScript activity: ${runtime.activity || "Unavailable"}`,
    `- Responsiveness: ${runtime.responsiveness || "Unavailable"}`,
    `- Long tasks: ${runtime.longTasks?.supported ? runtime.longTasks.count : "Unavailable"}`,
    `- Total long-task time: ${runtime.longTasks?.supported ? formatDuration(runtime.longTasks.totalDuration) : "Unavailable"}`,
    `- JavaScript heap used: ${runtime.heap?.supported ? formatBytes(runtime.heap.used) : "Unavailable"}`,
    "",
    "Network",
    `- Response: ${response.status || "Unavailable"} ${response.statusText || ""}`.trim(),
    `- IPv4: ${network.ipv4 || "Unavailable"}`,
    `- Server: ${network.server || "Unavailable"}`,
    `- CDN: ${network.cdn?.name || "Unavailable"}`,
    "",
    "Resolved endpoint location",
    `- Country: ${geolocation.country || "Unavailable"}`,
    `- Region / city: ${geolocation.region || "Unavailable"} / ${geolocation.city || "Unavailable"}`,
    `- Timezone: ${geolocation.timezone || "Unavailable"}`,
    `- Coordinates: ${formatCoordinates(geolocation.latitude, geolocation.longitude)}`,
    "",
    "Domain registration",
    `- Registered domain: ${domain.domain || "Unavailable"}`,
    `- Registered: ${formatDate(domain.registeredOn)}`,
    `- Age: ${formatDomainAge(domain.ageDays)}`,
    `- Expires: ${formatDate(domain.expiresOn)}`,
   `- Registrar: ${domain.registrar || "Unavailable"}`,
   `- Nameservers: ${displayList(domain.nameservers)}`,
   "",
    "Traffic intelligence",
    `- Monthly visits (estimated): ${formatNumber(traffic.monthlyVisits)}`,
    `- Global rank: ${Number.isFinite(traffic.globalRank) ? "#" + traffic.globalRank.toLocaleString() : "Unavailable"}`,
    `- Provider / confidence: ${traffic.provider || "Unavailable"} / ${traffic.confidence || "Not provided"}`,
    `- Updated: ${formatDate(traffic.updatedAt)}`,
    `- Top countries: ${formatTrafficBreakdown(traffic.countries || []) || "Unavailable"}`,
    `- Traffic sources: ${formatTrafficBreakdown(traffic.channels || []) || "Unavailable"}`,
    "",
   "Technology evidence",
    technologyLines,
    "",
    "Security analysis",
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
  renderPerformance(data.performanceAnalysis);
  renderResourceSummary(data.resourceSummary);
  renderRuntimeHealth(data.performanceAnalysis);
  renderTechnologies(data.technologies);
  renderTraffic(null);
  fillTrafficForm(null);
  void loadTraffic(data).then(() => {
    if (currentScan === data) fillTrafficForm(data.traffic);
  });
  if (data.network) {
    renderNetwork(data.network);
    renderGeolocation(data.network.geolocation);
    renderDomain(data.network.domain);
    renderSecurityAnalysis(data.network.security);
  } else {
    renderGeolocation();
    renderDomain();
    renderSecurityAnalysis();
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

$("trafficForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = trafficStorageKey();
  if (!key || !currentScan) return;
  const optionalNumber = (value, minimum) => {
    if (value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= minimum ? Math.round(number) : null;
  };
  const traffic = {
    provider: $("trafficProviderInput").value.trim(),
    monthlyVisits: optionalNumber($("trafficVisitsInput").value, 0),
    globalRank: optionalNumber($("trafficRankInput").value, 1),
    confidence: $("trafficConfidenceInput").value,
    countries: parseTrafficBreakdown($("trafficCountriesInput").value),
    channels: parseTrafficBreakdown($("trafficChannelsInput").value),
    updatedAt: new Date().toISOString()
  };
  if (!traffic.provider) return;
  try {
    await chrome.storage.local.set({ [key]: traffic });
    currentScan.traffic = traffic;
    renderTraffic(traffic);
    $("trafficForm").closest("details").open = false;
  } catch {
    setText("trafficFootnote", "The traffic estimate could not be saved locally.");
  }
});

$("clearTraffic").addEventListener("click", async () => {
  const key = trafficStorageKey();
  if (!key || !currentScan) return;
  try {
    await chrome.storage.local.remove(key);
    currentScan.traffic = null;
    fillTrafficForm(null);
    renderTraffic(null);
  } catch {
    setText("trafficFootnote", "The saved traffic estimate could not be cleared.");
  }
});

scan();
