if (!globalThis.__webscopeCollectorInstalled) {
  globalThis.__webscopeCollectorInstalled = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "WEBSCOPE_COLLECT") return;

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
      userAgent
    });
  });
}
