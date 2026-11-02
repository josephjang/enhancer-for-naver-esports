import { fileURLToPath } from 'node:url';

export const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));
export const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url));
export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));
