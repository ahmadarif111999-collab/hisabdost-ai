const DEFAULT_API_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://hisabdost-api.vercel.app'
    : 'http://localhost:4000';

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  DEFAULT_API_URL
).replace(/\/$/, '');

const TOKEN_KEY = 'pakbooks_token';
const BUSINESS_KEY = 'pakbooks_business_id';

type ApiOptions = RequestInit & {
  skipAuth?: boolean;
};

export function getToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(TOKEN_KEY, token);

  window.dispatchEvent(
    new Event('pakbooks-auth-changed'),
  );
}

export function clearToken() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(BUSINESS_KEY);

  window.dispatchEvent(
    new Event('pakbooks-auth-changed'),
  );

  window.dispatchEvent(
    new Event('pakbooks-business-changed'),
  );
}

export function getBusinessId() {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(BUSINESS_KEY);
}

export function setBusinessId(id: string) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(BUSINESS_KEY, id);

  window.dispatchEvent(
    new Event('pakbooks-business-changed'),
  );
}

export function clearBusinessId() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(BUSINESS_KEY);

  window.dispatchEvent(
    new Event('pakbooks-business-changed'),
  );
}

export async function api<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const {
    skipAuth,
    headers,
    ...fetchOptions
  } = options;

  const token = getToken();

  let response: Response;

  try {
    response = await fetch(
      `${API_URL}${path}`,
      {
        ...fetchOptions,
        cache:
          fetchOptions.cache ||
          'no-store',
        headers: {
          ...(fetchOptions.body instanceof
          FormData
            ? {}
            : {
                'Content-Type':
                  'application/json',
              }),
          ...(!skipAuth && token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
          ...(headers || {}),
        },
      },
    );
  } catch {
    throw new Error(
      'Cannot connect to the HisabDost API. Check NEXT_PUBLIC_API_URL, FRONTEND_URL, and the API deployment.',
    );
  }

  if (response.status === 401) {
    clearToken();

    if (
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith(
        '/login',
      )
    ) {
      window.location.href = '/login';
    }

    throw new Error(
      'Session expired. Please login again.',
    );
  }

  if (!response.ok) {
    let message =
      `Request failed: ${response.status}`;

    try {
      const data = await response.json();

      message =
        data.message ||
        data.error ||
        message;
    } catch {
      // Keep the fallback error message.
    }

    throw new Error(
      Array.isArray(message)
        ? message.join(', ')
        : message,
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();

  if (!text) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

export function money(value?: number) {
  return `Rs. ${Math.round(
    value || 0,
  ).toLocaleString('en-PK')}`;
}

export function downloadBase64File(
  filename: string,
  mimeType: string,
  contentBase64: string,
) {
  if (typeof window === 'undefined') {
    return;
  }

  const binary = atob(contentBase64);

  const bytes =
    new Uint8Array(binary.length);

  for (
    let index = 0;
    index < binary.length;
    index += 1
  ) {
    bytes[index] =
      binary.charCodeAt(index);
  }

  const blob = new Blob(
    [bytes],
    {
      type: mimeType,
    },
  );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement('a');

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);

  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}
