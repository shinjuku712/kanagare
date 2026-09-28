import type Database from 'better-sqlite3';
import { config } from './config.ts';
import { hashPassword } from './auth/password.ts';

/**
 * The database handle every module queries through. Injected at startup rather
 * than opened here, because the two runtimes open it differently: Node opens a
 * better-sqlite3 file (server/index.ts), the Cloudflare build wraps a Durable
 * Object's SQLite storage (worker/sqlite.ts). An ES live binding, so importers
 * see the value set by useDatabase() without re-importing.
 */
export let db: Database.Database;

export function useDatabase(handle: Database.Database): void {
  db = handle;
}

/**
 * Idempotent migrations, run at every start. On a fresh database this creates
 * everything; on an older one it adds whatever is missing.
 */
export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#7c6ef6',
      position INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      column_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      content TEXT NOT NULL,
      language TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS card_labels (
      card_id INTEGER NOT NULL,
      label_id INTEGER NOT NULL,
      PRIMARY KEY (card_id, label_id),
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
      FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS card_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_card_id INTEGER NOT NULL,
      to_card_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'relates',
      created_at TEXT DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (from_card_id) REFERENCES cards(id) ON DELETE CASCADE,
      FOREIGN KEY (to_card_id) REFERENCES cards(id) ON DELETE CASCADE,
      CHECK (from_card_id <> to_card_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_card_links_pair ON card_links(from_card_id, to_card_id, type);
    CREATE INDEX IF NOT EXISTS idx_card_links_to ON card_links(to_card_id);
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      edited_at TEXT DEFAULT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_columns_project ON columns(project_id);
    CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_card ON attachments(card_id);
    CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(card_id, id);
    -- activity: email and title are copied in so entries outlive what they describe
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT (datetime('now')),
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT,
      verb TEXT NOT NULL,
      card_id INTEGER,
      project_id INTEGER,
      subject TEXT,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_activity_card ON activity(card_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id, id DESC);
    -- templates: project_id NULL = every project; labels are stored by name
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      label_names TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_templates_project ON templates(project_id);
  `);

  // Columns added over time — safe to re-run.
  const addColumn = (table: string, ddl: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    } catch {
      /* column already exists */
    }
  };
  addColumn('projects', "archived INTEGER NOT NULL DEFAULT 0");
  addColumn('cards', 'due_date TEXT DEFAULT NULL');
  addColumn('cards', 'updated_at TEXT DEFAULT NULL');
  for (const t of ['projects', 'columns', 'cards', 'labels']) {
    addColumn(t, 'created_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }

  // Who's responsible for a card. Separate from created_by, which decides who can edit it.
  addColumn('cards', 'assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL');

  // Uploaded files share the attachments table with text snippets. A file has
  // storage_key set and content ''; a snippet has its text in content.
  addColumn('attachments', 'storage_key TEXT DEFAULT NULL');
  addColumn('attachments', 'mime TEXT DEFAULT NULL');
  addColumn('attachments', 'size_bytes INTEGER DEFAULT NULL');
  addColumn('attachments', 'checksum TEXT DEFAULT NULL');
  addColumn('attachments', 'created_by INTEGER REFERENCES users(id) ON DELETE SET NULL');

  // These index columns added above, so they must come after the ALTERs.
  db.exec("CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due_date) WHERE due_date IS NOT NULL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_cards_assignee ON cards(assignee_id) WHERE assignee_id IS NOT NULL");

  migrateSearchIndex();
}

/**
 * One FTS5 index over cards, comments and attachments, kept in sync by
 * triggers. `kind` + `ref_id` point at the source row; `card_id` is what
 * search results open.
 */
function migrateSearchIndex(): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
      text,
      kind UNINDEXED,
      ref_id UNINDEXED,
      card_id UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    -- cards: title + notes
    CREATE TRIGGER IF NOT EXISTS trg_fts_cards_ai AFTER INSERT ON cards BEGIN
      INSERT INTO search_fts(text, kind, ref_id, card_id)
      VALUES (new.title || ' ' || COALESCE(new.description, ''), 'card', new.id, new.id);
    END;
    CREATE TRIGGER IF NOT EXISTS trg_fts_cards_au AFTER UPDATE OF title, description ON cards BEGIN
      DELETE FROM search_fts WHERE kind = 'card' AND ref_id = new.id;
      INSERT INTO search_fts(text, kind, ref_id, card_id)
      VALUES (new.title || ' ' || COALESCE(new.description, ''), 'card', new.id, new.id);
    END;
    CREATE TRIGGER IF NOT EXISTS trg_fts_cards_ad AFTER DELETE ON cards BEGIN
      DELETE FROM search_fts WHERE card_id = old.id;
    END;

    -- comments
    CREATE TRIGGER IF NOT EXISTS trg_fts_comments_ai AFTER INSERT ON comments BEGIN
      INSERT INTO search_fts(text, kind, ref_id, card_id) VALUES (new.body, 'comment', new.id, new.card_id);
    END;
    CREATE TRIGGER IF NOT EXISTS trg_fts_comments_au AFTER UPDATE OF body ON comments BEGIN
      DELETE FROM search_fts WHERE kind = 'comment' AND ref_id = new.id;
      INSERT INTO search_fts(text, kind, ref_id, card_id) VALUES (new.body, 'comment', new.id, new.card_id);
    END;
    CREATE TRIGGER IF NOT EXISTS trg_fts_comments_ad AFTER DELETE ON comments BEGIN
      DELETE FROM search_fts WHERE kind = 'comment' AND ref_id = old.id;
    END;

    -- attachments: filename, plus the body of text snippets (uploads have none)
    CREATE TRIGGER IF NOT EXISTS trg_fts_att_ai AFTER INSERT ON attachments BEGIN
      INSERT INTO search_fts(text, kind, ref_id, card_id)
      VALUES (new.filename || ' ' || COALESCE(new.content, ''), 'attachment', new.id, new.card_id);
    END;
    CREATE TRIGGER IF NOT EXISTS trg_fts_att_au AFTER UPDATE OF filename, content ON attachments BEGIN
      DELETE FROM search_fts WHERE kind = 'attachment' AND ref_id = new.id;
      INSERT INTO search_fts(text, kind, ref_id, card_id)
      VALUES (new.filename || ' ' || COALESCE(new.content, ''), 'attachment', new.id, new.card_id);
    END;
    CREATE TRIGGER IF NOT EXISTS trg_fts_att_ad AFTER DELETE ON attachments BEGIN
      DELETE FROM search_fts WHERE kind = 'attachment' AND ref_id = old.id;
    END;
  `);

  // Backfill once, for databases that predate the index.
  const indexed = (db.prepare('SELECT COUNT(*) AS c FROM search_fts').get() as { c: number }).c;
  if (indexed === 0) {
    const n = db.transaction(() => {
      db.exec(`
        INSERT INTO search_fts(text, kind, ref_id, card_id)
          SELECT title || ' ' || COALESCE(description, ''), 'card', id, id FROM cards;
        INSERT INTO search_fts(text, kind, ref_id, card_id)
          SELECT body, 'comment', id, card_id FROM comments;
        INSERT INTO search_fts(text, kind, ref_id, card_id)
          SELECT filename || ' ' || COALESCE(content, ''), 'attachment', id, card_id FROM attachments;
      `);
      return (db.prepare('SELECT COUNT(*) AS c FROM search_fts').get() as { c: number }).c;
    })();
    if (n) console.log(`[search] backfilled ${n} rows into the full-text index`);
  }
}

export function seed(): void {
  // First admin from env when the users table is empty.
  const userCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  const isFirstAdmin = userCount === 0;
  if (isFirstAdmin) {
    if (config.adminEmail && config.adminPassword) {
      const info = db
        .prepare('INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, 1)')
        .run(config.adminEmail.toLowerCase().trim(), hashPassword(config.adminPassword));
      console.log(`[auth] seeded initial admin: ${config.adminEmail}`);
      adoptOrphanRows(Number(info.lastInsertRowid));
    } else {
      console.warn(
        '[auth] users table is empty and ADMIN_EMAIL/ADMIN_PASSWORD not set — no one can log in.',
      );
    }
  }

  // Prune expired sessions on boot (cheap, table is small).
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

  // Default project + columns on a completely fresh database.
  const projCount = (db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }).c;
  if (projCount === 0) {
    db.prepare('INSERT INTO projects (name, slug, color, position) VALUES (?, ?, ?, ?)').run(
      'General',
      'general',
      '#7c6ef6',
      0,
    );
  }
  const colCount = (db.prepare('SELECT COUNT(*) AS c FROM columns').get() as { c: number }).c;
  if (colCount === 0) {
    const firstProject = db.prepare('SELECT id FROM projects ORDER BY position LIMIT 1').get() as
      | { id: number }
      | undefined;
    if (firstProject) seedDefaultColumns(firstProject.id, null);
  }
}

/**
 * Backfill for databases that predate user accounts: rows without a creator
 * are given to the first admin. Otherwise they'd stay NULL, which is
 * admin-only, and nobody else could edit the old cards.
 *
 * Only runs when the first admin is seeded into an empty users table.
 */
function adoptOrphanRows(adminId: number): void {
  const tables = ['projects', 'columns', 'cards', 'labels'] as const;
  let total = 0;
  const tx = db.transaction(() => {
    for (const t of tables) {
      const info = db.prepare(`UPDATE ${t} SET created_by = ? WHERE created_by IS NULL`).run(adminId);
      total += info.changes;
    }
  });
  tx();
  if (total > 0) console.log(`[migrate] adopted ${total} pre-ownership row(s) as admin #${adminId}`);
}

export function seedDefaultColumns(projectId: number, createdBy: number | null): void {
  const insert = db.prepare(
    'INSERT INTO columns (project_id, title, position, color, created_by) VALUES (?, ?, ?, ?, ?)',
  );
  insert.run(projectId, 'To Do', 0, '#6366f1', createdBy);
  insert.run(projectId, 'In Progress', 1, '#f59e0b', createdBy);
  insert.run(projectId, 'Done', 2, '#10b981', createdBy);
}
