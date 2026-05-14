# csfd-data-hub

Denní snímky hodnocení z Česko-Slovenské filmové databáze (ČSFD) jako otevřená data.
Jeden JSON soubor na film, historie verzována přes git, statické API přes Vercel CDN.

> **PoC, neoficiální projekt.** Scraping zajišťuje [`node-csfd-api`](https://github.com/bartholomej/node-csfd-api).

## Architektura

```
GitHub Actions cron (03:00 UTC)
        │
        ▼
   scripts/scrape.ts (Node.js, node-csfd-api)
        │
        ▼
   public/data/movies/{csfd_id}.json   ← jeden soubor na film
   public/data/diffs/YYYY-MM-DD.json   ← denní rozdíly
   public/data/index.json              ← souhrn pro klienty
        │
   git commit && git push
        │
        ▼
   Vercel auto-deploy
        │
        ▼
   /api/v1/movies/{id} → /data/movies/{id}.json (rewrite, CDN)
   /api/v1/diffs/{date}
   /api/v1/index
```

Žádná externí databáze, žádné cold-starty, žádná pauza. Git poskytuje historii, Vercel CDN distribuci.

## Struktura repa

```
csfd-data-hub/
├── .github/workflows/scrape.yml   # denní cron
├── app/                            # Next.js (App Router) landing page
├── public/data/                    # generovaná data, commitovaná do gitu
│   ├── watchlist.json              # seznam ČSFD ID ke sledování
│   ├── movies/{id}.json            # jeden soubor na film
│   ├── diffs/{YYYY-MM-DD}.json     # denní diffy
│   ├── diffs/index.json            # list dostupných diff dní
│   └── index.json                  # souhrn pro klienty
├── scripts/
│   ├── scrape.ts                   # hlavní entrypoint scraperu
│   └── lib/                        # store, diff, paths
├── reference/node-csfd-api/        # gitignored — zkopírováno pro inspekci
├── vercel.json                     # rewrites + cache headers
└── package.json
```

## Lokální použití

```bash
npm install

# Suchý běh (nic se nezapíše)
npm run scrape:dry

# Reálný běh (ukládá do public/data/)
npm run scrape

# Next.js dev server (http://localhost:3000)
npm run dev
```

## Úprava watchlistu

Přidávejte ČSFD ID do `public/data/watchlist.json`:

```json
{
  "ids": [2294, 8819, 9499, 535121]
}
```

ID najdete v URL ČSFD — `csfd.cz/film/535121-na-spatne-strane/` → `535121`.

## Konfigurace přes env vars

| Proměnná | Default | Popis |
|---|---|---|
| `REQUEST_DELAY_MS` | `2500` | Pauza mezi requesty na ČSFD (ms). Buďte ohleduplní. |
| `DRY_RUN` | `` | Pokud `1`, nezapíše žádné soubory. |

## API

| Endpoint | Mapováno na |
|---|---|
| `GET /api/v1/movies/{id}` | `/data/movies/{id}.json` |
| `GET /api/v1/index` | `/data/index.json` |
| `GET /api/v1/watchlist` | `/data/watchlist.json` |
| `GET /api/v1/diffs/{date}` | `/data/diffs/{date}.json` |

Vše se servíruje rovnou jako statický soubor přes CDN — žádné serverless funkce.

## Historie a diffy

Každá změna hodnocení je samostatný git commit, takže můžete:

```bash
# Historie konkrétního filmu
git log --follow public/data/movies/535121.json

# Co se změnilo v daný den
cat public/data/diffs/2026-05-14.json | jq
```

## Nasazení na Vercel

1. Push do GitHubu.
2. Na Vercelu „Import Project" → vyberte repo.
3. Žádné env vars potřeba.
4. GitHub Actions cron se aktivuje sám (potřebuje `contents: write` permission, už nastaveno ve workflow).

## Známé limity

- **Vercel Hobby** je explicitně non-commercial. Pro osobní použití OK.
- **node-csfd-api** je neoficiální scraper. Pokud ČSFD změní HTML, knihovna dostane update, my updatujeme `node-csfd-api` ve `package.json`.
- **Rate limit ze strany ČSFD** — workflow defaultně čeká 2.5 s mezi requesty. Pro stovky filmů to znamená několik minut běhu, což GitHub Actions zvládá (timeout 60 min).

## Licence

MIT — viz `LICENSE`. Data scrapovaná z ČSFD nejsou součástí licence tohoto repa, patří jejich autorům a POMO Media Group s.r.o.
