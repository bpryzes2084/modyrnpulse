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

## Membership

Members pay through Square and log in with their email and a password. `src/worker.js` handles `/join`, `/welcome`, `/login`, `/account`, `/reset` and `/members/`. Accounts live in the **modyrnpulse-members** D1 database (schema: `migrations/0002_members.sql`).

**How it works:** a visitor picks a plan on `/join/`, and the Worker creates a Square checkout for that subscription plan. Square sends the buyer back to `/welcome/`, where the Worker confirms the subscription and the buyer sets a password. When a member visits, the Worker checks Square for an active subscription (cached for 6 hours), so people who cancel lose access on their own.

### One-time setup
1. **Create the plans in Square.** In the Square Dashboard, go to Subscriptions and create a plan with fixed prices, for example $5 monthly and $50 yearly. The join page lists whatever plans Square has.
2. **Get a Square access token.** At developer.squareup.com, create an application and switch it to **Production**. Copy the **Access token**.
3. **Add it to Cloudflare.** In the **modyrnpulse** Worker, go to **Settings → Variables and Secrets** and add a **Secret** named `SQUARE_ACCESS_TOKEN`.
   - Optional: `SQUARE_LOCATION_ID`. Without it, the Worker uses your first active location.

Until the token is set, `/join/` shows "Memberships open soon."

### Members-only posts
Add a Markdown file to `content/members/`; `_example.md` shows the format. The file name becomes the address, for example `content/members/hidden-maps.md` becomes `/members/hidden-maps/`. Everyone can see the title and `summary`, and only active members see the rest. Members-only text is built into the Worker and never into `dist/`, so it can't be fetched directly.

### Password resets
Run this in **D1 → modyrnpulse-members → Console**, replacing both values:

```sql
UPDATE members SET reset_code = 'PICK-A-LONG-RANDOM-CODE', reset_expires = (strftime('%s','now') + 86400) * 1000
WHERE email = 'member@example.com';
```

Then send the member `https://modyrnpulse.com/reset/?code=PICK-A-LONG-RANDOM-CODE`. The link works once and expires after 24 hours.

## Email sign-ups (switched off)

Set `"newsletter": true` in `data/site.json` to show the form. Addresses go to the `subscribers` table in the same database.

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
