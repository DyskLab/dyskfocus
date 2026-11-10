<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PushSubscription extends Model
{
    protected $fillable = [
        'user_id', 'endpoint', 'endpoint_hash', 'public_key', 'auth_token', 'content_encoding',
    ];

    /** SHA-256 of an endpoint URL — the indexed lookup key (endpoints are TEXT). */
    public static function hashEndpoint(string $endpoint): string
    {
        return hash('sha256', $endpoint);
    }

    protected static function booted(): void
    {
        static::saving(function (PushSubscription $sub) {
            $sub->endpoint_hash = self::hashEndpoint((string) $sub->endpoint);
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
