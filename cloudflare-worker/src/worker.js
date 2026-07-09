const API_ORIGIN = 'https://qian7988-qianxi-blog-backend.hf.space';

function withOrigin(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function buildOriginRequest(request, url) {
  const target = new URL(url.pathname + url.search, API_ORIGIN);
  const headers = new Headers(request.headers);
  headers.set('host', target.host);
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', 'https');
  return new Request(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (withOrigin(url.pathname)) {
      const response = await fetch(buildOriginRequest(request, url));
      const headers = new Headers(response.headers);
      headers.set('access-control-allow-origin', '*');
      headers.set('access-control-allow-methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
      headers.set('access-control-allow-headers', request.headers.get('access-control-request-headers') || 'content-type,authorization');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return env.ASSETS.fetch(request);
  },
};
