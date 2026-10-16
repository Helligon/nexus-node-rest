import type { Asset, AssetFilter } from '../domain/asset.js';

export interface AssetRepository {
  add(asset: Asset): Promise<void>;
  findById(id: string): Promise<Asset | undefined>;
  findByIsbn(isbn: string): Promise<Asset | undefined>;
  list(filter: AssetFilter): Promise<Asset[]>; // creation order; filter semantics from §4.2; returns copies
}

export class InMemoryAssetRepository implements AssetRepository {
  private readonly assets: Asset[] = [];

  async add(asset: Asset): Promise<void> {
    this.assets.push({ ...asset });
  }

  async findById(id: string): Promise<Asset | undefined> {
    return this.copy(this.assets.find((a) => a.id === id));
  }

  async findByIsbn(isbn: string): Promise<Asset | undefined> {
    return this.copy(this.assets.find((a) => a.isbn === isbn));
  }

  async list(filter: AssetFilter): Promise<Asset[]> {
    const author = filter.author?.toLowerCase();
    const q = filter.q?.toLowerCase();
    return this.assets
      .filter(
        (a) =>
          (author === undefined || a.author.toLowerCase() === author) &&
          (filter.status === undefined || a.status === filter.status) &&
          (q === undefined || a.title.toLowerCase().includes(q)),
      )
      .map((a) => ({ ...a }));
  }

  private copy(asset: Asset | undefined): Asset | undefined {
    return asset && { ...asset };
  }
}
