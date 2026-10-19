# Breaking Ice Productions: website

Next.js 16 (App Router) + Sanity, deployed on Vercel.

- **Site:** `src/app/(site)/…`, one folder per page.
- **Content editor (Sanity Studio):** `/studio` on the same site. Schemas live in `src/sanity/schemaTypes`.
- **Brand:** tokens and component styles in `src/app/globals.css`, from the Breaking Ice design system (navy, copper, Archivo Expanded, Newsreader Italic). Logo and pattern files in `public/brand`.
- **Sample content:** `src/lib/samples.ts` fills every page while Sanity is empty. Anything you publish in the Studio replaces it.

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000, Studio at /studio
```

## Environment variables

See `.env.example`. `SITE_PASSWORD` turns on the pre-launch password lock.

## Contact form

`src/app/api/contact/route.ts` sends each enquiry to whichever destinations are configured
(email via Resend, Slack, Google Sheet; see `.env.example`). With none configured the form says
it isn't switched on and offers a pre-filled email instead. Spam: hidden honeypot field,
a 3-second minimum, and a light per-IP rate limit.

## Analytics

Vercel Web Analytics (page views) plus custom events: `Contact form sent`, `Contact form failed`,
`Booking link click`, `Email click`, `Phone click`, `Video play`. Enable Web Analytics on the
project in Vercel to start recording; custom events need Vercel Pro.

## Back office

`/admin` is the private back office: dashboard, projects by pipeline stage, and a project page.
Sign-in is the same email link + code as the client portal, limited to `ADMIN_EMAILS`.

- **Data:** extra fields on each client project in the Studio (Client portal → Client project → “Back office (private)” tab).
  The portal only reads the fields it names, so none of these reach clients. Leads and quotes are hidden from the portal until booked.
- **Stage changes** (`src/admin/stages.ts`) show a preview of every step, then run only what you confirm:
  TickTick checklist, Google Calendar dates, Xero draft invoices (deposit when booked, balance when delivered) and the portal status.
- **Keeping in sync:** the 10-minute scheduler also moves calendar events and TickTick due dates when dates change,
  and pulls invoice statuses back from Xero (`src/admin/sync.ts`).
- **Setup:** `/admin/settings` walks through Xero, TickTick and Google Calendar. Tokens are stored encrypted in the private dataset.
- **Locally** without a Sanity token, `/admin` shows sample projects and saves nothing.

## Pre-launch switches to flip on launch day

1. Remove `SITE_PASSWORD` in Vercel.
2. `src/app/robots.ts`: allow `/`, disallow `/studio`, add the sitemap.
3. `src/app/layout.tsx`: remove `robots: { index: false }`.
4. `next.config.ts`: remove the `X-Robots-Tag` header.
5. `src/app/(site)/layout.tsx`: remove the preview ribbon.
