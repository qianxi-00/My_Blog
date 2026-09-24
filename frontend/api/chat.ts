/**
 * AI 聊天相关 API
 */
import api from './config';

export interface ChatMessage {
    id: number;
    session_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: string;
}

export interface ChatSession {
    id: string;
    title?: string;
    created_at: string;
    updated_at: string;
}

export interface ChatSessionWithMessages extends ChatSession {
    messages: ChatMessage[];
}

export interface ChatResponse {
    session_id: string;
    message: ChatMessage;
    reply: ChatMessage;
}

export interface PromptLabRequest {
    prompt: string;
    input_text?: string;
    max_tokens?: number;
    temperature?: number;
}

export interface PromptLabResponse {
    result: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

// 创建聊天会话
export const createChatSession = async (title?: string): Promise<ChatSession> => {
    const response = await api.post('/chat/session', { title });
    return response.data;
};

// 发送消息
export const sendMessage = async (sessionId: string, content: string): Promise<ChatResponse> => {
    const response = await api.post('/chat/message', {
        session_id: sessionId,
        content,
    });
    return response.data;
};

// 流式发送消息
export const sendMessageStream = async (
    sessionId: string,
    content: string,
    onChunk: (chunk: string) => void
): Promise<void> => {
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${api.defaults.baseURL}/chat/message/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            session_id: sessionId,
            content
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
    }

    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        const chunk = decoder.decode(value, { stream: true });
        onChunk(chunk);
    }
};

// ---------- A-RAG 流式对话（SSE：思考 / 工具调用 / 回答） ----------

export type AgenticEvent =
    | { type: 'reasoning'; content: string }
    | { type: 'text'; content: string }
    | { type: 'tool_start'; name: string; input?: string }
    | { type: 'tool_result'; name: string; ok: boolean; summary?: string }
    | { type: 'done'; session_id?: string }
    | { type: 'error'; message: string };

export const streamAgenticChat = async (
    sessionId: string,
    content: string,
    onEvent: (event: AgenticEvent) => void
): Promise<void> => {
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${api.defaults.baseURL}/chat/message/agentic`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            session_id: sessionId,
            content
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
    }

    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 帧以空行分隔：event: <type>\ndata: <json>\n\n
        let sep = buffer.indexOf('\n\n');
        while (sep !== -1) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            sep = buffer.indexOf('\n\n');

            let eventType = '';
            let dataRaw = '';
            for (const line of block.split('\n')) {
                if (line.startsWith('event: ')) eventType = line.slice(7).trim();
                else if (line.startsWith('data: ')) dataRaw = line.slice(6);
            }
            if (!eventType) continue;

            let data: Record<string, any> = {};
            try {
                data = dataRaw ? JSON.parse(dataRaw) : {};
            } catch {
                data = {};
            }

            switch (eventType) {
                case 'reasoning':
                    onEvent({ type: 'reasoning', content: data.content || '' });
                    break;
                case 'text':
                    onEvent({ type: 'text', content: data.content || '' });
                    break;
                case 'tool_start':
                    onEvent({ type: 'tool_start', name: data.name || 'tool', input: data.input });
                    break;
                case 'tool_result':
                    onEvent({ type: 'tool_result', name: data.name || 'tool', ok: !!data.ok, summary: data.summary });
                    break;
                case 'done':
                    onEvent({ type: 'done', session_id: data.session_id });
                    break;
                case 'error':
                    onEvent({ type: 'error', message: data.message || 'A-RAG 服务暂时不可用' });
                    break;
            }
        }
    }
};

// 获取会话历史
export const getChatHistory = async (sessionId: string): Promise<ChatSessionWithMessages> => {
    const response = await api.get(`/chat/session/${sessionId}/history`);
    return response.data;
};

// 删除会话
export const deleteChatSession = async (sessionId: string): Promise<void> => {
    await api.delete(`/chat/session/${sessionId}`);
};

// Prompt 实验室 (AI 调用需要更长超时时间)
export const runPromptLab = async (data: PromptLabRequest): Promise<PromptLabResponse> => {
    const response = await api.post('/chat/prompt-lab', data, {
        timeout: 120000, // 2 分钟超时，AI 响应可能较慢
    });
    return response.data;
};
