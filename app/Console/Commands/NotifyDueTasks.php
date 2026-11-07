<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\WebPushSender;
use Illuminate\Console\Command;

class NotifyDueTasks extends Command
{
    protected $signature = 'tasks:notify-due';

    protected $description = 'Send a web-push notification for tasks that have become due.';

    public function handle(WebPushSender $sender): int
    {
        if (! $sender->isConfigured()) {
            $this->warn('VAPID keys not configured; skipping.');

            return self::SUCCESS;
        }

        $totalSent = 0;

        User::whereHas('pushSubscriptions')->each(function (User $user) use ($sender, &$totalSent) {
            $due = $user->tasks()
                ->where('status', 'todo')
                ->whereNull('due_notified_at')
                ->whereNotNull('due_date')
                ->whereDate('due_date', '<=', $user->todayDate())
                ->orderBy('due_date')
                ->get();

            if ($due->isEmpty()) {
                return;
            }

            $count = $due->count();
            $first = $due->first();
            $payload = [
                'title' => $count === 1 ? 'Task due' : "{$count} tasks due",
                'body' => $count === 1 ? $first->title : $first->title.' and '.($count - 1).' more',
                'url' => '/today',
                'tag' => 'dyskfocus-due',
            ];

            if ($sender->sendToUser($user, $payload) > 0) {
                // Mark them so they aren't notified again on the next run.
                $user->tasks()->whereIn('id', $due->pluck('id'))->update(['due_notified_at' => now()]);
                $totalSent++;
            }
        });

        $this->info("Notified {$totalSent} user(s) about due tasks.");

        return self::SUCCESS;
    }
}
