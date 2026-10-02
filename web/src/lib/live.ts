import { api, wsUrl } from './api';
import { USE_MOCKS } from './env';
import { chainEventSchema, type ChainEvent } from './schemas';

/**
 * One subscription API over two transports:
 *   - `USE_MOCKS`: polling of `/api-mock/api/ws` with a cursor.
 *   - otherwise: the SPEC `WebSocket /ws` feed, with reconnect.
 *
 * Consumers (turnout page, later the vote page) only see `ChainEvent`s.
 */

export type Unsubscribe = () => void;

export const DEFAULT_POLL_INTERVAL_MS = 4000;
const DEFAULT_RECONNECT_MS = 2000;

export interface SubscribeOptions {
  /** Restrict the feed to one election; omit for every election. */
  electionId?: string;
  onEvent: (event: ChainEvent) => void;
  onError?: (error: unknown) => void;
  pollIntervalMs?: number;
}

export function subscribeToChainEvents(options: SubscribeOptions): Unsubscribe {
  if (USE_MOCKS) return subscribeByPolling(options);
  return subscribeByWebSocket(options);
}

function subscribeByPolling(options: SubscribeOptions): Unsubscribe {
  const { electionId, onEvent, onError } = options;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const controller = new AbortController();
  let closed = false;
  let cursor = 0;

  const tick = async (): Promise<void> => {
    if (closed) return;
    try {
      const batch = await api.pollChainEvents(electionId ?? '', cursor, controller.signal);
      cursor = batch.cursor;
      for (const event of batch.events) {
        if (!closed) onEvent(event);
      }
    } catch (error) {
      if (!closed) onError?.(error);
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), pollIntervalMs);

  return () => {
    closed = true;
    controller.abort();
    clearInterval(timer);
  };
}

function subscribeByWebSocket({ electionId, onEvent, onError }: SubscribeOptions): Unsubscribe {
  let closed = false;
  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = (): void => {
    if (closed) return;
    socket = new WebSocket(wsUrl({ electionId }));

    socket.onmessage = (message: MessageEvent<string>) => {
      const parsed = chainEventSchema.safeParse(safeJsonParse(message.data));
      if (parsed.success) onEvent(parsed.data);
      else onError?.(parsed.error);
    };
    socket.onerror = (event: Event) => onError?.(event);
    socket.onclose = () => {
      if (!closed) reconnectTimer = setTimeout(connect, DEFAULT_RECONNECT_MS);
    };
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.close();
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}