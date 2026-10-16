import type { Asset, AssetStatus } from '../api/types';

const LABELS: Record<AssetStatus, string> = { available: 'Available', on_loan: 'On loan', lost: 'Lost' };

export function AssetList({ assets, error }: { assets: Asset[] | null; error: boolean }) {
  if (error) return <p role="alert">Could not load books.</p>;
  if (assets === null) return <p>Loading…</p>;
  if (assets.length === 0) return <p>No books match these filters.</p>;
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
        {assets.map((a) => (
          <tr key={a.id}>
            <td>{a.title}</td>
            <td>{a.author}</td>
            <td>{a.isbn ?? '—'}</td>
            <td>{LABELS[a.status]}</td>
            <td>{a.createdAt.slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
