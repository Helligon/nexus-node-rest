import { beforeEach, describe, expect, it } from 'vitest';
import type { Asset } from '../../src/domain/asset.js';
import { InMemoryAssetRepository } from '../../src/repo/asset-repository.js';

const make = (n: number, over: Partial<Asset> = {}): Asset => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  title: `Title ${n}`,
  author: `Author ${n}`,
  isbn: null,
  status: 'available',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('InMemoryAssetRepository', () => {
  let repo: InMemoryAssetRepository;
  beforeEach(() => {
    repo = new InMemoryAssetRepository();
  });

  it('finds added assets by id and isbn, and gives undefined otherwise', async () => {
    const a = make(1, { isbn: '9780306406157' });
    await repo.add(a);
    expect(await repo.findById(a.id)).toEqual(a);
    expect(await repo.findByIsbn('9780306406157')).toEqual(a);
    expect(await repo.findById('nope')).toBeUndefined();
    expect(await repo.findByIsbn('0306406152')).toBeUndefined();
  });

  it('lists in creation order and filters', async () => {
    await repo.add(make(1, { author: 'Ann Lee', title: 'The Red Book' }));
    await repo.add(make(2, { author: 'Bob', title: 'Blue', status: 'lost' }));
    await repo.add(make(3, { author: 'ann lee', title: 'red sky', status: 'lost' }));
    const ids = async (f: Parameters<typeof repo.list>[0]) => (await repo.list(f)).map((a) => a.id.slice(-1));
    expect(await ids({})).toEqual(['1', '2', '3']);
    expect(await ids({ author: 'ANN LEE' })).toEqual(['1', '3']);
    expect(await ids({ author: 'ann' })).toEqual([]);
    expect(await ids({ status: 'lost' })).toEqual(['2', '3']);
    expect(await ids({ q: 'RED' })).toEqual(['1', '3']);
    expect(await ids({ q: 'red', status: 'lost', author: 'Ann Lee' })).toEqual(['3']);
  });

  it('returns copies', async () => {
    const a = make(1);
    await repo.add(a);
    a.title = 'mutated input';
    const list = await repo.list({});
    list[0]!.title = 'mutated output';
    list.pop();
    (await repo.findById(a.id))!.title = 'mutated found';
    expect((await repo.list({}))[0]!.title).toBe('Title 1');
    expect((await repo.findById(a.id))!.title).toBe('Title 1');
  });
});
