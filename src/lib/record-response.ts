export async function readRecordResponse(response: Response): Promise<unknown> {
  if (response.redirected && /\/login(?:[/?]|$)/.test(response.url)) throw new Error('Sign in again to load these records.');
  if (!response.headers.get('content-type')?.includes('json')) throw new Error('The record service did not return data. Sign in again or retry.');
  const value: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 401) throw new Error('Sign in again to load these records.');
    const message = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : `Could not load records (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return value;
}

export async function readRecordArray<T>(response: Response): Promise<T[]> {
  const value = await readRecordResponse(response);
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('The server returned an invalid record list. Retry loading.');
  return value as T[];
}

export interface RecordPage<T> {
  data: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
export async function readRecordPage<T>(response: Response): Promise<RecordPage<T>> {
  const value = await readRecordResponse(response) as RecordPage<T> | null;
  const p = value?.pagination;
  if (!value || !Array.isArray(value.data) || value.data.some(row => !row || typeof row !== 'object' || Array.isArray(row)) || !p || !Number.isInteger(p.page) || p.page < 1 || !Number.isInteger(p.pageSize) || p.pageSize < 1 || !Number.isInteger(p.totalItems) || p.totalItems < 0 || !Number.isInteger(p.totalPages) || p.totalPages < 0 || (p.totalPages === 0 && (p.totalItems !== 0 || value.data.length !== 0))) throw new Error('The server returned an invalid paginated record list. Retry loading.');
  return value;
}
