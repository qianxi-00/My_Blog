import React, { useState } from 'react';

export interface ProcessStep {
  id: string;
  kind: 'reasoning' | 'tool';
  reasoningText?: string;
  name?: string;
  input?: string;
  summary?: string;
  status?: 'running' | 'ok' | 'error';
}

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  search_blog_articles: { label: '检索博客文章', icon: '🔍' },
  search_article_blocks: { label: '定位正文证据', icon: '📍' },
  read_article_window: { label: '阅读文章段落', icon: '📖' },
  read_blog_article: { label: '读取文章全文', icon: '📄' },
  search_blog_hotspots: { label: '检索热点分析', icon: '🔥' },
};

const AgentProcessStrip: React.FC<{ steps: ProcessStep[] }> = ({ steps }) => {
  const [showReasoning, setShowReasoning] = useState(false);
  if (!steps.length) return null;

  const reasoningStep = steps.find((s) => s.kind === 'reasoning' && s.reasoningText);
  const toolSteps = steps.filter((s) => s.kind === 'tool');

  return (
    <div className="mb-2 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/50 px-2.5 py-2 text-xs">
      {reasoningStep && (
        <div className="mb-1">
          <button
            type="button"
            onClick={() => setShowReasoning((v) => !v)}
            className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:opacity-80 transition-opacity"
          >
            <span>💭</span>
            <span className="font-medium">{showReasoning ? '收起思考' : '思考过程'}</span>
            <span className="text-slate-400">{reasoningStep.reasoningText!.length} 字</span>
          </button>
          {showReasoning && (
            <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{reasoningStep.reasoningText}</pre>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {toolSteps.map((step) => {
          const meta = TOOL_LABELS[step.name || ''] || { label: step.name || '工具', icon: '🛠' };
          const running = step.status === 'running';
          return (
            <span
              key={step.id}
              title={step.input ? `${step.name}(${step.input})` : step.name}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 transition-colors ${
                running
                  ? 'border-sky-300 bg-sky-50 text-sky-600 dark:border-sky-700/60 dark:bg-sky-900/30 dark:text-sky-300'
                  : step.status === 'error'
                    ? 'border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-700/60 dark:bg-rose-900/30 dark:text-rose-300'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-300'
              }`}
            >
              <span className={running ? 'animate-pulse' : ''}>{meta.icon}</span>
              <span className="font-medium truncate">{meta.label}</span>
              {step.status === 'ok' && <span>✓</span>}
              {step.status === 'error' && <span>✗</span>}
              {running && <span className="animate-pulse">…</span>}
              {step.summary && (
                <span className="text-[10px] opacity-70 truncate max-w-[90px]">{step.summary}</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default AgentProcessStrip;
