/**
 * 安全链接与站内回跳校验工具
 * 防止个人外链（website/github/bilibili）或 ?redirect= 注入 javascript:/data: 或开放重定向
 */

export const safeExternalUrl = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
};

export const buildGithubUrl = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return safeExternalUrl(trimmed);
  }
  const cleanUser = trimmed.replace(/^@+/, '').split('/')[0].trim();
  if (!cleanUser || !/^[a-zA-Z0-9-]+$/.test(cleanUser)) {
    return null;
  }
  return `https://github.com/${cleanUser}`;
};

export const buildBilibiliUrl = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return safeExternalUrl(trimmed);
  }
  if (/^\d+$/.test(trimmed)) {
    return `https://space.bilibili.com/${trimmed}`;
  }
  return null;
};

/**
 * 仅允许同源站内路径，防止开放重定向到外部恶意地址
 */
export const safeRedirectPath = (raw?: string | null, fallback = '/'): string => {
  if (!raw) return fallback;
  let candidate = raw.trim();
  if (!candidate) return fallback;
  if (candidate.startsWith('#')) {
    candidate = candidate.slice(1);
  }
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) {
    return fallback;
  }
  // 禁止包含控制字符或反斜杠
  if (/[\r\n\\]/.test(candidate)) {
    return fallback;
  }
  return candidate;
};
