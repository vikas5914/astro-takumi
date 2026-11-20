import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { DiskFetchCache, OgCache, computeGlobalKey, pageCacheKey, sha256Hex } from "./cache.js";
import type { IntegrationOptions } from "./types.js";

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "takumi-cache-"));
}

const baseOptions: IntegrationOptions = {
  width: 1200,
  height: 630,
  format: "png",
  quality: 100,
  verbose: false,
  drawDebugBorder: false,
  domBackend: "linkedom",
};

test("sha256Hex is stable and distinguishes content", () => {
  expect(sha256Hex("abc")).toBe(sha256Hex(new TextEncoder().encode("abc")));
  expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
});

test("pageCacheKey changes when html, path, or global key changes", () => {
  const k = pageCacheKey("g1", "/a/", "h1");
  expect(pageCacheKey("g1", "/a/", "h2")).not.toBe(k);
  expect(pageCacheKey("g1", "/b/", "h1")).not.toBe(k);
  expect(pageCacheKey("g2", "/a/", "h1")).not.toBe(k);
});

test("computeGlobalKey reacts to render fn source and options", () => {
  const renderA = () => "A";
  const renderB = () => "B";
  const versions = { integration: "1", core: "1" };
  const kA = computeGlobalKey({ render: renderA, options: baseOptions, versions });
  const kA2 = computeGlobalKey({ render: renderA, options: baseOptions, versions });
  expect(kA).toBe(kA2);
  const kB = computeGlobalKey({ render: renderB, options: baseOptions, versions });
  expect(kB).not.toBe(kA);
  const kWider = computeGlobalKey({ render: renderA, options: { ...baseOptions, width: 800 }, versions });
  expect(kWider).not.toBe(kA);
});

test("OgCache persists across instances; globalKey change wipes blobs", async () => {
  const root = await tempDir();
  const c1 = new OgCache(root, "key1");
  await c1.init();
  await c1.putBlob("b1", new Uint8Array([1, 2, 3]));
  c1.record({ pathname: "/a/", htmlHash: "h", key: "b1", ts: 1 });
  await c1.flush();

  const c2 = new OgCache(root, "key1");
  await c2.init();
  expect(c2.getEntry("/a/")).toBeDefined();
  expect(await c2.hasBlob("b1")).toBe(true);

  const c3 = new OgCache(root, "key2");
  await c3.init();
  expect(c3.getEntry("/a/")).toBeUndefined();
  expect(await c3.hasBlob("b1")).toBe(false);
});

test("html snapshots roundtrip through gzip", async () => {
  const root = await tempDir();
  const cache = new OgCache(root, "k");
  await cache.init();
  const html = new TextEncoder().encode("<html><head><title>x</title></head></html>");
  await cache.snapshotHtml("hash1", html);
  const back = await cache.readHtmlSnapshot("hash1");
  expect(back).toBeDefined();
  expect(Buffer.compare(// SAFETY: readHtmlSnapshot returns Buffer | undefined, defined is checked above
    back as Buffer, Buffer.from(html))).toBe(0);
  expect(await cache.readHtmlSnapshot("missing")).toBeUndefined();
});

test("DiskFetchCache persists http responses to disk and serves them to a new instance", async () => {
  const root = await tempDir();
  const dir = join(root, "fetch");
  await mkdir(dir, { recursive: true });
  const c1 = new DiskFetchCache(dir);
  const url = "https://example.com/logo.png";
  const bytes = new Uint8Array([9, 8, 7]);
  const buf = bytes.buffer.slice(0, bytes.byteLength);
  c1.set(url, Promise.resolve(buf));
  await c1.get(url);

  const c2 = new DiskFetchCache(dir);
  const served = await c2.get(url);
  expect(served).toBeDefined();
  expect(new Uint8Array(// SAFETY: DiskFetchCache.get returns Promise<ArrayBuffer> | undefined, defined is checked above
    served as ArrayBuffer)).toEqual(bytes);

  expect(c2.get("data:image/png;base64,AAA")).toBeUndefined();
  expect(c2.get("https://example.com/other.png")).toBeUndefined();
});
