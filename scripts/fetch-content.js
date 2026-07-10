// scripts/fetch-content.js
//
// Fetches posts and pages from a WordPress REST API and writes them
// as Markdown files with frontmatter, ready for Eleventy to build.
//
// Usage:
//   WP_SITE_URL=https://yoursite.com node scripts/fetch-content.js
//
// Or set WP_SITE_URL in a .env file / repo secret (see README).

import fs from "node:fs";
import path from "node:path";
import TurndownService from "turndown";

const SITE = process.env.WP_SITE_URL;
const OUT_POSTS = "./content/posts";
const OUT_PAGES = "./content/pages";
const ASSETS_DIR = "./content/assets/images";

if (!SITE) {
  console.error("Missing WP_SITE_URL environment variable.");
  console.error("Example: WP_SITE_URL=https://yoursite.com node scripts/fetch-content.js");
  process.exit(1);
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/**
 * Fetch all items from a paginated WP REST API endpoint.
 */
async function fetchAll(endpoint) {
  let page = 1;
  let results = [];

  while (true) {
    const url = `${SITE.replace(/\/$/, "")}/wp-json/wp/v2/${endpoint}${
      endpoint.includes("?") ? "&" : "?"
    }per_page=100&page=${page}`;

    const res = await fetch(url);

    // WP returns 400 once you page past the last page - treat as "done"
    if (res.status === 400) break;
    if (!res.ok) {
      console.warn(`Warning: ${url} returned ${res.status}, stopping pagination.`);
      break;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    results = results.concat(data);

    const totalPages = Number(res.headers.get("x-wp-totalpages") || 1);
    if (page >= totalPages) break;
    page++;
  }

  return results;
}

/**
 * Download an image to the local assets folder and return the local path.
 * Skips download if the file already exists (keeps rebuilds fast).
 */
async function downloadImage(url) {
  if (!url) return null;
  try {
    const filename = path.basename(new URL(url).pathname);
    const localPath = path.join(ASSETS_DIR, filename);

    if (!fs.existsSync(localPath)) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(ASSETS_DIR, { recursive: true });
      fs.writeFileSync(localPath, buffer);
    }

    return `/assets/images/${filename}`;
  } catch (err) {
    console.warn(`Could not download image ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Escape a string for safe use inside YAML frontmatter double-quotes.
 */
function yamlEscape(str = "") {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").trim();
}

/**
 * Strip WordPress "Read more" / block editor artifacts the API sometimes
 * leaves behind, then convert HTML content to Markdown.
 */
function contentToMarkdown(html) {
  const cleaned = (html || "")
    .replace(/<!--\s*wp:.*?-->/g, "")
    .replace(/<!--\s*\/wp:.*?-->/g, "");
  return turndown.turndown(cleaned).trim();
}

async function processCollection(endpoint, outDir, typeLabel) {
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Fetching ${typeLabel}...`);
  const items = await fetchAll(`${endpoint}?_embed`);
  console.log(`  Found ${items.length} ${typeLabel}`);

  for (const item of items) {
    const title = item.title?.rendered || "Untitled";
    const slug = item.slug || String(item.id);
    const date = item.date || new Date().toISOString();
    const modified = item.modified || date;

    // Featured image, if present via _embed
    const media = item._embedded?.["wp:featuredmedia"]?.[0];
    let featuredImage = null;
    if (media?.source_url) {
      featuredImage = await downloadImage(media.source_url);
    }

    // Author name, if present via _embed
    const author = item._embedded?.author?.[0]?.name || null;

    // Categories/tags, if present via _embed (posts only)
    const terms = (item._embedded?.["wp:term"] || []).flat();
    const categories = terms
      .filter((t) => t.taxonomy === "category")
      .map((t) => t.name);
    const tags = terms.filter((t) => t.taxonomy === "post_tag").map((t) => t.name);

    const body = contentToMarkdown(item.content?.rendered);
    const excerpt = contentToMarkdown(item.excerpt?.rendered);

    const frontmatterLines = [
      "---",
      `title: "${yamlEscape(title)}"`,
      `slug: "${slug}"`,
      `date: ${date}`,
      `modified: ${modified}`,
      `layout: "${typeLabel === "pages" ? "page" : "post"}.njk"`,
    ];

    if (author) frontmatterLines.push(`author: "${yamlEscape(author)}"`);
    if (featuredImage) frontmatterLines.push(`image: "${featuredImage}"`);
    if (categories.length) {
      frontmatterLines.push(`categories: [${categories.map((c) => `"${yamlEscape(c)}"`).join(", ")}]`);
    }
    if (tags.length) {
      frontmatterLines.push(`tags: [${tags.map((t) => `"${yamlEscape(t)}"`).join(", ")}]`);
    }
    if (excerpt) frontmatterLines.push(`excerpt: "${yamlEscape(excerpt).slice(0, 300)}"`);

    frontmatterLines.push("---", "");

    const fileContent = frontmatterLines.join("\n") + body + "\n";
    fs.writeFileSync(path.join(outDir, `${slug}.md`), fileContent, "utf-8");
  }

  return items.length;
}

async function main() {
  console.log(`Fetching content from ${SITE}\n`);

  const postCount = await processCollection("posts", OUT_POSTS, "posts");
  const pageCount = await processCollection("pages", OUT_PAGES, "pages");

  console.log(`\nDone. Wrote ${postCount} posts and ${pageCount} pages.`);
}

main().catch((err) => {
  console.error("Fetch failed:", err);
  process.exit(1);
});
