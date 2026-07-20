# WP → Static Site Pipeline

Fetches content from a WordPress site's REST API, builds a static site with
[Eleventy](https://www.11ty.dev/), and deploys it for free via GitHub Pages
(or any static host you prefer).

```
WordPress (REST API) → fetch-content.js → Markdown → Eleventy → _site/ → GitHub Pages
```

## How it works

- `scripts/fetch-content.js` calls `/wp-json/wp/v2/posts` and `/wp-json/wp/v2/pages`
  on your WordPress site, converts each item's HTML content to Markdown, downloads
  featured images locally, and writes one `.md` file per post/page with YAML
  frontmatter into `content/posts/` and `content/pages/`.
- Eleventy reads those Markdown files and renders them into full HTML pages
  using the templates in `_includes/`.
- A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs the fetch +
  build on every push, on a schedule (every 6 hours by default), or manually,
  then deploys the result to GitHub Pages.

No WordPress plugin is required — this only uses the REST API that's enabled
by default on any standard WordPress install.

### Fetched content is committed back to the repo

After every fetch, the workflow commits any new/changed Markdown files and
images in `content/posts/`, `content/pages/`, and `content/assets/` back to
`main`, authored by a bot user (`wp-sync-bot`). This means:

- Your repo always has an up-to-date, version-controlled copy of your
  WordPress content as plain Markdown files — you can browse it, diff it,
  or `git clone` it independently of the built site.
- If nothing changed since the last fetch, no commit is made (the action
  no-ops on an empty diff).
- To avoid an infinite loop (bot commits → triggers `push` → triggers
  workflow → fetches again → commits again → ...), the workflow checks
  whether the triggering commit's author is `wp-sync-bot` and skips the
  rest of the job if so. Scheduled and manual runs are unaffected — only
  a `push` event caused by the bot's own commit is skipped.

If you'd rather **not** commit fetched content back to git (e.g. you're
deploying to Netlify/Vercel/Cloudflare Pages and only care about the built
output), just delete the "Commit fetched content back to repo" step from
the workflow — the build will still work exactly the same, it just won't
persist the intermediate Markdown.

## Local setup

```bash
npm install

# Point at your WordPress site and fetch content
WP_SITE_URL=https://yoursite.com npm run fetch

# Build the static site
npm run build

# Or fetch + build in one step
WP_SITE_URL=https://yoursite.com npm run sync

# Preview locally with live reload
npm run serve
```

Built output goes to `_site/`. Open `_site/index.html` or use `npm run serve`
to preview at `http://localhost:8080`.

## Connecting your WordPress site

Requirements:
- Your WordPress site must have the REST API enabled (default on all modern
  WordPress installs — no plugin needed).
- Only **public, published** posts/pages are fetched. Private/draft content
  requires authentication, which this script does not include by default
  (see "Fetching private content" below).
- If your site has a security plugin (Wordfence, etc.) that blocks the REST
  API or blocks unfamiliar user agents, allowlist the API routes or your
  CI runner's requests.

Test that your REST API is reachable before wiring up CI:

```bash
curl https://yoursite.com/wp-json/wp/v2/posts
```

If that returns JSON, you're good to go.

## Deploying to GitHub Pages (included, free)

1. Push this repo to GitHub.
2. In your repo: **Settings → Pages → Build and deployment → Source** → select
   **GitHub Actions**.
3. In your repo: **Settings → Secrets and variables → Actions → New repository
   secret**:
   - Name: `WP_SITE_URL`
   - Value: `https://yoursite.com`
4. Push to `main` (or trigger the workflow manually from the **Actions** tab).
   The workflow will fetch content, build the site, and deploy it.
5. Your site will be live at `https://<username>.github.io/<repo>/`.

The workflow also runs automatically every 6 hours (see the `cron` schedule
in `.github/workflows/deploy.yml`) so new WordPress posts show up without
you doing anything. Adjust the schedule to taste — e.g. `0 * * * *` for hourly.

### Serving from a subpath (`/reponame/`) vs. root

GitHub Pages serves **project repos** (anything not named `<username>.github.io`)
at a subpath: `https://<username>.github.io/<reponame>/`. Every internal link
(CSS, images, nav links) needs that `/reponame/` prefix baked in, or your CSS
and links will 404.

This is handled automatically:

- `eleventy.config.js` reads a `PATH_PREFIX` env var and applies it via
  Eleventy's `pathPrefix` option plus a custom `url` template filter.
- All templates (`base.njk`, `post.njk`, `content/index.njk`) already wrap
  every internal absolute link/href/src in `{{ ... | url }}`, so they pick up
  the prefix automatically.
- The included GitHub Actions workflow auto-computes `PATH_PREFIX` from your
  **repo name** at build time — no manual configuration needed for a normal
  project repo.

**You only need to override this if:**
- You're using a **custom domain** (site served at root, not a subpath), or
- Your repo is named exactly `<username>.github.io` (also served at root), or
- You're deploying to Netlify/Vercel/Cloudflare Pages instead (also root by
  default).

To override: in your repo, go to **Settings → Secrets and variables →
Actions → Variables tab → New repository variable**, name it `PATH_PREFIX`,
and set it to `/` (root). The workflow prefers this variable over the
auto-computed repo name when it's set.

For local builds, root is the default — no env var needed:

```bash
npm run build              # builds for root ("/")
PATH_PREFIX=/my-repo npm run build   # builds for a subpath, e.g. to test
                                       # exactly what GitHub Pages will serve
```

### Using a custom domain with GitHub Pages

Add a `CNAME` file to `static/` (Eleventy will need a passthrough copy, or
just drop it directly in `_site` post-build) containing your domain, and
configure a `CNAME` DNS record pointing to `<username>.github.io`. Also set
the `PATH_PREFIX` repository variable to `/` as described above, since custom
domains are served from root. See
[GitHub's custom domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
for details.

## Deploying elsewhere instead (Netlify / Vercel / Cloudflare Pages)

All of these can build directly from your GitHub repo without needing the
included GitHub Actions workflow — just point them at the repo and set:

- **Build command:** `npm run fetch && npm run build`
  *(or just `npm run build` if you prefer to run `fetch` only via a separate
  scheduled job/webhook)*
- **Publish directory:** `_site`
- **Environment variable:** `WP_SITE_URL=https://yoursite.com`

These platforms serve your site from the **root** of their own domain/subdomain
(e.g. `yoursite.netlify.app`), so you do **not** need to set `PATH_PREFIX` —
leave it unset and it defaults to `/`.

These platforms have their own free tiers and typically deploy on every
push automatically. To pick up *new WordPress content* without a new git
push, either:
- Use their scheduled/cron build feature if available, or
- Set up a WordPress webhook (via a plugin like **WP Webhooks**) that fires
  on `publish_post` and hits that host's **build hook URL** to trigger a
  rebuild on demand — this is the fastest way to get "publish in WordPress
  → live in seconds."

## Styling and dark/light theme

The site uses [Pico CSS](https://picocss.com) (v2), a small classless-first
CSS framework that styles semantic HTML directly — no utility classes
needed. It's self-hosted from `node_modules` (not a CDN), so builds work
offline and don't depend on a third party at runtime.

- **Dark/light mode is built in.** By default the site follows the visitor's
  OS-level preference (`prefers-color-scheme`).
- **A toggle button** (sun/moon icon, top right) lets visitors override that
  and pick light or dark explicitly. Their choice is saved in
  `localStorage` and persists across visits.
- **No flash of the wrong theme:** a small inline script in `<head>` applies
  the saved preference before the page paints.
- `static/css/style.css` contains only small layout overrides (reading-width
  container, nav spacing, toggle button styling) — all actual colors and
  component styling come from Pico's CSS variables, so re-theming means
  swapping Pico's color variant or overriding a handful of `--pico-*`
  variables, not rewriting a stylesheet.

To use a different built-in Pico color scheme (e.g. blue, emerald), swap the
passthrough copy path in `eleventy.config.js`:

```js
eleventyConfig.addPassthroughCopy({
  "node_modules/@picocss/pico/css/pico.min.css": "css/pico.min.css",
});
```

to point at any file in `node_modules/@picocss/pico/css/` (see that folder
for all available color/style variants).

## SEO

Several SEO essentials are built in and generated automatically:

- **Canonical tags** point back to the original WordPress post/page URL
  (captured in frontmatter as `originalUrl` during fetch), so search engines
  treat WordPress as the authoritative source rather than flagging this
  static mirror as duplicate content. Pages with no WordPress equivalent
  (like the homepage) get a canonical pointing at their own absolute URL.
- **Open Graph and Twitter Card meta tags** are generated per-page (title,
  description, image, article type/author/publish-date for posts) so links
  shared on social platforms and chat apps render nice previews.
- **`robots.txt`** is generated at build time, allows all crawlers, and
  points to the sitemap.
- **`sitemap.xml`** is generated at build time, listing every post, page,
  and the homepage as absolute URLs with `lastmod` dates.

All of this depends on two things being set correctly at build time:

- **`SITE_URL`** — the final public URL of the deployment (no trailing
  slash), e.g. `https://username.github.io` or `https://my-site.surge.sh`.
  Used to build every absolute URL (canonical fallback, OG tags, sitemap).
  Defaults to a placeholder (`https://example.com`) if unset, so local
  builds still succeed without it configured — just don't ship that build.
- **`PATH_PREFIX`** — see the deployment sections above; affects the path
  portion of every absolute URL the same way it affects internal links.

The included GitHub Actions workflow already sets both correctly for both
GitHub Pages and Surge deploys. If you add another host, set `SITE_URL`
(and `PATH_PREFIX` if it serves from a subpath) in that build step too.

## Archiving to the Wayback Machine

`scripts/archive-to-wayback.js` submits every fetched post/page's original
WordPress URL (the `originalUrl` frontmatter field) to the Internet
Archive's [Save Page Now](https://web.archive.org) API, so each piece of
content gets an independent, permanent backup snapshot outside of both
WordPress and this repo.

```bash
npm run archive
```

Run this any time after `npm run fetch` (it reads `originalUrl` out of the
Markdown files that step writes). It's already wired into the included
GitHub Actions workflow as an optional step that runs right after fetching
and before committing.

**How it works:**
- Tracks progress in `.archive-state.json` (committed to the repo alongside
  fetched content), so reruns only archive URLs that haven't been archived
  yet — not the entire site every time.
- Archives at most `ARCHIVE_BATCH_SIZE` URLs per run (default: **5**). The
  rest are left for the next run — since the scheduled workflow runs every
  6 hours, a large backlog of posts gets fully archived gradually over
  several runs rather than all at once. Safe to just let it run on its
  normal schedule, or re-run manually to work through a backlog faster.
- Waits `ARCHIVE_DELAY_MS` (default 5000ms) between requests to stay under
  archive.org's rate limits.
- If archive.org returns a 429 (rate limited), it stops early and leaves
  the remaining URLs for the next run rather than hammering the API.
- Failures are never retried automatically within the same run, but aren't
  marked as done either — they'll be retried on the next run.
- In CI, this step uses `continue-on-error: true`, so a Wayback Machine
  outage or rate-limit never blocks your actual site deploy.

**Recommended: get a free API key** for much more reliable archiving
(anonymous requests are heavily rate-limited). Get one at
[archive.org/account/s3.php](https://archive.org/account/s3.php), then set:

- Locally: `ARCHIVE_ORG_ACCESS_KEY` / `ARCHIVE_ORG_SECRET_KEY` env vars
- In CI: add both as repository secrets with the same names

Without a key, the script still works, just expect more `FAILED` /
rate-limited lines in the log — those URLs simply get retried next run.

## RSS feed

An RSS 2.0 feed is generated automatically at `/feed.xml`, listing every
post (newest first) with full HTML content, so people can subscribe in
their feed reader of choice.

- **Auto-discovery:** every page includes a `<link rel="alternate">` tag in
  `<head>` so browsers and feed readers can find the feed automatically.
  There's also a plain "RSS feed" link in the site footer.
- **Full content, not just excerpts:** each item includes the complete
  rendered post body (`<content:encoded>`), plus the excerpt as the
  standard `<description>`, so feed readers that only support one or the
  other both get something useful.
- Includes author (`<dc:creator>`) and categories when present in a post's
  frontmatter.
- Respects `SITE_URL` and `PATH_PREFIX` the same way every other absolute
  URL in the site does — no extra configuration needed beyond what you've
  already set up for canonical tags and the sitemap.

## Project structure

```
.
├── content/
│   ├── posts/          ← generated .md files (one per WP post)
│   ├── pages/           ← generated .md files (one per WP page)
│   ├── assets/images/   ← downloaded featured images
│   ├── index.njk        ← homepage template (lists posts)
│   ├── feed.xml.njk      ← generated RSS 2.0 feed
│   ├── robots.txt.njk    ← generated robots.txt
│   └── sitemap.xml.njk   ← generated sitemap.xml
├── _includes/
│   ├── base.njk          ← shared HTML shell + Pico CSS + theme toggle + SEO tags
│   ├── post.njk          ← single post layout
│   └── page.njk          ← single page layout
├── static/css/style.css   ← small overrides on top of Pico CSS
├── scripts/
│   ├── fetch-content.js   ← WP REST API → Markdown converter
│   ├── archive-to-wayback.js  ← submits original URLs to the Wayback Machine
│   └── date-shim.js       ← tiny date formatter (no external deps)
├── eleventy.config.js
├── .github/workflows/deploy.yml
└── package.json
```

## Extending this

- **Comments:** since the site is static, native WordPress comments won't
  work. Use a third-party service like Giscus (GitHub-based, free) or
  utterances.
- **Search:** add a client-side search index (e.g. Pagefind) as a
  post-build step.
- **Custom post types / taxonomies:** add another `processCollection(...)`
  call in `fetch-content.js` pointing at the relevant REST endpoint
  (e.g. `products` for WooCommerce, if registered with `show_in_rest`).
- **Faster incremental rebuilds:** the image downloader already skips
  re-downloading existing files; for very large sites, consider tracking a
  `modified` timestamp cursor to skip re-fetching unchanged posts.
