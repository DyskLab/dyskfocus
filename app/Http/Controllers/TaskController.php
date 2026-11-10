<?php

namespace App\Http\Controllers;

use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Observers\SyncObserver;
use App\Services\Priority;
use App\Services\Recurrence;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        $query = $request->user()->tasks()
            ->with('tags')
            ->withCount('children');

        if ($request->filled('project_id')) {
            $query->where('project_id', $request->project_id);
        }
        if ($request->boolean('inbox')) {
            $query->whereNull('project_id');
        }
        if ($request->filled('parent_id')) {
            $query->where('parent_id', $request->parent_id);
        } elseif ($request->boolean('top_level')) {
            $query->whereNull('parent_id');
        }
        if ($request->filled('tag_id')) {
            $query->whereHas('tags', fn ($q) => $q->where('tags.id', $request->tag_id));
        }
        if ($request->has('flagged')) {
            $query->where('flagged', $request->boolean('flagged'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('availability')) {
            match ($request->availability) {
                'available' => $query->actionable($request->user()->todayDate()),
                'remaining' => $query->where('status', 'todo'),
                'completed' => $query->where('status', 'done'),
                default => null,
            };
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->priority);
        }
        if ($request->filled('min_priority')) {
            $query->whereIn('priority', Priority::atLeast($request->min_priority));
        }
        if ($request->filled('due_before')) {
            $query->whereDate('due_date', '<=', $request->due_before);
        }
        if ($request->filled('due_after')) {
            $query->whereDate('due_date', '>=', $request->due_after);
        }
        if ($request->filled('search')) {
            $query->search((string) $request->search);
        }

        match ($request->query('sort', 'manual')) {
            'priority' => $query
                ->orderByRaw("CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC")
                ->orderBy('position'),
            'due' => $query->orderByRaw('due_date is null')->orderBy('due_date')->orderBy('position'),
            default => $query->orderBy('position')->orderBy('created_at'),
        };

        return TaskResource::collection($query->get());
    }

    public function store(Request $request)
    {
        $data = $this->validateData($request);

        $task = $request->user()->tasks()->create(Arr::except($data, ['tag_ids']));

        if (array_key_exists('tag_ids', $data)) {
            $task->tags()->sync($data['tag_ids']);
        }

        return new TaskResource($task->load('tags')->loadCount('children'));
    }

    public function show(Request $request, Task $task)
    {
        $this->authorizeOwner($task, $request);

        return new TaskResource(
            $task->load(['tags', 'children.tags', 'comments', 'project'])->loadCount('children')
        );
    }

    public function update(Request $request, Task $task)
    {
        $this->authorizeOwner($task, $request);

        $data = $this->validateData($request, false);

        if (array_key_exists('parent_id', $data) && $data['parent_id'] !== null
            && $this->wouldCreateCycle($task->id, (int) $data['parent_id'])) {
            abort(422, 'A task cannot be nested under itself or one of its subtasks.');
        }

        $task->fill(Arr::except($data, ['tag_ids']));
        // A rescheduled task should be able to notify again for its new due date.
        if ($task->isDirty('due_date')) {
            $task->due_notified_at = null;
        }
        $task->save();

        if (array_key_exists('tag_ids', $data)) {
            $task->tags()->sync($data['tag_ids']);
        }

        return new TaskResource($task->fresh(['tags'])->loadCount('children'));
    }

    public function destroy(Request $request, Task $task)
    {
        $this->authorizeOwner($task, $request);
        $task->delete(); // soft delete

        return response()->noContent();
    }

    /** Apply a bulk action to many tasks at once. */
    public function bulk(Request $request)
    {
        $userId = $request->user()->id;

        $data = $request->validate([
            'ids' => 'required|array',
            'ids.*' => 'integer',
            'action' => 'required|in:complete,uncomplete,delete,restore,priority,color,project,tag,flag',
            'value' => 'nullable',
        ]);

        // The value refers to another record for these actions — it must be the user's own.
        if ($data['action'] === 'project') {
            $request->validate(['value' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('user_id', $userId)]]);
        } elseif ($data['action'] === 'tag') {
            $request->validate(['value' => ['required', 'integer', Rule::exists('tags', 'id')->where('user_id', $userId)]]);
        }
        $base = fn () => Task::query()->where('user_id', $userId)->whereIn('id', $data['ids']);
        $value = $data['value'] ?? null;

        switch ($data['action']) {
            case 'complete':
                // Go through the model so repeating tasks spawn their next occurrence.
                foreach ($base()->where('status', '!=', 'done')->get() as $task) {
                    $task->update(['status' => 'done', 'completed_at' => now()]);
                    if ($task->repeat_rule) {
                        Recurrence::spawnNext($task);
                    }
                }
                break;
            case 'uncomplete':
                $base()->update(['status' => 'todo', 'completed_at' => null]);
                break;
            case 'delete':
                $base()->delete(); // soft delete
                break;
            case 'restore':
                Task::withTrashed()->where('user_id', $userId)->whereIn('id', $data['ids'])->restore();
                break;
            case 'priority':
                $base()->update(['priority' => in_array($value, ['none', 'low', 'medium', 'high'], true) ? $value : 'none']);
                break;
            case 'color':
                $colors = ['red', 'orange', 'amber', 'green', 'teal', 'sky', 'blue', 'violet', 'pink'];
                $base()->update(['color' => in_array($value, $colors, true) ? $value : null]);
                break;
            case 'flag':
                $base()->update(['flagged' => (bool) $value]);
                break;
            case 'project':
                $base()->update(['project_id' => $value ?: null, 'parent_id' => null]);
                break;
            case 'tag':
                if ($value) {
                    foreach ($base()->get() as $task) {
                        $task->tags()->syncWithoutDetaching([(int) $value]);
                    }
                }
                break;
        }

        // Query-builder writes skip model observers — notify other tabs/devices.
        SyncObserver::bumpUser($userId);

        return response()->noContent();
    }

    /** Undo a soft-deleted task. */
    public function restore(Request $request, int $id)
    {
        $task = Task::withTrashed()->where('user_id', $request->user()->id)->findOrFail($id);
        $task->restore();

        return new TaskResource($task->load('tags')->loadCount('children'));
    }

    /**
     * Toggle completion of a task.
     */
    public function complete(Request $request, Task $task)
    {
        $this->authorizeOwner($task, $request);

        $completed = $request->boolean('completed', true);
        $wasDone = $task->status === 'done';

        $task->update([
            'status' => $completed ? 'done' : 'todo',
            'completed_at' => $completed ? now() : null,
        ]);

        // Repeating task → schedule the next occurrence.
        // Only on a real todo → done transition, so a double click or a
        // re-tick of an already-done task doesn't spawn duplicates.
        if ($completed && ! $wasDone && $task->repeat_rule) {
            Recurrence::spawnNext($task);
        }

        return new TaskResource($task->fresh(['tags'])->loadCount('children'));
    }

    /**
     * Bulk reorder / re-parent tasks (drag & drop).
     */
    public function reorder(Request $request)
    {
        $userId = $request->user()->id;

        $data = $request->validate([
            'items' => 'required|array',
            'items.*.id' => ['required', 'integer', Rule::exists('tasks', 'id')->where('user_id', $userId)],
            'items.*.position' => 'required|integer',
            'items.*.project_id' => ['sometimes', 'nullable', 'integer', Rule::exists('projects', 'id')->where('user_id', $userId)],
            'items.*.parent_id' => ['sometimes', 'nullable', 'integer', Rule::exists('tasks', 'id')->where('user_id', $userId)],
        ]);

        foreach ($data['items'] as $item) {
            if (! empty($item['parent_id']) && $this->wouldCreateCycle((int) $item['id'], (int) $item['parent_id'])) {
                abort(422, 'A task cannot be nested under itself or one of its subtasks.');
            }
        }

        foreach ($data['items'] as $item) {
            $update = ['position' => $item['position']];
            if (array_key_exists('project_id', $item)) {
                $update['project_id'] = $item['project_id'];
            }
            if (array_key_exists('parent_id', $item)) {
                $update['parent_id'] = $item['parent_id'];
            }

            Task::where('id', $item['id'])
                ->where('user_id', $userId)
                ->update($update);
        }

        SyncObserver::bumpUser($userId);

        return response()->noContent();
    }

    /** True when making $parentId the parent of $taskId would form a loop. */
    private function wouldCreateCycle(int $taskId, int $parentId): bool
    {
        $seen = [];
        $current = $parentId;
        while ($current !== null && ! isset($seen[$current])) {
            if ($current === $taskId) {
                return true;
            }
            $seen[$current] = true;
            $current = Task::withTrashed()->whereKey($current)->value('parent_id');
            $current = $current === null ? null : (int) $current;
        }

        return false;
    }

    private function validateData(Request $request, bool $creating = true): array
    {
        $userId = $request->user()->id;

        return $request->validate([
            'title' => ($creating ? 'required' : 'sometimes').'|string|max:255',
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('user_id', $userId)],
            'parent_id' => ['nullable', 'integer', Rule::exists('tasks', 'id')->where('user_id', $userId)],
            'note' => 'nullable|string',
            'status' => 'in:todo,done,dropped',
            'defer_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'flagged' => 'boolean',
            'priority' => 'in:none,low,medium,high',
            'color' => 'nullable|in:red,orange,amber,green,teal,sky,blue,violet,pink',
            'estimated_minutes' => 'nullable|integer|min:0',
            'repeat_rule' => 'nullable|array',
            'position' => 'integer',
            'tag_ids' => 'array',
            'tag_ids.*' => ['integer', Rule::exists('tags', 'id')->where('user_id', $userId)],
        ]);
    }
}
