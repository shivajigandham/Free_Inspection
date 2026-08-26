globalThis.WebScopePerformance = (() => {
  const monitor = globalThis.__webscopeRuntimeMonitorV5 || {
    longTasks: [],
    longTaskSupport: false
  };

  if (!globalThis.__webscopeRuntimeMonitorV5) {
    globalThis.__webscopeRuntimeMonitorV5 = monitor;
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          monitor.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        });
      });
      observer.observe({ type: "longtask", buffered: true });
      monitor.longTaskSupport = true;
    } catch {
      monitor.longTaskSupport = false;
    }
  }

  function duration(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end === 0) return null;
    return Math.round((end - start) * 100) / 100;
  }

  function toByteStats() {
    return { count: 0, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 };
  }

  function addResource(stats, entry) {
    stats.count += 1;
    stats.transferSize += Number(entry.transferSize) || 0;
    stats.encodedBodySize += Number(entry.encodedBodySize) || 0;
    stats.decodedBodySize += Number(entry.decodedBodySize) || 0;
  }

  function getResourceType(entry) {
    const url = entry.name.toLowerCase();
    if (entry.initiatorType === "script" || /\.m?js(?:$|[?#])/.test(url)) return "javascript";
    if (entry.initiatorType === "img" || /\.(?:avif|gif|ico|jpe?g|png|svg|webp)(?:$|[?#])/.test(url)) return "images";
    if (entry.initiatorType === "css" || /\.css(?:$|[?#])/.test(url)) return "css";
    if (entry.initiatorType === "font" || /\.(?:eot|otf|ttf|woff2?)(?:$|[?#])/.test(url)) return "fonts";
    return "other";
  }

  function collectResources(entries) {
    const summary = {
      total: toByteStats(),
      javascript: toByteStats(),
      css: toByteStats(),
      images: toByteStats(),
      fonts: toByteStats(),
      other: toByteStats(),
      sizeAvailability: entries.some((entry) => Number(entry.transferSize) > 0)
    };
    entries.forEach((entry) => {
      addResource(summary.total, entry);
      addResource(summary[getResourceType(entry)], entry);
    });
    return summary;
  }

  function collectLongTasks() {
    const entries = [...monitor.longTasks];
    try {
      performance.getEntriesByType("longtask").forEach((entry) => {
        entries.push({ startTime: entry.startTime, duration: entry.duration });
      });
    } catch {
      // The observer support flag below remains the authoritative capability check.
    }

    const unique = [...new Map(entries.map((entry) => [
      `${Math.round(entry.startTime)}:${Math.round(entry.duration)}`,
      entry
    ])).values()];
    const totalDuration = unique.reduce((total, entry) => total + entry.duration, 0);
    const longestDuration = unique.reduce((longest, entry) => Math.max(longest, entry.duration), 0);

    return {
      supported: monitor.longTaskSupport,
      count: unique.length,
      totalDuration: Math.round(totalDuration * 100) / 100,
      longestDuration: Math.round(longestDuration * 100) / 100
    };
  }

  function getRuntimeHealth(longTasks, resources) {
    const blocking = longTasks.totalDuration;
    let activity = "Unavailable";
    let responsiveness = "Unavailable";

    if (longTasks.supported) {
      if (blocking >= 1000 || longTasks.count >= 10) activity = "High";
      else if (blocking >= 200 || longTasks.count >= 3) activity = "Moderate";
      else activity = "Light";

      if (longTasks.longestDuration >= 200 || blocking >= 1000) responsiveness = "High impact";
      else if (longTasks.count > 0) responsiveness = "Some blocking";
      else responsiveness = "No long tasks observed";
    }

    const memory = performance.memory;
    const heap = memory && Number.isFinite(memory.usedJSHeapSize)
      ? {
          supported: true,
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
          limit: memory.jsHeapSizeLimit,
          utilization: memory.jsHeapSizeLimit ? Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100) : null
        }
      : { supported: false };

    return {
      activity,
      responsiveness,
      longTasks,
      heap,
      hardware: {
        logicalProcessors: navigator.hardwareConcurrency || null,
        deviceMemory: navigator.deviceMemory || null
      },
      javascriptTransferSize: resources.javascript.transferSize
    };
  }

  function collect() {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resourceEntries = performance.getEntriesByType("resource");
    const paints = performance.getEntriesByType("paint");
    const resources = collectResources(resourceEntries);
    const longTasks = collectLongTasks();
    const domLoading = navigation?.domLoading || navigation?.responseEnd || null;

    return {
      navigation: navigation ? {
        dns: duration(navigation.domainLookupStart, navigation.domainLookupEnd),
        tcp: duration(navigation.connectStart, navigation.connectEnd),
        tls: navigation.secureConnectionStart > 0 ? duration(navigation.secureConnectionStart, navigation.connectEnd) : null,
        serverResponse: duration(navigation.requestStart, navigation.responseStart),
        domProcessing: duration(domLoading, navigation.domContentLoadedEventEnd),
        domInteractive: duration(navigation.startTime, navigation.domInteractive),
        domContentLoaded: duration(navigation.startTime, navigation.domContentLoadedEventEnd),
        pageLoad: duration(navigation.startTime, navigation.loadEventEnd)
      } : null,
      paint: {
        firstPaint: paints.find((entry) => entry.name === "first-paint")?.startTime ?? null,
        firstContentfulPaint: paints.find((entry) => entry.name === "first-contentful-paint")?.startTime ?? null
      },
      resources,
      runtime: getRuntimeHealth(longTasks, resources)
    };
  }

  return { collect };
})();
