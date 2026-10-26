import { render, screen } from '@testing-library/react';
import Guide from './Guide';

const STEPS = ['Sign in', 'Find a supply', 'Open it', 'Add it', 'Choose how many', 'Open your list', 'Review it',
  'Send it', 'Watch your email', 'See past requests'];

test('the guide is ten steps, numbered, with signing in as one step', () => {
  render(<Guide contactEmail="contact@b4pglobal.org" />);
  expect(screen.getByRole('heading', { level: 1, name: 'How to request supplies' })).toHaveFocus();
  STEPS.forEach((title, i) => {
    expect(screen.getByRole('heading', { level: 2, name: `Step ${i + 1}: ${title}` })).toBeInTheDocument();
  });
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(10);
  expect(screen.queryByRole('navigation', { name: 'Jump to' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Back to top' })).not.toBeInTheDocument();
});

test('each step has one described screenshot, and the button names match the site', () => {
  render(<Guide contactEmail="contact@b4pglobal.org" />);
  const shots = screen.getAllByRole('img');
  expect(shots).toHaveLength(10);
  for (const img of shots) expect(img.getAttribute('alt').length).toBeGreaterThan(30);
  for (const label of ['Account', 'Sign in', 'Forgot password?', 'Request supplies', '+ Add to list', 'Your list',
    'Review and send', 'Send request', 'My requests']) {
    expect(screen.getAllByText(label, { selector: 'strong' }).length).toBeGreaterThan(0);
  }
});

test('ends with a short way to get help and a Request supplies button', () => {
  render(<Guide contactEmail="contact@b4pglobal.org" />);
  expect(screen.getByRole('link', { name: 'contact@b4pglobal.org' })).toHaveAttribute('href', 'mailto:contact@b4pglobal.org');
  expect(screen.getByRole('link', { name: 'Request supplies' })).toHaveAttribute('href', '#/supplies');
});
