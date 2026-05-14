# Setup — připojení csfd-data-hub na cr produkční DB

Tento dokument popisuje **jednorázovou** konfiguraci, kterou udělá vlastník
projektu (jednou) předtím, než workflow začne automaticky tahat watchlist
z `cr` produkční DB.

Po provedení už GitHub Actions vše dělá samo: 03:00 UTC denně → SSH tunnel
→ `SELECT csfd_id FROM films UNION …` → scrape ČSFD → commit JSONů.

> **Bezpečnostní cíle**
> 1. csfd-data-hub může z prod DB **jen číst** (DB user má jen `SELECT`).
> 2. SSH deploy klíč může **jen forwardovat port 5432**, ne otevřít shell.
> 3. Všechny credentials jsou v GitHub Actions Secrets, nikdy v repu.

## 1. Vygenerujte dedikovaný SSH klíč

```bash
ssh-keygen -t ed25519 \
  -f ~/.ssh/csfd-data-hub-deploy \
  -C "csfd-data-hub@github-actions" \
  -N ""

# Veřejný klíč si pak nakopírujte:
cat ~/.ssh/csfd-data-hub-deploy.pub
```

Pojmenování `~/.ssh/csfd-data-hub-deploy` je doporučení, můžete cokoli.
**Klíč nepoužívejte pro nic jiného** — kompromitace = jednoduchá rotace.

## 2. Nainstalujte veřejný klíč na VPS s restrikcí

Na produkčním VPS otevřete `~csfd-readonly/.ssh/authorized_keys`
(nebo `~root/.ssh/authorized_keys` pokud nepoužíváte separátní účet)
a přidejte řádek:

```
restrict,permitlisten="127.0.0.1:5432",command="echo 'port-forward only';sleep 86400" ssh-ed25519 AAAA…váš public klíč… csfd-data-hub@github-actions
```

Význam:

| Token | Co dělá |
|---|---|
| `restrict` | Vypne agent forwarding, X11, port-forwarding **kromě** explicitně povoleného, PTY, user-rc. Černá listina. |
| `permitlisten="127.0.0.1:5432"` | Whitelist: tento jeden port lze forwardovat |
| `command="echo 'port-forward only';sleep 86400"` | I když by někdo otevřel shell, dostane jen tuto pseudo-zprávu — žádný interaktivní přístup |

Pokud `cr-db-1` Docker container poslouchá jen na docker bridge, vytvořte
si na VPS systemovou službu nebo zachovejte stávající přepis `db: → 127.0.0.1:`
přes Postgres dostupný na hostitelské 127.0.0.1:5432.

## 3. Vytvořte read-only Postgres uživatele

Na VPS (např. přes `docker exec -it cr-db-1 psql -U cr -d cr` nebo svým
běžným adminským připojením):

```sql
-- Heslo si vygenerujte: `openssl rand -base64 32` nebo password manager
CREATE USER csfd_readonly WITH PASSWORD '<silne-nahodne-heslo>';

GRANT CONNECT ON DATABASE cr TO csfd_readonly;
GRANT USAGE   ON SCHEMA   public TO csfd_readonly;
GRANT SELECT  ON films, series, tv_shows TO csfd_readonly;

-- Pojistka: i kdyby měl user omylem write práva, vše bude RO transakce
ALTER USER csfd_readonly SET default_transaction_read_only = on;

-- Ověření, že to funguje
\c cr csfd_readonly
SELECT COUNT(*) FROM films WHERE csfd_id IS NOT NULL;
-- Mělo by projít. Pak zkuste:
INSERT INTO films (title, slug) VALUES ('test', 'test');
-- Mělo by selhat: "ERROR: permission denied for table films"
```

> Pokud později přibudou další tabulky s `csfd_id` (např. nějaké epizody),
> stačí dopsat další `GRANT SELECT ON <table> TO csfd_readonly;`.

## 4. Vložte secrets do GitHub Actions

Z lokálu (`gh` musí být přihlášen — `gh auth status`):

```bash
gh secret set VPS_SSH_HOST --repo Olbrasoft/csfd-data-hub --body "<vps-hostname-nebo-ip>"
gh secret set VPS_SSH_PORT --repo Olbrasoft/csfd-data-hub --body "<port>"
gh secret set VPS_SSH_KEY  --repo Olbrasoft/csfd-data-hub --body "$(cat ~/.ssh/csfd-data-hub-deploy)"
gh secret set DB_RO_URL    --repo Olbrasoft/csfd-data-hub \
    --body "postgres://csfd_readonly:<heslo>@127.0.0.1:5432/cr"
```

**`DB_RO_URL` ukazuje na `127.0.0.1:5432`** — to je úmyslné. Workflow nejdřív
vytvoří SSH tunnel `-L 5432:127.0.0.1:5432`, takže lokálně v GH runneru
to vypadá jako localhost. Tunnel se tear-downuje po proběhnutí sync-watchlistu.

Ověření, že secrets sedí (nezobrazí hodnoty, jen jména):
```bash
gh secret list --repo Olbrasoft/csfd-data-hub
```

## 5. Ověřte ručním spuštěním

```bash
gh workflow run "Daily ČSFD scrape" --repo Olbrasoft/csfd-data-hub \
    -f dry_run=true
```

Sledování:
```bash
gh run watch --repo Olbrasoft/csfd-data-hub
```

Co byste měli v logu vidět:
- `Fetched <N> rows from cr prod DB.`
- `Unique IDs: <N>` (nový watchlist)
- Scraper zpracuje pár prvních ID (zkrácený běh kvůli dry_run)
- `(dry run — no file written)`
- Žádný řádek nesmí obsahovat heslo ani privátní klíč — pokud ano,
  reportujte jako bug a rotujte klíče.

## 6. Rotace klíčů (kdykoli)

```bash
# 1. nový klíč
ssh-keygen -t ed25519 -f ~/.ssh/csfd-data-hub-deploy-NEW -N ""

# 2. přidat na VPS (zatím se starým)
cat ~/.ssh/csfd-data-hub-deploy-NEW.pub  # → authorized_keys

# 3. update GH secret
gh secret set VPS_SSH_KEY --repo Olbrasoft/csfd-data-hub \
    --body "$(cat ~/.ssh/csfd-data-hub-deploy-NEW)"

# 4. ověřit workflow run

# 5. smazat starý řádek z authorized_keys + lokální starý klíč
```

DB heslo se rotuje stejnou logikou: `ALTER USER csfd_readonly PASSWORD '<new>';`
+ `gh secret set DB_RO_URL …`.

## Co když workflow selže

| Symptom v logu | Pravděpodobná příčina | Náprava |
|---|---|---|
| `Permission denied (publickey)` | Public key není na VPS | Krok 2 |
| `port forwarding failed` | `permitlisten` nematchuje, nebo Postgres není na 127.0.0.1 | Krok 2 + zkontrolovat `ss -tlnp` na VPS |
| `password authentication failed for user "csfd_readonly"` | Špatné heslo v `DB_RO_URL` nebo user neexistuje | Krok 3 + 4 |
| `relation "films" does not exist` | DB user nemá GRANT na schema, nebo connect na špatnou DB | Krok 3 |
| `permission denied for table films` | GRANT chybí | Krok 3 — `GRANT SELECT ON films …` |
