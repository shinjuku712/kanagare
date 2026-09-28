# HTTP API

The web app is just a client of this API, so anything you can do in the UI you
can do with curl.

- Base URL: `http://localhost:3463/api`
- Bodies are JSON unless noted.
- Errors are `4xx` with `{ "error": "message" }`.
- Response types are in [shared/types.ts](../shared/types.ts), and the routes
  are in [server/routes/](../server/routes/).

```bash
curl -sS -c /tmp/j -X POST http://localhost:3463/api/login \
  -H 'Content-Type: application/json' -d '{"email":"you@example.com","password":"..."}'

curl -sS -b /tmp/j -X POST http://localhost:3463/api/cards/quick \
  -H 'Content-Type: application/json' \
  -d '{"title":"Fix the login page","column":"To Do","project":"Website"}'

curl -sS -b /tmp/j 'http://localhost:3463/api/search?q=login'
```

## Endpoints

```
Auth         POST /login   POST /logout   GET /check
Users        GET /users                                  (id + email, any signed-in user)
Admin        GET|POST /admin/users
             PUT /admin/users/:id/password   PUT /admin/users/:id/admin   DELETE /admin/users/:id
Projects     GET /projects[?archived=1]   POST /projects   PUT /projects/reorder   GET /projects/counts
             PUT|DELETE /projects/:id   PUT /projects/:id/archive   PUT /projects/:id/unarchive
             GET /projects/:id/board   GET /projects/:id/graph
Columns      POST /columns   PUT /columns/reorder   PUT|DELETE /columns/:id
Cards        POST /cards   PUT|DELETE /cards/:id
             PUT /cards/move          {cardId, targetColumnId, newPosition}
             PUT /cards/:id/move-to   {column, position?, project?}   (by name)
             POST /cards/quick   POST /cards/bulk                     (by name, for scripts)
Labels       GET|POST /projects/:id/labels   PUT|DELETE /labels/:id
             POST /cards/:id/labels {label_id}   DELETE /cards/:id/labels/:labelId
Comments     GET|POST /cards/:id/comments   PUT|DELETE /comments/:id
Links        GET|POST /cards/:id/links   DELETE /links/:id
Files        POST /cards/:id/files   GET|DELETE /files/:id
Snippets     GET|POST /cards/:id/attachments   GET|PUT|DELETE /attachments/:id
Templates    GET|POST /templates   PUT|DELETE /templates/:id   POST /templates/:id/apply
Other        GET /search?q=   GET /agenda   GET /activity   GET /board (first project's board)
```

`POST /projects` also creates To Do, In Progress and Done columns.

## Sign-in and sessions

`POST /login` takes `{email, password}` and sets an `HttpOnly`,
`SameSite=Strict` cookie (`Secure` unless `NODE_ENV=development`). Sessions
last 30 days. `POST /logout` ends the session. `GET /check` never fails: it
returns `{authenticated: false}` or `{authenticated: true, user: {id, email, is_admin}}`.

| Situation | Status | Error |
|---|---|---|
| no session, or it expired | 401 | `Unauthorized` |
| non-admin on `/admin/*` | 403 | `Admin required` |
| editing someone else's thing | 403 | `Only the creator or an admin can modify this ...` |

## Users

Everything under `/admin/users` is admin-only:

```
GET    /admin/users                → [{id, email, is_admin, created_at}]
POST   /admin/users                {email, password, is_admin?}
PUT    /admin/users/:id/password   {password}
PUT    /admin/users/:id/admin      {is_admin: true|false}
DELETE /admin/users/:id
```

- Passwords need at least 8 characters. Emails are case-insensitive, and a
  duplicate returns 409.
- You can't delete yourself, or demote or delete the last admin.
- Resetting a password signs that user out everywhere.
- Deleting a user keeps everything they made. Their cards, comments and so on
  lose their owner and become admin-only to edit, and cards assigned to them
  become unassigned.

`GET /users` returns `[{id, email}]` to anyone signed in, so people can assign
cards to each other.

## Permissions

Everyone signed in can see everything and create anything. For changing
things:

| | anyone | creator | admin |
|---|:-:|:-:|:-:|
| move cards, reorder columns and projects | ✓ | ✓ | ✓ |
| edit or delete a card, column, project, label, template | | ✓ | ✓ |
| labels, files, snippets, assignee on a card | | ✓ (of the card) | ✓ |
| link a card to another | | ✓ (of the first card) | ✓ |
| remove a link | | ✓ (of either card) | ✓ |
| comment | ✓ | ✓ | ✓ |
| edit a comment | | ✓ (author only) | |
| delete a comment | | ✓ (author) | ✓ |
| manage users | | | ✓ |

Admins can delete comments but can't edit other people's. Assigning a card to
someone doesn't let them edit it. A non-admin can't delete a column or project
that holds someone else's cards, since anyone can move cards into it. Rows with no creator (from before accounts
existed, or whose creator was deleted) are admin-only.

The server enforces all of this ([server/permissions.ts](../server/permissions.ts)).
The web app only uses the same rules to hide buttons.

## Cards

`POST /cards` takes `{column_id, title, description?, color?, due_date?}`.
`PUT /cards/:id` takes any of `title`, `description`, `color`, `due_date` and
`assignee_id`.

- `color` is a hex colour (`#rgb`, `#rrggbb` or `#rrggbbaa`), and `""` means
  none. The UI offers a fixed palette, but any hex colour works. The same goes
  for columns, projects, labels and templates.
- `due_date` is `"YYYY-MM-DD"`. Use `null` or `""` to clear it.
- `assignee_id` is a user id, or `null` to clear it.
- `description` (and comment bodies) is markdown. It's stored as-is and
  rendered by the client, and `- [ ]` checkboxes are clickable.

`POST /cards/quick` takes `{title, project?, column?, description?, color?}`
and finds the project and column by name (case-insensitive) or id. The
defaults are project 1 (or the first project, if 1 is gone) and "To Do". `POST /cards/bulk` takes
`{project?, cards: [...]}` with the same fields per card.

None of the create endpoints take labels or files. Add those afterwards.

Board rows (`GET /projects/:id/board`) include `comment_count`, `link_count`,
`creator_email` and `assignee_email`.

## Labels

Labels belong to a project. First create one, then put it on cards:

```bash
curl -sS -b /tmp/j -X POST http://localhost:3463/api/projects/1/labels \
  -H 'Content-Type: application/json' -d '{"name":"bug","color":"#e5534b"}'   # → {"id":7,...}
curl -sS -b /tmp/j -X POST http://localhost:3463/api/cards/42/labels \
  -H 'Content-Type: application/json' -d '{"label_id":7}'
curl -sS -b /tmp/j -X DELETE http://localhost:3463/api/cards/42/labels/7
```

## Comments

```
GET    /cards/:id/comments   → oldest first
POST   /cards/:id/comments   {body}
PUT    /comments/:id         {body}
DELETE /comments/:id
```

```json
{ "id": 12, "card_id": 71, "body": "Looks good", "created_at": "2026-08-05 18:07:29",
  "edited_at": null, "created_by": 1, "creator_email": "you@example.com" }
```

A comment body can be up to 10,000 characters. Once a comment is edited,
`edited_at` is set.

## Links

Types: `relates` (no direction), `blocks` (A blocks B) and `parent` (B is a
subtask of A).

```
GET    /cards/:id/links   → links as seen from this card
POST   /cards/:id/links   {to_card_id, type?}      (type defaults to relates)
DELETE /links/:id
```

```json
[ { "id": 2, "type": "parent", "direction": "outgoing", "other_card_id": 76,
    "other_title": "Write tests", "other_color": "", "other_column_title": "To Do",
    "other_project_id": 1, "other_project_name": "General" } ]
```

`outgoing` + `parent` means the other card is a subtask of this one. The API
rejects self-links, duplicates (`relates` A→B and B→A count as the same link)
and parent loops, all with a 400.

`GET /projects/:id/graph` returns `{nodes, edges}` for one project. Links to
cards in other projects are left out.

## Files

The request body is the raw file, not multipart. Send the filename
URL-encoded in a header:

```bash
curl -sS -b /tmp/j -X POST http://localhost:3463/api/cards/71/files \
  -H 'Content-Type: image/png' -H 'X-Filename: screen%20shot.png' \
  --data-binary @shot.png
```

Accepted types are images (png, jpeg, gif, webp, avif), PDF, plain text, CSV,
markdown, JSON, zip, and Office/OpenDocument files. The list is in
`ALLOWED_UPLOAD_MIME` in [server/config.ts](../server/config.ts). HTML and SVG
are refused because they can run scripts. Anything else gets
`400 Unsupported file type`. Files over `MAX_UPLOAD_BYTES` (25 MB by default)
get a 413.

`GET /files/:id` needs a session. Images, PDFs and plain text open in the
browser; everything else downloads. Add `?download=1` to always download.
Identical files are stored once.

### Text snippets

The older kind of attachment: text stored in the database.
`POST /cards/:id/attachments` takes `{filename, content, language?}`.
`GET /cards/:id/attachments` lists snippets and files together, without
content. Uploaded files have a `storage_key`.

## Agenda

`GET /agenda` returns every card with a due date in a non-archived project,
excluding columns named "Done", sorted by date. This is the Today view.

## Activity

```
GET /activity?card=71              → one card's history, newest first
GET /activity?project=1&limit=50   → one project
GET /activity                      → everything
```

```json
[ { "id": 42, "created_at": "2026-08-06 18:20:11", "actor_id": 1,
    "actor_email": "you@example.com", "verb": "card.moved", "card_id": 71,
    "project_id": 1, "subject": "Fix the login page", "detail": "To Do → In Progress" } ]
```

Entries keep the card title and the person's email, so they still make sense
after either is deleted. Verbs: `card.created`, `card.deleted`, `card.moved`,
`card.renamed`, `card.described`, `card.due`, `card.assigned`,
`card.unassigned`, `card.labeled`, `card.linked`, `card.unlinked`,
`file.added`, `comment.added`, `comment.deleted`. Edits that don't change
anything and reordering within a column aren't logged.

## Search

`GET /search?q=...&limit=20` searches card titles and notes, comments, and
attachment names and text. It returns one row per card, best match first:

```json
[ { "id": 71, "title": "...", "column_title": "To Do", "project_name": "General",
    "match_kind": "comment", "match_snippet": "...the text around the match..." } ]
```

The last word matches as a prefix, and accents are ignored ("sao" finds
"são"). Any input is safe to send, since the query is escaped before it
reaches SQLite.

## Templates

```
GET    /templates[?project=1]    → that project's templates plus global ones
POST   /templates                {name, project_id?, title?, description?, color?, label_names?[]}
PUT    /templates/:id            (same fields)
DELETE /templates/:id
POST   /templates/:id/apply      {column_id, title?}   → the new card
```

`project_id: null` makes a template available in every project. Labels are
stored by name. When you apply a template, it reuses a label with that name if
the project has one, and creates the label otherwise.
