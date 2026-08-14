# quartz-i18n web editor

A static GitHub Pages site for translating [quartz-i18n](..) without cloning the
repo. Translators sign in with GitHub, see a side-by-side view (English source on
the left, their translation on the right), and commit changes directly.

## How it works

- **GitHub Pages** serves everything (`site/` folder) — no server.
- **GitHub OAuth App** authenticates translators; the site checks
  `permissions.push` to enforce write access.
- **Cloudflare Worker** (`worker.js`) exchanges the OAuth `code` for an access
  token using the client secret, which is never shipped to the browser.
- Edits run through the GitHub Contents API (`PUT` on the target language file),
  which triggers the existing `validate.yml` and `manifest.yml` workflows.

## Setup

1. **Create a GitHub OAuth App** (Settings → Developer settings → OAuth Apps):
   - Homepage URL: your Pages URL.
   - Authorization callback URL: `https://<pages-domain>/callback.html`.
   - Note the **Client ID** and generate a **Client Secret**.

2. **Deploy the worker** (`worker.js`) with Cloudflare Workers, then set its
   secrets:
   ```
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   ```

3. **Edit `app.js`** `CONFIG` block: set `clientId` and `tokenExchangeUrl`,
   and confirm `owner`/`repo`/`branch`.

4. **Enable Pages** once: repo Settings → Pages → Source = "Deploy from a branch"
   → branch `gh-pages` / `/ (root)`. The `pages.yml` workflow then auto-publishes
   `site/` to that branch on every change to `site/**` — no manual deploys.

## Notes

- Access tokens are held in `sessionStorage` only; closing the tab signs out.
- The reference column is `en-US.json` (read-only). The `0KTL` sentinel key is
  locked from editing.
- Partial translations are valid; missing keys fall back to English per the repo
  rules.
