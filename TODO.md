# Modyrn Pulse to-do

## Membership (Square)
- [x] Member accounts built: join → Square checkout → set password → members-only posts; cancellations lock out automatically
- [ ] In Square: create subscription plans with fixed prices (suggested: $5/month and $50/year)
- [ ] At developer.squareup.com: create an app, switch to Production, copy the Access token
- [ ] In Cloudflare: Worker → Settings → Variables and Secrets → add Secret SQUARE_ACCESS_TOKEN
- [ ] Do one real test signup, then cancel it in Square and check access stops (within 6 hours)
- [ ] Write the first members-only post (content/members/, or ask Claude)
- [ ] Add a contact email to the site so members can ask for password resets and cancellations

## Email sign-ups (off)
- Form removed from the site. To turn it back on, set "newsletter": true in data/site.json.
- [ ] Before turning it back on: plan to actually send emails, include an unsubscribe option, and cover it in the Privacy Policy

## Before sharing widely
- [ ] Copy Privacy Policy, Terms of Service and DMCA text from modyrnpulse.pages.dev (old site) and add to content/legal/
- [ ] Then delete the old Cloudflare Pages project
- [ ] Cloudflare → Security → Settings → Bot traffic: Block AI bots on all pages, Bot Fight Mode on, managed robots.txt on
- [ ] Click through every rabbit hole on the live site (especially stuffin.space) and report broken ones

## Make it more appealing
- [ ] Preview screenshot for every card and page
- [ ] Write guides for the remaining rabbit holes (only The Library of Babel has one)
- [ ] Share preview images for links posted on social media and in texts
- [ ] Rotate "This week's hole" automatically every Friday; "New" badges for added sites
- [ ] Consider splitting Live Planet (16 sites) into two categories

## Money
- [ ] Check which listed sites have affiliate programs (GeoGuessr, Windy, Flightradar24) and add "Go Pro" links
- [ ] Amazon Associates / Bookshop.org links where a book fits
- [ ] Tip jar (Ko-fi or Buy Me a Coffee) in the footer
- [ ] Update the Privacy Policy to cover member accounts, Square payments and affiliate links
