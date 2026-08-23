# Test App

A small installable web app for tracking Dragon 7, Panda 8, and cards-dealt totals.

## Use locally

Serve this directory from any local web server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Install on iPhone (no App Store)

Host these static files on a free HTTPS host, such as GitHub Pages, Cloudflare Pages, or Netlify. Open the resulting URL in Safari on your iPhone, tap **Share**, then **Add to Home Screen**. It opens like an app and retains totals on that device. No Apple Developer Program membership or App Store publishing is required.

The counters work offline once the page has been opened online at least once.
