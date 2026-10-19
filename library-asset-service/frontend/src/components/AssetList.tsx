import { STATUS_LABELS } from '../api/types';
import type { Asset } from '../api/types';

export type ListState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; assets: Asset[] };

export function AssetList({ state }: { state: ListState }) {
  if (state.kind === 'loading') return <p>Loading…</p>;
  if (state.kind === 'error') return <p role="alert">Could not load books.</p>;
  if (state.assets.length === 0) return <p>No books match these filters.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Author</th>
          <th>ISBN</th>
          <th>Status</th>
          <th>Added</th>
        </tr>
      </thead>
      <tbody>
        {state.assets.map((asset) => (
          <tr key={asset.id}>
            <td>{asset.title}</td>
            <td>{asset.author}</td>
            <td>{asset.isbn ?? '—'}</td>
            <td>{STATUS_LABELS[asset.status]}</td>
            <td>{asset.createdAt.slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
