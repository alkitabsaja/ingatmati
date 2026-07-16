// scripts/archive-to-wayback.js
//
// Submits each post/page's original WordPress URL to the Internet Archive's
// "Save Page Now" API (web.archive.org/save/...), so every piece of content
// gets a permanent, independent backup snapshot.
//
// Run this *after* fetch-content.js, since it reads originalUrl out of the
// frontmatter that script writes.
//
// Usage:
//   node scripts/archive-to-wayback.js
//
// Optional environment variables:
//   ARCHIVE_ORG_ACCESS_KEY / ARCHIVE_ORG_SECRET_KEY
//     If set, requests are authenticated, which is far less likely to be
//     rate-limited. Get a free key at https://archive.org/account/s3.php
//   ARCHIVE_DELAY_MS (default: 5000)
//     Delay between requests, to stay under archive.org's rate limits.
//   ARCHIVE_STATE_FILE (default: .archive-state.json)
//     Tracks which URLs have already been archived so reruns don't
//     resubmit everything every time. Commit this file to the repo (or let
//     the same CI workflow that commits fetched content also commit it) to
//     persist state across runs.

import fs from "node:fs";
import path from "node:path";

const CONTENT_DIRS = ["./content/posts", "./content/pages"];
const STATE_FILE = process.env.ARCHIVE_STATE_FILE || "./.archive-state.json";
const DELAY_MS = Number(process.env.ARCHIVE_DELAY_MS || 5000);
const ACCESS_KEY = process.env.ARCHIVE_ORG_ACCESS_KEY;
const SECRET_KEY = process.env.ARCHIVE_ORG_SECRET_KEY;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull `originalUrl: "..."` out of a Markdown file's YAML frontmatter
 * without needing a full YAML parser — the frontmatter here is always
 * simple flat key/value pairs written by fetch-content.js.
 */
function extractOriginalUrl(fileContent) {
  const match = fileContent.match(/^originalUrl:\s*"(.*)"\s*$/m);
  return match ? match[1] : null;
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    console.warn(`Could not parse ${STATE_FILE}, starting with empty state.`);
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

/**
 * Collect every originalUrl referenced across all fetched content files.
 */
function collectUrls() {
  const urls = [];

  for (const dir of CONTENT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const content = fs.readFileSync(fullPath, "utf-8");
      const url = extractOriginalUrl(content);
      if (url) urls.push(url);
    }
  }

  return urls;
}

/**
 * Submit a single URL to the Wayback Machine's Save Page Now endpoint.
 * Returns { ok, status, archivedUrl } — never throws, so one failure
 * doesn't stop the rest of the batch.
 */
async function archiveUrl(url) {
  const saveUrl = `https://web.archive.org/save/${url}`;
  const headers = {
    "User-Agent": "wp-static-site-archiver/1.0 (+https://github.com/)",
  };

  if (ACCESS_KEY && SECRET_KEY) {
    headers["Authorization"] = `LOW ${ACCESS_KEY}:${SECRET_KEY}`;
  }

  try {
    const res = await fetch(saveUrl, { method: "GET", headers, redirect: "follow" });

    // The Save Page Now API sometimes returns the archived snapshot's
    // location in this header; not always present, so it's best-effort.
    const archivedUrl = res.headers.get("content-location") || null;

    if (res.status === 429) {
      return { ok: false, status: 429, archivedUrl, rateLimited: true };
    }

    return { ok: res.ok, status: res.status, archivedUrl };
  } catch (err) {
    return { ok: false, status: null, archivedUrl: null, error: err.message };
  }
}

async function main() {
  const urls = [...new Set(collectUrls())]; // de-dupe, just in case

  if (urls.length === 0) {
    console.log("No originalUrl values found in content/posts or content/pages — nothing to archive.");
    return;
  }

  const state = loadState();
  const toArchive = urls.filter((url) => !state[url]);

  console.log(`Found ${urls.length} content URLs, ${toArchive.length} not yet archived.`);

  if (toArchive.length === 0) {
    console.log("Everything is already archived. Nothing to do.");
    return;
  }

  if (!ACCESS_KEY || !SECRET_KEY) {
    console.log(
      "Note: running without ARCHIVE_ORG_ACCESS_KEY/ARCHIVE_ORG_SECRET_KEY — " +
        "requests are anonymous and much more likely to be rate-limited. " +
        "See https://archive.org/account/s3.php for a free key."
    );
  }

  let archivedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < toArchive.length; i++) {
    const url = toArchive[i];
    process.stdout.write(`[${i + 1}/${toArchive.length}] Archiving ${url} ... `);

    const result = await archiveUrl(url);

    if (result.ok) {
      console.log(`OK (${result.status})`);
      state[url] = {
        archivedAt: new Date().toISOString(),
        status: result.status,
        archivedUrl: result.archivedUrl,
      };
      archivedCount++;
    } else if (result.rateLimited) {
      console.log(`RATE LIMITED (429) — stopping early, will retry remaining URLs next run.`);
      break;
    } else {
      console.log(`FAILED (${result.status || "network error"}${result.error ? ": " + result.error : ""})`);
      failedCount++;
      // Don't mark failed URLs as done — they'll be retried on the next run.
    }

    saveState(state); // persist incrementally so a mid-run crash doesn't lose progress

    if (i < toArchive.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone. Archived ${archivedCount}, failed ${failedCount}, state saved to ${STATE_FILE}.`);
}

main().catch((err) => {
  console.error("Archiving failed:", err);
  process.exit(1);
});
