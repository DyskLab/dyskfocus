<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Enable Sanctum SPA (cookie) authentication for the React frontend.
        $middleware->statefulApi();

        // API is stateless-facing: never redirect guests to a login route
        // (there is none — the SPA owns /login), just return 401 JSON.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();

// Desktop (Electron) build: relocate the writable storage dir out of the
// read-only app bundle into the OS per-user data directory.
if ($storagePath = getenv('DYSKFOCUS_STORAGE_PATH')) {
    $app->useStoragePath($storagePath);
}

return $app;
