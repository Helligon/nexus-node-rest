import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mswHttp } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { contractJson, server } from './test/server';

const make = (n: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  title: `Book ${n}`,
  author: `Author ${n}`,
  isbn: null,
  status: 'available',
  createdAt: '2026-01-0' + n + 'T00:00:00.000Z',
  ...over,
});

const list = (data: unknown[]) => contractJson('GET', '/assets', 200, { data });

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders books from the API', async () => {
    server.use(mswHttp.get('*/api/assets', () => list([make(1), make(2, { isbn: '9780306406157', status: 'on_loan' })])));
    render(<App />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    const table = await screen.findByRole('table');
    expect(screen.getByRole('heading', { name: 'Library assets' })).toBeInTheDocument();
    for (const h of ['Title', 'Author', 'ISBN', 'Status', 'Added']) {
      expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Book 1',
      'Author 1',
      '—',
      'Available',
      '2026-01-01',
    ]);
    expect(within(rows[2]!).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Book 2',
      'Author 2',
      '9780306406157',
      'On loan',
      '2026-01-02',
    ]);
  });

  it('filters by author after the debounce', async () => {
    const seen: string[] = [];
    server.use(
      mswHttp.get('*/api/assets', ({ request }) => {
        seen.push(new URL(request.url).search);
        return list([make(1)]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('table');
    await user.type(screen.getByLabelText('Filter by author'), ' Ann ');
    expect(seen).toEqual(['']);
    await waitFor(() => expect(seen).toEqual(['', '?author=Ann']), { timeout: 2000 });
  });

  it('filters by status immediately', async () => {
    const seen: string[] = [];
    server.use(
      mswHttp.get('*/api/assets', ({ request }) => {
        seen.push(new URL(request.url).search);
        return list([make(1)]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'Lost');
    await waitFor(() => expect(seen).toEqual(['', '?status=lost']));
  });

  it('shows the empty state', async () => {
    server.use(mswHttp.get('*/api/assets', () => list([])));
    render(<App />);
    expect(await screen.findByText('No books match these filters.')).toBeInTheDocument();
  });

  it('shows the load error', async () => {
    server.use(
      mswHttp.get('*/api/assets', () =>
        contractJson('GET', '/assets', 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }),
      ),
    );
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load books.');
  });

  it('refreshes the list after registering a book', async () => {
    let books = [make(1)];
    server.use(
      mswHttp.get('*/api/assets', () => list(books)),
      mswHttp.post('*/api/assets', () => {
        const created = make(2);
        books = [...books, created];
        return contractJson('POST', '/assets', 201, created);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Book 1');
    await user.type(screen.getByLabelText('Title'), 'Book 2');
    await user.type(screen.getByLabelText('Author'), 'Author 2');
    await user.click(screen.getByRole('button', { name: 'Register book' }));
    expect(await screen.findByText('Book 2', { selector: 'td' })).toBeInTheDocument();
    expect(screen.getByText('Book registered.')).toBeInTheDocument();
  });

  it('keeps the table visible while reloading', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      mswHttp.get('*/api/assets', async ({ request }) => {
        if (new URL(request.url).searchParams.has('status')) await gate;
        return list([make(1)]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'Lost');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    release();
  });

  it('ignores a stale response', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstAnswered = false;
    server.use(
      mswHttp.get('*/api/assets', async ({ request }) => {
        if (!new URL(request.url).searchParams.has('status')) {
          await gate;
          firstAnswered = true;
          return list([make(1, { title: 'Stale book' })]);
        }
        return list([make(2, { title: 'Fresh book', status: 'lost' })]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'Lost');
    expect(await screen.findByText('Fresh book')).toBeInTheDocument();
    release();
    await waitFor(() => expect(firstAnswered).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Fresh book')).toBeInTheDocument();
    expect(screen.queryByText('Stale book')).not.toBeInTheDocument();
  });
});
