# Review room storage (Cloudflare R2)

New cuts can play in our own review room instead of Vimeo. The review copy (an H.264 MP4,
uploaded as-is, never re-encoded) lives in a **private** Cloudflare R2 bucket. Nobody can
browse the bucket: the site hands out a short-lived link (about two hours) to one file, and
only after it has checked who is asking (a signed-in portal contact of that client, you, or
someone holding a switched-on share link for that version).

Existing Vimeo-linked versions keep working exactly as before.

## 1. Create the bucket

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**.
2. Name it, for example `bi-review`. Location: Automatic. Leave **Public access off**
   (no r2.dev URL, no custom domain). The bucket must stay private.

## 2. Make an API token for that bucket only

1. R2 → **Manage R2 API Tokens** → **Create API token**.
2. Permissions: **Object Read & Write**.
3. Specify bucket: **Apply to specific buckets only** → pick `bi-review`.
4. TTL: forever (or a date you'll remember to renew).
5. Create, then copy the **Access Key ID** and **Secret Access Key** (the secret is shown once).
   Your **Account ID** is on the R2 overview page (right-hand side).

## 3. Add the settings in Vercel

Project → Settings → Environment Variables (Production, and Preview if you test there):

| Name | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | the Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | the token's Access Key ID |
| `R2_SECRET_ACCESS_KEY` | the token's Secret Access Key |
| `R2_BUCKET` | the bucket name, e.g. `bi-review` |

Redeploy. Back office → Settings shows **Review storage (R2): Ready**, and the Finder's
"Add a video" gets an **Upload for review** choice.

## 4. Set the bucket's CORS policy

The browser uploads straight to R2 and plays from it, so the bucket must allow our site.
R2 → `bi-review` → **Settings** → **CORS Policy** → **Add CORS policy** → paste
(replace the first origin with the live site address if it differs):

```json
[
  {
    "AllowedOrigins": ["https://breakingiceproductions.com", "https://www.breakingiceproductions.com", "http://localhost:3107"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

`ETag` must be exposed: the uploader reads it from each part to finish the upload. If it
isn't, the upload stops with a message pointing here.

## 5. Optional: clean up abandoned uploads

R2 → `bi-review` → Settings → **Object lifecycle rules** → add a rule that aborts incomplete
multipart uploads after 7 days. (Cancelling in the Finder already cleans up; this catches
uploads left half-done when a browser was closed and never resumed.)

## How it fits together

- Finder → a project → Videos → **Upload for review**: pick the MP4 and the frame rate
  (23.976 by default, used for timecode). Title, note and "send to the client now" work as
  for a Vimeo link, and the usual 10-minute hold and "new version" email follow.
- Files go up in 8–16 MB parts, three at a time; a failed part is retried. If the page is
  reloaded, choosing the same file again carries on from the parts already sent.
- Object keys: `review/<projectId>/<versionKey>/v<version>-<random>.mp4`.
- Deleting a version in the Finder deletes its review copy too.
- Comments are `reviewComment` documents in the portal dataset (Studio → Review comments,
  read-only there).
- Share links: Back office → the version's review room → **Share link**: make, copy, switch
  off/on, or make a new one (the old address stops working at once).
- Final downloads (delivered projects) still prefer the file in Final Files; otherwise the
  review copy downloads from R2 with a short-lived link.
