# DyskFocus — Standalone macOS app (Electron + static PHP)

This builds DyskFocus into a double-clickable **`.app`/`.dmg`** that runs with no
DDEV, no separate server, and no PHP install on the target machine. The Electron
shell boots the bundled Laravel app with a **bundled static PHP binary** on a
random `127.0.0.1` port and shows it in a native window.

> Why not NativePHP? Its current release only supports Laravel ≤ 12; DyskFocus runs
> on Laravel 13, so we bundle our own shell. When NativePHP ships Laravel 13
> support, migrating to it is an option.

All files live in `desktop/`.

## What the desktop build changes

- **Realtime (SSE) is disabled** — the single desktop PHP process shouldn't hold
  a long-lived connection. Detected via `window.__DYSKFOCUS_DESKTOP__` (set by the
  blade when `DYSKFOCUS_DESKTOP=1`).
- **Web push is hidden** — not applicable in Electron (use in-app *Reminders*
  instead; native notifications can be added later via IPC).
- **Writable state** (SQLite DB + `storage/`) is relocated to the OS per-user
  data dir (`~/Library/Application Support/DyskFocus`) so the bundle stays read-only. On first launch, data from an earlier Stackr install is copied there.
- **Auth** works over `http://127.0.0.1:<port>` (Sanctum stateful domains + APP_URL
  are set at runtime by `desktop/main.js`).

On first launch you get the normal **first-run setup wizard** (create account /
import backup). Migrations run automatically on every launch.

## Prerequisites (on your Mac)

- macOS with **Xcode Command Line Tools** (`xcode-select --install`)
- **Node 20+** and **Composer 2**
- A **static PHP CLI binary** with the right extensions (built once, reused)

### 1. Get a static PHP binary

**Easiest — download a prebuilt binary** (this is what the shipped build uses):

```bash
# Apple Silicon (arm64). Pick the newest 8.4 "common" build listed at the URL.
mkdir -p desktop/bin
curl -L "https://dl.static-php.dev/static-php-cli/common/php-8.4.23-cli-macos-aarch64.tar.gz" -o /tmp/sphp.tar.gz
tar xzf /tmp/sphp.tar.gz -C desktop/bin
chmod +x desktop/bin/php
desktop/bin/php -m   # confirm pdo_sqlite, sqlite3, mbstring, openssl, bcmath, curl, gmp…
```

(For Intel, use `...-macos-x86_64.tar.gz` and build with `--x64`.)

**Or build it yourself** with [static-php-cli](https://github.com/crazywhalecc/static-php-cli):

```bash
# install the tool (one-time)
composer global require crazywhalecc/static-php-cli

# build a static php (cli) for this Mac's arch with the extensions DyskFocus needs
spc build \
  "pdo,pdo_sqlite,sqlite3,mbstring,openssl,tokenizer,bcmath,curl,fileinfo,\
dom,xml,xmlwriter,simplexml,filter,session,ctype,phar,sockets,posix,pcntl,gd,zip" \
  --build-cli

# copy the resulting binary into the desktop bundle
mkdir -p desktop/bin
cp buildroot/bin/php desktop/bin/php
chmod +x desktop/bin/php
```

Verify it: `desktop/bin/php -v` and `desktop/bin/php -m` (should list `pdo_sqlite`,
`openssl`, `mbstring`, `bcmath`, `curl`, …).

> Apple Silicon vs Intel: build the binary on (or for) each arch you want to ship,
> and run the matching `npm run dist:arm64` / `dist:x64`.

### 2. (Optional) App icon

Put an `icon.icns` at `desktop/build/icon.icns` (1024×1024 source recommended).
Without it, Electron's default icon is used.

## Build the app

```bash
cd desktop
npm install
npm run dist          # prepares the Laravel app + runs electron-builder (mac)
# or: npm run dist:arm64  /  npm run dist:x64
```

`npm run prepare-app` (run automatically by `dist`) stages a production copy of
the Laravel app into `desktop/app-dist` (`composer install --no-dev`, fresh SPA
build, bundled `.env`, cleared caches). The output installers land in
`desktop/dist/` (`DyskFocus-1.0.0.dmg`, `DyskFocus-1.0.0-mac.zip`).

## Try it without building an installer

For a quick dev run using your **system PHP** and the live project (no static
binary, no packaging):

```bash
cd desktop
npm install
DYSKFOCUS_PHP="$(which php)" npm run start
```

This launches the Electron window against the project root, migrating and serving
with your local PHP. Good for iterating on `main.js`.

## Code signing & notarization (for distribution)

An unsigned `.app` runs locally but macOS Gatekeeper warns other users. To
distribute:

1. Join the Apple Developer Program; create a **Developer ID Application** cert.
2. Sign + notarize via electron-builder, e.g. in `package.json` `build.mac`:
   ```json
   "identity": "Developer ID Application: Your Name (TEAMID)",
   "notarize": { "teamId": "TEAMID" }
   ```
   with `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` in your env.
3. `npm run dist` will sign and notarize the output.

For personal use you can skip this and right-click → Open the first time, or run
`xattr -dr com.apple.quarantine /Applications/DyskFocus.app`.

## Where user data lives

```
~/Library/Application Support/DyskFocus/
├── app.key                 # per-install APP_KEY (stable, do not delete)
├── database/database.sqlite # your data
└── storage/                 # sessions, cache, compiled views, logs
```

Deleting that folder resets the app to a clean first-run.

## Notes / limitations

- PHP's built-in server is single-process; `PHP_CLI_SERVER_WORKERS=6` (set by
  `main.js`) lets it handle the SPA's parallel API calls. For heavier needs,
  swap to FrankenPHP later.
- Auto-update isn't wired up. electron-builder supports it (`electron-updater`)
  if you host the artifacts.
