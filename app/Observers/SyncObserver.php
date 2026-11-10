<?php

namespace App\Observers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Bumps a per-user "sync version" whenever any of the user's data changes,
 * so connected SSE streams can tell clients to refetch. Attached to every
 * user-owned model in AppServiceProvider.
 */
class SyncObserver
{
    public static function versionKey(int $userId): string
    {
        return "sync:user:{$userId}";
    }

    public function saved(Model $model): void
    {
        $this->bump($model);
    }

    public function deleted(Model $model): void
    {
        $this->bump($model);
    }

    public function restored(Model $model): void
    {
        $this->bump($model);
    }

    protected function bump(Model $model): void
    {
        $userId = $model->getAttribute('user_id');
        if (! $userId) {
            return;
        }

        self::bumpUser((int) $userId);
    }

    /**
     * Bump a user's sync version directly. Query-builder writes (bulk update,
     * reorder, import) skip model events, so callers use this afterwards.
     */
    public static function bumpUser(int $userId): void
    {
        $key = self::versionKey($userId);
        // get+put keeps this store-agnostic; the value only needs to change.
        Cache::put($key, ((int) Cache::get($key, 0)) + 1, now()->addDay());
    }
}
