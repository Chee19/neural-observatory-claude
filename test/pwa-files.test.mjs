import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("index.html links the web manifest and theme color", async () => {
  const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /theme-color/i);
});

test("pwa support files exist", async () => {
  await assert.doesNotReject(() =>
    fs.access(new URL("../public/manifest.webmanifest", import.meta.url)),
  );
  await assert.doesNotReject(() =>
    fs.access(new URL("../public/sw.js", import.meta.url)),
  );
  await assert.doesNotReject(() =>
    fs.access(new URL("../src/lib/registerServiceWorker.ts", import.meta.url)),
  );
});
