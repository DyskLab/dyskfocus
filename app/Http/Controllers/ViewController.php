<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProjectResource;
use App\Http\Resources\TaskResource;
use Illuminate\Http\Request;

class ViewController extends Controller
{
    /** Tasks with no project. */
    public function inbox(Request $request)
    {
        $tasks = $request->user()->tasks()
            ->whereNull('project_id')
            ->whereNull('parent_id')
            ->where('status', 'todo')
            ->with(['tags', 'children.tags'])->withCount('children')
            ->orderBy('position')->orderBy('created_at')
            ->get();

        return TaskResource::collection($tasks);
    }

    /** Available tasks that are due today/overdue or flagged. */
    public function today(Request $request)
    {
        $today = $request->user()->todayDate();

        // Due/overdue items always show (even if a sequential project would
        // block them); flagged-only items need to be actionable.
        $tasks = $request->user()->tasks()
            ->available($today)
            ->inActiveProject()
            ->where(function ($q) use ($today) {
                $q->whereDate('due_date', '<=', $today)
                    ->orWhere(fn ($f) => $f->where('flagged', true)->notBlocked());
            })
            ->with('tags')->withCount('children')
            ->orderByRaw('due_date is null')
            ->orderBy('due_date')
            ->get();

        return TaskResource::collection($tasks);
    }

    /** Tasks grouped by their due date for the coming N days (+ overdue bucket). */
    public function forecast(Request $request)
    {
        $days = (int) $request->query('days', 7);
        $today = $request->user()->todayDate();
        $limit = now($request->user()->timezone())->addDays($days)->toDateString();

        $tasks = $request->user()->tasks()
            ->where('status', 'todo')
            ->inActiveProject()
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<=', $limit)
            ->with('tags')->withCount('children')
            ->orderBy('due_date')
            ->get();

        $groups = $tasks->groupBy(function ($task) use ($today) {
            if ($task->due_date->toDateString() < $today) {
                return 'overdue';
            }

            return $task->due_date->toDateString();
        })->map(fn ($items) => TaskResource::collection($items));

        return response()->json(['data' => $groups]);
    }

    /** All flagged, still-open tasks. */
    public function flagged(Request $request)
    {
        $tasks = $request->user()->tasks()
            ->where('flagged', true)
            ->where('status', 'todo')
            ->inActiveProject()
            ->with('tags')->withCount('children')
            ->orderBy('position')
            ->get();

        return TaskResource::collection($tasks);
    }

    /** Recently completed tasks (most recent first). */
    public function completed(Request $request)
    {
        $tasks = $request->user()->tasks()
            ->where('status', 'done')
            ->with('tags')->withCount('children')
            ->orderByDesc('completed_at')
            ->limit(200)
            ->get();

        return TaskResource::collection($tasks);
    }

    /** All active projects with their open tasks, plus loose Inbox tasks. */
    public function byProject(Request $request)
    {
        $user = $request->user();

        $todayDate = $user->todayDate();
        $projects = $user->projects()
            ->where('status', 'active')
            ->withCount(['tasks as remaining_count' => fn ($q) => $q->available($todayDate)])
            ->with([
                'tasks' => fn ($q) => $q->whereNull('parent_id')->where('status', 'todo')->orderBy('position'),
                'tasks.tags',
                'tasks.children.tags',
            ])
            ->orderBy('position')->orderBy('title')
            ->get();

        $inbox = $user->tasks()
            ->whereNull('project_id')->whereNull('parent_id')->where('status', 'todo')
            ->with(['tags', 'children.tags'])
            ->orderBy('position')
            ->get();

        return response()->json([
            'inbox' => TaskResource::collection($inbox)->resolve(),
            'projects' => ProjectResource::collection($projects)->resolve(),
        ]);
    }

    /** Badge counts for the sidebar. */
    public function counts(Request $request)
    {
        $user = $request->user();

        $todayDate = $user->todayDate();

        // Counts mirror what the lists actually show — deferred (future start
        // date) tasks are excluded by default via the available() scope.
        $today = $user->tasks()->available($todayDate)->inActiveProject()
            ->where(fn ($q) => $q->whereDate('due_date', '<=', $todayDate)
                ->orWhere(fn ($f) => $f->where('flagged', true)->notBlocked()))
            ->count();

        $overdue = $user->tasks()->available($todayDate)->inActiveProject()
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', $todayDate)
            ->count();

        $flagged = $user->tasks()->available($todayDate)->inActiveProject()->where('flagged', true)->count();

        $inbox = $user->tasks()->available($todayDate)
            ->whereNull('project_id')->whereNull('parent_id')->count();

        $review = $user->projects()->where('status', 'active')
            ->whereNotNull('review_interval_days')
            ->where(fn ($q) => $q->whereNull('next_review_at')->orWhere('next_review_at', '<=', now()))
            ->count();

        return response()->json(['data' => compact('inbox', 'today', 'overdue', 'flagged', 'review')]);
    }

    /** Projects whose next review date has arrived (or never reviewed). */
    public function review(Request $request)
    {
        $projects = $request->user()->projects()
            ->where('status', 'active')
            ->whereNotNull('review_interval_days')
            ->where(function ($q) {
                $q->whereNull('next_review_at')
                    ->orWhere('next_review_at', '<=', now());
            })
            ->withCount(['tasks', 'tasks as remaining_count' => fn ($q) => $q->where('status', 'todo')])
            ->orderBy('next_review_at')
            ->get();

        return ProjectResource::collection($projects);
    }
}
