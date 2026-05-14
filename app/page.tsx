import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

interface IndexSummary {
  generatedAt: string | null;
  movieCount: number;
  movies: Array<{ id: number; title: string; year: number; rating: number; ratingCount: number }>;
}

async function loadIndex(): Promise<IndexSummary> {
  const file = path.join(process.cwd(), 'public', 'data', 'index.json');
  try {
    return JSON.parse(await readFile(file, 'utf8')) as IndexSummary;
  } catch {
    return { generatedAt: null, movieCount: 0, movies: [] };
  }
}

async function countDiffs(): Promise<number> {
  const dir = path.join(process.cwd(), 'public', 'data', 'diffs');
  try {
    const files = await readdir(dir);
    return files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).length;
  } catch {
    return 0;
  }
}

export default async function Home() {
  const index = await loadIndex();
  const diffs = await countDiffs();
  const lastUpdated = index.generatedAt
    ? new Date(index.generatedAt).toLocaleString('cs-CZ')
    : '— zatím neproběhlo';

  return (
    <main>
      <h1>csfd-data-hub</h1>
      <p className="lede">
        Denní snímky hodnocení z Česko-Slovenské filmové databáze jako otevřená data — jeden JSON na
        film, historie v gitu, statické API přes CDN.
      </p>

      <div className="stats">
        <div>
          <span className="stat-value">{index.movieCount}</span>
          <span className="stat-label">sledovaných titulů</span>
        </div>
        <div>
          <span className="stat-value">{diffs}</span>
          <span className="stat-label">denních diffů</span>
        </div>
        <div>
          <span className="stat-value" style={{ fontSize: '1rem', fontWeight: 400 }}>
            {lastUpdated}
          </span>
          <span className="stat-label">poslední aktualizace</span>
        </div>
      </div>

      <h2>REST API</h2>
      <ul>
        <li>
          <code>GET /api/v1/movies/{'{csfd_id}'}</code> — detail filmu
        </li>
        <li>
          <code>GET /api/v1/index</code> — seznam všech sledovaných filmů
        </li>
        <li>
          <code>GET /api/v1/watchlist</code> — aktuální watchlist
        </li>
        <li>
          <code>GET /api/v1/diffs/{'{YYYY-MM-DD}'}</code> — co se daný den změnilo
        </li>
      </ul>

      <h2>Statické soubory</h2>
      <p>Vše je servírováno také rovnou z CDN bez serverless funkce:</p>
      <ul>
        <li>
          <code>/data/movies/{'{csfd_id}'}.json</code>
        </li>
        <li>
          <code>/data/index.json</code>
        </li>
        <li>
          <code>/data/diffs/{'{YYYY-MM-DD}'}.json</code>
        </li>
        <li>
          <code>/data/diffs/index.json</code> — seznam dostupných dní
        </li>
      </ul>

      <h2>Bulk download</h2>
      <p>
        Pro první spárování stáhněte ZIP celého repa z GitHubu (
        <code>{'https://github.com/<user>/csfd-data-hub/archive/refs/heads/main.zip'}</code>) — git
        archive je zdarma a obsahuje aktuální snapshot včetně historie přes <code>git log</code>.
      </p>

      <footer>
        <p>
          PoC — neoficiální. Data scrapuje denně cron z ČSFD pomocí{' '}
          <a href="https://github.com/bartholomej/node-csfd-api">node-csfd-api</a>.
        </p>
      </footer>
    </main>
  );
}
