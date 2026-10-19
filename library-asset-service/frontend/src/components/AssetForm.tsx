import { useState } from 'react';
import type { FormEvent } from 'react';
import { createAsset } from '../api/assets';
import { ApiError, ASSET_STATUSES, STATUS_LABELS } from '../api/types';
import type { Asset, AssetStatus } from '../api/types';

const FIELDS = ['title', 'author', 'isbn', 'status'] as const;
type Field = (typeof FIELDS)[number];
type FieldErrors = Partial<Record<Field, string>>;

const GENERAL_ERROR = 'Could not register the book. Please try again.';

export function AssetForm({ onCreated }: { onCreated: (asset: Asset) => void }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [status, setStatus] = useState<AssetStatus>('available');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setGeneralError(false);
    setRegistered(false);
    setSubmitting(true);
    try {
      const asset = await createAsset({ title, author, isbn, status });
      setTitle('');
      setAuthor('');
      setIsbn('');
      setStatus('available');
      setRegistered(true);
      onCreated(asset);
    } catch (error) {
      const api = error instanceof ApiError ? error : undefined;
      if (api?.status === 409) {
        setFieldErrors({ isbn: 'A book with this ISBN is already registered.' });
      } else if (api?.status === 400) {
        const errors: FieldErrors = {};
        let other = false;
        for (const detail of api.details) {
          const field = FIELDS.find((f) => f === detail.field);
          if (field) errors[field] = detail.issue;
          else other = true;
        }
        setFieldErrors(errors);
        setGeneralError(other);
      } else {
        setGeneralError(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const describe = (field: Field) => ({
    'aria-invalid': fieldErrors[field] ? (true as const) : undefined,
    'aria-describedby': fieldErrors[field] ? `${field}-error` : undefined,
  });
  const error = (field: Field) =>
    fieldErrors[field] && (
      <p id={`${field}-error`} className="field-error">
        {fieldErrors[field]}
      </p>
    );

  return (
    <section>
      <h2>Register a book</h2>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} {...describe('title')} />
          {error('title')}
        </div>
        <div className="field">
          <label htmlFor="author">Author</label>
          <input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} {...describe('author')} />
          {error('author')}
        </div>
        <div className="field">
          <label htmlFor="isbn">ISBN (optional)</label>
          <input id="isbn" value={isbn} onChange={(e) => setIsbn(e.target.value)} {...describe('isbn')} />
          {error('isbn')}
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value as AssetStatus)} {...describe('status')}>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {error('status')}
        </div>
        <button type="submit" disabled={submitting}>
          Register book
        </button>
        {generalError && <p role="alert">{GENERAL_ERROR}</p>}
        {registered && <p role="status">Book registered.</p>}
      </form>
    </section>
  );
}
