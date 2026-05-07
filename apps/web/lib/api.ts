const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pakbooks_token');
}

export function setToken(token: string) {
  localStorage.setItem('pakbooks_token', token);
}

export function clearToken() {
  localStorage.removeItem('pakbooks_token');
  localStorage.removeItem('pakbooks_business_id');
}

export function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pakbooks_business_id');
}

export function setBusinessId(id: string) {
  localStorage.setItem('pakbooks_business_id', id);
  window.dispatchEvent(new Event('pakbooks-business-changed'));
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      message = data.message || message;
    } catch {}
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  return res.json();
}

export function money(value?: number) {
  return `Rs. ${Math.round(value || 0).toLocaleString('en-PK')}`;
}

export function downloadBase64File(filename: string, mimeType: string, contentBase64: string) {
  if (typeof window === 'undefined') return;
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
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
