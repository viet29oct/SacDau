const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function getTokens() {
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
  };
}

export function setTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem('accessToken', accessToken);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

async function rawRequest(path, options) {
  const { accessToken } = getTokens();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const body = await res.json().catch(() => null);

  if (!body) {
    throw new ApiError('INTERNAL_ERROR', 'Không đọc được phản hồi từ server');
  }
  return { ok: res.ok, body };
}

async function refreshAccessToken() {
  const { refreshToken } = getTokens();
  if (!refreshToken) throw new ApiError('UNAUTHORIZED', 'Chưa đăng nhập');

  const { ok, body } = await rawRequest('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });

  if (!ok || !body.success) {
    clearTokens();
    throw new ApiError(body?.error?.code ?? 'UNAUTHORIZED', body?.error?.message ?? 'Refresh token hết hạn');
  }

  setTokens({ accessToken: body.data.accessToken });
  return body.data.accessToken;
}

export async function apiRequest(path, options = {}, { retry = true } = {}) {
  const { ok, body } = await rawRequest(path, options);

  if (ok && body.success) return body.data;

  if (body?.error?.code === 'UNAUTHORIZED' && retry && getTokens().refreshToken) {
    await refreshAccessToken();
    return apiRequest(path, options, { retry: false });
  }

  if (body?.error?.code === 'UNAUTHORIZED') clearTokens();
  throw new ApiError(body?.error?.code ?? 'INTERNAL_ERROR', body?.error?.message ?? 'Có lỗi xảy ra');
}

export const api = {
  get: (path) => apiRequest(path, { method: 'GET' }),
  post: (path, data) => apiRequest(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: (path, data) => apiRequest(path, { method: 'PATCH', body: JSON.stringify(data) }),
};
