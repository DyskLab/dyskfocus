// Electron main process for the standalone DyskFocus macOS app.
//
// It boots the bundled Laravel app with a bundled *static* PHP binary
// (`php artisan serve`) on a random localhost port, runs migrations, then
// opens a native window pointing at that local server. All writable state
// (SQLite DB + storage) lives in the OS per-user data directory, so the app
// bundle itself stays read-only.

const { app, BrowserWindow, shell } = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')

const isPackaged = app.isPackaged

// Paths differ between `electron .` (dev) and a packaged .app.
const RES = isPackaged ? process.resourcesPath : path.join(__dirname, '..')
const APP_ROOT = isPackaged ? path.join(RES, 'laravel') : path.join(__dirname, '..')
const PHP_BIN = isPackaged ? path.join(RES, 'php', 'php') : (process.env.DYSKFOCUS_PHP || 'php')
const PHP_INI = isPackaged ? path.join(RES, 'php', 'php.ini') : path.join(__dirname, 'php.ini')

let phpProc = null
let win = null

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

/** A stable per-install APP_KEY, persisted so encrypted data stays readable. */
function appKey(userData) {
  const keyFile = path.join(userData, 'app.key')
  if (fs.existsSync(keyFile)) return fs.readFileSync(keyFile, 'utf8').trim()
  const key = 'base64:' + crypto.randomBytes(32).toString('base64')
  fs.writeFileSync(keyFile, key)
  return key
}

/**
 * The app was called Stackr, and its data folder follows the app name. Copy the
 * old data once rather than moving it, so the old folder stays as a backup. The
 * database goes last: its presence is what marks the copy as finished.
 */
function copyLegacyData(userData) {
  const legacy = path.join(app.getPath('appData'), 'Stackr')
  if (fs.existsSync(path.join(userData, 'database', 'database.sqlite'))) return
  if (!fs.existsSync(path.join(legacy, 'database', 'database.sqlite'))) return
  for (const item of ['app.key', 'storage', 'database']) {
    const from = path.join(legacy, item)
    if (fs.existsSync(from)) fs.cpSync(from, path.join(userData, item), { recursive: true })
  }
}

function buildEnv(userData, port) {
  const storagePath = path.join(userData, 'storage')
  const dbPath = path.join(userData, 'database', 'database.sqlite')

  // Writable skeleton (the bundle is read-only).
  ;['app', 'app/public', 'framework/cache/data', 'framework/sessions', 'framework/views', 'logs'].forEach((d) =>
    ensureDir(path.join(storagePath, d))
  )
  ensureDir(path.join(userData, 'database'))
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '')

  return {
    ...process.env,
    PHPRC: PHP_INI, // load the bundled php.ini in artisan + the built-in server workers
    APP_NAME: 'DyskFocus',
    APP_ENV: 'production',
    APP_DEBUG: 'false',
    APP_KEY: appKey(userData),
    APP_URL: `http://127.0.0.1:${port}`,
    DYSKFOCUS_DESKTOP: '1',
    DYSKFOCUS_STORAGE_PATH: storagePath,
    DB_CONNECTION: 'sqlite',
    DB_DATABASE: dbPath,
    SESSION_DRIVER: 'file',
    CACHE_STORE: 'file',
    QUEUE_CONNECTION: 'sync',
    BROADCAST_CONNECTION: 'log',
    MAIL_MAILER: 'log',
    LOG_CHANNEL: 'single',
    LOG_LEVEL: 'warning',
    SANCTUM_STATEFUL_DOMAINS: `127.0.0.1:${port},localhost:${port}`,
    // Let PHP's built-in server handle the SPA's parallel API calls.
    PHP_CLI_SERVER_WORKERS: '6',
  }
}

function waitForServer(port, timeoutMs = 20000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/up', timeout: 1000 }, (res) => {
        res.destroy()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error('PHP server did not start in time'))
        else setTimeout(tick, 250)
      })
      req.on('timeout', () => req.destroy())
    }
    tick()
  })
}

async function boot() {
  const userData = app.getPath('userData')
  copyLegacyData(userData)
  const port = await freePort()
  const env = buildEnv(userData, port)

  // Bring the schema up to date (idempotent; also handles app updates).
  spawnSync(PHP_BIN, ['artisan', 'migrate', '--force'], { cwd: APP_ROOT, env, stdio: 'inherit' })

  // Serve the app.
  phpProc = spawn(PHP_BIN, ['artisan', 'serve', '--host=127.0.0.1', `--port=${port}`, '--no-reload'], {
    cwd: APP_ROOT,
    env,
    stdio: 'inherit',
  })
  phpProc.on('exit', (code) => {
    if (code && code !== 0 && !app.isQuitting) {
      // Server died unexpectedly — quit so the user isn't left with a blank window.
      app.quit()
    }
  })

  await waitForServer(port)

  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: 'DyskFocus',
    backgroundColor: '#0f172a',
    webPreferences: { contextIsolation: true },
  })

  // External links open in the default browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.loadURL(`http://127.0.0.1:${port}`)
  win.on('closed', () => (win = null))
}

app.whenReady().then(() =>
  boot().catch((err) => {
    console.error('Failed to start DyskFocus:', err)
    app.quit()
  })
)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && win === null) boot()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  app.isQuitting = true
  if (phpProc) {
    try {
      phpProc.kill()
    } catch {
      /* already gone */
    }
  }
})
