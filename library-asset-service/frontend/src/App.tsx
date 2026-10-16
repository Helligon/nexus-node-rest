import { useEffect, useRef, useState } from 'react';
import { listAssets } from './api/assets';
import type { AssetFilterValues } from './api/types';
import { AssetFilters } from './components/AssetFilters';
import type { FilterInputs } from './components/AssetFilters';
import { AssetForm } from './components/AssetForm';
import { AssetList } from './components/AssetList';
import type { ListState } from './components/AssetList';
import { useDebouncedValue } from './hooks/useDebouncedValue';

export function App() {
  const [inputs, setInputs] = useState<FilterInputs>({ author: '', status: '', q: '' });
  const [reloads, setReloads] = useState(0);
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const latest = useRef(0);

  const author = useDebouncedValue(inputs.author, 300);
  const q = useDebouncedValue(inputs.q, 300);
  const { status } = inputs;

  useEffect(() => {
    const requestId = ++latest.current;
    const filters: AssetFilterValues = { author, q, ...(status && { status }) };
    listAssets(filters).then(
      (assets) => {
        if (requestId === latest.current) setState({ kind: 'ready', assets });
      },
      () => {
        if (requestId === latest.current) setState({ kind: 'error' });
      },
    );
  }, [author, q, status, reloads]);

  return (
    <main>
      <h1>Library assets</h1>
      <AssetForm onCreated={() => setReloads((n) => n + 1)} />
      <section>
        <h2>Books</h2>
        <AssetFilters values={inputs} onChange={setInputs} />
        <AssetList state={state} />
      </section>
    </main>
  );
}
