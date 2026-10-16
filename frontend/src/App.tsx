import { useEffect, useRef, useState } from 'react';
import { listAssets } from './api/assets';
import type { Asset } from './api/types';
import { AssetFilters, type FilterState } from './components/AssetFilters';
import { AssetForm } from './components/AssetForm';
import { AssetList } from './components/AssetList';
import { useDebouncedValue } from './hooks/useDebouncedValue';

export default function App() {
  const [filters, setFilters] = useState<FilterState>({ author: '', status: '', q: '' });
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const latestRequest = useRef(0);

  const author = useDebouncedValue(filters.author, 300);
  const q = useDebouncedValue(filters.q, 300);
  const { status } = filters;

  useEffect(() => {
    const requestId = ++latestRequest.current;
    listAssets({ author, q, status: status || undefined }).then(
      (result) => {
        if (requestId !== latestRequest.current) return;
        setAssets(result);
        setFailed(false);
      },
      () => {
        if (requestId !== latestRequest.current) return;
        setFailed(true);
      },
    );
  }, [author, q, status, reloads]);

  return (
    <main>
      <h1>Library assets</h1>
      <AssetForm onCreated={() => setReloads((n) => n + 1)} />
      <section>
        <h2>Books</h2>
        <AssetFilters value={filters} onChange={setFilters} />
        <AssetList assets={assets} error={failed} />
      </section>
    </main>
  );
}
