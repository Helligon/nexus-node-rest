import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mswHttp } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contractJson, server } from '../test/server';
import { AssetForm } from './AssetForm';

const created = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: null,
  status: 'available',
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function fill(user: ReturnType<typeof userEvent.setup>, isbn = '') {
  await user.type(screen.getByLabelText('Title'), 'Dune');
  await user.type(screen.getByLabelText('Author'), 'Frank Herbert');
  if (isbn) await user.type(screen.getByLabelText('ISBN (optional)'), isbn);
  await user.click(screen.getByRole('button', { name: 'Register book' }));
}

describe('AssetForm', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('registers a book and omits an empty ISBN', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    let posted: unknown;
    server.use(
      mswHttp.post('*/api/assets', async ({ request }) => {
        posted = await request.json();
        return contractJson('POST', '/assets', 201, created);
      }),
    );
    render(<AssetForm onCreated={onCreated} />);
    await fill(user);
    expect(await screen.findByRole('status')).toHaveTextContent('Book registered.');
    expect(posted).toEqual({ title: 'Dune', author: 'Frank Herbert', status: 'available' });
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Author')).toHaveValue('');
    expect(screen.getByLabelText('Status')).toHaveValue('available');
  });

  it('shows server validation issues next to their fields', async () => {
    const user = userEvent.setup();
    server.use(
      mswHttp.post('*/api/assets', () =>
        contractJson('POST', '/assets', 400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request is invalid',
            details: [
              { field: 'title', issue: 'is required and must be a string' },
              { field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' },
            ],
          },
        }),
      ),
    );
    render(<AssetForm onCreated={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Register book' }));
    const title = screen.getByLabelText('Title');
    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'));
    expect(title).toHaveAttribute('aria-describedby', 'title-error');
    expect(document.getElementById('title-error')).toHaveTextContent('is required and must be a string');
    expect(screen.getByLabelText('ISBN (optional)')).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('isbn-error')).toHaveTextContent('must be a valid ISBN-10 or ISBN-13');
    expect(screen.getByLabelText('Author')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the general alert as well for body issues', async () => {
    const user = userEvent.setup();
    server.use(
      mswHttp.post('*/api/assets', () =>
        contractJson('POST', '/assets', 400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request is invalid',
            details: [{ field: 'body', issue: 'is not allowed' }],
          },
        }),
      ),
    );
    render(<AssetForm onCreated={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Register book' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not register the book. Please try again.');
  });

  it('shows the duplicate ISBN message', async () => {
    const user = userEvent.setup();
    server.use(
      mswHttp.post('*/api/assets', () =>
        contractJson('POST', '/assets', 409, {
          error: { code: 'CONFLICT', message: 'An asset with this ISBN already exists' },
        }),
      ),
    );
    render(<AssetForm onCreated={() => {}} />);
    await fill(user, '9780306406157');
    await waitFor(() =>
      expect(document.getElementById('isbn-error')).toHaveTextContent('A book with this ISBN is already registered.'),
    );
    expect(screen.getByLabelText('ISBN (optional)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('ISBN (optional)')).toHaveAttribute('aria-describedby', 'isbn-error');
  });

  it('shows the general alert for other errors', async () => {
    const user = userEvent.setup();
    server.use(
      mswHttp.post('*/api/assets', () =>
        contractJson('POST', '/assets', 500, {
          error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        }),
      ),
    );
    render(<AssetForm onCreated={() => {}} />);
    await fill(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not register the book. Please try again.');
    expect(screen.queryByText('Book registered.')).not.toBeInTheDocument();
  });
});
