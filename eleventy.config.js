import { DateTime } from "./scripts/date-shim.js";

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
    dir: {
      input: "content",
      includes: "../_includes",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
