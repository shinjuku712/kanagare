import fs from 'node:fs';
import path from 'node:path';
import type { BlobStore } from './blobs.ts';

/**
 * Blobs as files under `dir`, with a two-level fanout so one directory doesn't
 * accumulate thousands of entries. The OS streams them, and the .db stays
 * small — but a .db backup alone is no longer a complete backup.
 */
export function fsBlobStore(dir: string): BlobStore {
  fs.mkdirSync(dir, { recursive: true });
  const pathFor = (key: string) => path.join(dir, key.slice(0, 2), key.slice(2, 4), key);

  return {
    has: (key) => fs.existsSync(pathFor(key)),
    put(key, bytes) {
      const dest = pathFor(key);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes);
    },
    open(key) {
      const file = pathFor(key);
      return fs.existsSync(file) ? fs.createReadStream(file) : null;
    },
    delete(key) {
      try {
        fs.unlinkSync(pathFor(key));
      } catch {
        /* already gone — nothing to do */
      }
    },
  };
}
