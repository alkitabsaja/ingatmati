import { DateTime } from "./scripts/date-shim.js";

// Set via env var in CI, e.g. PATH_PREFIX=/my-repo-name
// Leave unset (or "/") for root deployments (custom domain, user/org pages,
// Netlify/Vercel/Cloudflare Pages).
const pathPrefix = process.env.PATH_PREFIX || "/";

export default function (eleventyConfig) {
  // Copy static assets (downloaded images, css, etc.) straight through
  eleventyConfig.addPassthroughCopy("content/assets");
  eleventyConfig.addPassthroughCopy("static/css");

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
