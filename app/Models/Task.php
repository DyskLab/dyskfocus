<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Task extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'project_id', 'parent_id', 'title', 'note', 'status',
        'completed_at', 'defer_date', 'due_date', 'due_notified_at', 'flagged', 'priority', 'color',
        'estimated_minutes', 'repeat_rule', 'position',
    ];

    protected $attributes = [
        'status' => 'todo',
        'flagged' => false,
        'priority' => 'none',
        'position' => 0,
    ];

    protected function casts(): array
    {
        return [
            'completed_at' => 'datetime',
            'defer_date' => 'date',
            'due_date' => 'date',
            'due_notified_at' => 'datetime',
            'flagged' => 'boolean',
            'estimated_minutes' => 'integer',
            'repeat_rule' => 'array',
            'position' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Task::class, 'parent_id')->orderBy('position');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'task_tag');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class)->latest();
    }

    /**
     * Case-insensitive literal search in title + note. LIKE wildcards in the
     * input are escaped with "!" (portable across SQLite, MySQL and Postgres).
     */
    public function scopeSearch(Builder $query, string $term): Builder
    {
        $pattern = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $term).'%';

        return $query->where(function (Builder $q) use ($pattern) {
            $q->whereRaw("title LIKE ? ESCAPE '!'", [$pattern])
                ->orWhereRaw("note LIKE ? ESCAPE '!'", [$pattern]);
        });
    }

    /**
     * "Available" = actionable now: not completed/dropped and defer date has arrived.
     * Pass $today (Y-m-d in the user's timezone) for timezone-correct comparisons.
     */
    public function scopeAvailable(Builder $query, ?string $today = null): Builder
    {
        $today ??= now()->toDateString();

        return $query->where('status', 'todo')
            ->where(function (Builder $q) use ($today) {
                $q->whereNull('defer_date')->orWhereDate('defer_date', '<=', $today);
            });
    }

    /**
     * Only tasks whose project is live: in the Inbox, or in a project that is
     * active and not archived. On-hold / done / dropped / archived projects
     * keep their tasks out of Today, Flagged, Forecast and the badge counts.
     */
    public function scopeInActiveProject(Builder $query): Builder
    {
        return $query->where(function (Builder $q) {
            $q->whereNull('tasks.project_id')
                ->orWhereHas('project', fn (Builder $p) => $p->where('status', 'active')->whereNull('archived_at'));
        });
    }

    /**
     * Not blocked by a sequential project: in a sequential project only the
     * first remaining top-level task (by position, then id) can be worked on.
     */
    public function scopeNotBlocked(Builder $query): Builder
    {
        return $query->whereNot(function (Builder $q) {
            $q->whereNull('tasks.parent_id')
                ->whereHas('project', fn (Builder $p) => $p->where('type', 'sequential'))
                ->whereExists(function ($prev) {
                    $prev->selectRaw('1')
                        ->from('tasks as prev')
                        ->whereColumn('prev.project_id', 'tasks.project_id')
                        ->whereNull('prev.parent_id')
                        ->whereNull('prev.deleted_at')
                        ->where('prev.status', 'todo')
                        ->where(function ($o) {
                            $o->whereColumn('prev.position', '<', 'tasks.position')
                                ->orWhere(function ($t) {
                                    $t->whereColumn('prev.position', 'tasks.position')
                                        ->whereColumn('prev.id', '<', 'tasks.id');
                                });
                        });
                });
        });
    }

    /** Truly actionable now: available, in a live project, and not blocked. */
    public function scopeActionable(Builder $query, ?string $today = null): Builder
    {
        return $query->available($today)->inActiveProject()->notBlocked();
    }
}
