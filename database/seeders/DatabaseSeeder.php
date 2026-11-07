<?php

namespace Database\Seeders;

use App\Models\Comment;
use App\Models\Folder;
use App\Models\Perspective;
use App\Models\Project;
use App\Models\Tag;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::updateOrCreate(
            ['email' => 'demo@dyskfocus.test'],
            [
                'name' => 'Demo User',
                'password' => Hash::make('password'),
                'settings' => ['theme' => 'dark'],
            ]
        );

        // Tags (contexts)
        $tags = collect(['Home', 'Work', 'Errands', 'Waiting', 'Focus'])
            ->mapWithKeys(fn ($name, $i) => [
                $name => Tag::create(['user_id' => $user->id, 'name' => $name, 'position' => $i]),
            ]);

        // Folders
        $work = Folder::create(['user_id' => $user->id, 'name' => 'Work', 'position' => 0]);
        $personal = Folder::create(['user_id' => $user->id, 'name' => 'Personal', 'position' => 1]);

        // Project 1 — with markdown note, review cycle, subtasks
        $launch = Project::create([
            'user_id' => $user->id,
            'folder_id' => $work->id,
            'title' => 'Launch DyskFocus v1',
            'note' => "# Launch checklist\n\n- Ship the **REST API**\n- Polish the _dark mode_\n- Write [docs](https://example.com)\n\n> Target: end of month.",
            'type' => 'sequential',
            'status' => 'active',
            'flagged' => true,
            'due_date' => now()->addDays(10)->toDateString(),
            'review_interval_days' => 7,
            'next_review_at' => now()->subDay(),
            'position' => 0,
        ]);

        $design = Task::create([
            'user_id' => $user->id, 'project_id' => $launch->id,
            'title' => 'Design the task inspector', 'status' => 'todo',
            'note' => "Support:\n\n- [x] Markdown notes\n- [ ] Tag chips\n- [ ] Date pickers",
            'due_date' => now()->addDays(2)->toDateString(), 'flagged' => true, 'priority' => 'medium', 'color' => 'violet', 'position' => 0,
        ]);
        $design->tags()->attach([$tags['Work']->id, $tags['Focus']->id]);

        Task::create([
            'user_id' => $user->id, 'project_id' => $launch->id, 'parent_id' => $design->id,
            'title' => 'Sketch layout in Figma', 'status' => 'done', 'completed_at' => now(), 'position' => 0,
        ]);
        Task::create([
            'user_id' => $user->id, 'project_id' => $launch->id, 'parent_id' => $design->id,
            'title' => 'Build inspector component', 'status' => 'todo', 'position' => 1,
        ]);

        $api = Task::create([
            'user_id' => $user->id, 'project_id' => $launch->id,
            'title' => 'Finish REST API endpoints', 'status' => 'todo',
            'defer_date' => now()->toDateString(), 'priority' => 'high', 'position' => 1,
        ]);
        $api->tags()->attach($tags['Work']->id);
        Comment::create(['user_id' => $user->id, 'task_id' => $api->id, 'body' => "Remember to add `reorder` **and** `complete` actions."]);

        // Project 2 — parallel personal project
        $trip = Project::create([
            'user_id' => $user->id, 'folder_id' => $personal->id,
            'title' => 'Plan weekend trip', 'type' => 'parallel', 'status' => 'active',
            'note' => 'Somewhere with **mountains**.', 'position' => 1,
        ]);
        $book = Task::create([
            'user_id' => $user->id, 'project_id' => $trip->id, 'title' => 'Book accommodation',
            'status' => 'todo', 'due_date' => now()->addDay()->toDateString(), 'flagged' => true, 'priority' => 'low', 'color' => 'green', 'position' => 0,
        ]);
        $book->tags()->attach($tags['Errands']->id);
        Task::create([
            'user_id' => $user->id, 'project_id' => $trip->id, 'title' => 'Pack bags',
            'status' => 'todo', 'defer_date' => now()->addDays(5)->toDateString(), 'position' => 1,
        ]);

        // Inbox tasks (no project)
        $inbox = Task::create([
            'user_id' => $user->id, 'title' => 'Reply to Sam about invoice',
            'status' => 'todo', 'due_date' => now()->toDateString(), 'position' => 0,
        ]);
        $inbox->tags()->attach($tags['Waiting']->id);
        Task::create([
            'user_id' => $user->id, 'title' => 'Buy groceries',
            'note' => "- Milk\n- Coffee\n- Bread", 'status' => 'todo', 'position' => 1,
        ]);
        Task::create([
            'user_id' => $user->id, 'title' => 'Water the plants',
            'status' => 'todo', 'due_date' => now()->toDateString(), 'position' => 2,
            'repeat_rule' => ['frequency' => 'daily', 'interval' => 2],
        ]);

        // Perspectives (saved filters)
        Perspective::create([
            'user_id' => $user->id, 'name' => 'Flagged & Due', 'icon' => 'flag',
            'filter_rules' => ['availability' => 'available', 'flagged' => true],
            'sort_rule' => 'due_date', 'position' => 0,
        ]);
        Perspective::create([
            'user_id' => $user->id, 'name' => 'Work — this week', 'icon' => 'briefcase',
            'filter_rules' => ['availability' => 'available', 'tag_ids' => [$tags['Work']->id], 'due_within_days' => 7],
            'position' => 1,
        ]);

        $this->command?->info('Seeded demo user: demo@dyskfocus.test / password');
    }
}
