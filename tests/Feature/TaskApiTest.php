<?php

namespace Tests\Feature;

use App\Models\Folder;
use App\Models\Project;
use App\Models\PushSubscription;
use App\Models\Tag;
use App\Models\Task;
use App\Models\User;
use App\Services\WebPushSender;
use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use App\Observers\SyncObserver;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class TaskApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_register_and_receive_a_session(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Ada',
            'email' => 'ada@example.com',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ]);

        $response->assertCreated()->assertJsonPath('data.email', 'ada@example.com');
        $this->assertAuthenticated();
    }

    public function test_login_fails_with_bad_credentials(): void
    {
        User::factory()->create(['email' => 'bob@example.com']);

        $this->postJson('/api/login', ['email' => 'bob@example.com', 'password' => 'wrong'])
            ->assertStatus(422);
    }

    public function test_guests_cannot_list_tasks(): void
    {
        $this->getJson('/api/tasks')->assertUnauthorized();
    }

    public function test_a_user_can_create_and_complete_a_task(): void
    {
        $user = User::factory()->create();

        $created = $this->actingAs($user)
            ->postJson('/api/tasks', ['title' => 'Write tests', 'flagged' => true])
            ->assertCreated()
            ->assertJsonPath('data.status', 'todo')
            ->assertJsonPath('data.flagged', true)
            ->json('data.id');

        $this->actingAs($user)
            ->postJson("/api/tasks/{$created}/complete", ['completed' => true])
            ->assertOk()
            ->assertJsonPath('data.status', 'done');

        $this->assertNotNull(Task::find($created)->completed_at);
    }

    public function test_a_user_cannot_access_another_users_task(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $task = Task::factory()->for($owner)->create();

        $this->actingAs($intruder)->getJson("/api/tasks/{$task->id}")->assertForbidden();
        $this->actingAs($intruder)->deleteJson("/api/tasks/{$task->id}")->assertForbidden();
    }

    public function test_tasks_can_be_tagged_and_filtered(): void
    {
        $user = User::factory()->create();
        $tag = Tag::factory()->for($user)->create();

        $id = $this->actingAs($user)
            ->postJson('/api/tasks', ['title' => 'Tagged', 'tag_ids' => [$tag->id]])
            ->assertCreated()
            ->json('data.id');

        $this->assertDatabaseHas('task_tag', ['task_id' => $id, 'tag_id' => $tag->id]);

        $this->actingAs($user)
            ->getJson("/api/tasks?tag_id={$tag->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_inbox_view_only_returns_tasks_without_a_project(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create();
        Task::factory()->for($user)->create(['project_id' => $project->id, 'title' => 'In project']);
        Task::factory()->for($user)->create(['project_id' => null, 'title' => 'In inbox']);

        $this->actingAs($user)
            ->getJson('/api/views/inbox')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'In inbox');
    }

    public function test_project_review_schedules_next_review(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create(['review_interval_days' => 7]);

        $this->actingAs($user)
            ->postJson("/api/projects/{$project->id}/review")
            ->assertOk();

        $project->refresh();
        $this->assertNotNull($project->last_reviewed_at);
        $this->assertNotNull($project->next_review_at);
    }

    public function test_completing_a_repeating_task_spawns_the_next_occurrence(): void
    {
        $user = User::factory()->create();
        $tag = Tag::factory()->for($user)->create();
        $task = Task::factory()->for($user)->create([
            'defer_date' => '2025-12-30',
            'due_date' => '2026-01-01',
            'repeat_rule' => ['frequency' => 'weekly', 'interval' => 1],
        ]);
        $task->tags()->attach($tag->id);

        $this->actingAs($user)
            ->postJson("/api/tasks/{$task->id}/complete", ['completed' => true])
            ->assertOk();

        // Original stays completed as history.
        $this->assertSame('done', $task->fresh()->status);

        // Next occurrence created with dates advanced by one week.
        $next = Task::where('status', 'todo')->where('id', '!=', $task->id)->first();
        $this->assertNotNull($next);
        $this->assertSame('2026-01-06', $next->defer_date->toDateString());
        $this->assertSame('2026-01-08', $next->due_date->toDateString());
        $this->assertTrue($next->tags->contains($tag));
    }

    public function test_tasks_can_be_filtered_by_minimum_priority(): void
    {
        $user = User::factory()->create();
        Task::factory()->for($user)->create(['priority' => 'low', 'title' => 'Low one']);
        Task::factory()->for($user)->create(['priority' => 'high', 'title' => 'High one']);
        Task::factory()->for($user)->create(['priority' => 'none', 'title' => 'None one']);

        $this->actingAs($user)
            ->getJson('/api/tasks?min_priority=medium')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'High one');
    }

    public function test_tasks_can_be_sorted_by_priority(): void
    {
        $user = User::factory()->create();
        Task::factory()->for($user)->create(['priority' => 'low', 'title' => 'L', 'position' => 0]);
        Task::factory()->for($user)->create(['priority' => 'high', 'title' => 'H', 'position' => 1]);
        Task::factory()->for($user)->create(['priority' => 'medium', 'title' => 'M', 'position' => 2]);

        $titles = $this->actingAs($user)
            ->getJson('/api/tasks?sort=priority')
            ->assertOk()
            ->json('data.*.title');

        $this->assertSame(['H', 'M', 'L'], $titles);
    }

    public function test_subtasks_are_nested_and_not_duplicated_in_inbox(): void
    {
        $user = User::factory()->create();
        $parent = Task::factory()->for($user)->create(['project_id' => null, 'parent_id' => null, 'title' => 'Parent']);

        $this->actingAs($user)
            ->postJson('/api/tasks', ['title' => 'Child', 'parent_id' => $parent->id])
            ->assertCreated();

        // Inbox lists only the top-level parent, not the nested child.
        $this->actingAs($user)
            ->getJson('/api/views/inbox')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Parent');

        // The parent's detail carries the child.
        $this->actingAs($user)
            ->getJson("/api/tasks/{$parent->id}")
            ->assertOk()
            ->assertJsonPath('data.children.0.title', 'Child');
    }

    public function test_user_can_export_and_import_their_data_with_remapped_relations(): void
    {
        $user = User::factory()->create();
        $folder = Folder::factory()->for($user)->create(['name' => 'F']);
        $project = Project::factory()->for($user)->create(['title' => 'P', 'folder_id' => $folder->id]);
        $tag = Tag::factory()->for($user)->create(['name' => 'T']);
        $root = Task::factory()->for($user)->create(['title' => 'Root', 'project_id' => $project->id]);
        $root->tags()->attach($tag->id);
        Task::factory()->for($user)->create(['title' => 'Child', 'project_id' => $project->id, 'parent_id' => $root->id]);

        $export = $this->actingAs($user)->getJson('/api/export')->assertOk()->json();
        $this->assertCount(2, $export['tasks']);

        // Restore into a different user (replace semantics) and check relations remap.
        $other = User::factory()->create();
        $this->actingAs($other)->postJson('/api/import', $export)->assertNoContent();

        $this->assertDatabaseHas('projects', ['user_id' => $other->id, 'title' => 'P']);
        $newRoot = Task::where('user_id', $other->id)->where('title', 'Root')->first();
        $newChild = Task::where('user_id', $other->id)->where('title', 'Child')->first();

        $this->assertNotNull($newRoot);
        $this->assertSame($newRoot->id, $newChild->parent_id);
        $this->assertTrue($newRoot->tags->pluck('name')->contains('T'));
        $this->assertSame($newRoot->project->folder->name, 'F');
    }

    public function test_sidebar_counts_reflect_due_state(): void
    {
        $user = User::factory()->create();
        Task::factory()->for($user)->create(['due_date' => now()->subDays(2)->toDateString()]); // overdue
        Task::factory()->for($user)->create(['due_date' => now()->toDateString()]);              // due today
        Task::factory()->for($user)->flagged()->create();                                        // flagged, no due
        Task::factory()->for($user)->create(['due_date' => now()->addDays(5)->toDateString()]);  // future

        $counts = $this->actingAs($user)->getJson('/api/views/counts')->assertOk()->json('data');

        $this->assertSame(1, $counts['overdue']);
        $this->assertSame(3, $counts['today']);   // overdue + due-today + flagged
        $this->assertSame(1, $counts['flagged']);
        $this->assertSame(4, $counts['inbox']);
    }

    public function test_tasks_can_be_filtered_by_due_date_range(): void
    {
        $user = User::factory()->create();
        Task::factory()->for($user)->create(['due_date' => '2026-03-10', 'title' => 'In']);
        Task::factory()->for($user)->create(['due_date' => '2026-04-10', 'title' => 'Out']);

        $this->actingAs($user)
            ->getJson('/api/tasks?due_after=2026-03-01&due_before=2026-03-31')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'In');
    }

    public function test_counts_use_the_users_timezone(): void
    {
        // 2026-06-15 23:30 UTC is already 2026-06-16 in UTC+14 (Kiritimati).
        $this->travelTo(Carbon::parse('2026-06-15 23:30:00', 'UTC'));

        $user = User::factory()->create(['settings' => ['timezone' => 'Pacific/Kiritimati']]);
        Task::factory()->for($user)->create(['due_date' => '2026-06-15']); // yesterday locally → overdue
        Task::factory()->for($user)->create(['due_date' => '2026-06-16']); // today locally

        $counts = $this->actingAs($user)->getJson('/api/views/counts')->assertOk()->json('data');

        $this->assertSame(1, $counts['overdue']); // 0 if we (wrongly) used UTC
        $this->assertSame(2, $counts['today']);

        $this->travelBack();
    }

    public function test_completed_view_lists_done_tasks_most_recent_first(): void
    {
        $user = User::factory()->create();
        Task::factory()->for($user)->create(['title' => 'Still open']);
        Task::factory()->for($user)->done()->create(['title' => 'Old', 'completed_at' => now()->subDay()]);
        Task::factory()->for($user)->done()->create(['title' => 'New', 'completed_at' => now()]);

        $titles = $this->actingAs($user)
            ->getJson('/api/views/completed')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->json('data.*.title');

        $this->assertSame(['New', 'Old'], $titles);
    }

    public function test_a_task_can_have_a_color(): void
    {
        $user = User::factory()->create();

        $id = $this->actingAs($user)
            ->postJson('/api/tasks', ['title' => 'Coloured', 'color' => 'violet'])
            ->assertCreated()
            ->json('data.id');
        $this->assertSame('violet', Task::find($id)->color);

        $this->actingAs($user)
            ->postJson('/api/tasks', ['title' => 'Bad', 'color' => 'chartreuse'])
            ->assertStatus(422);
    }

    public function test_a_tag_can_have_a_color(): void
    {
        $user = User::factory()->create();
        $tag = Tag::factory()->for($user)->create();

        $this->actingAs($user)
            ->putJson("/api/tags/{$tag->id}", ['color' => 'sky'])
            ->assertOk()
            ->assertJsonPath('data.color', 'sky');

        $this->actingAs($user)
            ->putJson("/api/tags/{$tag->id}", ['color' => 'not-a-color'])
            ->assertStatus(422);
    }

    public function test_deleting_a_task_soft_deletes_and_can_be_restored(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create(['project_id' => null, 'parent_id' => null]);

        $this->actingAs($user)->deleteJson("/api/tasks/{$task->id}")->assertNoContent();
        $this->assertSoftDeleted('tasks', ['id' => $task->id]);
        $this->actingAs($user)->getJson('/api/views/inbox')->assertOk()->assertJsonCount(0, 'data');

        $this->actingAs($user)->postJson("/api/tasks/{$task->id}/restore")->assertOk();
        $this->actingAs($user)->getJson('/api/views/inbox')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_by_project_view_groups_tasks(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create(['title' => 'P']);
        Task::factory()->for($user)->create(['project_id' => $project->id, 'title' => 'In P']);
        Task::factory()->for($user)->create(['project_id' => null, 'parent_id' => null, 'title' => 'In inbox']);

        $data = $this->actingAs($user)->getJson('/api/views/by-project')->assertOk()->json();

        $this->assertSame('In inbox', $data['inbox'][0]['title']);
        $this->assertSame('P', $data['projects'][0]['title']);
        $this->assertSame('In P', $data['projects'][0]['tasks'][0]['title']);
    }

    public function test_bulk_actions_apply_to_many_tasks(): void
    {
        $user = User::factory()->create();
        $a = Task::factory()->for($user)->create();
        $b = Task::factory()->for($user)->create();

        $this->actingAs($user)->postJson('/api/tasks/bulk', ['ids' => [$a->id, $b->id], 'action' => 'complete'])->assertNoContent();
        $this->assertSame('done', $a->fresh()->status);
        $this->assertSame('done', $b->fresh()->status);

        $this->actingAs($user)->postJson('/api/tasks/bulk', ['ids' => [$a->id], 'action' => 'priority', 'value' => 'high'])->assertNoContent();
        $this->assertSame('high', $a->fresh()->priority);

        $this->actingAs($user)->postJson('/api/tasks/bulk', ['ids' => [$a->id, $b->id], 'action' => 'delete'])->assertNoContent();
        $this->assertSoftDeleted('tasks', ['id' => $a->id]);

        $this->actingAs($user)->postJson('/api/tasks/bulk', ['ids' => [$a->id, $b->id], 'action' => 'restore'])->assertNoContent();
        $this->assertNull($a->fresh()->deleted_at);
    }

    public function test_project_can_be_saved_as_template_and_applied(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create(['title' => 'Onboarding', 'type' => 'sequential']);
        $step = Task::factory()->for($user)->create(['project_id' => $project->id, 'title' => 'Step 1']);
        Task::factory()->for($user)->create(['project_id' => $project->id, 'parent_id' => $step->id, 'title' => 'Sub A']);

        $tplId = $this->actingAs($user)
            ->postJson('/api/templates', ['name' => 'Onboarding tpl', 'project_id' => $project->id])
            ->assertCreated()->json('data.id');

        $newId = $this->actingAs($user)
            ->postJson("/api/templates/{$tplId}/apply", ['title' => 'New Onboarding'])
            ->assertCreated()->json('data.id');

        $this->assertDatabaseHas('projects', ['id' => $newId, 'title' => 'New Onboarding', 'type' => 'sequential']);
        $newStep = Task::where('project_id', $newId)->where('title', 'Step 1')->first();
        $this->assertNotNull($newStep);
        $this->assertDatabaseHas('tasks', ['project_id' => $newId, 'parent_id' => $newStep->id, 'title' => 'Sub A']);
    }

    public function test_user_can_change_password(): void
    {
        $user = User::factory()->create(['password' => Hash::make('oldpass123')]);

        $this->actingAs($user)
            ->putJson('/api/password', ['current_password' => 'oldpass123', 'password' => 'newpass123', 'password_confirmation' => 'newpass123'])
            ->assertNoContent();
        $this->assertTrue(Hash::check('newpass123', $user->fresh()->password));

        $this->actingAs($user)
            ->putJson('/api/password', ['current_password' => 'wrong', 'password' => 'another123', 'password_confirmation' => 'another123'])
            ->assertStatus(422);
    }

    public function test_password_can_be_reset_with_an_emailed_token(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'reset@example.com']);

        $this->postJson('/api/forgot-password', ['email' => 'reset@example.com'])->assertOk();

        Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notification) use ($user) {
            $this->postJson('/api/reset-password', [
                'token' => $notification->token,
                'email' => $user->email,
                'password' => 'brandnew123',
                'password_confirmation' => 'brandnew123',
            ])->assertOk();

            return true;
        });

        $this->assertTrue(Hash::check('brandnew123', $user->fresh()->password));
    }

    public function test_completing_a_non_repeating_task_does_not_duplicate(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create();

        $this->actingAs($user)
            ->postJson("/api/tasks/{$task->id}/complete", ['completed' => true])
            ->assertOk();

        $this->assertSame(1, Task::count());
    }

    public function test_push_subscription_can_be_stored_updated_and_removed(): void
    {
        $user = User::factory()->create();
        $endpoint = 'https://push.example.com/abc123';

        $this->actingAs($user)->postJson('/api/push/subscribe', [
            'endpoint' => $endpoint,
            'keys' => ['p256dh' => 'PUBLICKEY', 'auth' => 'AUTHTOKEN'],
            'contentEncoding' => 'aes128gcm',
        ])->assertCreated();

        $this->assertDatabaseHas('push_subscriptions', [
            'user_id' => $user->id,
            'endpoint' => $endpoint,
            'public_key' => 'PUBLICKEY',
        ]);

        // Re-subscribing the same endpoint updates in place (no duplicate).
        $this->actingAs($user)->postJson('/api/push/subscribe', [
            'endpoint' => $endpoint,
            'keys' => ['p256dh' => 'NEWKEY', 'auth' => 'NEWAUTH'],
        ])->assertCreated();

        $this->assertSame(1, PushSubscription::count());
        $this->assertSame('NEWKEY', PushSubscription::first()->public_key);

        $this->actingAs($user)->postJson('/api/push/unsubscribe', ['endpoint' => $endpoint])
            ->assertNoContent();

        $this->assertSame(0, PushSubscription::count());
    }

    public function test_push_key_endpoint_returns_vapid_public_key(): void
    {
        config(['webpush.vapid.public_key' => 'TEST_PUBLIC_KEY']);

        $this->actingAs(User::factory()->create())
            ->getJson('/api/push/key')
            ->assertOk()
            ->assertJsonPath('key', 'TEST_PUBLIC_KEY');
    }

    public function test_notify_due_command_pushes_and_marks_only_due_tasks(): void
    {
        $user = User::factory()->create();
        $user->pushSubscriptions()->create([
            'endpoint' => 'https://push.example.com/x',
            'public_key' => 'K',
            'auth_token' => 'A',
        ]);

        $due = Task::factory()->for($user)->create(['due_date' => today()->subDay(), 'status' => 'todo']);
        $future = Task::factory()->for($user)->create(['due_date' => today()->addWeek(), 'status' => 'todo']);

        $mock = $this->mock(WebPushSender::class);
        $mock->shouldReceive('isConfigured')->andReturnTrue();
        $mock->shouldReceive('sendToUser')->once()->andReturn(1);

        $this->artisan('tasks:notify-due')->assertSuccessful();

        $this->assertNotNull($due->fresh()->due_notified_at);
        $this->assertNull($future->fresh()->due_notified_at);

        // A second run must not notify again: sendToUser is expected exactly once total.
        $this->artisan('tasks:notify-due')->assertSuccessful();
    }

    public function test_setup_status_reflects_whether_an_account_exists(): void
    {
        $this->getJson('/api/setup/status')
            ->assertOk()
            ->assertJson(['migrated' => true, 'has_users' => false, 'needs_setup' => true]);

        User::factory()->create();

        $this->getJson('/api/setup/status')
            ->assertOk()
            ->assertJson(['has_users' => true, 'needs_setup' => false]);
    }

    public function test_setup_migrate_is_blocked_once_an_account_exists(): void
    {
        User::factory()->create();

        $this->postJson('/api/setup/migrate')->assertForbidden();
    }

    public function test_projects_can_be_reordered(): void
    {
        $user = User::factory()->create();
        $a = Project::factory()->for($user)->create(['position' => 0]);
        $b = Project::factory()->for($user)->create(['position' => 1]);
        $c = Project::factory()->for($user)->create(['position' => 2]);

        $this->actingAs($user)
            ->postJson('/api/projects/reorder', ['ids' => [$c->id, $a->id, $b->id]])
            ->assertNoContent();

        $this->assertSame(0, $c->fresh()->position);
        $this->assertSame(1, $a->fresh()->position);
        $this->assertSame(2, $b->fresh()->position);
    }

    public function test_folders_can_be_reordered(): void
    {
        $user = User::factory()->create();
        $a = $user->folders()->create(['name' => 'A', 'position' => 0]);
        $b = $user->folders()->create(['name' => 'B', 'position' => 1]);

        $this->actingAs($user)
            ->postJson('/api/folders/reorder', ['ids' => [$b->id, $a->id]])
            ->assertNoContent();

        $this->assertSame(0, $b->fresh()->position);
        $this->assertSame(1, $a->fresh()->position);
    }

    public function test_cannot_reorder_another_users_project(): void
    {
        $user = User::factory()->create();
        $other = Project::factory()->for(User::factory()->create())->create();

        $this->actingAs($user)
            ->postJson('/api/projects/reorder', ['ids' => [$other->id]])
            ->assertStatus(422);
    }

    public function test_project_archive_hides_it_from_the_default_list(): void
    {
        $user = User::factory()->create();
        $a = Project::factory()->for($user)->create();
        $b = Project::factory()->for($user)->create();

        $this->actingAs($user)->postJson("/api/projects/{$b->id}/archive")
            ->assertOk()->assertJsonPath('data.archived', true);

        $active = collect($this->actingAs($user)->getJson('/api/projects')->json('data'))->pluck('id');
        $this->assertTrue($active->contains($a->id));
        $this->assertFalse($active->contains($b->id), 'archived project should be hidden by default');

        $onlyArchived = collect($this->actingAs($user)->getJson('/api/projects?archived=only')->json('data'))->pluck('id');
        $this->assertTrue($onlyArchived->contains($b->id));
        $this->assertFalse($onlyArchived->contains($a->id));

        $this->actingAs($user)->postJson("/api/projects/{$b->id}/unarchive")
            ->assertOk()->assertJsonPath('data.archived', false);
        $this->assertNull($b->fresh()->archived_at);
    }

    public function test_perspective_filters_by_multiple_projects(): void
    {
        $user = User::factory()->create();
        $p1 = Project::factory()->for($user)->create();
        $p2 = Project::factory()->for($user)->create();
        $p3 = Project::factory()->for($user)->create();
        $t1 = Task::factory()->for($user)->create(['project_id' => $p1->id, 'status' => 'todo']);
        $t2 = Task::factory()->for($user)->create(['project_id' => $p2->id, 'status' => 'todo']);
        $t3 = Task::factory()->for($user)->create(['project_id' => $p3->id, 'status' => 'todo']);

        $persp = $user->perspectives()->create([
            'name' => 'Two projects',
            'filter_rules' => ['availability' => 'remaining', 'project_ids' => [$p1->id, $p2->id]],
        ]);

        $ids = collect($this->actingAs($user)->getJson("/api/perspectives/{$persp->id}/tasks")->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($t1->id));
        $this->assertTrue($ids->contains($t2->id));
        $this->assertFalse($ids->contains($t3->id), 'tasks outside the selected projects are excluded');
    }

    public function test_repeating_task_with_after_count_stops(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create([
            'due_date' => today(),
            'repeat_rule' => ['frequency' => 'daily', 'interval' => 1, 'ends' => 'after', 'count' => 2],
        ]);

        $this->actingAs($user)->postJson("/api/tasks/{$task->id}/complete", ['completed' => true])->assertOk();
        $this->assertSame(2, Task::count()); // original + one more occurrence
        $next = Task::where('status', 'todo')->first();
        $this->assertSame(1, $next->repeat_rule['count']);

        // The last occurrence (count 1) does not spawn another.
        $this->actingAs($user)->postJson("/api/tasks/{$next->id}/complete", ['completed' => true])->assertOk();
        $this->assertSame(2, Task::count());
    }

    public function test_repeating_task_stops_after_end_date(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create([
            'due_date' => today(),
            'repeat_rule' => ['frequency' => 'daily', 'interval' => 1, 'ends' => 'on', 'until' => today()->toDateString()],
        ]);

        // Next occurrence would be tomorrow, past the until date → no spawn.
        $this->actingAs($user)->postJson("/api/tasks/{$task->id}/complete", ['completed' => true])->assertOk();
        $this->assertSame(1, Task::count());
    }

    public function test_realtime_stream_requires_authentication(): void
    {
        $this->getJson('/api/stream')->assertUnauthorized();
    }

    public function test_data_changes_bump_the_users_sync_version(): void
    {
        $user = User::factory()->create();
        $key = SyncObserver::versionKey($user->id);
        $before = (int) Cache::get($key, 0);

        $task = Task::factory()->for($user)->create();
        $afterCreate = (int) Cache::get($key, 0);
        $this->assertGreaterThan($before, $afterCreate);

        $task->update(['title' => 'changed']);
        $afterUpdate = (int) Cache::get($key, 0);
        $this->assertGreaterThan($afterCreate, $afterUpdate);

        $task->delete();
        $this->assertGreaterThan($afterUpdate, (int) Cache::get($key, 0));
    }

    public function test_bulk_and_reorder_cannot_point_at_another_users_records(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $mine = Task::factory()->for($user)->create();
        $theirProject = Project::factory()->for($other)->create();
        $theirTag = Tag::factory()->for($other)->create();
        $theirTask = Task::factory()->for($other)->create();

        $this->actingAs($user)->postJson('/api/tasks/bulk', ['ids' => [$mine->id], 'action' => 'project', 'value' => $theirProject->id])->assertUnprocessable();
        $this->actingAs($user)->postJson('/api/tasks/bulk', ['ids' => [$mine->id], 'action' => 'tag', 'value' => $theirTag->id])->assertUnprocessable();
        $this->actingAs($user)->postJson('/api/tasks/reorder', ['items' => [['id' => $mine->id, 'position' => 0, 'project_id' => $theirProject->id]]])->assertUnprocessable();
        $this->actingAs($user)->postJson('/api/tasks/reorder', ['items' => [['id' => $mine->id, 'position' => 0, 'parent_id' => $theirTask->id]]])->assertUnprocessable();

        $mine->refresh();
        $this->assertNull($mine->project_id);
        $this->assertNull($mine->parent_id);
        $this->assertCount(0, $mine->tags);
    }

    public function test_a_task_cannot_be_nested_under_its_own_subtask(): void
    {
        $user = User::factory()->create();
        $parent = Task::factory()->for($user)->create();
        $child = Task::factory()->for($user)->create(['parent_id' => $parent->id]);

        $this->actingAs($user)->putJson("/api/tasks/{$parent->id}", ['parent_id' => $child->id])->assertStatus(422);
        $this->actingAs($user)->putJson("/api/tasks/{$parent->id}", ['parent_id' => $parent->id])->assertStatus(422);
        $this->assertNull($parent->fresh()->parent_id);
    }

    public function test_completing_a_repeating_task_twice_spawns_only_one_occurrence(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create([
            'due_date' => '2026-01-01',
            'repeat_rule' => ['frequency' => 'daily', 'interval' => 1],
        ]);

        $this->actingAs($user)->postJson("/api/tasks/{$task->id}/complete", ['completed' => true])->assertOk();
        $this->actingAs($user)->postJson("/api/tasks/{$task->id}/complete", ['completed' => true])->assertOk();

        $this->assertSame(2, $user->tasks()->count());
    }

    public function test_bulk_complete_spawns_next_occurrence_and_bumps_sync(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create([
            'due_date' => '2026-01-01',
            'due_notified_at' => now(),
            'repeat_rule' => ['frequency' => 'weekly', 'interval' => 1],
        ]);
        $key = SyncObserver::versionKey($user->id);
        $before = (int) Cache::get($key, 0);

        $this->actingAs($user)->postJson('/api/tasks/bulk', ['ids' => [$task->id], 'action' => 'complete'])->assertNoContent();

        $next = $user->tasks()->where('status', 'todo')->first();
        $this->assertNotNull($next);
        $this->assertSame('2026-01-08', $next->due_date->toDateString());
        $this->assertNull($next->due_notified_at, 'next occurrence must be able to notify again');
        $this->assertGreaterThan($before, (int) Cache::get($key, 0));
    }

    public function test_rescheduling_a_task_resets_its_due_notification(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create(['due_date' => '2026-01-01', 'due_notified_at' => now()]);

        $this->actingAs($user)->putJson("/api/tasks/{$task->id}", ['due_date' => '2026-02-01'])->assertOk();

        $this->assertNull($task->fresh()->due_notified_at);
    }

    public function test_search_treats_wildcards_literally(): void
    {
        $user = User::factory()->create();
        Task::factory()->for($user)->create(['title' => '100% done', 'note' => null]);
        Task::factory()->for($user)->create(['title' => '1000 things', 'note' => null]);

        $this->actingAs($user)->getJson('/api/tasks?search='.urlencode('100%'))
            ->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_registration_is_closed_once_an_account_exists(): void
    {
        User::factory()->create();

        $this->postJson('/api/register', [
            'name' => 'Intruder', 'email' => 'x@example.com',
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertForbidden();

        config(['app.allow_registration' => true]);
        $this->postJson('/api/register', [
            'name' => 'Friend', 'email' => 'y@example.com',
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertCreated();
    }

    public function test_import_hard_deletes_previous_tasks(): void
    {
        $user = User::factory()->create();
        Task::factory()->for($user)->count(3)->create();

        $this->actingAs($user)->postJson('/api/import', ['tasks' => [['id' => 1, 'title' => 'Fresh', 'color' => 'red']]])->assertNoContent();

        $this->assertSame(1, Task::withTrashed()->where('user_id', $user->id)->count());
        $this->assertSame('red', $user->tasks()->first()->color);
    }

    public function test_tasks_in_inactive_projects_stay_out_of_today_flagged_and_counts(): void
    {
        $user = User::factory()->create();
        $active = Project::factory()->for($user)->create(['status' => 'active']);
        $onHold = Project::factory()->for($user)->create(['status' => 'on_hold']);
        $archived = Project::factory()->for($user)->create(['status' => 'active', 'archived_at' => now()]);
        $today = today()->toDateString();

        $keep = Task::factory()->for($user)->create(['project_id' => $active->id, 'due_date' => $today, 'flagged' => true]);
        Task::factory()->for($user)->create(['project_id' => $onHold->id, 'due_date' => $today, 'flagged' => true]);
        Task::factory()->for($user)->create(['project_id' => $archived->id, 'due_date' => $today, 'flagged' => true]);

        $this->actingAs($user)->getJson('/api/views/today')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $keep->id);
        $this->actingAs($user)->getJson('/api/views/flagged')->assertJsonCount(1, 'data');
        $this->actingAs($user)->getJson('/api/views/forecast')->assertJsonCount(1, 'data.'.$today);
        $counts = $this->actingAs($user)->getJson('/api/views/counts')->json('data');
        $this->assertSame(1, $counts['today']);
        $this->assertSame(1, $counts['flagged']);
    }

    public function test_sequential_project_only_makes_the_first_task_available(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user)->create(['type' => 'sequential', 'status' => 'active']);
        $first = Task::factory()->for($user)->create(['project_id' => $project->id, 'position' => 0, 'flagged' => true, 'due_date' => null, 'defer_date' => null]);
        $second = Task::factory()->for($user)->create(['project_id' => $project->id, 'position' => 1, 'flagged' => true, 'due_date' => null, 'defer_date' => null]);

        $ids = fn () => collect($this->actingAs($user)->getJson('/api/tasks?availability=available')->json('data'))->pluck('id')->all();
        $this->assertSame([$first->id], $ids());

        // Flagged-only items in Today need to be actionable too.
        $this->actingAs($user)->getJson('/api/views/today')->assertJsonCount(1, 'data');

        // Completing the first unblocks the next one.
        $this->actingAs($user)->postJson("/api/tasks/{$first->id}/complete", ['completed' => true])->assertOk();
        $this->assertSame([$second->id], $ids());
    }

    public function test_push_subscription_is_keyed_by_endpoint_hash(): void
    {
        $user = User::factory()->create();
        $endpoint = 'https://push.example.com/'.str_repeat('a', 600);
        $payload = ['endpoint' => $endpoint, 'keys' => ['p256dh' => 'k1', 'auth' => 'a1']];

        $this->actingAs($user)->postJson('/api/push/subscribe', $payload)->assertCreated();
        $payload['keys']['p256dh'] = 'k2';
        $this->actingAs($user)->postJson('/api/push/subscribe', $payload)->assertCreated();

        $this->assertSame(1, $user->pushSubscriptions()->count());
        $sub = $user->pushSubscriptions()->first();
        $this->assertSame('k2', $sub->public_key);
        $this->assertSame(hash('sha256', $endpoint), $sub->endpoint_hash);

        $this->actingAs($user)->postJson('/api/push/unsubscribe', ['endpoint' => $endpoint])->assertSuccessful();
        $this->assertSame(0, $user->pushSubscriptions()->count());
    }
}
