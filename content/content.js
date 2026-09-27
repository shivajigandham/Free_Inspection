if (!globalThis.__webscopeCollectorInstalledV5) {
  globalThis.__webscopeCollectorInstalledV5 = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "WEBSCOPE_COLLECT_V5") return;

    setTimeout(() => {
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

      const performanceAnalysis = globalThis.WebScopePerformance?.collect?.() || null;
      const currentUrl = new URL(location.href);
      const resourceSelectors = [
        "script[src]",
        "link[href]",
        "img[src]",
        "iframe[src]",
        "audio[src]",
        "video[src]",
        "source[src]"
      ];
      const insecureResources = resourceSelectors.flatMap((selector) => [...document.querySelectorAll(selector)])
        .map((element) => element.src || element.href || "")
        .filter(Boolean)
        .filter((value) => {
          try {
            return new URL(value, location.href).protocol === "http:";
          } catch {
            return false;
          }
        });
      const passwordForms = [...document.forms].filter((form) => form.querySelector('input[type="password"]'));
      const insecurePasswordForms = passwordForms.filter((form) => {
        try {
          return new URL(form.getAttribute("action") || location.href, location.href).protocol === "http:";
        } catch {
          return false;
        }
      });
      const metaContent = (selector) => document.querySelector(selector)?.getAttribute("content") || "";
      const securitySignals = {
        isHttps: currentUrl.protocol === "https:",
        metaCsp: metaContent('meta[http-equiv="content-security-policy" i]'),
        metaReferrer: metaContent('meta[name="referrer" i]'),
        insecureResourceCount: insecureResources.length,
        insecureResourceExamples: [...new Set(insecureResources)].slice(0, 3),
        passwordFormCount: passwordForms.length,
        insecurePasswordFormCount: insecurePasswordForms.length
      };

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
        performanceAnalysis,
        securitySignals,
        technologies: globalThis.WebScopeTechnology?.detect?.() || []
      });
    }, 30);

    return true;
  });
}
