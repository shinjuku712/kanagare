import Database from 'better-sqlite3';
import { config } from './config.ts';
import { migrate, seed, useDatabase } from './db.ts';
import { useBlobStore } from './blobs.ts';
import { fsBlobStore } from './blobs-fs.ts';
import { errorHandler } from './http.ts';
import { createApp } from './app.ts';
import { staticRouter } from './static.ts';

const database = new Database(config.dbPath);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
useDatabase(database);
useBlobStore(fsBlobStore(config.uploadsDir));

migrate();
seed();

const app = createApp();
app.use(staticRouter);
app.use(errorHandler);

app.listen(config.port, '127.0.0.1', () => {
  console.log(`${config.appName} listening on 127.0.0.1:${config.port}`);
});
