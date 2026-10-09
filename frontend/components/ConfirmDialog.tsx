/**
 * 十三期 C2：统一确认弹窗，替代全站 17 处原生 window.confirm
 * （深色主题下原生 confirm 是白色系统弹窗，风格撕裂且无法排版后果说明）。
 *
 * 用法：
 *   const { confirm, confirmDialog } = useConfirm();
 *   // 调一处：
 *   <button onClick={async () => {
 *     const ok = await confirm({ title: '删除文章', message: '删除后不可恢复，真的要删吗？', danger: true });
 *     if (!ok) return;
 *     ...
 *   }} />
 *   // 页面底部渲染：
 *   {confirmDialog}
 */
import React, { useCallback, useRef, useState } from 'react';
import { Button } from './Shared';
import { Icons } from './Icons';

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  /** 不可逆/伤人操作传 true：确认按钮变实心红 + 警告图标 */
  danger?: boolean;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState(options);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState(null);
  }, []);

  const confirmDialog = state ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={() => settle(false)}
      role="dialog"
      aria-modal="true"
      aria-label={state.title}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {state.danger && (
            <div className="shrink-0 w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <Icons.AlertTriangle className="w-4.5 h-4.5 text-red-600 dark:text-red-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{state.title}</h3>
            <div className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{state.message}</div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="outline" size="sm" onClick={() => settle(false)}>取消</Button>
          <Button
            variant={state.danger ? 'danger' : 'primary'}
            size="sm"
            onClick={() => settle(true)}
            autoFocus
          >
            {state.confirmText || '确认'}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmDialog };
}
