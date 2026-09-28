# Contributing

Issues and PRs are welcome. This is a hobby project, so replies might take a
while.

## Setup

```bash
npm install

# the API on :3999 with a scratch database, and Vite with hot reload next to it
DB_PATH=/tmp/dev.db ADMIN_EMAIL=dev@example.com ADMIN_PASSWORD=devpassword npm run dev
npx vite    # http://localhost:5174
```

Before a PR, run `npm run check` (typechecks the server, web app and Worker)
and `npm run build`. There are no unit tests. `node scripts/browsertest.mjs`
clicks through the app against the dev server above and fails if anything
breaks; it expects Chromium at `/usr/bin/chromium` (set `CHROME_PATH`
otherwise).

Only the packages listed under `allowScripts` in `package.json` may run
install scripts (`.npmrc` turns on npm's strict mode). The entries are pinned
to exact versions, so after upgrading one of them, update its entry too.

## Layout

```
server/            the API (Express). Node runs the .ts files directly, no build step
  index.ts         Node entry: opens the database, serves web/dist, listens
  app.ts           the Express app itself, shared with the Worker
  db.ts            schema and migrations, run at every start
  permissions.ts   who can edit what
  routes/          one file per resource
  blobs*.ts        where uploaded files are stored
worker/            Cloudflare entry: the same app inside a Durable Object
shared/types.ts    response types, used by both server and web
web/src/
  store.ts         all client state and the optimistic updates
  components/      the UI
  styles.css       design tokens are at the top
```

## Things to know

- **Migrations only add.** New columns go through `addColumn` in `db.ts`.
  Nothing ever drops or rewrites data, so old databases keep working.
- **Permissions are checked on the server** in `permissions.ts`. The client
  has a copy (`canEdit` in `store.ts`) only to hide buttons.
- **Search is kept up to date by SQLite triggers.** If you write to cards,
  comments or attachments some way that skips them, search drifts. You can
  fix it with `DELETE FROM search_fts;` and a restart.
- **Activity logging never throws.** A failed log line shouldn't fail the edit.
- **`activity.card_id` has no foreign key**, so history survives a deleted
  card.
- **`relates` links are stored once**, with the lower card id first.
- **Uploads are an allowlist** (`ALLOWED_UPLOAD_MIME` in `config.ts`).
  Don't add HTML or SVG. Files are served from the app's own origin, so either
  one could run scripts as the signed-in user.
- **The design is flat.** Surfaces are separated by colour, with no borders
  or shadows. Native form controls are avoided because they don't follow the
  theme.
- **The Worker build shares everything** except startup and storage. Keep
  `server/` free of filesystem access outside `index.ts`, `static.ts` and
  `blobs-fs.ts`.
