import { csfd } from 'node-csfd-api';
import { detectChange, type DailyDiff, type RatingDelta, type ScrapeError } from './lib/diff.js';
import { DIFFS_DIR, INDEX_FILE, diffFile } from './lib/paths.js';
import {
  ensureDataDirs,
  loadPreviousSnapshot,
  loadWatchlist,
  type MovieSnapshot,
  writeJson,
  writeSnapshot
} from './lib/store.js';
import { readdir } from 'node:fs/promises';

const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS ?? 2500);
const DRY_RUN = process.env.DRY_RUN === '1';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rebuildIndex(): Promise<void> {
  const files = (await readdir(new URL('../public/data/movies', import.meta.url))).filter((f) =>
    f.endsWith('.json')
  );

  const summaries = await Promise.all(
    files.map(async (file) => {
      const id = Number(file.replace('.json', ''));
      const snapshot = await loadPreviousSnapshot(id);
      if (!snapshot) return null;
      return {
        id: snapshot.id,
        title: snapshot.title,
        year: snapshot.year,
        rating: snapshot.rating,
        ratingCount: snapshot.ratingCount,
        url: snapshot.url,
        fetchedAt: snapshot.fetchedAt
      };
    })
  );

  const valid = summaries.filter((s): s is NonNullable<typeof s> => s !== null);
  valid.sort((a, b) => a.id - b.id);

  await writeJson(INDEX_FILE, {
    generatedAt: new Date().toISOString(),
    movieCount: valid.length,
    movies: valid
  });
}

async function rebuildDiffsIndex(): Promise<void> {
  const files = (await readdir(DIFFS_DIR))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace('.json', ''))
    .sort()
    .reverse();
  await writeJson(`${DIFFS_DIR}/index.json`, { dates: files });
}

async function main(): Promise<void> {
  console.log(`csfd-data-hub scraper — ${todayIso()}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  await ensureDataDirs();

  const watchlist = await loadWatchlist();
  console.log(`Watchlist: ${watchlist.ids.length} titles, delay ${REQUEST_DELAY_MS} ms\n`);

  const added: RatingDelta[] = [];
  const changed: RatingDelta[] = [];
  const unchanged: number[] = [];
  const errors: ScrapeError[] = [];

  for (const id of watchlist.ids) {
    try {
      const previous = await loadPreviousSnapshot(id);
      const fresh = await csfd.movie(id);

      if (!fresh || !fresh.id) {
        throw new Error('Empty response — likely rate-limited or blocked');
      }

      const snapshot: MovieSnapshot = { ...fresh, fetchedAt: new Date().toISOString() };
      const result = detectChange(previous, snapshot);

      if (!DRY_RUN) {
        await writeSnapshot(snapshot);
      }

      if (result.kind === 'added' && result.delta) added.push(result.delta);
      if (result.kind === 'changed' && result.delta) changed.push(result.delta);
      if (result.kind === 'unchanged') unchanged.push(id);

      const marker =
        result.kind === 'added' ? '+' : result.kind === 'changed' ? '~' : '·';
      console.log(
        `${marker} ${id} — ${fresh.title} (${fresh.year}): ${fresh.rating}% (${fresh.ratingCount} hlasů)`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ id, message });
      console.error(`! ${id}: ${message}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  const hasOutput = added.length > 0 || changed.length > 0 || errors.length > 0;
  if (hasOutput && !DRY_RUN) {
    const diff: DailyDiff = {
      date: todayIso(),
      generatedAt: new Date().toISOString(),
      changed,
      added,
      unchanged,
      errors
    };
    await writeJson(diffFile(todayIso()), diff);
    await rebuildDiffsIndex();
  }

  if (!DRY_RUN) {
    await rebuildIndex();
  }

  console.log(
    `\nDone. +${added.length} new, ~${changed.length} changed, ·${unchanged.length} unchanged, !${errors.length} errors.`
  );

  if (errors.length > 0 && errors.length === watchlist.ids.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
