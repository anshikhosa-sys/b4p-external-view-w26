import { render, screen } from '@testing-library/react';
import Guide from './Guide';

test('the guide lists every step and how to reach HQ', () => {
  render(<Guide contactEmail="contact@b4pglobal.org" signedIn={false} />);
  expect(screen.getByRole('heading', { level: 1, name: 'How to request supplies' })).toHaveFocus();
  for (const title of ['Set up your account', 'Sign in', 'Find a supply', 'Choose how many', 'Check your request', 'Send it', 'Follow your request']) {
    expect(screen.getByRole('heading', { level: 2, name: new RegExp(title) })).toBeInTheDocument();
  }
  expect(screen.getAllByRole('link', { name: 'contact@b4pglobal.org' }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('link', { name: 'Start a request' })[0]).toHaveAttribute('href', '#/');
});

test('signed-in clinics don’t see the Sign in button', () => {
  render(<Guide contactEmail="contact@b4pglobal.org" signedIn />);
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
});
