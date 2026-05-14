import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

export const DATA_DIR = path.join(REPO_ROOT, 'public', 'data');
export const MOVIES_DIR = path.join(DATA_DIR, 'movies');
export const DIFFS_DIR = path.join(DATA_DIR, 'diffs');
export const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlist.json');
export const INDEX_FILE = path.join(DATA_DIR, 'index.json');

export const movieFile = (id: number) => path.join(MOVIES_DIR, `${id}.json`);
export const diffFile = (isoDate: string) => path.join(DIFFS_DIR, `${isoDate}.json`);
