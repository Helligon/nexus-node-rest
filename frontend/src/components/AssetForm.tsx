import { useState, type FormEvent } from 'react';
import { createAsset } from '../api/assets';
import { ApiError, type Asset, type AssetStatus } from '../api/types';

const FIELDS = ['title', 'author', 'isbn', 'status'] as const;
type Field = (typeof FIELDS)[number];
type FieldErrors = Partial<Record<Field, string>>;

const GENERAL_ERROR = 'Could not register the book. Please try again.';

export function AssetForm({ onCreated }: { onCreated: (asset: Asset) => void }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [status, setStatus] = useState<AssetStatus>('available');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
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
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        const next: FieldErrors = {};
        let other = false;
        for (const detail of err.details) {
          const field = FIELDS.find((f) => f === detail.field);
          if (field) next[field] = detail.issue;
          else other = true;
        }
        setErrors(next);
        setGeneralError(other);
      } else if (err instanceof ApiError && err.status === 409) {
        setErrors({ isbn: 'A book with this ISBN is already registered.' });
      } else {
        setGeneralError(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const describe = (field: Field) => ({
    'aria-invalid': errors[field] ? (true as const) : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
  });
  const error = (field: Field) =>
    errors[field] ? (
      <p id={`${field}-error`} className="field-error">
        {errors[field]}
      </p>
    ) : null;

  return (
    <section>
      <h2>Register a book</h2>
      <form onSubmit={handleSubmit} noValidate>
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
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as AssetStatus)}
            {...describe('status')}
          >
            <option value="available">Available</option>
            <option value="on_loan">On loan</option>
            <option value="lost">Lost</option>
          </select>
          {error('status')}
        </div>
        <button type="submit" disabled={submitting}>
          Register book
        </button>
        {registered && <p role="status">Book registered.</p>}
        {generalError && <p role="alert">{GENERAL_ERROR}</p>}
      </form>
    </section>
  );
}
