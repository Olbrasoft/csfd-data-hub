/**
 * Probe: how well does Wikidata map IMDb / TMDB IDs to ČSFD film IDs?
 *
 * Wikidata properties involved:
 *   P345  — IMDb ID  (string "tt1234567")
 *   P4947 — TMDB movie ID (numeric)
 *   P2529 — ČSFD film ID (numeric)
 *
 * For each sample film we query both paths:
 *   1) imdb_id  → csfd_id  (films coming from cr.films.imdb_id)
 *   2) tmdb_id  → csfd_id  (films coming from cr.films.tmdb_id, no TMDB API needed)
 *
 * Run:
 *   npm run probe:wikidata
 *
 * No npm deps — uses Node 20+ global fetch.
 */

interface ProbeFilm {
  imdb: string;
  tmdb: number;
  hint: string;
}

// IMDb + TMDB IDs of well-known films, paired manually from public sources.
const SAMPLE: ProbeFilm[] = [
  { imdb: 'tt1375666', tmdb: 27205, hint: 'Inception (2010)' },
  { imdb: 'tt0468569', tmdb: 155, hint: 'The Dark Knight (2008)' },
  { imdb: 'tt0816692', tmdb: 157336, hint: 'Interstellar (2014)' },
  { imdb: 'tt0211915', tmdb: 194, hint: 'Amélie (2001)' },
  { imdb: 'tt0245429', tmdb: 129, hint: 'Spirited Away (2001)' },
  { imdb: 'tt0095765', tmdb: 11216, hint: 'Cinema Paradiso (1988)' },
  // — Czech / Slovak films are the interesting edge case —
  { imdb: 'tt0120669', tmdb: 27513, hint: 'Kolja (1996)' },
  { imdb: 'tt0245429', tmdb: 129, hint: 'duplicate ok' },
  { imdb: 'tt0190332', tmdb: 38751, hint: 'Pelíšky (1999)' },
  { imdb: 'tt0286499', tmdb: 14439, hint: 'Tmavomodrý svět (2001)' },
  // — TV series via P4947 may behave differently (TMDB has separate /tv/ endpoint) —
  { imdb: 'tt0903747', tmdb: 1396, hint: 'Breaking Bad (TV, 2008)' }
];

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT =
  'csfd-data-hub-probe/0.2 (https://github.com/Olbrasoft/csfd-data-hub; olbrasoft.claudecode@gmail.com)';

interface SparqlBinding {
  key?: { value: string };
  csfd?: { value: string };
  label?: { value: string };
  film?: { value: string };
}

interface SparqlResponse {
  results: { bindings: SparqlBinding[] };
}

async function querySparql(query: string): Promise<SparqlResponse> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': USER_AGENT
    }
  });
  if (!res.ok) {
    throw new Error(`Wikidata SPARQL ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<SparqlResponse>;
}

function buildQueryByImdb(imdbIds: string[]): string {
  const values = imdbIds.map((id) => `"${id}"`).join(' ');
  return `
    SELECT ?key ?csfd ?film ?label WHERE {
      VALUES ?key { ${values} }
      ?film wdt:P345 ?key .
      OPTIONAL { ?film wdt:P2529 ?csfd . }
      OPTIONAL {
        ?film rdfs:label ?label .
        FILTER(LANG(?label) = "cs")
      }
    }
  `;
}

function buildQueryByTmdb(tmdbIds: number[]): string {
  const values = tmdbIds.map((id) => `"${id}"`).join(' ');
  return `
    SELECT ?key ?csfd ?film ?label WHERE {
      VALUES ?key { ${values} }
      ?film wdt:P4947 ?key .
      OPTIONAL { ?film wdt:P2529 ?csfd . }
      OPTIONAL {
        ?film rdfs:label ?label .
        FILTER(LANG(?label) = "cs")
      }
    }
  `;
}

type Hits = Map<string, { csfd?: string; label?: string; wikidata?: string }>;

function indexBindings(response: SparqlResponse): Hits {
  const hits: Hits = new Map();
  for (const row of response.results.bindings) {
    const k = row.key?.value;
    if (!k) continue;
    const prev = hits.get(k) ?? {};
    hits.set(k, {
      csfd: row.csfd?.value ?? prev.csfd,
      label: row.label?.value ?? prev.label,
      wikidata: row.film?.value ?? prev.wikidata
    });
  }
  return hits;
}

function pct(n: number, total: number): string {
  return `${n}/${total} (${Math.round((100 * n) / total)}%)`;
}

async function main(): Promise<void> {
  console.log(`Wikidata coverage probe — ${SAMPLE.length} sample films\n`);

  const imdbIds = [...new Set(SAMPLE.map((f) => f.imdb))];
  const tmdbIds = [...new Set(SAMPLE.map((f) => f.tmdb))];

  const [imdbResp, tmdbResp] = await Promise.all([
    querySparql(buildQueryByImdb(imdbIds)),
    querySparql(buildQueryByTmdb(tmdbIds))
  ]);

  const byImdb = indexBindings(imdbResp);
  const byTmdb = indexBindings(tmdbResp);

  console.log(
    'IMDb        TMDB     hint                              | imdb→ČSFD | tmdb→ČSFD | label'
  );
  console.log(
    '----------- -------- --------------------------------- + --------- + --------- + --------------------'
  );

  let imdbHasFilm = 0;
  let imdbHasCsfd = 0;
  let tmdbHasFilm = 0;
  let tmdbHasCsfd = 0;
  let bothPathsAgree = 0;
  let onlyTmdb = 0;
  let onlyImdb = 0;
  let neither = 0;

  for (const film of SAMPLE) {
    const i = byImdb.get(film.imdb);
    const t = byTmdb.get(String(film.tmdb));

    if (i?.wikidata) imdbHasFilm++;
    if (i?.csfd) imdbHasCsfd++;
    if (t?.wikidata) tmdbHasFilm++;
    if (t?.csfd) tmdbHasCsfd++;

    if (i?.csfd && t?.csfd && i.csfd === t.csfd) bothPathsAgree++;
    else if (t?.csfd && !i?.csfd) onlyTmdb++;
    else if (i?.csfd && !t?.csfd) onlyImdb++;
    else if (!i?.csfd && !t?.csfd) neither++;

    const imdbCol = i?.csfd ? i.csfd.padEnd(9) : '   —     ';
    const tmdbCol = t?.csfd ? t.csfd.padEnd(9) : '   —     ';
    const label = i?.label ?? t?.label ?? '';

    console.log(
      `${film.imdb.padEnd(11)} ${String(film.tmdb).padEnd(8)} ${film.hint.padEnd(33)} | ${imdbCol} | ${tmdbCol} | ${label}`
    );
  }

  const N = SAMPLE.length;
  console.log('');
  console.log('Coverage summary:');
  console.log(`  IMDb → Wikidata film:        ${pct(imdbHasFilm, N)}`);
  console.log(`  IMDb → ČSFD ID:              ${pct(imdbHasCsfd, N)}`);
  console.log(`  TMDB → Wikidata film:        ${pct(tmdbHasFilm, N)}`);
  console.log(`  TMDB → ČSFD ID:              ${pct(tmdbHasCsfd, N)}`);
  console.log('');
  console.log('Cross-check (both paths against each other):');
  console.log(`  Both paths agree on ČSFD:    ${pct(bothPathsAgree, N)}`);
  console.log(`  Only TMDB path resolved:     ${onlyTmdb}`);
  console.log(`  Only IMDb path resolved:     ${onlyImdb}`);
  console.log(`  Neither path resolved:       ${neither}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
