`anthropic-sdk-1.5.0.js` is the official Anthropic TypeScript SDK (`@anthropic-ai/sdk` 1.5.0, Apache-2.0), bundled for the browser so the app needs no build step or CDN:

```bash
echo 'export { default } from "@anthropic-ai/sdk";' > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --minify --legal-comments=inline --outfile=anthropic-sdk-1.5.0.js
```

To upgrade, rebuild with a newer version, update `SDK_SRC` in `src/platform.js` and `SHELL` in `sw.js`, and bump `VERSION` in `sw.js`.
