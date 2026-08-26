# WebScope — Phases 1–5

A Manifest V3 Chrome extension that analyzes the currently open webpage without a backend.

## Included in Phase 1

- URL, domain, HTTPS/HTTP status, and page title
- Link, image, script, stylesheet, and DOM-element counts
- Navigation timing for page load and DOM readiness
- Browser name and user-agent details

## Included in Phase 2

- DNS-over-HTTPS lookups for A (IPv4), AAAA (IPv6), and CNAME records
- ISP/network organisation and ASN lookup for the first resolved address
- Main-document HTTP response status and complete response-header list
- Basic server and CDN detection using response headers and DNS signatures

## Included in Phase 3

- Evidence-based detection of React, Next.js, Angular, Vue.js, jQuery, and Bootstrap
- CMS detection for WordPress, Drupal, and Shopify
- Google Analytics and Google Tag Manager detection
- Nginx, Apache, Microsoft IIS, Express, and PHP detection when exposed in response headers
- A Technology Evidence panel that records the observable signal behind every result
- Resource footprint metrics for loaded resources and their transfer size
- Security-header snapshot for HTTPS, HSTS, CSP, frame protection, referrer policy, and permissions policy
- Copy Report action for sharing the current scan as plain text

Production websites can strip framework labels from files or hide their backend behind a CDN. Phase 3 therefore checks both public page resources and runtime markers exposed by the page; a blank Technology Evidence panel means no trustworthy signature was available, not that the website uses no technology.

## Included in Phase 4

- Navigation timing for DNS lookup, TCP connection, TLS handshake, server response, DOM processing, DOM interactivity, and page load
- First Paint and First Contentful Paint when the browser exposes those entries
- Resource transfer breakdown for JavaScript, CSS, images, and fonts

## Included in Phase 5

- Page-side JavaScript activity and responsiveness based on Long Tasks API observations
- Long-task count, total blocking duration, and longest observed task
- JavaScript heap figures and logical processor count when Chrome exposes them
- Explicit measurement boundaries so page-runtime signals are never presented as total device CPU or RAM usage

## Run it locally

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose this project folder.
4. Open a normal `http` or `https` webpage, then select the WebScope toolbar icon.

Chrome intentionally prevents the extension from inspecting special pages such as `chrome://` and the Chrome Web Store.

## Important boundaries

Phase 2 sends the current hostname to Cloudflare's public DNS-over-HTTPS resolver and the resolved IP address to ipapi.co for organisation and ASN data. Both services are key-free convenience sources; their results can be unavailable, rate-limited, or differ from an authoritative network source.

An IP may belong to a CDN or shared host rather than the website owner. Likewise, all technology, server, and CDN fingerprints are evidence-based and can be hidden, changed, or spoofed by a proxy. A missing result does not prove that a technology is absent, and WebScope does not guess at hidden backend systems or databases.

Visitor estimates, WHOIS/RDAP, geolocation, and full security assessment remain out of scope. Extensions also cannot reliably measure device-wide CPU or RAM use; Phase 5 reports only page-visible JavaScript runtime data when the browser provides it.
