export async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as T & { error?: unknown };
    const message = typeof payload.error === "string"
      ? payload.error
      : payload.error ? JSON.stringify(payload.error) : `HTTP ${response.status}`;
    const error = new Error(message) as Error & { payload?: T };
    error.payload = payload;
    throw error;
  }
  return await response.json() as T;
}
