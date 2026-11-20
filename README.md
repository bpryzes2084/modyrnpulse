# Modyrn Pulse

Legendary internet rabbit holes: hand-picked websites, each with a short guide.

It's a static site with no dependencies. `node build.mjs` writes the whole site to `dist/`, including the homepage, one page per rabbit hole, the collection pages, `sitemap.xml` and `robots.txt`.

`robots.txt` asks AI assistants and AI training crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended and others) to stay out, while regular search engines can still index the site. The list is `AI_BOTS` in `build.mjs`.

## Deploy on Cloudflare Pages

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git** and pick `bpryzes2084/modyrnpulse`.
2. Use these build settings:
   - Framework preset: **None**
   - Build command: `node build.mjs`
   - Build output directory: `dist`
3. Save and deploy. You get a `*.pages.dev` preview address.
4. Check the preview. Then open the project's **Custom domains** tab and add `modyrnpulse.com` and `www.modyrnpulse.com`. This step switches the live domain over to the new site, so whatever serves it today stops serving it.

After that, every push to `main` redeploys the site automatically.

## Email sign-ups

The homepage form posts to `/api/subscribe`, which `src/worker.js` handles. Addresses are saved in the **modyrnpulse-signups** D1 database in Cloudflare (table `subscribers`).

**Download the list:** visit `https://modyrnpulse.com/api/subscribers.csv?key=YOUR_ADMIN_KEY`.

**Set it up:** in the Worker's **Settings → Variables and Secrets**, add a **Secret** named `ADMIN_KEY` with a long random value. Until you do, the download link returns "Not found".

To hide the form, set `"newsletter": false` in `data/site.json`.

## Editing content

| What | Where |
|---|---|
| The 50 rabbit holes (name, link, category, blurb, depth 1–5, optional guide) | `data/holes.json` |
| The site's featured hole, newsletter form and suggestion email | `data/site.json` |
| Collections and "Fresh from the editors" picks | `data/curated.json` |
| Privacy Policy, Terms of Service, DMCA | `content/legal/privacy.html`, `terms.html`, `dmca.html` |
| Look and feel | `src/styles.css` |

- **Guides:** a hole only gets the "What it is / Where to start / Why you won't leave" sections when it has a `guide` in `holes.json`. Copy the shape used by `the-library-of-babel`.
- **Editor picks** are hidden until `editorPicks` has entries. Each entry looks like `{ "kind": "Video", "title": "…", "url": "…", "desc": "…", "image": "…", "imageAlt": "…" }`. The first entry becomes the large lead card.
- **Newsletter** is hidden until you set `newsletterFormAction` to your email provider's form URL.
- **Legal pages** only appear, and only get footer links, once their HTML file exists in `content/legal/`.

## Preview locally

```
node build.mjs
npx serve dist
```
