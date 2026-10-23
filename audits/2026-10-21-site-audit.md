# Breaking Ice Productions: site audit (2026-10-21)

Read-only audit. Nothing in the code or in Sanity was changed.

**How it was checked**
- **Live site:** https://breaking-ice-website.vercel.app (build `ca4a949`). All 35 sitemap URLs plus a 404 were fetched and parsed. Key pages were rendered at 375, 768 and 1440 px (also 360 and 1280 for spot checks) and measured for overflow, tap targets and text size. Contrast was computed for light and dark themes. Mobile screenshots were taken.
- **Source review:** `src/` at commit `ca4a949`.
- **Content:** live Sanity content (project `8rusxi8t`, dataset `production`).

Paths below are relative to the repo root. **G** means `src/app/globals.css`.

---

## 1. Summary

### Overall state
- **Built well:**
  - Clean App Router structure.
  - Proper `seoMeta` helper with canonicals and OG on almost every page.
  - JSON-LD for Organization, WebSite, Service, FAQPage, BreadcrumbList and VideoObject.
  - Good contact-form error handling.
  - Reduced-motion support.
  - No contrast failures in either theme.
  - No broken internal links.
  - Fast server response.
- **What's wrong:**
  - Content gaps leak through as visible `[placeholder]` text on 22 pages.
  - Testimonials break the "never name people" rule.
  - Two real mobile bugs: the menu opens only 68px tall, and every page scrolls sideways at phone width.
  - The CSS has grown by appending patches, leaving leftover cut-corner shapes, duplicate rules, about eight label styles and ten breakpoints.

### Top 5 issues
1. **FMT-05: the mobile menu is broken.** Tapping the menu button opens a panel only 68px tall (measured at 375px), so phone visitors can't navigate.
2. **UI-01: testimonials show real names.** 11 testimonials name client contacts or film participants (e.g. "Kyle Newhook", "Al & Lin", "Elly"). They appear in the home carousel and on three service pages.
3. **UI-02 to UI-05: visible placeholder text.**
   - "[Services]" on all 20 story pages.
   - "[Year]" and "[Place]" on 5 story pages.
   - "[A true line…] / [Name]" and "[Speaker]: [Transcript…]" on the Imperial NDP story.
   - "[Heading 1–3]" on /accessibility.
   - "[Booking link…]" on /contact.
4. **FMT-04: sideways scroll on every page at 375px.** The page is 436–489px wide in a 375px screen. The footer email doesn't wrap, and the big email on /contact overflows too.
5. **SEO-01: titles too long.** 22 of 35 titles are over 60 characters, and 10 story titles say "Breaking Ice" twice ("… | Breaking Ice · Breaking Ice Productions").

### Issue count

| Pass | High | Medium | Low | Total |
|---|---|---|---|---|
| SEO | 1 | 4 | 7 | 12 |
| Format & spacing | 4 | 14 | 9 | 27 |
| Content & UI | 5 | 9 | 5 | 19 |
| **Total** | **10** | **27** | **21** | **58** |

Two format items didn't reproduce in the browser (FMT-03, FMT-08). They're kept as Low "verify" items. Info-only notes (SEO-07, SEO-13) aren't counted.

---

## 2. Findings by pass

### Pass 1: SEO

**SEO-01 · High · Titles too long and double-branded** · Quick
- Where: `src/lib/seo.ts:19`, plus the template in `src/app/layout.tsx:29` (`%s · Breaking Ice Productions` adds 27 characters).
- Evidence (live lengths):
  - Home 71
  - /northwest-territories 76
  - /services 62
  - Story pages 73–87
  - Sanity SEO titles on 10 stories already end in "| Breaking Ice", e.g. fly-north 87 characters: "Pilot Careers in the North | North-Wright Air | Breaking Ice · Breaking Ice Productions".
- Fix, in `seoMeta`:
  - Strip a trailing `/\s*[|·–-]\s*Breaking Ice.*$/i` from the title.
  - If `title.length + 27 > 60`, return `title: { absolute: title }`.
  - Home: `title: { absolute: 'Breaking Ice Productions · Video in Alberta & the NWT' }`.
  - NWT fallback: "Video production in the NWT".
  - Services fallback: "Video production services".

**SEO-02 · Medium · Short or duplicated meta descriptions (target 120–160)** · Quick in code, Moderate for copy
- Evidence (live lengths):
  - home 116
  - /services 115
  - six service pages 48–77 (they fall back to the one-line summary)
  - about 54
  - contact 76
  - alberta 90
  - NWT 76
  - stories 88
  - privacy and accessibility reuse the site default (99)
  - 12 story SEO descriptions are under 120
- `contact/page.tsx:9` fallback says "usually within a day or two", but Sanity says "within two business days".
- Fix:
  - Code fallbacks:
    - About: "Founded in Norman Wells, NWT in 2022 and now also based in Stony Plain, Alberta. Meet Josh Ferguson and the patient, people-first way we make films."
    - Contact: "Tell us about the story and the people in it. Josh reads every message and replies within two business days."
    - Services: `${summary} From Stony Plain, AB and Norman Wells, NT.`
  - Make the contact reply-time wording match Sanity.
  - Fill in the Sanity SEO fields (see Needs Josh).

**SEO-03 · Medium · Privacy and Accessibility have no canonical, OG or Twitter tags** · Quick
- Where: `src/app/(site)/privacy/page.tsx:3` and `accessibility/page.tsx:3` export a static `{ title }`. The `legalPage` schema has an SEO field (`src/sanity/schemaTypes/documents/misc.ts:121`) that's ignored.
- Fix: `generateMetadata` → `seoMeta(doc?.seo, 'Privacy', '<description>', { path: '/privacy', eyebrow: 'Legal' })`. Same for Accessibility.

**SEO-04 · Low · `siteSettings.defaultSeo.image` is never used** · Quick
- Where: `src/lib/data.ts:20,42` fetch it. `seoMeta` falls back to the generated `/og` card instead, so the Mackenzie River aerial set in Sanity is ignored.
- Fix: pass `defaultSeo.image` into `seoMeta` as the last image fallback before `/og`, or remove the field. Owner preference (Needs Josh).

**SEO-05 · Medium · Thin Organization and LocalBusiness schema** · Quick
- Where: `src/components/json-ld.tsx:14-35`; `src/components/location-page.tsx:20`.
- What's missing or wrong:
  - No `address`, `founder`, `foundingDate` or `image`.
  - `sameAs` is empty because no social URLs exist.
  - The logo is an 8:1 SVG; Google wants a square raster of at least 112px.
  - Location entities are named "Breaking Ice Productions · Alberta" instead of the exact business name.
  - No `image` or `geo` on the location entities.
- Fix:
  - Add `founder: {'@type':'Person', name:'Josh Ferguson'}`, `foundingDate: '2022'` and `address` (Stony Plain AB, Norman Wells NT).
  - Use a square PNG logo (export of `bi-symbol`).
  - Use `name: SITE_NAME` on the location entities and add `image: loc.heroImage`.
  - `sameAs` once social links exist.

**SEO-06 · Low · VideoObject gaps** · Moderate
- Where: `src/app/(site)/stories/[slug]/page.tsx:59-72`.
- `uploadDate` is invented as `${year}-01-01`.
- VideoObject is skipped on the 4 stories with no year (Ten Stone, Boiler Controls, Canoe North Lodge, Emergency Funding).
- No `duration`, and no VideoObject for the home reel.
- Fix:
  - Add a `releaseDate` field (or use `_createdAt`) and an ISO 8601 `duration`.
  - Emit VideoObject without a year when needed.
  - Fill in the years (Needs Josh).

**SEO-07 · Info · FAQPage and Service schema are fine**
- Google only shows FAQ rich results for government and health sites. No change needed.

**SEO-08 · Low · Sitemap `lastModified` is always "now"** · Quick
- Where: `src/app/sitemap.ts:10`.
- Fix: select `_updatedAt` in `getProjects`/`getServices` and use it.

**SEO-09 · Low · Heading level skips** · Quick
- /services and /stories go from H1 straight to H3 (card titles) (`services/page.tsx`, `stories/page.tsx`, `components/cards.tsx`).
- /contact has no H2.
- Fix: add an sr-only `<h2>` on each ("All services", "All stories", "Other ways to reach us").

**SEO-10 · Medium · Video boxes without posters; many Vimeo players** · Moderate
- Home mounts the hero plus 4 process-step Vimeo players (`src/components/sections.tsx:86`).
- These have no `posterUrl`, so they're empty boxes until the player loads:
  - the process clips
  - the About hero (`about/page.tsx:32`)
  - the service hero clip (`services/[slug]/page.tsx:95`, in the first screen, which hurts LCP)
- Fix:
  - Pass posters: service `cardImage` for the service clip; a new `poster` image or a Vimeo thumbnail for the others.
  - Consider `hoverOnly` or tap-to-play for process clips on mobile.

**SEO-11 · Low · Thin story pages** · Large (content)
- 19 of 20 stories have no case study and no transcript. The page is hero, title, summary and meta row only.
- Fix: 2–3 sentences of story per project, plus transcripts (these also feed VideoObject). Mostly content (Needs Josh).

**SEO-12 · Low · `/og` route renders any text** · Quick
- Where: `src/app/og/route.tsx:34`. Anyone can generate a branded card with arbitrary words.
- Fix: cap the title length and allow only the eyebrow labels the site uses, or sign the query.
- Pre-launch note: the `SITE_PASSWORD` gate (`src/proxy.ts`) also blocks `/og`, so share previews can't work until launch. That's expected.

**SEO-13 · Info · Internal links**
- Every internal href was checked (nav, footer, cards, `?type=`, `#book`, `?category=`, testimonial links, legal anchors). No broken links. The 404 returns status 404.

**SEO-14 · Low · Naming consistency (local SEO)** · Quick once decided
- Name, email and phone are consistent across settings, footer, location pages and JSON-LD.
- Inconsistent:
  - "Sahtú" vs "Sahtu"
  - "North-Wright Air" vs "North-Wright Airways"
  - "Imperial" vs "Imperial Oil" vs "Imperial Norman Wells project"
- Fix: pick one spelling of each (Needs Josh), then update Sanity.

**Launch-day switches (not issues, for the record):**
1. `src/app/robots.ts:7` → `{ userAgent:'*', allow:'/', disallow:['/studio','/api'] }`.
2. Remove `robots: { index:false, follow:false }` in `src/app/layout.tsx:32`.
3. Remove the catch-all X-Robots-Tag header in `next.config.ts`. Keep the `/portal` one.
4. Remove the preview ribbon in `src/app/(site)/layout.tsx:13`.
5. Vercel environment: unset `SITE_PASSWORD`; set `NEXT_PUBLIC_SITE_URL=https://breakingiceproductions.com` (the sitemap, canonicals and JSON-LD currently use the vercel.app host); confirm `RESEND_API_KEY`, `CONTACT_FROM` and `CONTACT_TO`.
6. Submit the sitemap in Search Console and set up a Google Business Profile with the same name, phone and service areas.

---

### Pass 2: Format & spacing

**FMT-01 · High · The calculator band has no top padding** · Quick
- G:140 `.section + .section { padding-top: 0 }` applies to the dark calculator section at `src/app/(site)/page.tsx:150`. Measured live: `padding-top: 0px`. The "The return" eyebrow sits on the band's top edge.
- Fix: `.section.dark { padding-top: var(--section) }`, or narrow the rule to `.section:not(.dark) + .section:not(.dark)`.

**FMT-02 · High · Leftover cut-corner clip-paths on non-media boxes** · Moderate
- The G:724 patch only un-clips `.media`. These are still clipped by G:181–182 (three rounded corners, one cut):
  - `about/page.tsx:112` `.panel.cut-lg`
  - `services/[slug]/page.tsx:140` `.panel.cut-lg`
  - `contact/page.tsx:50` `.book-card.cut-lg`
  - `components/interactive.tsx:15` `.testimonial.cut-lg`
  - `components/interactive.tsx:56` `.reveal.cut-lg`
  - `components/contact-form.tsx:130` `.success.cut-lg`
  - `components/return-calculator.tsx:18` `.calc.cut-lg`
  - `components/cards.tsx:14` `.tag.cut-sm`
  - `portal/(app)/page.tsx:171`
- `.testimonial`, `.book-card`, `.reveal` and `.calc` have no border-radius at all.
- Fix:
  - Remove all `cut-lg`/`cut-sm` classes and the `cut` prop on `Still` (`components/brand.tsx:119`).
  - Delete G:51, G:59 (the `--cut-*` vars), G:181–182 and G:724.
  - Add `border-radius: var(--radius-lg)` to `.testimonial`, `.book-card`, `.reveal` and `.calc`.
  - `.tag`: `border-radius: var(--radius-pill)` and drop its 34px right padding (G:183).
  - Keep `.shard-list li::before` (G:190), the brand bullet.

**FMT-03 · Low · Header width at 360px (verify)** · Quick
- Code math suggested the logo plus buttons overflow at 360px (logo `flex:none`, G:217; buttons 42px, G:463). Measured live at 360px, the header fits (scrollWidth = clientWidth = 360).
- Fix only if seen on a device: `.site-header .wrap { gap: var(--space-3) }` and `--logo-h: 24px` under 400px.

**FMT-04 · High · Sideways scroll on every page at phone width** · Quick
- Measured at 375px: the document is 444px wide on all pages and 489px on /contact. At 360px it's 436px.
- Causes:
  - The footer email link doesn't wrap (`src/components/footer.tsx:40`; G:244–245).
  - On /contact, the email and phone are set as `a.h3` with no wrapping (`contact/page.tsx:62–63`).
  - The email in the location-page panel is a smaller risk (`location-page.tsx:52`).
- Fix:
  - `.footer-grid a { overflow-wrap: anywhere }`.
  - A `.contact-direct a { overflow-wrap: anywhere; text-decoration: none }` class for the contact links, dropping the inline `textDecoration`.
  - The same `overflow-wrap` on `.panel dd a`.

**FMT-05 · High · Mobile menu opens only 68px tall** · Quick
- Measured live at 375px: after tapping the menu button, `.mobile-menu` is 375×68.
- Cause: `.site-header` has `backdrop-filter` (G:215), which turns it into the containing block for the `position:fixed` menu rendered inside it (`src/components/header.tsx:96`; G:233).
- Fix: render the menu through `createPortal(..., document.body)`, or remove `backdrop-filter` while the menu is open (`.site-header:has(.mobile-menu){ backdrop-filter:none }`, toggled with a class).

**FMT-06 · Medium · Splash fade-on-scroll never runs** · Quick
- G:254–256 `animation: … both` holds the end value `opacity:1`, overriding the scroll-linked `opacity: calc(1 - var(--sp)…)` at G:696–697.
- Fix: change the fill mode to `backwards` on `.splash-logo`, `.splash-line` and `.splash-cue`.

**FMT-07 · Medium · Two copper underlines on the active nav item** · Quick
- G:220/222 `border-bottom` and G:703–705 `::after` both draw an underline, and the `::after` also hits the mobile menu links.
- Fix: delete the border lines (G:220, 222) and scope G:703–705 to `.main-nav a`.

**FMT-08 · Low · Desktop nav crowding 1280–1360px (verify)** · Quick
- Not reproduced: at 1280 and 1360 the header content fits (no overflow measured). Check by eye on a 13" laptop.
- If it's tight: raise the 1279 breakpoint (G:227) to about 1359, or `--logo-h: 32px` below 1440.

**FMT-09 · Medium · Letterbox bars on 4:3 clips outside cards** · Quick
- G:320 crops Vimeo only inside `.card .media.ratio-43 > iframe`, so the process-step clips (`sections.tsx:86`) and the service hero clip (`services/[slug]/page.tsx:95`) show bars.
- Fix: generalise to `.media.ratio-43 > iframe`, and add `isolation: isolate` to `.media` (G:193) so Safari respects the rounded corners.

**FMT-10 · Medium · Page-head and section padding isn't responsive or consistent** · Moderate
- `.page-head` is a fixed 96/64px (G:372) and ignores `--section`, so mobile keeps 96px.
- Inline overrides:
  - `contact/page.tsx:22`
  - `components/legal-page.tsx:22`
  - `services/[slug]/page.tsx:76`
  - `stories/[slug]/page.tsx:99`
- `.closing` is a fixed 96 (G:367).
- `about/page.tsx:30` and `stories/[slug]/page.tsx:121` use one-off values.
- Five inline `paddingTop:0`:
  - `page.tsx:85`
  - `contact:31`
  - `services:26`
  - `stories:25`
  - `legal-page:31`
- Fix:
  - `.page-head { padding: var(--section) 0 calc(var(--section) * .66) }` with `.page-head.tight` and `.after-film` modifiers.
  - `.closing` uses `var(--section)`.
  - A `.section.flush-top` class replaces the inline zeros.

**FMT-11 · Medium · Small-caps labels styled about eight ways** · Moderate
- `.eyebrow` is 13px/.24em (G:123). Other labels:
  - footer h2 (G:243): 12/.22
  - `.step dt` (G:305): 12/.18
  - `.meta-row dt` (G:387): 12/.2
  - `.testimonial .by` (G:332): 13/.2
  - `.rail-count` (pages.css:22): 12/.18
  - `.scroll-cue` (G:272): 12/.22
  - `.splash-line` (G:255): 13/.28
  - `.sample-flag`: 11/.14
  - `.tag` / `.industry-tags`: 11/.18
- Inline copies: `page.tsx:89`, `legal-page.tsx:34`, `location-page.tsx:88`.
- The 11px category chips were measured live on story cards and filters.
- Fix:
  - One `.label` class: `12px/16px, 600, .18em, uppercase, var(--ink-muted)`. Point every label above at it and delete the inline styles.
  - Raise the chips to 12px.
  - Add `margin: 0` to `.eyebrow` so the roughly 15 `style={{margin:0}}` on `h2.eyebrow` can go:
    - `stories/[slug]`: 77, 147, 156, 165, 175, 213, 234
    - `services/[slug]`: 102, 114, 133, 202
    - `process-compact:9`
    - `brand.tsx:53`

**FMT-12 · Medium · Five sizes of serif quote** · Quick
- Where:
  - testimonial (G:330)
  - `.pull` (G:398)
  - about beliefs inline (`about/page.tsx:108`)
  - sign-in (G:633)
  - footer inline (`footer.tsx:19`)
- Fix: `.quote-lg` (the `.pull` values) and `.quote-sm` (22/30). Apply them and delete the inlines.

**FMT-13 · Medium · Section headings use mixed levels on the same page** · Moderate
- Home checklist (`page.tsx:166`), home founder (`:197`) and About founder (`about:95`) use `.h1` on an h2; the other sections use `.h2`.
- The service detail page mixes eyebrow-style h2s (`:102/114/133/202`), `.h2` "Questions" (`:187`) and `SectionHead` (`:159`).
- Fix: one pattern for titled sections (`SectionHead`, `.h2`) and one for label-only sections, applied on every page.

**FMT-14 · Medium · Lede width set inline five ways** · Quick
- Values:
  - 56ch: `about:25`, `services:21`, `stories:20`
  - 52ch: `contact:26`
  - 58ch: `stories/[slug]:108`
  - 44ch: `not-found:19`
- Fix: `.lede { margin: 0; max-width: 56ch }` and use it everywhere.

**FMT-15 · Medium · Inline styles that should be classes; off-scale spacing** · Moderate
- `sections.tsx:82` puts the list reset inline on `.process`, which forces `!important` in pages.css:33–35.
- `about:66–68` copies `.step` inline.
- On the home page:
  - `page.tsx:73–77` stats styles
  - `page.tsx:151` `maxWidth:1040`
  - `page.tsx:152` centred head
- `location-page.tsx:50` (flex row) and `:101` (right-aligned link).
- Off-scale gaps:
  - 20: `page.tsx:195`, `services/[slug]:132`, `footer:16`, `not-found:16`
  - 6: `cards.tsx:21`
  - 28: `contact-form:155`
- Raw px where tokens exist: `about:38,93`, `contact:49,60,65`, `legal-page:33,35,45`, `interactive:17,24`, `header:116,120`, `stories/[slug]:179`.
- Fix:
  - Move these into classes: `.wrap-narrow`, `.sec-head.center`, `.contact-facts`, `.milestones`, and `.stats` children.
  - Add `--space-5: 20px` or round to existing tokens, and use `var(--space-*)` throughout.

**FMT-16 · Medium · Rounded image bottoms inside square-topped cards** · Quick
- `.media` radius 20 (G:723) inside `.svc-card` and `.proj-card`, which already clip at 20.
- Fix: `.svc-card .media, .proj-card .media { border-radius: 0 }`.

**FMT-17 · Medium · Two different location-card layouts** · Quick
- `LocationCard` (`cards.tsx:57–66`) vs a hand-built `.loc-card` on About (`about/page.tsx:55–64`) with different gaps.
- Fix: reuse `LocationCard` (or a variant) on About.

**FMT-18 · Medium · Dark-mode gaps** · Moderate
- `.calc` pins a light hex palette (G:654), so it's a bright cream block in the dark theme.
- `.caption` has no `.dark` override; `contact:57` works around it inline.
- `.back-top` is fixed navy (G:682) and nearly invisible on navy in the dark theme.
- Fix:
  - Tokenise `.calc` and add `:root[data-theme=dark] .calc` using `var(--surface-raised)`.
  - Add `.dark .caption { color: var(--ink-inverse-muted) }` and drop the inline.
  - `.back-top`: `var(--surface-inverse)` with a `var(--line-dark)` border.

**FMT-19 · Medium · Ten breakpoints** · Moderate
- 1279, 1020, 960, 900, 820/821, 640, 600, 560, 400, and 1640 (min).
- `--gutter` and `--section` switch at 820, but the footer, sign-in, hero head and portal switch at 900, and contact at 960.
- Fix: standardise on 1360/1020/820/560/400.

**FMT-20 · Medium · Tap targets under 24–44px** · Quick
- Measured live: footer nav links are 16px tall; "← All stories", breadcrumbs and the privacy link 16px; location email and phone 19px.
- From code:
  - `.industry-tags a` 32px (services.css:6)
  - `.legal-toc a` 2px padding (pages.css:46)
  - `details.transcript summary` 32px (G:400)
  - `.howto summary` 32px (G:605)
  - menu and theme buttons 42px under 400px (G:463)
- Fix: `display:inline-flex; align-items:center; min-height:44px` on these. Footer list items get `padding-block: 10px`.

**FMT-21 · Low · Dead CSS** · Quick
- Full-bleed `.hero` leftovers: G:261–267 (`.hero-media`, `.hero-scrim`, `.hero-content`). Also drop the `hero` class at `page.tsx:36`.
- `.media-fill` (G:194)
- `.nav-label` (G:224)
- `.raised` (G:143)
- `.shard-field.warm` (G:207–208)
- Unused transitions (G:317, G:351)
- Fix: delete them.

**FMT-22 · Low · Duplicate and redundant rules** · Quick
- `.logo-link` twice (G:217–218)
- `scroll-behavior` twice (G:96 and G:676)
- `.lockup` logo swap repeats G:461–462 (G:718–720)
- Reduced-motion blocks already covered by G:97: G:258, G:711–713, story.css:60–62
- `.card-title` duplicates `.h3` (G:325)
- Fix: merge them, and regroup the appended blocks into their sections.

**FMT-23 · Low · Hard-coded colours and radii** · Quick
- Colours:
  - G:276, 279 (lightbox)
  - G:675 (`::selection`)
  - G:682, 684 (back-top)
  - G:729, 732 (shadow, duplicated)
- Radii: 28, 20, 12 and 6px (G:729, 732, 736, 682, 344).
- Fix: `--scrim`, `--shadow-film` and `--radius-xl` tokens; `::selection` uses `var(--on-accent)`.

**FMT-24 · Low · Display headings near the edge at 375px** · Quick
- `.display-xl` has a 40px minimum in expanded 700 type (G:118–119). The home H1 "organizations." measures about 355 of 375px, and /contact "conversation" is at the limit.
- Fix: `overflow-wrap: break-word; hyphens: auto` and a minimum of about 34px under 400px.

**FMT-25 · Low · Back-to-top shows above the lightboxes** · Quick
- Back-to-top is z-index 90 (G:682); the lightboxes are 80 (G:276).
- Fix: lightboxes to 130, or hide back-to-top while a dialog is open.

**FMT-26 · Low · Five icon-button sizes** · Quick
- 40, 46, 48, and 52px with a 12px radius.
- Fix: one `.icon-btn`, 48px, circular.

**FMT-27 · Low · Small inconsistencies** · Quick
- The arrow link is hand-written about 9 times instead of using `ArrowLink`:
  - `page.tsx:208`
  - `about:84`
  - `services:38`
  - `services/[slug]:163`
  - `stories/[slug]:235`
  - `location-page:73,103`
  - `process-compact:10`
  - `interactive:24`
- `.prose p` leaves a trailing margin (G:131); add `.prose > :last-child { margin-bottom: 0 }`.
- Line heights are in px (G:104, 122, 123); use unitless values.
- Testimonials render two different ways (a card on home, `.pull` on service pages).

---

### Pass 3: Content & UI

**UI-01 · High · Testimonials name people (breaks the naming rule)** · Quick
- The live Sanity `name` field holds real names:
  - Bianca Romagnoli
  - Kyle Newhook
  - Nicholas Castel
  - Nathan Baines
  - Kennedy Tanner
  - Shafak Sajid
  - Praharshi Jay
  - Keele guests and owners: Elly; Michelle; Paul & Elly; Al & Lin
- A 12th holds a job title in that field ("Engagement Manager").
- Where they show: the home carousel shows all 12 originals; the organizational films, social stories and photography service pages show one each.
- Rendered at `src/components/interactive.tsx:21`, `services/[slug]/page.tsx:176` and `stories/[slug]/page.tsx:203`.
- Fix:
  - Render only role · organization in all three places.
  - Clear `name` on those 12 documents in Sanity (moving "Engagement Manager" into `role`).
  - Remove the `'[Name]'` fallback.

**UI-02 · High · "[Services]", "[Year]" and "[Place]" in the story meta row** · Quick
- Where: `stories/[slug]/page.tsx:124-136`.
- Live, every story shows "Services: [Services]", because no project has service links.
- "[Year]" shows on Ten Stone, Boiler Controls, Canoe North Lodge and Emergency Funding; "[Place]" on TGG Celebration.
- Fix: render each row only when it has a value (keep the placeholders for `p.sample`). Also link projects to services in Sanity (an obvious mapping exists from the service pages' related stories).

**UI-03 · High · Imperial NDP case study shows a placeholder quote and transcript** · Quick
- Where: `stories/[slug]/page.tsx:172-208`.
- The live page shows "[A true line from someone on camera, or from the client.] [Name] [Role], [Organization]" and a Transcript section with "[Speaker]: [Transcript text…]".
- Fix: render the quote only if `cs.pullQuote || p.sample`, and the transcript only if a transcript or captions exist (or `p.sample`).

**UI-04 · High · "[Heading 1] [Heading 2] [Heading 3]" on /accessibility** · Quick
- Where: `src/components/legal-page.tsx:36-42`. The table of contents falls back to placeholders when the body has no H2s.
- Fix: show the placeholders only when there's no document; hide the table of contents and collapse the grid when there are no headings.

**UI-05 · High · Booking-link placeholder on /contact, and a CTA pointing to it** · Quick
- `siteSettings.bookingLink` is empty, so `contact/page.tsx:57` shows "[Booking link: add your Google appointment schedule in Site settings]".
- "Book a 20-minute call" on every service page (`services/[slug]/page.tsx:91`) links to `/contact#book`.
- Fix: hide the book card and that secondary CTA when there's no link; add the link in Sanity (Needs Josh).

**UI-06 · Medium · Labelled grey boxes where images are missing** · Quick in code
- Live placeholders:
  - Home Alberta location card ("Alberta")
  - /alberta hero ("Alberta: hero image") and map
  - /northwest-territories map
  - /about Stony Plain journey image
- Fix:
  - Drop the map column when there's no map image (`location-page.tsx:96`).
  - For the hero and card, fall back to a neutral brand pattern (`shard-field`) instead of a labelled box.
  - Upload images (Needs Josh).

**UI-07 · Medium · The Alberta page has no work on it** · Content
- All 20 projects are tagged NWT, so /alberta has no stories section, and it's the market being grown into. Needs Josh.

**UI-08 · Medium · Stale preview ribbon** · Quick
- `src/app/(site)/layout.tsx:13` says "Private preview · sample content · not yet public".
- Fix: "Private preview · not yet public" (remove at launch).

**UI-09 · Medium · Footer "Follow" column shows dead labels** · Quick
- With no social URLs, `footer.tsx:47-50` renders Instagram, LinkedIn, YouTube and Vimeo as plain text that looks like broken links.
- Fix: render only the links that have URLs, and hide the column when none do.

**UI-10 · Medium · "Budget range" field lists project sizes** · Quick
- `contact-form.tsx:211-213` label "Budget range" / "Select a range", but the live options are scopes ("A single short piece"…).
- Fix: label "Project size" / "Select one" (or use real ranges; Needs Josh).

**UI-11 · Medium · Video lightbox focus handling** · Quick
- `video.tsx:191-207`: no Tab focus trap, focus isn't returned to the trigger on close, and the iframe title is a generic "Video".
- Fix: reuse the trap and return-focus pattern from `stills.tsx:116-140`, and pass the film title to the iframe `title`.

**UI-12 · Medium · No captions on any film** · Large (content)
- No project has captions or a transcript, and the Accessibility page says films include them "where we have them".
- Fix: add caption tracks on Vimeo (`texttrack=en` is already wired up in `lib/video.ts:23`). Needs Josh.

**UI-13 · Medium · Phone visitors see no message or CTA in the first screen** · Quick
- The splash (`page.tsx:29-33`) fills the screen with the logo and one line. Under 900px the header CTA is hidden (G:228). The eyebrow line repeats in the hero (`page.tsx:31` and `:40`).
- Fix (design call, Needs Josh): shorten the splash on mobile (e.g. 70vh) or add a single "Start a conversation" link under the line; drop the repeated eyebrow.

**UI-14 · Low · Logo marquee can't be paused by keyboard or touch** · Quick
- G:292–293 pauses on hover only (WCAG 2.2.2).
- Fix: pause on `:focus-within` and add a small pause button, or show it as a static wrap.

**UI-15 · Low · Contact form details** · Quick
- Required fields aren't marked.
- A server 400 shows "Something went wrong on our end" (`contact-form.tsx:113-118`).
- The story field has no `maxLength`; the server truncates silently at 5000 (`api/contact/route.ts:29`).
- The honeypot time check is skipped when `startedAt` is missing (`route.ts:54`).
- Slack text isn't escaped, so `<!channel>`-style injection is possible (`route.ts:137-141`).
- The portal prefills name and email via the query string (`contact-form.tsx:52-54`).
- Fix:
  - Add `aria-required` and "(required)".
  - A specific message for 400s.
  - `maxLength={5000}` with a counter.
  - Treat a missing `startedAt` as a bot.
  - Escape `<>&` for Slack.
  - Pass the prefill via `sessionStorage`.

**UI-16 · Low · Smaller accessibility gaps** · Quick
- `not-found.tsx` has no skip link.
- The mobile menu has a second `nav aria-label="Main"` (`header.tsx:111`); rename it to "Mobile".
- "Area served" pills look like buttons (G:419).
- No `:active` styles.
- The story hero poster passes `posterAlt=''` (`stories/[slug]/page.tsx:93`); pass `p.thumbnail?.alt`. This is the one empty-alt image on every story page.
- Fix: as listed.

**UI-17 · Low · Copy polish in Sanity** · Quick (needs Josh's OK)
- "chief And council"; that quote is about a website, not a film.
- Missing final period on one quote.
- "our Alumni" → "alumni".
- Straight vs curly apostrophes.
- Several quotes read out of context ("I love the layouts though…", "Well, you are in real time!! Holy moly…", "It was great working with you on the 18th…", "Yes I'd like to release 2023 video…").
- One quote is from a fellow videographer, not a client.
- About's Alberta card repeats "Stony Plain".

**UI-18 · Low · Small data issues** · Quick
- Location-page stories are ordered by `_createdAt` instead of `order` (`src/lib/data.ts:162`).
- The home founder still crops a 3:2 portrait to 4:5 (`page.tsx:192`); check the face isn't cut.
- Fix: order by `coalesce(order, 999)`; set a hotspot on the portrait.

**UI-19 · Medium · Very long home page on mobile** · Moderate
- Measured at 375px: home is about 12,000px tall, and "What we make" alone is 2,649px (six full service cards stacked).
- Fix: on mobile, show services as a two-up compact grid or a swipe rail (the site already has `SwipeRail`), or show three with a "See all services" link.

---

## 3. Action plan

Sorted by priority. Items that touch the same file are grouped so they can be done together. Tick each item when done.

### High
- [x] **FMT-05** Mobile menu full-screen: portal it, or drop `backdrop-filter` while open · `components/header.tsx`, G:215/233 · Quick
- [x] **FMT-04** Wrap long emails: footer, contact, location panel · `components/footer.tsx`, `contact/page.tsx`, `location-page.tsx`, G · Quick
- [x] **UI-01** Stop rendering testimonial names; clear the `name` field on 12 docs (move "Engagement Manager" to `role`) · `components/interactive.tsx`, `services/[slug]/page.tsx`, `stories/[slug]/page.tsx`, Sanity · Quick
- [x] **UI-02 + UI-03** Story page: hide empty meta rows, the empty pull quote and the empty transcript; link projects to services in Sanity · `stories/[slug]/page.tsx`, Sanity · Quick
- [x] **UI-04** Legal page: no placeholder table of contents · `components/legal-page.tsx` · Quick
- [x] **UI-05** Hide the booking card and "Book a 20-minute call" when there's no booking link · `contact/page.tsx`, `services/[slug]/page.tsx` · Quick
- [x] **SEO-01** Title de-duplication and length · `lib/seo.ts`, `app/(site)/page.tsx`, `northwest-territories/page.tsx`, `services/page.tsx` · Quick
- [x] **FMT-01** Calculator band top padding · G:140 · Quick
- [x] **FMT-02** Remove the cut-corner clip-paths; add radius to cards and panels (do together with FMT-16, FMT-22 and FMT-23 in G) · G, `brand.tsx`, `interactive.tsx`, `contact-form.tsx`, `return-calculator.tsx`, `cards.tsx`, `about/page.tsx`, `services/[slug]/page.tsx`, `contact/page.tsx`, portal · Moderate

### Medium
- [x] **SEO-03** Legal pages: `generateMetadata` via `seoMeta` · `privacy/page.tsx`, `accessibility/page.tsx` · Quick
- [x] **SEO-02** Description fallbacks; contact reply time matches Sanity · `about`, `contact`, `services/[slug]`, `stories`, `alberta`, `northwest-territories` pages · Quick
- [x] **SEO-05** Organization and location JSON-LD fields · `components/json-ld.tsx`, `location-page.tsx` · Quick (square logo: Needs Josh, or export from the brand kit)
- [x] **SEO-10** Posters for clip boxes; tap-to-play process clips on mobile · `sections.tsx`, `about/page.tsx`, `services/[slug]/page.tsx`, `video.tsx` · Moderate
- [x] **UI-06** No labelled placeholder boxes in production; drop the empty map column · `location-page.tsx`, `brand.tsx`, `about/page.tsx`, `cards.tsx` · Quick
- [x] **UI-08** Ribbon text · `(site)/layout.tsx` · Quick
- [x] **UI-09** Footer social links only when set · `footer.tsx` · Quick
- [x] **UI-10** "Project size" label · `contact-form.tsx` · Quick
- [x] **UI-11** Lightbox focus trap, return focus, iframe title · `video.tsx` · Quick
- [x] **UI-19** Compact services on mobile home · `app/(site)/page.tsx`, G · Moderate
- [x] **FMT-06** Splash fill mode · G:254–256 · Quick
- [x] **FMT-07** Single nav underline · G:220/222/703–705 · Quick
- [x] **FMT-09** 4:3 iframe crop everywhere, plus `isolation` · G:193/320 · Quick
- [x] **FMT-16** No radius on images inside cards · G · Quick
- [x] **FMT-18** Dark-mode `.calc`, `.caption`, `.back-top` · G · Moderate
- [x] **FMT-20** Tap targets to 44px · G, services.css, pages.css · Quick
- [x] **FMT-11 + FMT-12 + FMT-14** `.label`, `.quote-lg`/`.quote-sm`, `.lede`; `.eyebrow{margin:0}`; remove the inline styles · G, `page.tsx`, `legal-page.tsx`, `location-page.tsx`, `stories/[slug]`, `services/[slug]`, `about`, `footer`, `process-compact`, `brand` · Moderate
- [x] **FMT-10 + FMT-15** Responsive page-head, `.section.flush-top`, inline styles to classes, spacing tokens · G and all page files · Moderate
- [x] **FMT-13** One section-heading pattern · `page.tsx`, `about`, `services/[slug]`, `stories/[slug]` · Moderate
- [x] **FMT-17** Reuse `LocationCard` on About · `about/page.tsx`, `cards.tsx` · Quick
- [x] **FMT-19** Consolidate breakpoints · G, pages.css, services.css, story.css · Moderate

### Low
- [x] **SEO-04** Default share image: Josh chose the branded title card, so no code change · `lib/seo.ts`, `lib/data.ts` · Quick
- [ ] **SEO-06** VideoObject: emit without a year, add duration (NOT DONE, see notes) · `stories/[slug]/page.tsx` · Moderate
- [x] **SEO-08** Sitemap `lastModified` from `_updatedAt` · `sitemap.ts`, `lib/data.ts` · Quick
- [x] **SEO-09** sr-only H2s on /services, /stories, /contact · Quick
- [x] **SEO-12** Limit `/og` input · `og/route.tsx` · Quick
- [x] **UI-14** Marquee pause on focus, plus a button · G, logo strip component · Quick
- [x] **UI-15** Contact form hardening · `contact-form.tsx`, `api/contact/route.ts` · Quick
- [x] **UI-16** Small accessibility fixes · `not-found.tsx`, `header.tsx`, `stories/[slug]/page.tsx`, G · Quick
- [x] **UI-18** Location stories order; portrait hotspot · `lib/data.ts`, Sanity · Quick
- [x] **FMT-21 + FMT-22 + FMT-23** Dead CSS, duplicates, colour and radius tokens · G · Quick
- [x] **FMT-24** Display heading wrap safety · G:118 · Quick
- [x] **FMT-25** Lightbox z-index · G · Quick
- [x] **FMT-26** One icon-button size · G · Quick
- [x] **FMT-27** `ArrowLink` everywhere, `.prose` last margin, unitless line heights · various · Quick
- [x] **FMT-03** (verified: no overflow at 360px; logo now 24px and tighter gap under 400px as a safety margin) header at 360px · G · Quick
- [x] **FMT-08** (verified: no overflow at 1280 or 1360; no change) nav at 1280–1360px · G · Quick

### Not done in code (content work)
- SEO-11 thin story pages, SEO-14 naming standard, UI-07 Alberta work, UI-12 captions, UI-17 copy polish. These need Josh first (see below).

---

## Needs Josh

1. **Testimonials (UI-01, UI-17).** Confirm the names come off, then decide which quotes stay. Several are out of context, from a peer, or about a website rather than a film.
2. **Booking link (UI-05).** Your Google appointment schedule URL.
3. **Social links (UI-09, SEO-05).** Instagram, LinkedIn, YouTube and Vimeo URLs.
4. **Images (UI-06, SEO-05).**
   - Alberta: hero, card and map.
   - NWT: map.
   - About: an Alberta/Stony Plain photo.
   - A square PNG logo for search results (or I export one from the brand kit).
5. **Alberta work (UI-07).** Any Alberta projects to tag, or a plan for the first ones.
6. **Phone and address (SEO-05).**
   - 807 is an Ontario area code; keep it, or use a local 780/587 or 867 number?
   - Publish a mailing address, or stay a service-area business?
7. **Spelling standards (SEO-14).** Sahtú or Sahtu; North-Wright Air or Airways; Imperial or Imperial Oil.
8. **Contact form (UI-10).** Rename "Budget range" to "Project size", or give real dollar ranges.
9. **Home stats and calculator.** "10+ years" sits next to "founded 2022" on About; is that framed the way you want (storytelling experience vs company age)? The calculator's default shows a $240,000/yr return; are you comfortable with that example?
10. **Project data (UI-02, SEO-06).** Years for Ten Stone, Boiler Controls, Canoe North Lodge and Emergency Funding; a place for the TGG Celebration. (I can link projects to services myself from the existing mapping.)
11. **Imperial NDP (UI-03).** A pull quote (role-only credit) and a transcript, if you want those sections to show.
12. **Captions and transcripts (UI-12, SEO-11).** Upload caption files to Vimeo, plus 2–3 sentences per story.
13. **SEO fields (SEO-02).** Approve titles and descriptions for the services and singletons. Suggested service titles:
    - "Corporate & brand video, NWT & AB"
    - "Social media video, Alberta & NWT"
    - "Event videography, NWT & Alberta"
    - "Video retainers for organizations"
    - "Documentary films, NWT & Alberta"
    - "Commercial photography, NWT & AB"
14. **Mobile first screen (UI-13).** Keep the calm logo-only splash on phones, or add a CTA / shorten it?
15. **Default share image (SEO-04).** Use the Mackenzie River aerial, or the generated branded card?

---

## Implementation notes (2026-10-21)

Implemented in three commits on `main`:
- `a5d22ab` SEO pass
- `6f76df0` Format & spacing pass
- `1eae988` Content & UI pass

Sanity content changes were published the same day:
- **Testimonials:** names cleared on every testimonial ("Engagement Manager" moved into `role`).
- **Weak quotes unpublished, kept as drafts:**
  - NWA "I love the layouts"
  - Canoe North "Holy moly"
  - NWA "on the 18th"
  - Imperial Sahtu Cup "release 2023 video"
  - the fellow videographer
  - Fort Good Hope website
- **Spelling standard:** Sahtú, North-Wright Air, Imperial, applied to titles, locations, alt text, About, bio and logos. Verbatim quotes and the official name "Sahtu Secretariat" were left as they are, and URLs (slugs) didn't change.
- **Project services:** all 20 projects are linked to their services.
- **Contact form:** dollar ranges (Under $5k, $5k–15k, $15k–30k, $30k+, Not sure yet).
- **Service pages:** SEO titles for all six.
- **About:** the repeated "Stony Plain" line under the location cards is gone.

**Not done, and why**
- **SEO-06 (VideoObject):** needs real release dates for the 4 projects with no year, and film durations (they would come from Vimeo or a new Sanity field). Nothing was invented.
- **SEO-11, UI-07, UI-12 (content):** thin story text, Alberta work and captions need you.
- **UI-17 (copy polish):** quotes kept verbatim except names; the weakest ones were unpublished instead of edited.
- **UI-18 (portrait hotspot):** needs a visual check of the portrait crop in the Studio. Location story order is fixed.

**Partly done**
- **FMT-15:** the most-repeated inline styles moved to classes. A few one-off inline pixel values remain in About, Contact, legal, the testimonial card and the header.
- **FMT-19:** 900, 960, 600 and 640 were folded in. 1279 (nav) and 400 remain on purpose.
- **SEO-10:** posters were added for every clip box. Tap-to-play for the process clips on mobile was not added; the clips still load as they scroll into view.

**Still needs Josh**
- Booking link and social URLs: paste them and the booking card, "Book a call" buttons and footer Follow column appear automatically.
- Alberta images.
- Years for 4 projects.
- An NDP pull quote and transcript.
- Captions.
