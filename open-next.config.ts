// OpenNext Cloudflare adapter configuration.
// Minimal setup: the built-in cache is fine for testing (no ISR/R2 cache).
// See https://opennext.js.org/cloudflare/caching for production options.

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
