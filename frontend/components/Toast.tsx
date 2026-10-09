import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
    /** 十三期：出场标记——true 时加 toast-out 渐隐（index.css 定义） */
    exiting?: boolean;
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

interface ToastProviderProps {
    children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);

        // 十三期：出场动画——2 秒后先加 toast-out 渐隐 180ms，动画结束再真正删除。
        // 原来是 2s 直接删 DOM，闪断很生硬。
        setTimeout(() => {
            setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 190);
        }, 2000);
    }, []);

    const getToastStyles = (type: 'success' | 'error' | 'info') => {
        switch (type) {
            case 'success':
                return 'bg-emerald-500 text-white';
            case 'error':
                return 'bg-red-500 text-white';
            case 'info':
                return 'bg-cyan-500 text-white';
            default:
                return 'bg-slate-700 text-white';
        }
    };

    const getIcon = (type: 'success' | 'error' | 'info') => {
        switch (type) {
            case 'success':
                return '✓';
            case 'error':
                return '✕';
            case 'info':
                return 'ℹ';
            default:
                return '';
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}

            {/* Toast 容器 */}
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in-down ${toast.exiting ? 'toast-out' : ''} ${getToastStyles(toast.type)}`}
                    >
                        <span className="text-lg">{getIcon(toast.type)}</span>
                        <span className="text-sm font-medium">{toast.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export default ToastProvider;
