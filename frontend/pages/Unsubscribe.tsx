import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button, Card } from '../components/Shared';
import { unsubscribe } from '../api/subscribe';
import { errorText } from '../utils/errors';

const Unsubscribe: React.FC = () => {
  const { token } = useParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const doUnsubscribe = async () => {
      if (!token) {
        setStatus('error');
        setMessage('无效的取消订阅链接');
        return;
      }

      try {
        const result = await unsubscribe(token);
        if (result.success) {
          setStatus('success');
          setMessage(result.message);
        } else {
          setStatus('error');
          setMessage(result.message);
        }
      } catch (error: any) {
        setStatus('error');
        setMessage(errorText(error, '操作失败，请稍后重试'));
      }
    };

    doUnsubscribe();
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="p-8 text-center">
          {status === 'loading' && (
            <>
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-5">
                <Icons.RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">正在处理退订请求</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">请稍候...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800/60 rounded-full flex items-center justify-center mx-auto mb-5">
                <Icons.Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">已取消订阅</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{message}</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs mb-6 leading-relaxed">
                你将不再收到博客更新邮件通知。<br />
                如果这是误操作，欢迎随时回首页重新订阅。
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-14 h-14 bg-red-50 dark:bg-red-950/50 border border-red-200/70 dark:border-red-800/60 rounded-full flex items-center justify-center mx-auto mb-5">
                <Icons.X className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">退订失败</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{message}</p>
            </>
          )}

          <Link to="/">
            <Button variant="secondary">
              <Icons.Home className="w-4 h-4" /> 返回首页
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
};

export default Unsubscribe;
