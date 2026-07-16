import { DateTime } from "./scripts/date-shim.js";

// Set via env var in CI, e.g. PATH_PREFIX=/my-repo-name
// Leave unset (or "/") for root deployments (custom domain, user/org pages,
// Netlify/Vercel/Cloudflare Pages).
const pathPrefix = process.env.PATH_PREFIX || "/";

// The final public URL of this deployment, e.g. https://username.github.io
// or https://my-project.surge.sh — used to build absolute canonical URLs
// for pages that don't have an original WordPress URL (like the homepage).
// No trailing slash. Falls back to a placeholder if unset so builds still
// succeed locally without it configured.
//
// Defensively normalized: if SITE_URL was accidentally passed without a
// scheme (just "my-site.surge.sh") we add https://; if it was passed with
// one already we leave it as-is. This guards against configs that
// mistakenly do something like `"https://" + vars.SOME_DOMAIN` when
// SOME_DOMAIN already includes the scheme, which would otherwise produce
// "https://https://...".
function normalizeSiteUrl(rawUrl) {
  let value = (rawUrl || "https://example.com").trim().replace(/\/$/, "");
  // Capture the first scheme actually present (defaults to https if none),
  // then strip *all* scheme prefixes so a doubled one like
  // "https://https://x.com" or "https://http://x.com" collapses correctly
  // instead of being left with a scheme still embedded in the host.
  const firstSchemeMatch = value.match(/^(https?):\/\//i);
  const scheme = firstSchemeMatch ? firstSchemeMatch[1].toLowerCase() : "https";
  value = value.replace(/^(https?:\/\/)+/i, "");
  return `${scheme}://${value}`;
}

const siteUrl = normalizeSiteUrl(process.env.SITE_URL);

export default function (eleventyConfig) {
  // Copy static assets (downloaded images, css, etc.) straight through
  eleventyConfig.addPassthroughCopy("content/assets");
  eleventyConfig.addPassthroughCopy({ "static/css": "css" });
  eleventyConfig.addPassthroughCopy({
    "node_modules/@picocss/pico/css/pico.min.css": "css/pico.min.css",
  });

  eleventyConfig.addGlobalData("siteUrl", siteUrl);

  // Human-friendly date filter for templates: {{ date | readableDate }}
  eleventyConfig.addFilter("readableDate", (dateObj) => {
    return DateTime.fromISO(String(dateObj)).toFormat("LLLL d, yyyy");
  });

  // Machine-readable ISO date for <time datetime="..."> attributes
  eleventyConfig.addFilter("isoDate", (dateObj) => {
    const d = new Date(dateObj);
    return isNaN(d.getTime()) ? String(dateObj) : d.toISOString();
  });

  // Prefixes an absolute path with pathPrefix, e.g. "/css/style.css" becomes
  // "/my-repo/css/style.css" when deployed under a project subpath.
  // Use this for every internal absolute link/src/href in templates.
  eleventyConfig.addFilter("url", (relativePath = "") => {
    if (/^https?:\/\//.test(relativePath)) return relativePath; // leave external URLs alone
    const prefix = pathPrefix.replace(/\/$/, ""); // strip trailing slash
    const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
    return `${prefix}${path}` || "/";
  });

  // Builds a full absolute URL (with domain) from a site-relative path,
  // applying pathPrefix along the way. Use for canonical tags, OG tags,
  // sitemaps, and anywhere else a fully-qualified URL is required.
  eleventyConfig.addFilter("absoluteUrl", (relativePath = "") => {
    if (/^https?:\/\//.test(relativePath)) return relativePath; // already absolute
    const prefix = pathPrefix.replace(/\/$/, "");
    const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
    return `${siteUrl}${prefix}${path}`;
  });

  // Collection of all posts, newest first
  eleventyConfig.addCollection("posts", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("content/posts/*.md")
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("pages", (collectionApi) => {
    return collectionApi.getFilteredByGlob("content/pages/*.md");
  });

  return {
    pathPrefix,
    dir: {
      input: "content",
      includes: "../_includes",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}