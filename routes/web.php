<?php

use App\Http\Controllers\SetupController;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;

// First-run setup — session-free so it works before the DB is migrated.
$setupWithout = [StartSession::class, ShareErrorsFromSession::class, PreventRequestForgery::class];
Route::get('/api/setup/status', [SetupController::class, 'status'])->withoutMiddleware($setupWithout);
Route::post('/api/setup/migrate', [SetupController::class, 'migrate'])->withoutMiddleware($setupWithout);

// PWA manifest with the correct MIME type (works on any web server).
Route::get('/manifest.webmanifest', function () {
    $manifest = [
        'name' => 'DyskFocus',
        'short_name' => 'DyskFocus',
        'description' => 'A focused, OmniFocus-style task manager.',
        'start_url' => '/',
        'scope' => '/',
        'display' => 'standalone',
        'background_color' => '#0f172a',
        'theme_color' => '#6366f1',
        'icons' => [
            ['src' => '/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
            ['src' => '/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
            ['src' => '/maskable-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
        ],
    ];

    return response(json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), 200, [
        'Content-Type' => 'application/manifest+json',
        'Cache-Control' => 'public, max-age=3600',
    ]);
});

// Serve the React SPA for every non-API route; React Router handles the rest.
// Session-free: the shell is static HTML, so it still loads before the DB is
// migrated (the API owns auth/session via its own middleware).
Route::view('/{any?}', 'app')
    ->where('any', '^(?!api|sanctum|storage|up).*$')
    ->withoutMiddleware($setupWithout);
