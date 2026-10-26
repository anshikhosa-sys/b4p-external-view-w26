import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamSignIn from './TeamSignIn';

const reply = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
afterEach(() => jest.restoreAllMocks());

test('someone not on the member list is told so plainly', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => reply(403, { detail: 'This email isn’t on the Blueprints member list.' }));
  render(<TeamSignIn onSignedIn={jest.fn()} />);
  userEvent.type(screen.getByLabelText('Your email'), 'clinic@riverside.org');
  userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
  expect(await screen.findByText('This email isn’t on the Blueprints member list.')).toBeInTheDocument();
});

test('a member gets a code (shown in preview) and is signed in', async () => {
  const onSignedIn = jest.fn();
  jest.spyOn(global, 'fetch').mockImplementation((url) => (String(url).endsWith('/sign-in')
    ? reply(200, { sent: true, preview_code: '482913' })
    : reply(200, { token: 'tok', role: 'hq', name: 'Rhea Chokhalingam', email: 'rchokha@umich.edu', position: 'Member' })));
  render(<TeamSignIn onSignedIn={onSignedIn} />);
  userEvent.type(screen.getByLabelText('Your email'), 'rchokha@umich.edu');
  userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
  expect(await screen.findByText('482913')).toBeInTheDocument();
  userEvent.type(screen.getByLabelText('Code from the email'), '482913');
  userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: 'Checking…' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 0));
  expect(onSignedIn).toHaveBeenCalledWith({ token: 'tok', name: 'Rhea Chokhalingam', email: 'rchokha@umich.edu', position: 'Member' });
});
