import { describe, expect, it } from 'vitest';
import type { Asset } from '../../src/domain/asset.js';
import { InMemoryAssetRepository } from '../../src/repo/asset-repository.js';

const make = (n: number, over: Partial<Asset> = {}): Asset => ({
  id: `id-${n}`,
  title: `Title ${n}`,
  author: `Author ${n}`,
  isbn: null,
  status: 'available',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('InMemoryAssetRepository', () => {
  it('finds by id and isbn, and returns undefined when missing', async () => {
    const repo = new InMemoryAssetRepository();
    await repo.add(make(1, { isbn: '9780306406157' }));
    expect((await repo.findById('id-1'))?.title).toBe('Title 1');
    expect((await repo.findByIsbn('9780306406157'))?.id).toBe('id-1');
    expect(await repo.findById('nope')).toBeUndefined();
    expect(await repo.findByIsbn('0306406152')).toBeUndefined();
  });

  it('lists in creation order', async () => {
    const repo = new InMemoryAssetRepository();
    for (const n of [1, 2, 3]) await repo.add(make(n));
    expect((await repo.list({})).map((a) => a.id)).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('filters by author, status and q, combined with AND', async () => {
    const repo = new InMemoryAssetRepository();
    await repo.add(make(1, { author: 'Ann Lee', title: 'War and Peace' }));
    await repo.add(make(2, { author: 'ann lee', title: 'Peace', status: 'lost' }));
    await repo.add(make(3, { author: 'Ann Leeson', title: 'WAR' }));
    const ids = async (f: Parameters<typeof repo.list>[0]) => (await repo.list(f)).map((a) => a.id);
    expect(await ids({ author: 'ANN LEE' })).toEqual(['id-1', 'id-2']);
    expect(await ids({ status: 'lost' })).toEqual(['id-2']);
    expect(await ids({ q: 'war' })).toEqual(['id-1', 'id-3']);
    expect(await ids({ author: 'ann lee', q: 'peace', status: 'available' })).toEqual(['id-1']);
  });

  it('returns copies', async () => {
    const repo = new InMemoryAssetRepository();
    const original = make(1, { isbn: '9780306406157' });
    await repo.add(original);
    original.title = 'changed';
    const list = await repo.list({});
    list[0]!.title = 'mutated';
    list.pop();
    (await repo.findById('id-1'))!.title = 'mutated';
    (await repo.findByIsbn('9780306406157'))!.title = 'mutated';
    expect((await repo.list({})).map((a) => a.title)).toEqual(['Title 1']);
  });
});
