import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { contractJson, server } from '../test/server';
import { AssetForm } from './AssetForm';

const asset = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: null,
  status: 'available',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Title'), 'Dune');
  await user.type(screen.getByLabelText('Author'), 'Frank Herbert');
};
const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Register book' }));

describe('AssetForm', () => {
  it('registers a book and omits an empty ISBN', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    let posted: unknown;
    server.use(
      http.post('/api/assets', async ({ request }) => {
        posted = await request.json();
        return contractJson('POST', '/assets', 201, asset);
      }),
    );
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<AssetForm onCreated={onCreated} />);
    await fill(user);
    await submit(user);
    expect(await screen.findByRole('status')).toHaveTextContent('Book registered.');
    expect(posted).toEqual({ title: 'Dune', author: 'Frank Herbert', status: 'available' });
    expect(onCreated).toHaveBeenCalledWith(asset);
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Author')).toHaveValue('');
    expect(screen.getByLabelText('ISBN (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Status')).toHaveValue('available');
  });

  it('sends the ISBN and status when given', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    let posted: unknown;
    server.use(
      http.post('/api/assets', async ({ request }) => {
        posted = await request.json();
        return contractJson('POST', '/assets', 201, asset);
      }),
    );
    const user = userEvent.setup();
    render(<AssetForm onCreated={() => {}} />);
    await fill(user);
    await user.type(screen.getByLabelText('ISBN (optional)'), '9780306406157');
    await user.selectOptions(screen.getByLabelText('Status'), 'Lost');
    await submit(user);
    await screen.findByRole('status');
    expect(posted).toEqual({ title: 'Dune', author: 'Frank Herbert', isbn: '9780306406157', status: 'lost' });
  });

  it('shows server validation issues next to their fields', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    server.use(
      http.post('/api/assets', () =>
        contractJson('POST', '/assets', 400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request is invalid',
            details: [
              { field: 'title', issue: 'must be 1-200 characters' },
              { field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' },
              { field: 'status', issue: 'must be one of available, on_loan, lost' },
              { field: 'author', issue: 'is required and must be a string' },
            ],
          },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<AssetForm onCreated={() => {}} />);
    await submit(user);
    expect(await screen.findByText('must be 1-200 characters')).toHaveAttribute('id', 'title-error');
    const title = screen.getByLabelText('Title');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAttribute('aria-describedby', 'title-error');
    expect(screen.getByLabelText('Author')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('ISBN (optional)')).toHaveAttribute('aria-describedby', 'isbn-error');
    expect(screen.getByLabelText('Status')).toHaveAttribute('aria-describedby', 'status-error');
    expect(screen.getByText('must be a valid ISBN-10 or ISBN-13')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the general alert as well for body-level validation issues, and clears on resubmit', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    server.use(
      http.post('/api/assets', () =>
        contractJson('POST', '/assets', 400, {
          error: { code: 'VALIDATION_ERROR', message: 'Request is invalid', details: [{ field: 'body', issue: 'is not allowed' }] },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<AssetForm onCreated={() => {}} />);
    await submit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not register the book. Please try again.');
    server.use(http.post('/api/assets', () => contractJson('POST', '/assets', 201, asset)));
    await submit(user);
    expect(await screen.findByRole('status')).toHaveTextContent('Book registered.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the duplicate ISBN message', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    server.use(
      http.post('/api/assets', () =>
        contractJson('POST', '/assets', 409, { error: { code: 'CONFLICT', message: 'An asset with this ISBN already exists' } }),
      ),
    );
    const user = userEvent.setup();
    render(<AssetForm onCreated={() => {}} />);
    await submit(user);
    expect(await screen.findByText('A book with this ISBN is already registered.')).toHaveAttribute('id', 'isbn-error');
    expect(screen.getByLabelText('ISBN (optional)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the general alert for other errors', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    server.use(
      http.post('/api/assets', () =>
        contractJson('POST', '/assets', 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }),
      ),
    );
    const user = userEvent.setup();
    render(<AssetForm onCreated={() => {}} />);
    await submit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not register the book. Please try again.');
  });

  it('shows the general alert on a network failure and disables the button while submitting', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    server.use(http.post('/api/assets', () => HttpResponse.error()));
    const user = userEvent.setup();
    render(<AssetForm onCreated={() => {}} />);
    await submit(user);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register book' })).toBeEnabled();
  });
});
