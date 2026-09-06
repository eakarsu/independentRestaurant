import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCollection } from '../../src/lib/fetchCollection';

test('collects paginated staff and retains filters', async () => {
  const urls: URL[] = [];
  const fetcher = (async (input: string) => {
    const url = new URL(input, 'http://test.local'); urls.push(url);
    const page = Number(url.searchParams.get('page'));
    return Response.json({ data: [{ id: `staff-${page}` }], pagination: { page, totalPages: 2 } });
  }) as typeof fetch;
  assert.deepEqual(await fetchCollection('/api/staff?active=true', fetcher), [{id:'staff-1'}, {id:'staff-2'}]);
  assert.equal(urls.length, 2);
  for (const url of urls) { assert.equal(url.searchParams.get('active'), 'true'); assert.equal(url.searchParams.get('pageSize'), '100'); }
});

test('accepts legacy arrays and rejects failed or inconsistent responses', async () => {
  assert.deepEqual(await fetchCollection('/api/staff', (async () => Response.json([{id:'one'}])) as typeof fetch), [{id:'one'}]);
  await assert.rejects(fetchCollection('/api/staff', (async () => new Response('Unavailable', {status:503})) as typeof fetch), /HTTP 503/);
  await assert.rejects(fetchCollection('/api/staff', (async () => Response.json({data:[],pagination:{page:1,totalPages:2}})) as typeof fetch), /empty intermediate page/);
});
