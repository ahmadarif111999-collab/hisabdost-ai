const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const TOKEN_KEY = 'pakbooks_token';
const BUSINESS_KEY = 'pakbooks_business_id';

type ApiOptions = RequestInit & {
  skipAuth?: boolean;
};

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return;

  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event('pakbooks-auth-changed'));
}

export function clearToken() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(BUSINESS_KEY);
  window.dispatchEvent(new Event('pakbooks-auth-changed'));
  window.dispatchEvent(new Event('pakbooks-business-changed'));
}

export function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(BUSINESS_KEY);
}

export function setBusinessId(id: string) {
  if (typeof window === 'undefined') return;

  localStorage.setItem(BUSINESS_KEY, id);
  window.dispatchEvent(new Event('pakbooks-business-changed'));
}

export function clearBusinessId() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(BUSINESS_KEY);
  window.dispatchEvent(new Event('pakbooks-business-changed'));
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { skipAuth, headers, ...fetchOptions } = options;
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers: {
      ...(fetchOptions.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(!skipAuth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
  });

  if (res.status === 401) {
    clearToken();

    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }

    throw new Error('Session expired. Please login again.');
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;

    try {
      const data = await res.json();
      message = data.message || data.error || message;
    } catch {
      // keep fallback message
    }

    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  if (res.status === 204) {
    return null as T;
  }

  const text = await res.text();

  if (!text) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

export function money(value?: number) {
  return `Rs. ${Math.round(value || 0).toLocaleString('en-PK')}`;
}

export function downloadBase64File(filename: string, mimeType: string, contentBase64: string) {
  if (typeof window === 'undefined') return;

  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}
