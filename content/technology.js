globalThis.WebScopeTechnology = (() => {
    function detect() {
      const findings = new Map();
      const scripts = [...document.scripts].map((script) => script.src).filter(Boolean);
      const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
      const urls = [...scripts, ...resources].join("\n").toLowerCase();
      const generator = [...document.querySelectorAll('meta[name="generator" i]')]
        .map((meta) => meta.content)
        .filter(Boolean)
        .join(" | ");

      function add(name, category, evidence) {
        const key = `${category}:${name}`;
        if (!findings.has(key)) findings.set(key, { name, category, evidence: [] });
        const item = findings.get(key);
        if (!item.evidence.includes(evidence)) item.evidence.push(evidence);
      }

      function hasUrl(pattern) {
        return pattern.test(urls);
      }

      function safe(check) {
        try {
          return Boolean(check());
        } catch {
          return false;
        }
      }

      function read(check) {
        try {
          return check();
        } catch {
          return undefined;
        }
      }

      if (document.getElementById("__NEXT_DATA__")) add("Next.js", "Framework", "#__NEXT_DATA__ page payload");
      if (hasUrl(/\/_next\//)) add("Next.js", "Framework", "Loaded resource path contains /_next/");

      if (safe(() => window.__REACT_DEVTOOLS_GLOBAL_HOOK__)) add("React", "Framework", "React DevTools global hook");
      if (document.querySelector("[data-reactroot], [data-reactid]")) add("React", "Framework", "React root attribute in DOM");
      if (hasUrl(/(?:^|[\/_-])react(?:[._-]|\/|$)/)) add("React", "Framework", "Loaded resource name contains react");

      if (document.querySelector("[ng-version]")) add("Angular", "Framework", "ng-version attribute in DOM");
      if (safe(() => window.getAllAngularRootElements || window.ng?.getComponent)) add("Angular", "Framework", "Angular global API");
      if (hasUrl(/(?:^|[\/_-])angular(?:[._-]|\/|$)/)) add("Angular", "Framework", "Loaded resource name contains angular");

      if (safe(() => window.__VUE__ || window.__VUE_DEVTOOLS_GLOBAL_HOOK__)) add("Vue.js", "Framework", "Vue global hook");
      if (document.querySelector("[data-v-app]")) add("Vue.js", "Framework", "data-v-app root attribute in DOM");
      if (hasUrl(/(?:^|[\/_-])vue(?:[._-]|\/|$)/)) add("Vue.js", "Framework", "Loaded resource name contains vue");

      const jQueryVersion = read(() => window.jQuery?.fn?.jquery || window.$?.fn?.jquery);
      if (jQueryVersion) {
        add("jQuery", "Library", `jQuery global API (v${jQueryVersion})`);
      }
      if (hasUrl(/jquery(?:[.-]|\/|$)/)) add("jQuery", "Library", "Loaded resource name contains jquery");

      if (safe(() => window.bootstrap?.Modal) || hasUrl(/bootstrap(?:[.-]|\/|$)/)) {
        add("Bootstrap", "Library", safe(() => window.bootstrap?.Modal) ? "Bootstrap global API" : "Loaded resource name contains bootstrap");
      }

      if (/wordpress/i.test(generator)) add("WordPress", "CMS", `Generator meta tag: ${generator}`);
      if (hasUrl(/\/wp-(?:content|includes)\//) || document.body?.className.includes("wp-")) {
        add("WordPress", "CMS", hasUrl(/\/wp-(?:content|includes)\//) ? "Loaded resource path contains /wp-content/ or /wp-includes/" : "WordPress-style body class");
      }

      if (/drupal/i.test(generator)) add("Drupal", "CMS", `Generator meta tag: ${generator}`);
      if (safe(() => window.drupalSettings) || hasUrl(/\/sites\/(?:default|all)\//)) {
        add("Drupal", "CMS", safe(() => window.drupalSettings) ? "drupalSettings page global" : "Loaded resource path contains /sites/default/ or /sites/all/");
      }

      if (safe(() => window.Shopify?.theme) || hasUrl(/(?:cdn|assets)\.shopify(?:cdn)?\.com|\/cdn\/shop\//)) {
        add("Shopify", "CMS", safe(() => window.Shopify?.theme) ? "Shopify.theme page global" : "Loaded resource URL is hosted by Shopify");
      }

      if (safe(() => typeof window.gtag === "function" || typeof window.ga === "function") || hasUrl(/googletagmanager\.com\/gtag\/js|google-analytics\.com\/(?:analytics|g)\.js/)) {
        add("Google Analytics", "Analytics", safe(() => typeof window.gtag === "function" || typeof window.ga === "function") ? "gtag or ga page global" : "Loaded Google Analytics script");
      }

      if (safe(() => Array.isArray(window.dataLayer) && window.dataLayer.some((item) => item?.event === "gtm.js")) || hasUrl(/googletagmanager\.com\/gtm\.js/) || document.querySelector('iframe[src*="googletagmanager.com/ns.html"]')) {
        add("Google Tag Manager", "Analytics", hasUrl(/googletagmanager\.com\/gtm\.js/) ? "Loaded Google Tag Manager script" : "GTM data layer or noscript iframe");
      }

      return [...findings.values()]
        .map((item) => ({ ...item, evidence: item.evidence.sort() }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    }

  return { detect };
})();
