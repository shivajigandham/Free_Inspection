if (!globalThis.__webscopeCollectorInstalledV3) {
  globalThis.__webscopeCollectorInstalledV3 = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "WEBSCOPE_COLLECT_V3") return;

  const navigation = performance.getEntriesByType("navigation")[0];
  const stylesheets = [...document.querySelectorAll('link[rel~="stylesheet"]')];
  const userAgent = navigator.userAgent;
  const browser = /Edg\//.test(userAgent)
    ? "Microsoft Edge"
    : /Chrome\//.test(userAgent)
      ? "Google Chrome"
      : /Firefox\//.test(userAgent)
        ? "Mozilla Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Unknown browser";
  const resourceEntries = performance.getEntriesByType("resource");
  const resourceSummary = resourceEntries.reduce((summary, entry) => {
    const type = entry.initiatorType;
    summary.total += 1;
    summary.transferSize += Number(entry.transferSize) || 0;
    if (type === "script") summary.scripts += 1;
    else if (type === "img") summary.images += 1;
    else if (type === "css" || type === "link") summary.stylesheets += 1;
    else if (type === "font") summary.fonts += 1;
    else summary.other += 1;
    return summary;
  }, { total: 0, transferSize: 0, scripts: 0, images: 0, stylesheets: 0, fonts: 0, other: 0 });

    sendResponse({
      url: location.href,
      domain: location.hostname,
      protocol: location.protocol === "https:" ? "HTTPS" : "HTTP",
      title: document.title || "Untitled page",
      counts: {
        links: document.links.length,
        images: document.images.length,
        scripts: document.scripts.length,
        stylesheets: stylesheets.length,
        elements: document.getElementsByTagName("*").length
      },
      timing: {
        load: navigation ? Math.max(0, navigation.loadEventEnd - navigation.startTime) : null,
        domReady: navigation ? Math.max(0, navigation.domContentLoadedEventEnd - navigation.startTime) : null
      },
      browser,
      userAgent,
      resourceSummary,
      technologies: globalThis.WebScopeTechnology?.detect?.() || []
    });
  });
}
