<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('endpoint');
            $table->string('public_key');   // p256dh
            $table->string('auth_token');    // auth
            $table->string('content_encoding')->default('aes128gcm');
            $table->timestamps();
            // Uniqueness lives on endpoint_hash (see 2026_11_10_120000): MySQL
            // can't put a TEXT column in a unique index.
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
    }
};
