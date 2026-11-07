# DyskFocus — Setup

DyskFocus is a single Laravel app that serves a React SPA with a same-origin REST API
(Sanctum cookie auth, SQLite). This guide covers a fresh install.

## Requirements

- PHP 8.4 (ext: `openssl`, `mbstring`, `bcmath`, `curl`)
- Composer 2
- Node 20+ / npm
- SQLite
- (Optional) [DDEV](https://ddev.com) — the app runs at `https://omniflow.ddev.site`

## 1. Install dependencies & build

```bash
composer install
npm install
npm run build          # builds the SPA into public/build
```

With DDEV:

```bash
ddev start
ddev composer install
npm install && npm run build   # build assets on the host; DDEV serves public/build
```

## 2. Environment

```bash
cp .env.example .env        # if you don't have a .env yet
php artisan key:generate
```

Key settings (already set for DDEV):

- `DB_CONNECTION=sqlite` — the database file is `database/database.sqlite`
- `SESSION_DRIVER=database`, `CACHE_STORE=database`
- `APP_URL=https://omniflow.ddev.site`

Optional features:

- **Push notifications** — generate VAPID keys and add them to `.env`:
  ```bash
  php artisan tinker --execute="print_r(Minishlink\WebPush\VAPID::createVapidKeys());"
  ```
  ```env
  VAPID_PUBLIC_KEY=...
  VAPID_PRIVATE_KEY=...
  VAPID_SUBJECT=mailto:you@example.com
  ```
- **Due reminders (push)** need the scheduler running (a cron entry):
  ```
  * * * * * cd /path/to/app && php artisan schedule:run >> /dev/null 2>&1
  ```
  The scheduler fires `tasks:notify-due` every 15 minutes.

## 3. First-run setup (in the browser)

You do **not** need to seed the database. Open the app — with no database yet, a
**first-run wizard** appears automatically and walks you through:

1. **Database** — click **Run migrations** (creates all tables). If the browser
   can't run it, run `php artisan migrate --force` (or `ddev artisan migrate --force`)
   and click **re-check**.
2. **Account** — create the first (owner) account.
3. **Import** — optionally restore a DyskFocus JSON backup, or **Skip** to start empty.

When it finishes you land in the app, logged in. The wizard never shows again once
an account exists.

> The setup endpoints (`GET /api/setup/status`, `POST /api/setup/migrate`) are
> session-free so they work before the database exists. `migrate` is refused once
> any account exists.

### CLI alternative

If you prefer the terminal instead of the wizard:

```bash
php artisan migrate --force
# then open the app and register the first account,
# or import a backup from Settings → Data → Import backup
```

## Resetting to a clean database

To wipe everything and get the fresh first-run experience again:

```bash
php artisan db:wipe          # drops all tables → wizard starts from step 1
# or, to keep the schema but remove all data:
php artisan migrate:fresh    # empty, migrated database → wizard starts at "Account"
```

## Backups (Export / Import)

- **Export**: Settings → Data → *Export backup (.json)* — downloads everything
  (projects, tasks, tags, perspectives, comments).
- **Import**: the setup wizard (step 3) or Settings → Data → *Import backup*.
  Importing **replaces** all current data with the backup.

## Running the tests

```bash
php artisan test        # or: ddev artisan test
```
