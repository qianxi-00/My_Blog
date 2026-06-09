import api from './config';

export interface AgentMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: any;
  tool_call_id?: string | null;
  tool_name?: string | null;
  created_at: string;
}

export interface AgentSession {
  id: string;
  title?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentSessionWithMessages extends AgentSession {
  messages: AgentMessage[];
}

export type AgentStreamEventType = 'text' | 'thinking' | 'tool_start' | 'tool_result' | 'done' | 'error' | 'ready';

export interface AgentStreamEvent {
  type: AgentStreamEventType;
  data: any;
}

export const getAgentSessions = async (): Promise<AgentSession[]> => {
  const response = await api.get('/agent/sessions');
  return response.data;
};

export const getAgentSession = async (sessionId: string): Promise<AgentSessionWithMessages> => {
  const response = await api.get(`/agent/sessions/${sessionId}`);
  return response.data;
};

export const deleteAgentSession = async (sessionId: string): Promise<void> => {
  await api.delete(`/agent/sessions/${sessionId}`);
};

const parseSSEBlocks = (buffer: string): { events: AgentStreamEvent[]; remainder: string } => {
  const events: AgentStreamEvent[] = [];
  const blocks = buffer.split('\n\n');
  const remainder = blocks.pop() ?? '';

  for (const block of blocks) {
    let eventType = '';
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (!eventType || dataLines.length === 0) {
      continue;
    }

    const rawData = dataLines.join('\n');
    let parsedData: any = rawData;
    try {
      parsedData = JSON.parse(rawData);
    } catch {
      parsedData = { content: rawData };
    }

    events.push({
      type: eventType as AgentStreamEventType,
      data: parsedData,
    });
  }

  return { events, remainder };
};

export const sendAgentMessageStream = async (
  sessionId: string | null,
  content: string,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
  idleTimeoutMs: number = 45000
): Promise<void> => {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  if (signal) {
    if (signal.aborted) abortController.abort();
    signal.addEventListener('abort', onAbort);
  }

  const response = await fetch(`${api.defaults.baseURL}/agent/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session_id: sessionId,
      content,
    }),
    signal: abortController.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      abortController.abort();
    }, idleTimeoutMs);
  };

  resetIdleTimer();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      resetIdleTimer();
      buffer += decoder.decode(value, { stream: true });
      const { events, remainder } = parseSSEBlocks(buffer);
      buffer = remainder;

      for (const event of events) {
        onEvent(event);
      }
    }

    if (buffer.trim()) {
      const { events } = parseSSEBlocks(`${buffer}\n\n`);
      for (const event of events) {
        onEvent(event);
      }
    }
  } catch (error: any) {
    if (abortController.signal.aborted) {
      throw new Error('Agent 响应超时，请稍后重试');
    }
    throw error;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    if (signal) signal.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {}
  }
};
