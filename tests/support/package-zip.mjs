import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

/** Entries of the zip at `zipPath` as { path: bytes }. */
export async function readZip(zipPath) {
  return unzipSync(new Uint8Array(await readFile(zipPath)));
}

/** Extracts the zip at `zipPath` into `destDir` (which must be empty or new). */
export async function extractZip(zipPath, destDir) {
  for (const [name, bytes] of Object.entries(await readZip(zipPath))) {
    if (name.endsWith('/')) continue;
    const target = path.resolve(destDir, name);
    // Never write outside destDir, whatever the entry names say.
    if (!target.startsWith(path.resolve(destDir) + path.sep)) {
      throw new Error(`zip entry escapes the destination: ${name}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}
