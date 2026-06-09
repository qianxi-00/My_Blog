import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { unsubscribe } from '../api/subscribe';

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
        setMessage(error.response?.data?.detail || '操作失败，请稍后重试');
      }
    };

    doUnsubscribe();
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {status === 'loading' && (
            <>
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="animate-spin w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h1 className="text-xl font-bold text-slate-800 mb-2">处理中...</h1>
              <p className="text-slate-500">正在取消订阅</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-800 mb-2">取消订阅成功</h1>
              <p className="text-slate-500 mb-6">{message}</p>
              <p className="text-slate-400 text-sm mb-8">
                你将不再收到我们的邮件通知。<br />
                如果这是误操作，欢迎随时重新订阅。
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Icons.X className="w-8 h-8 text-red-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800 mb-2">出错了</h1>
              <p className="text-slate-500 mb-6">{message}</p>
            </>
          )}

          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-colors"
          >
            <Icons.Home className="w-4 h-4" />
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Unsubscribe;
