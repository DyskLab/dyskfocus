<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * First-run setup. These endpoints are deliberately session-free (registered in
 * routes/web.php without the session/CSRF middleware) so they work even before
 * migrations have created the sessions table.
 */
class SetupController extends Controller
{
    /** Current install state: is the DB migrated, and does an account exist yet? */
    public function status()
    {
        return response()->json($this->state());
    }

    /** Run database migrations. Allowed only until the first account is created. */
    public function migrate()
    {
        try {
            if (Schema::hasTable('users') && DB::table('users')->exists()) {
                return response()->json(['message' => 'Setup already completed.'], 403);
            }
        } catch (\Throwable) {
            // No users table yet — safe to proceed.
        }

        $this->ensureSqliteFileExists();

        Artisan::call('migrate', ['--force' => true]);

        return response()->json(array_merge(
            ['output' => trim(Artisan::output())],
            $this->state()
        ));
    }

    /** @return array{migrated: bool, has_users: bool, needs_setup: bool, registration_open: bool} */
    private function state(): array
    {
        $migrated = false;
        $hasUsers = false;

        try {
            $migrated = Schema::hasTable('migrations') && Schema::hasTable('users');
            if ($migrated) {
                $hasUsers = DB::table('users')->exists();
            }
        } catch (\Throwable) {
            $migrated = false;
        }

        return [
            'migrated' => $migrated,
            'has_users' => $hasUsers,
            'needs_setup' => ! $hasUsers, // setup runs until the first account exists
            'registration_open' => ! $hasUsers || (bool) config('app.allow_registration'),
        ];
    }

    /** SQLite won't migrate into a file that doesn't exist yet; create it. */
    private function ensureSqliteFileExists(): void
    {
        $default = config('database.default');
        if ($default !== 'sqlite') {
            return;
        }

        $path = config("database.connections.{$default}.database");
        if (is_string($path) && $path !== ':memory:' && ! file_exists($path)) {
            @touch($path);
        }
    }
}
