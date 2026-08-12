# WebScope — Phases 1 & 2

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

## Run it locally

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose this project folder.
4. Open a normal `http` or `https` webpage, then select the WebScope toolbar icon.

Chrome intentionally prevents the extension from inspecting special pages such as `chrome://` and the Chrome Web Store.

## Important boundaries

Phase 2 sends the current hostname to Cloudflare's public DNS-over-HTTPS resolver and the resolved IP address to ipapi.co for organisation and ASN data. Both services are key-free convenience sources; their results can be unavailable, rate-limited, or differ from an authoritative network source.

An IP may belong to a CDN or shared host rather than the website owner. Likewise, server/CDN fingerprints are evidence-based and can be hidden or changed by a proxy. WebScope labels unknown values rather than guessing.

Visitor estimates, WHOIS/RDAP, geolocation, security assessment, and device-wide CPU/RAM remain out of scope for these phases.
