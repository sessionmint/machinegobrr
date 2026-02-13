import { NextRequest } from 'next/server';
import {
  getStateSnapshot,
  refreshStateSnapshot,
  subscribeStateSnapshot,
} from '@/lib/server/state-store';
import { AppStateSnapshot } from '@/lib/state';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function encodeStateEvent(snapshot: AppStateSnapshot): string {
  return `event: state\ndata: ${JSON.stringify(snapshot)}\n\n`;
}

export async function GET(request: NextRequest) {
  await refreshStateSnapshot('api_state_stream_open', true);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const sendSnapshot = (snapshot: AppStateSnapshot) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeStateEvent(snapshot)));
      };

      sendSnapshot(getStateSnapshot());

      const unsubscribe = subscribeStateSnapshot((snapshot) => {
        sendSnapshot(snapshot);
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 25000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // noop
        }
      };

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
