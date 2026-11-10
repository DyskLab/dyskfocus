<?php

namespace App\Services;

use App\Models\Task;
use Illuminate\Support\Carbon;

class Recurrence
{
    /**
     * When a repeating task is completed, create its next occurrence with the
     * defer/due dates advanced by the rule. Tags, project, parent, note, flag
     * and the repeat rule itself are carried over.
     *
     * repeat_rule shape: {
     *   frequency: daily|weekly|monthly|yearly, interval: int,
     *   ends?: never|after|on, count?: int (remaining occurrences), until?: Y-m-d
     * }
     */
    public static function spawnNext(Task $task): ?Task
    {
        $rule = $task->repeat_rule;
        if (! is_array($rule) || empty($rule['frequency'])) {
            return null;
        }

        $ends = $rule['ends'] ?? 'never';

        // "After N occurrences" — count is how many remain, including this one.
        if ($ends === 'after' && (int) ($rule['count'] ?? 0) <= 1) {
            return null;
        }

        $interval = max(1, (int) ($rule['interval'] ?? 1));

        $advance = function ($date) use ($rule, $interval): ?string {
            if (! $date) {
                return null;
            }
            $d = $date instanceof Carbon ? $date->copy() : Carbon::parse($date);
            $next = match ($rule['frequency']) {
                'daily' => $d->addDays($interval),
                'weekly' => $d->addWeeks($interval),
                'monthly' => $d->addMonthsNoOverflow($interval),
                'yearly' => $d->addYearsNoOverflow($interval),
                default => null,
            };

            return $next?->toDateString();
        };

        $next = $task->replicate();
        $next->status = 'todo';
        $next->completed_at = null;
        $next->due_notified_at = null; // the new occurrence must be able to notify
        $next->defer_date = $advance($task->defer_date);
        $next->due_date = $advance($task->due_date);

        // "On date" — stop once the next occurrence would fall past the end date.
        if ($ends === 'on' && ! empty($rule['until'])) {
            $ref = $next->due_date ?? $next->defer_date;
            if ($ref && $ref > $rule['until']) {
                return null;
            }
        }

        // "After N" — carry a decremented remaining count to the next occurrence.
        if ($ends === 'after') {
            $rule['count'] = (int) $rule['count'] - 1;
            $next->repeat_rule = $rule;
        }

        $next->save();

        $next->tags()->sync($task->tags()->pluck('tags.id')->all());

        return $next;
    }
}
