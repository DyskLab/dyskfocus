<?php

namespace App\Http\Controllers;

use App\Models\Comment;
use App\Models\Folder;
use App\Models\Perspective;
use App\Models\Project;
use App\Models\Tag;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PortabilityController extends Controller
{
    /**
     * Export the authenticated user's entire dataset as JSON.
     */
    public function export(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'version' => 1,
            'exported_at' => now()->toIso8601String(),
            'folders' => $user->folders()->get(['id', 'name', 'position']),
            'tags' => $user->tags()->get(['id', 'name', 'color', 'parent_id', 'position']),
            'projects' => $user->projects()->get([
                'id', 'folder_id', 'title', 'note', 'type', 'status', 'archived_at', 'defer_date', 'due_date',
                'flagged', 'review_interval_days', 'last_reviewed_at', 'next_review_at', 'completed_at', 'position',
            ]),
            'tasks' => $user->tasks()->with('tags:id')->get()->map(fn (Task $t) => [
                'id' => $t->id,
                'project_id' => $t->project_id,
                'parent_id' => $t->parent_id,
                'title' => $t->title,
                'note' => $t->note,
                'status' => $t->status,
                'completed_at' => $t->completed_at,
                'defer_date' => $t->defer_date?->toDateString(),
                'due_date' => $t->due_date?->toDateString(),
                'flagged' => $t->flagged,
                'priority' => $t->priority,
                'color' => $t->color,
                'estimated_minutes' => $t->estimated_minutes,
                'repeat_rule' => $t->repeat_rule,
                'position' => $t->position,
                'tag_ids' => $t->tags->pluck('id'),
            ]),
            'perspectives' => $user->perspectives()->get(['id', 'name', 'icon', 'filter_rules', 'sort_rule', 'position']),
            'comments' => Comment::where('user_id', $user->id)->get(['id', 'task_id', 'body']),
        ]);
    }

    /**
     * Replace the user's dataset with an imported export (from export()).
     */
    public function import(Request $request)
    {
        $data = $request->validate([
            'folders' => 'array',
            'tags' => 'array',
            'projects' => 'array',
            'tasks' => 'array',
            'perspectives' => 'array',
            'comments' => 'array',
        ]);

        $user = $request->user();

        DB::transaction(function () use ($user, $data) {
            // Wipe existing data (cascades handle task_tag + comments on task delete).
            Comment::where('user_id', $user->id)->delete();
            // forceDelete: a soft delete would leave the old tasks (and their
            // tag links/comments) behind in the trash after every import.
            Task::withTrashed()->where('user_id', $user->id)->forceDelete();
            Project::where('user_id', $user->id)->delete();
            Folder::where('user_id', $user->id)->delete();
            Tag::where('user_id', $user->id)->delete();
            Perspective::where('user_id', $user->id)->delete();

            $folderMap = [];
            foreach ($data['folders'] ?? [] as $f) {
                $new = $user->folders()->create(['name' => $f['name'] ?? 'Folder', 'position' => $f['position'] ?? 0]);
                $folderMap[$f['id']] = $new->id;
            }

            $tagMap = [];
            foreach ($data['tags'] ?? [] as $t) {
                $new = $user->tags()->create(['name' => $t['name'] ?? 'Tag', 'color' => $t['color'] ?? null, 'position' => $t['position'] ?? 0]);
                $tagMap[$t['id']] = $new->id;
            }
            foreach ($data['tags'] ?? [] as $t) {
                if (! empty($t['parent_id']) && isset($tagMap[$t['parent_id']], $tagMap[$t['id']])) {
                    Tag::where('id', $tagMap[$t['id']])->update(['parent_id' => $tagMap[$t['parent_id']]]);
                }
            }

            $projectMap = [];
            foreach ($data['projects'] ?? [] as $p) {
                $new = $user->projects()->create([
                    'folder_id' => isset($p['folder_id']) ? ($folderMap[$p['folder_id']] ?? null) : null,
                    'title' => $p['title'] ?? 'Project',
                    'note' => $p['note'] ?? null,
                    'type' => $p['type'] ?? 'parallel',
                    'status' => $p['status'] ?? 'active',
                    'archived_at' => $p['archived_at'] ?? null,
                    'defer_date' => $p['defer_date'] ?? null,
                    'due_date' => $p['due_date'] ?? null,
                    'flagged' => $p['flagged'] ?? false,
                    'review_interval_days' => $p['review_interval_days'] ?? null,
                    'last_reviewed_at' => $p['last_reviewed_at'] ?? null,
                    'next_review_at' => $p['next_review_at'] ?? null,
                    'completed_at' => $p['completed_at'] ?? null,
                    'position' => $p['position'] ?? 0,
                ]);
                $projectMap[$p['id']] = $new->id;
            }

            $taskMap = [];
            foreach ($data['tasks'] ?? [] as $t) {
                $new = $user->tasks()->create([
                    'project_id' => isset($t['project_id']) ? ($projectMap[$t['project_id']] ?? null) : null,
                    'title' => $t['title'] ?? 'Task',
                    'note' => $t['note'] ?? null,
                    'status' => $t['status'] ?? 'todo',
                    'completed_at' => $t['completed_at'] ?? null,
                    'defer_date' => $t['defer_date'] ?? null,
                    'due_date' => $t['due_date'] ?? null,
                    'flagged' => $t['flagged'] ?? false,
                    'priority' => $t['priority'] ?? 'none',
                    'color' => $t['color'] ?? null,
                    'estimated_minutes' => $t['estimated_minutes'] ?? null,
                    'repeat_rule' => $t['repeat_rule'] ?? null,
                    'position' => $t['position'] ?? 0,
                ]);
                $taskMap[$t['id']] = $new->id;
            }
            foreach ($data['tasks'] ?? [] as $t) {
                $newId = $taskMap[$t['id']] ?? null;
                if (! $newId) {
                    continue;
                }
                if (! empty($t['parent_id']) && isset($taskMap[$t['parent_id']])) {
                    Task::where('id', $newId)->update(['parent_id' => $taskMap[$t['parent_id']]]);
                }
                if (! empty($t['tag_ids'])) {
                    $ids = collect($t['tag_ids'])->map(fn ($id) => $tagMap[$id] ?? null)->filter()->all();
                    if ($ids) {
                        Task::find($newId)->tags()->sync($ids);
                    }
                }
            }

            foreach ($data['comments'] ?? [] as $c) {
                if (! empty($c['task_id']) && isset($taskMap[$c['task_id']])) {
                    Comment::create([
                        'user_id' => $user->id,
                        'task_id' => $taskMap[$c['task_id']],
                        'body' => $c['body'] ?? '',
                    ]);
                }
            }

            foreach ($data['perspectives'] ?? [] as $ps) {
                $rules = $ps['filter_rules'] ?? [];
                if (is_array($rules)) {
                    if (! empty($rules['tag_ids'])) {
                        $rules['tag_ids'] = collect($rules['tag_ids'])->map(fn ($id) => $tagMap[$id] ?? null)->filter()->values()->all();
                    }
                    if (! empty($rules['project_id'])) {
                        $rules['project_id'] = $projectMap[$rules['project_id']] ?? null;
                    }
                }
                $user->perspectives()->create([
                    'name' => $ps['name'] ?? 'Perspective',
                    'icon' => $ps['icon'] ?? null,
                    'filter_rules' => $rules,
                    'sort_rule' => $ps['sort_rule'] ?? null,
                    'position' => $ps['position'] ?? 0,
                ]);
            }
        });

        \App\Observers\SyncObserver::bumpUser($user->id);

        return response()->noContent();
    }
}
