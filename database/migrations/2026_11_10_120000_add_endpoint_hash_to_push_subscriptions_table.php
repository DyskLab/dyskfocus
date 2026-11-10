<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Push endpoints are long URLs stored as TEXT, which MySQL can't index as
 * unique. Enforce one row per (user, endpoint) on a SHA-256 of the endpoint.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('push_subscriptions', function (Blueprint $table) {
            $table->char('endpoint_hash', 64)->nullable()->after('endpoint');
        });

        DB::table('push_subscriptions')->orderBy('id')->each(function ($row) {
            DB::table('push_subscriptions')->where('id', $row->id)
                ->update(['endpoint_hash' => hash('sha256', $row->endpoint)]);
        });

        Schema::table('push_subscriptions', function (Blueprint $table) {
            $table->unique(['user_id', 'endpoint_hash'], 'push_sub_user_endpoint_hash_unique');
        });

        // Installs created before this change carry the old TEXT unique index.
        if (Schema::hasIndex('push_subscriptions', 'push_sub_user_endpoint_unique')) {
            Schema::table('push_subscriptions', function (Blueprint $table) {
                $table->dropUnique('push_sub_user_endpoint_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::table('push_subscriptions', function (Blueprint $table) {
            $table->dropUnique('push_sub_user_endpoint_hash_unique');
            $table->dropColumn('endpoint_hash');
        });
    }
};
