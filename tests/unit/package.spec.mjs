import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  assertVersionsMatch,
  buildPackage,
  collectPackageFiles,
  manifestReferences,
  missingReferences,
} from '../../scripts/package.mjs';
import { readZip } from '../support/package-zip.mjs';
import { ROOT_DIR } from '../support/paths.mjs';

const manifest = JSON.parse(await readFile(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(await readFile(path.join(ROOT_DIR, 'package.json'), 'utf8'));

test.describe('manifest checks', () => {
  test('lists every file the manifest refers to', () => {
    expect(manifestReferences(manifest)).toEqual([
      '_locales/en/messages.json',
      'icons/icon-128.png',
      'icons/icon-16.png',
      'icons/icon-32.png',
      'icons/icon-48.png',
      'src/background.js',
      'src/content.css',
      'src/content.js',
      'src/fill-mode.js',
      'src/i18n.js',
      'src/player-button.js',
    ]);
  });

  test('handles a manifest without optional sections', () => {
    expect(manifestReferences({ manifest_version: 3, name: 'x', version: '1' })).toEqual([]);
  });

  test('reports references missing from a file list', () => {
    const files = manifestReferences(manifest).filter((file) => file !== 'src/i18n.js');

    expect(missingReferences(manifest, files)).toEqual(['src/i18n.js']);
    expect(missingReferences(manifest, [...files, 'src/i18n.js'])).toEqual([]);
  });

  test('rejects mismatched versions', () => {
    expect(() => assertVersionsMatch({ version: '0.1.0' }, { version: '0.1.0' })).not.toThrow();
    expect(() => assertVersionsMatch({ version: '0.2.0' }, { version: '0.1.0' }))
      .toThrow('manifest.json version 0.2.0 does not match package.json version 0.1.0');
  });

  test('the repository versions match', () => {
    expect(manifest.version).toBe(packageJson.version);
  });
});

test.describe('buildPackage', () => {
  test('zips exactly the runtime files, unchanged, with manifest.json at the root', async ({}, testInfo) => {
    const { zipPath, files } = await buildPackage({ outDir: testInfo.outputPath('dist') });
    const entries = await readZip(zipPath);

    expect(path.basename(zipPath)).toBe(`${packageJson.name}-${manifest.version}.zip`);
    expect(Object.keys(entries).sort()).toEqual(files);
    expect(files).toEqual(await collectPackageFiles());
    expect(files).toContain('manifest.json');
    expect(missingReferences(manifest, files)).toEqual([]);
    for (const file of files) {
      expect(Buffer.from(entries[file]).equals(await readFile(path.join(ROOT_DIR, file))), file).toBe(true);
    }
  });

  test('leaves out everything that is not loaded by the browser', async ({}, testInfo) => {
    const { files } = await buildPackage({ outDir: testInfo.outputPath('dist') });

    for (const file of files) {
      expect(file).toMatch(/^(manifest\.json|_locales\/[^/]+\/messages\.json|src\/[^/]+\.(js|css)|icons\/icon-\d+\.png)$/);
    }
  });

  test('produces identical bytes for identical sources', async ({}, testInfo) => {
    const first = await buildPackage({ outDir: testInfo.outputPath('first') });
    const second = await buildPackage({ outDir: testInfo.outputPath('second') });

    expect((await readFile(first.zipPath)).equals(await readFile(second.zipPath))).toBe(true);
  });

  test('refuses to build when a referenced file is missing', async ({}, testInfo) => {
    // A copy of the repository's runtime files without src/i18n.js.
    const rootDir = testInfo.outputPath('root');
    for (const file of [...(await collectPackageFiles()), 'package.json']) {
      if (file === 'src/i18n.js') continue;
      await mkdir(path.dirname(path.join(rootDir, file)), { recursive: true });
      await copyFile(path.join(ROOT_DIR, file), path.join(rootDir, file));
    }

    await expect(buildPackage({ rootDir, outDir: testInfo.outputPath('dist') }))
      .rejects.toThrow('manifest.json refers to files missing from the package: src/i18n.js');
  });

  test('refuses to build when the versions disagree', async ({}, testInfo) => {
    const rootDir = testInfo.outputPath('root');
    for (const file of await collectPackageFiles()) {
      await mkdir(path.dirname(path.join(rootDir, file)), { recursive: true });
      await copyFile(path.join(ROOT_DIR, file), path.join(rootDir, file));
    }
    await writeFile(path.join(rootDir, 'package.json'), JSON.stringify({ ...packageJson, version: '9.9.9' }));

    await expect(buildPackage({ rootDir, outDir: testInfo.outputPath('dist') }))
      .rejects.toThrow(`manifest.json version ${manifest.version} does not match package.json version 9.9.9`);
  });
});
