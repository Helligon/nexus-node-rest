import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { contractJson, server } from './test/server';

const book = (n: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  title: `Book ${n}`,
  author: `Author ${n}`,
  isbn: null,
  status: 'available',
  createdAt: '2026-01-0' + n + 'T00:00:00.000Z',
  ...over,
});
const list = (data: unknown[]) => contractJson('GET', '/assets', 200, { data });

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('App', () => {
  it('renders books from the API', async () => {
    server.use(http.get('/api/assets', () => list([book(1, { isbn: '9780306406157', status: 'on_loan' }), book(2)])));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Library assets' })).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    const table = await screen.findByRole('table');
    for (const h of ['Title', 'Author', 'ISBN', 'Status', 'Added']) {
      expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getByText('Book 1')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('9780306406157')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('On loan')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('2026-01-01')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('—')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Available')).toBeInTheDocument();
  });

  it('filters by author after the debounce', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/assets', ({ request }) => {
        urls.push(request.url);
        return list([]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('No books match these filters.');
    await user.type(screen.getByLabelText('Filter by author'), ' Ann ');
    await waitFor(() => expect(urls.at(-1)).toContain('author=Ann'));
    expect(urls.every((u) => !u.includes('author=A&') && !u.endsWith('author=A'))).toBe(true);
    expect(urls.length).toBeLessThanOrEqual(2);
  });

  it('does not send filters that are blank after trimming', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/assets', ({ request }) => {
        urls.push(request.url);
        return list([]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('No books match these filters.');
    await user.type(screen.getByLabelText('Search titles'), '   ');
    await new Promise((r) => setTimeout(r, 500));
    expect(urls.every((u) => new URL(u).search === '')).toBe(true);
  });

  it('filters by status immediately', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/assets', ({ request }) => {
        urls.push(request.url);
        return list([]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('No books match these filters.');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'Lost');
    await waitFor(() => expect(urls.at(-1)).toContain('status=lost'));
  });

  it('shows the empty state', async () => {
    server.use(http.get('/api/assets', () => list([])));
    render(<App />);
    expect(await screen.findByText('No books match these filters.')).toBeInTheDocument();
  });

  it('shows the load error', async () => {
    server.use(
      http.get('/api/assets', () =>
        contractJson('GET', '/assets', 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }),
      ),
    );
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load books.');
  });

  it('refreshes the list after registering a book', async () => {
    let books = [book(1)];
    server.use(
      http.get('/api/assets', () => list(books)),
      http.post('/api/assets', () => {
        books = [...books, book(2)];
        return contractJson('POST', '/assets', 201, book(2));
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Book 1');
    await user.type(screen.getByLabelText('Title'), 'Book 2');
    await user.type(screen.getByLabelText('Author'), 'Author 2');
    await user.click(screen.getByRole('button', { name: 'Register book' }));
    expect(await screen.findByText('Book 2')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('keeps the table visible while reloading', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get('/api/assets', async ({ request }) => {
        if (new URL(request.url).searchParams.has('status')) {
          await gate;
          return list([book(2)]);
        }
        return list([book(1)]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Book 1');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'Lost');
    expect(screen.getByText('Book 1')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    release();
    expect(await screen.findByText('Book 2')).toBeInTheDocument();
  });

  it('ignores a stale response', async () => {
    let releaseFirst: () => void = () => {};
    const first = new Promise<void>((resolve) => (releaseFirst = resolve));
    server.use(
      http.get('/api/assets', async ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        if (status === null) {
          await first;
          return list([book(1)]);
        }
        return list([book(2)]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'Lost');
    expect(await screen.findByText('Book 2')).toBeInTheDocument();
    releaseFirst();
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByText('Book 2')).toBeInTheDocument();
    expect(screen.queryByText('Book 1')).not.toBeInTheDocument();
  });

  it('ignores a stale error response', async () => {
    let releaseFirst: () => void = () => {};
    const first = new Promise<void>((resolve) => (releaseFirst = resolve));
    server.use(
      http.get('/api/assets', async ({ request }) => {
        if (new URL(request.url).searchParams.get('status') === null) {
          await first;
          return HttpResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, { status: 500 });
        }
        return list([book(2)]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'Lost');
    await screen.findByText('Book 2');
    releaseFirst();
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
