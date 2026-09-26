/**
 * 通用头像组件
 * 有 avatar_url 显示图片，否则用户名首字符 + 按名字哈希取色的彩色圆底（纯 CSS，无新依赖）
 */
import React from 'react';
import { getFileUrl } from '../api/config';

// 预置色板（Tailwind 类），按名字哈希取色，保证同一用户颜色稳定
const AVATAR_COLORS = [
    'bg-rose-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-lime-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-sky-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-fuchsia-500',
];

const hashString = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
};

interface AvatarProps {
    name?: string;
    avatarUrl?: string;
    // 尺寸与字号一起传，如 'w-10 h-10 text-lg'
    className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ name = '', avatarUrl, className = 'w-10 h-10 text-lg' }) => {
    if (avatarUrl) {
        return (
            <img
                src={getFileUrl(avatarUrl)}
                alt={name || '用户头像'}
                className={`${className} rounded-full object-cover flex-shrink-0 bg-slate-200 dark:bg-slate-700`}
            />
        );
    }

    const initial = (name.trim()[0] || '?').toUpperCase();
    const color = AVATAR_COLORS[hashString(name.trim() || '?') % AVATAR_COLORS.length];

    return (
        <div className={`${className} ${color} rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold select-none transition-colors`}>
            <span className="leading-none">{initial}</span>
        </div>
    );
};

export default Avatar;
