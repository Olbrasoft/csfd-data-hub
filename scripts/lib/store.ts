import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { CSFDMovie } from 'node-csfd-api';
import { DIFFS_DIR, MOVIES_DIR, WATCHLIST_FILE, movieFile } from './paths.js';

export interface Watchlist {
  description?: string;
  ids: number[];
}

export interface MovieSnapshot extends CSFDMovie {
  fetchedAt: string;
}

export async function ensureDataDirs(): Promise<void> {
  await mkdir(MOVIES_DIR, { recursive: true });
  await mkdir(DIFFS_DIR, { recursive: true });
}

export async function loadWatchlist(): Promise<Watchlist> {
  const raw = await readFile(WATCHLIST_FILE, 'utf8');
  return JSON.parse(raw) as Watchlist;
}

export async function loadPreviousSnapshot(id: number): Promise<MovieSnapshot | null> {
  const file = movieFile(id);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8')) as MovieSnapshot;
  } catch {
    return null;
  }
}

export async function writeSnapshot(snapshot: MovieSnapshot): Promise<void> {
  await writeFile(movieFile(snapshot.id), JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
