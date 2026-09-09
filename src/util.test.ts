import { expect, test } from "vitest";
import { getFilePath } from "./util.js";
import { tmpdir } from "os";
import { join, normalize } from "path";
import { mkdir, mkdtemp, writeFile } from "fs/promises";

test("getFilePath index", async () => {
  const tmpDir = await createTempDir();

  // change the current working directory to the temp dir
  process.chdir(tmpDir);

  // create a folder named blog inside the temp dir
  await writeFile(join(tmpDir, "index.html"), "");

  const result = getFilePath({ dir: "", page: "index/" });

  // change the current working directory back to the original
  process.chdir(__dirname);

  expect(normalize(result)).toBe(normalize("index.html"));
});

test("getFilePath 404", async () => {
  const tmpDir = await createTempDir();

  // change the current working directory to the temp dir
  process.chdir(tmpDir);

  // create a folder named blog inside the temp dir
  await writeFile(join(tmpDir, "404.html"), "");

  const result = getFilePath({ dir: "", page: "404/" });

  // change the current working directory back to the original
  process.chdir(__dirname);

  expect(normalize(result)).toBe(normalize("404.html"));
});

test("getFilePath blog", async () => {
  const tmpDir = await createTempDir();

  // change the current working directory to the temp dir
  process.chdir(tmpDir);

  // create a folder named blog inside the temp dir
  await mkdir(join(tmpDir, "blog"));
  await writeFile(join(tmpDir, "blog", "index.html"), "");

  const result = getFilePath({ dir: "", page: "blog/" });

  // change the current working directory back to the original
  process.chdir(__dirname);

  expect(normalize(result)).toBe(normalize("blog/index.html"));
});

// Astro build.format: 'file' + trailingSlash: 'never' → pathnames without a
// trailing slash (e.g. "docs/getting-started"), HTML at docs/getting-started.html.
// getFilePath must not mangle the last path character (previously "getting-starte.html")
// https://github.com/vikas5914/astro-takumi/issues/159
test("getFilePath file format nested page without trailing slash", async () => {
  const tmpDir = await createTempDir();

  // change the current working directory to the temp dir
  process.chdir(tmpDir);

  await mkdir(join(tmpDir, "docs"));
  await writeFile(join(tmpDir, "docs", "getting-started.html"), "");

  const result = getFilePath({ dir: "", page: "docs/getting-started" });

  // change the current working directory back to the original
  process.chdir(__dirname);

  expect(normalize(result)).toBe(normalize("docs/getting-started.html"));
});

test("getFilePath file format root index without trailing slash", async () => {
  const tmpDir = await createTempDir();

  // change the current working directory to the temp dir
  process.chdir(tmpDir);

  await writeFile(join(tmpDir, "index.html"), "");

  const result = getFilePath({ dir: "", page: "" });

  // change the current working directory back to the original
  process.chdir(__dirname);

  expect(normalize(result)).toBe(normalize("index.html"));
});

// https://sdorra.dev/posts/2024-02-12-vitest-tmpdir
async function createTempDir() {
  const ostmpdir = tmpdir();
  const dir = join(ostmpdir, "unit-test-");
  return await mkdtemp(dir);
}
