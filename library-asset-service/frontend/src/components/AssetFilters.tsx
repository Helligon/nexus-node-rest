import type { AssetStatus } from '../api/types';

export interface FilterState { author: string; status: AssetStatus | ''; q: string }

export function AssetFilters({ value, onChange }: { value: FilterState; onChange: (next: FilterState) => void }) {
  return (
    <div className="filters">
      <div className="field">
        <label htmlFor="filter-author">Filter by author</label>
        <input
          id="filter-author"
          value={value.author}
          onChange={(e) => onChange({ ...value, author: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="filter-status">Filter by status</label>
        <select
          id="filter-status"
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as AssetStatus | '' })}
        >
          <option value="">Any status</option>
          <option value="available">Available</option>
          <option value="on_loan">On loan</option>
          <option value="lost">Lost</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="filter-q">Search titles</label>
        <input id="filter-q" value={value.q} onChange={(e) => onChange({ ...value, q: e.target.value })} />
      </div>
    </div>
  );
}
