# Hosting

Two ways to run it: a Node process on a server you have, or Cloudflare Workers
(free plan is enough). Same app and same features either way.

## On a server

Install and build as in the [README](../README.md), then run it under
something that restarts it. A systemd unit:

```ini
[Unit]
Description=Kanagare
After=network.target

[Service]
User=kanagare
UMask=0077
WorkingDirectory=/srv/kanagare
EnvironmentFile=/etc/kanagare/env
ExecStart=/usr/bin/node server/index.ts
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Run it as its own user (`useradd --system kanagare`, owning `/srv/kanagare`);
`UMask=0077` keeps the database and uploads private to it. `/etc/kanagare/env`
is a copy of [.env.example](../.env.example). It holds the admin password on
first start, so `chmod 600` it.

The server only listens on 127.0.0.1. nginx in front of it:

```nginx
server {
    server_name kanban.example.com;
    listen 443 ssl;
    # certificates...

    # a bit above MAX_UPLOAD_BYTES, so a too-big upload gets the app's error
    # instead of nginx's HTML page
    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:3463;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    add_header Strict-Transport-Security "max-age=31536000" always;
}
```

### Updating

```bash
git pull
npm ci
npm run build
systemctl restart kanagare
```

Database migrations run on startup. They only ever add things, so an update
never needs a manual step.

### Backups

The database and the uploaded files are separate, so back up both:

```bash
sqlite3 kanagare.db ".backup '/var/backups/kanagare-$(date +%F).db'"   # fine while it's running
tar czf /var/backups/kanagare-uploads-$(date +%F).tar.gz uploads
```

A database backup without `uploads/` restores fine, but every attachment will
404.

### Lost the admin password

If another admin exists, they can reset it from **Manage users**. If not, stop
the service and either:

```bash
# wipe all accounts; the next start creates the admin from ADMIN_EMAIL/ADMIN_PASSWORD again
sqlite3 kanagare.db "PRAGMA foreign_keys = ON; DELETE FROM users;"
```

or set a new hash for one account:

```bash
node -e '
  const c = require("crypto"), salt = c.randomBytes(16);
  const hash = c.scryptSync(process.argv[1], salt, 64, { N: 16384, r: 8, p: 1 });
  console.log(`scrypt$16384$${salt.toString("hex")}$${hash.toString("hex")}`);
' 'new-password'

sqlite3 kanagare.db "UPDATE users SET password_hash = '<hash>' WHERE email = 'you@example.com';"
```

Wiping the users table keeps all the cards; the new admin takes over
everything the old accounts made.

## On Cloudflare Workers

The web app is served as static files. The API is the same Express app,
running inside a Durable Object that has its own SQLite database. Uploads are
stored in that database too, so you don't need R2 or a card on file.

Each deployment is a folder holding a `wrangler.jsonc`. The simplest place
is `deploy/<name>/` in your clone, which git ignores:

```bash
mkdir -p deploy/my-board
cp worker/wrangler.example.jsonc deploy/my-board/wrangler.jsonc   # set the name and domain

npx wrangler login
npx wrangler secret put ADMIN_EMAIL -c deploy/my-board/wrangler.jsonc
npx wrangler secret put ADMIN_PASSWORD -c deploy/my-board/wrangler.jsonc
npm run cf:deploy -- deploy/my-board
```

Deploy again with the same command after pulling changes. Your data stays put;
only the code is replaced.

Things to know:

- Signing in takes about 40 ms of CPU (password hashing). The free plan allows
  10 ms per request, but lets occasional spikes through, and people don't sign
  in often. Everything else takes 1 to 2 ms.
- If the domain already has a DNS record (from an old server, say), wrangler
  can't attach it as a custom domain. Delete the record, or keep it proxied and
  use a route instead. The example config shows both.
- There's no shell into the database. Cloudflare keeps 30 days of
  point-in-time recovery. Keep a second admin account around, because the
  lost-password steps above don't work here.

### Moving a server install to Cloudflare

`scripts/cf-restore.mjs` copies a `.db` file and its `uploads/` folder into a
deployment. It **replaces everything** in that deployment. It only works while
a `RESTORE_TOKEN` secret is set, so set one, run it, and delete it:

```bash
npx wrangler secret put RESTORE_TOKEN -c deploy/my-board/wrangler.jsonc
RESTORE_TOKEN=... node scripts/cf-restore.mjs https://board.example.com kanagare.db uploads/
npx wrangler secret delete RESTORE_TOKEN -c deploy/my-board/wrangler.jsonc
```

Sessions are copied too, so if `COOKIE_NAME` matches the old install, nobody
gets signed out.

### A repo per deployment

To keep a deployment's config in git, and control exactly which version runs,
give it its own (private) repo with Kanagare as a submodule:

```
my-board/
  kanagare/         git submodule add https://github.com/shinjuku712/kanagare.git
  wrangler.jsonc    as the example, with "main": "kanagare/worker/index.ts"
  brand/            optional, see below
```

Deploy with `npm ci --prefix kanagare && node kanagare/scripts/cf-deploy.mjs .`,
by hand or from a GitHub Actions workflow (it needs a `CLOUDFLARE_API_TOKEN`
secret from the "Edit Cloudflare Workers" token template, and
`CLOUDFLARE_ACCOUNT_ID`). The submodule pins a commit, so a deployment only
moves to a newer Kanagare when you update it: `git submodule update --remote`.

## Your own name and logo

A folder with a `brand.json` (`{ "name": "...", "shortName": "...", "description": "..." }`)
and optionally a `logo.svg` rebrands the web app. On Cloudflare, put it at
`deploy/my-board/brand/` and the deploy script picks it up. On a server, build
with it: `BRAND_DIR=path/to/brand npm run build`. The installed app's name
comes from `APP_NAME` and `APP_DESCRIPTION`, so set those to match.

For matching app icons, add a `logo-maskable.svg` (the logo on a full square,
kept inside the middle 80%) and generate them:

```bash
npm run icons -- brand/logo.svg brand/logo-maskable.svg brand/icons
```

On a server, copy the result over `icons/`. On Cloudflare, generate them into
`deploy/my-board/brand/icons/` and the deploy script uses them.
