<?php

namespace App\Http\Controllers;

use App\Observers\SyncObserver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SyncController extends Controller
{
    /**
     * Server-Sent Events stream. Emits a `sync` event whenever the user's data
     * changes (see SyncObserver). The connection is capped so php-fpm workers
     * are released periodically; the browser's EventSource auto-reconnects.
     */
    public function stream(Request $request): StreamedResponse
    {
        $key = SyncObserver::versionKey($request->user()->id);

        // On reconnect the browser sends the last version it saw, so changes
        // made while the stream was down still produce an event.
        // (Header from EventSource's own reconnect; ?last= when the client
        // reopens the stream itself, e.g. after the tab was hidden.)
        $lastSeen = $request->header('Last-Event-ID') ?? $request->query('last');

        return response()->stream(function () use ($key, $lastSeen) {
            @set_time_limit(0);
            @ignore_user_abort(false);

            $last = is_numeric($lastSeen) ? (int) $lastSeen : (int) Cache::get($key, 0);
            $start = time();

            echo "retry: 3000\n";
            // Tell the client which version it is now in sync with.
            echo 'id: '.$last."\n";
            echo "event: hello\n";
            echo 'data: '.json_encode(['v' => $last])."\n\n";
            $this->flush();

            while (! connection_aborted() && (time() - $start) < 25) {
                $current = (int) Cache::get($key, 0);
                if ($current !== $last) {
                    $last = $current;
                    echo 'id: '.$current."\n";
                    echo 'event: sync'."\n";
                    echo 'data: '.json_encode(['v' => $current])."\n\n";
                } else {
                    echo ": ping\n\n"; // heartbeat comment keeps the connection warm
                }
                $this->flush();

                if (connection_aborted()) {
                    break;
                }
                usleep(1_500_000); // poll every 1.5s
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no', // disable nginx proxy buffering for SSE
        ]);
    }

    private function flush(): void
    {
        if (ob_get_level() > 0) {
            @ob_flush();
        }
        flush();
    }
}
