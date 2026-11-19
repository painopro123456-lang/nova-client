# NOVA Share service

This Cloudflare Worker stores NOVA modpack archives in a private R2 bucket and gives each upload an eight-character share code.

## Deploy once

1. Create a Cloudflare account.
2. In **R2 Object Storage**, create a bucket named `nova-shares`.
3. Open **Workers & Pages** and create a Worker named `nova-share`.
4. Deploy the contents of `worker/src/index.js` as the Worker entry point.
5. In the Worker settings, add an R2 bucket binding:
   - Variable name: `NOVA_SHARES`
   - Bucket: `nova-shares`
6. Deploy, then copy the Worker URL. It should look like `https://nova-share.<your-subdomain>.workers.dev`.

You can also deploy from this folder with Wrangler after installing it and authenticating:
```sh
wrangler deploy
```

## API

- `POST /api/share` — request body is a ZIP archive; returns `{ "code": "...", "expiresAt": 0, "bytes": 0 }`.
- `GET /api/share/{CODE}` — downloads the archive.
- Codes expire after 30 days and are deleted when an expired code is requested.

## Current limits and safety

- Maximum archive upload: 90 MiB. This stays below the standard Cloudflare Workers request-body limit.
- Codes are unguessable eight-character codes and are case-insensitive by convention (the service emits uppercase).
- The R2 bucket is not public; all access goes through this Worker.
- This first version has no user authentication or per-IP quota. Do not publish the endpoint widely until rate limiting / abuse controls are enabled.
- Share only mod files whose licences allow redistribution. NOVA should prefer manifests and official mod downloads when a mod cannot legally be bundled.
- The NOVA desktop client must validate every ZIP path and enforce extraction size/count limits before installing an imported pack.
