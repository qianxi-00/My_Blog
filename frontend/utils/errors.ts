/**
 * 后端错误信息提取（2026-09-28）
 *
 * FastAPI 校验失败时 `detail` 是数组（[{loc, msg, type}]）。把它直接塞进 JSX 会抛
 * "Objects are not valid as a React child"，在没有 ErrorBoundary 时整站白屏
 * （用户中心改密码填 7 位就是这条路径）。所有要展示后端错误的地方都走这个函数。
 */
export const errorText = (error: any, fallback = '操作失败'): string => {
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        const first: any = detail[0];
        const loc = Array.isArray(first?.loc) ? first.loc[first.loc.length - 1] : '';
        const msg = first?.msg ? String(first.msg) : JSON.stringify(first);
        return loc ? `${loc}: ${msg}` : msg;
    }
    if (detail && typeof detail === 'object') return JSON.stringify(detail);
    return error?.message || fallback;
};
