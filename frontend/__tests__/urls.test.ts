import { describe, expect, it } from 'vitest';
import {
  buildBilibiliUrl,
  buildGithubUrl,
  safeExternalUrl,
  safeRedirectPath,
} from '../utils/urls';

describe('safeExternalUrl', () => {
  it('allows http and https URLs and trims surrounding spaces', () => {
    expect(safeExternalUrl('https://example.com/path?a=1')).toBe('https://example.com/path?a=1');
    expect(safeExternalUrl('  http://localhost:3000/test  ')).toBe('http://localhost:3000/test');
  });

  it('blocks javascript:, data:, vbscript:, whitespace, and malformed URLs', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('JAVASCRIPT:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBeNull();
    expect(safeExternalUrl('https://evil.com/foo bar')).toBeNull();
    expect(safeExternalUrl('not-a-url')).toBeNull();
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe('buildGithubUrl', () => {
  it('accepts usernames, @handles, and valid https URLs', () => {
    expect(buildGithubUrl('qianxi-00')).toBe('https://github.com/qianxi-00');
    expect(buildGithubUrl('@octocat')).toBe('https://github.com/octocat');
    expect(buildGithubUrl('https://github.com/qianxi-00/My_Blog')).toBe(
      'https://github.com/qianxi-00/My_Blog'
    );
  });

  it('rejects dangerous schemes and invalid usernames', () => {
    expect(buildGithubUrl('javascript:alert(1)')).toBeNull();
    expect(buildGithubUrl('user name')).toBeNull();
    expect(buildGithubUrl('../admin')).toBeNull();
    expect(buildGithubUrl('')).toBeNull();
  });
});

describe('buildBilibiliUrl', () => {
  it('accepts numeric UIDs and valid https URLs', () => {
    expect(buildBilibiliUrl('12345678')).toBe('https://space.bilibili.com/12345678');
    expect(buildBilibiliUrl('https://space.bilibili.com/12345678')).toBe(
      'https://space.bilibili.com/12345678'
    );
  });

  it('rejects non-numeric strings and dangerous schemes', () => {
    expect(buildBilibiliUrl('javascript:alert(1)')).toBeNull();
    expect(buildBilibiliUrl('abc123')).toBeNull();
    expect(buildBilibiliUrl('')).toBeNull();
  });
});

describe('safeRedirectPath', () => {
  it('allows relative internal paths including hash-prefixed paths', () => {
    expect(safeRedirectPath('/user')).toBe('/user');
    expect(safeRedirectPath('#/forum/threads/12?sort=latest')).toBe('/forum/threads/12?sort=latest');
  });

  it('blocks open redirects, protocol-relative URLs, backslashes, and control chars', () => {
    expect(safeRedirectPath('https://evil.com')).toBe('/');
    expect(safeRedirectPath('//evil.com')).toBe('/');
    expect(safeRedirectPath('/\\evil.com')).toBe('/');
    expect(safeRedirectPath('/good\nLocation: https://evil.com')).toBe('/');
    expect(safeRedirectPath('/foo\\bar')).toBe('/');
    expect(safeRedirectPath('')).toBe('/');
    expect(safeRedirectPath(null, '/forum')).toBe('/forum');
  });
});
