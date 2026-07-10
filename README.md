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

### Using a custom domain with GitHub Pages

Add a `CNAME` file to `static/` (Eleventy will need a passthrough copy, or
just drop it directly in `_site` post-build) containing your domain, and
configure a `CNAME` DNS record pointing to `<username>.github.io`. See
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

These platforms have their own free tiers and typically deploy on every
push automatically. To pick up *new WordPress content* without a new git
push, either:
- Use their scheduled/cron build feature if available, or
- Set up a WordPress webhook (via a plugin like **WP Webhooks**) that fires
  on `publish_post` and hits that host's **build hook URL** to trigger a
  rebuild on demand — this is the fastest way to get "publish in WordPress
  → live in seconds."

## Project structure

```
.
├── content/
│   ├── posts/          ← generated .md files (one per WP post)
│   ├── pages/           ← generated .md files (one per WP page)
│   ├── assets/images/   ← downloaded featured images
│   └── index.njk        ← homepage template (lists posts)
├── _includes/
│   ├── base.njk          ← shared HTML shell
│   ├── post.njk          ← single post layout
│   └── page.njk          ← single page layout
├── static/css/style.css   ← site styling
├── scripts/
│   ├── fetch-content.js   ← WP REST API → Markdown converter
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
