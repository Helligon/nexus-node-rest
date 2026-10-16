import type { AssetStatus } from '../api/types';

export interface FilterInputs { author: string; status: '' | AssetStatus; q: string }

export function AssetFilters({ values, onChange }: { values: FilterInputs; onChange: (values: FilterInputs) => void }) {
  return (
    <div className="filters">
      <div className="field">
        <label htmlFor="filter-author">Filter by author</label>
        <input id="filter-author" value={values.author} onChange={(e) => onChange({ ...values, author: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="filter-status">Filter by status</label>
        <select
          id="filter-status"
          value={values.status}
          onChange={(e) => onChange({ ...values, status: e.target.value as FilterInputs['status'] })}
        >
          <option value="">Any status</option>
          <option value="available">Available</option>
          <option value="on_loan">On loan</option>
          <option value="lost">Lost</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="filter-q">Search titles</label>
        <input id="filter-q" value={values.q} onChange={(e) => onChange({ ...values, q: e.target.value })} />
      </div>
    </div>
  );
}
