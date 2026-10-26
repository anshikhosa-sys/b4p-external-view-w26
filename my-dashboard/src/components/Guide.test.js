import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Guide from './Guide';

test('the guide is four short steps and a way to the supplies', () => {
  render(<Guide contactEmail="contact@b4pglobal.org" signedIn={false} />);
  expect(screen.getByRole('heading', { level: 1, name: 'How to request supplies' })).toHaveFocus();
  const steps = ['Sign in', 'Add what you need', 'Review and send', 'Follow your request'];
  steps.forEach((title, i) => {
    expect(screen.getByRole('heading', { level: 2, name: `Step ${i + 1}: ${title}` })).toBeInTheDocument();
  });
  for (const link of screen.getAllByRole('link', { name: 'Browse supplies' })) expect(link).toHaveAttribute('href', '#/supplies');
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '#/signin');
});

test('signed-in clinics don’t see the Sign in button', () => {
  render(<Guide contactEmail="contact@b4pglobal.org" signedIn />);
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
});

test('each step has described screenshots; the questions stay folded until opened', () => {
  render(<Guide contactEmail="contact@b4pglobal.org" signedIn={false} />);
  const cards = screen.getAllByRole('listitem').filter((li) => li.classList.contains('guide__card'));
  expect(cards).toHaveLength(4);
  for (const card of cards) {
    const shots = card.querySelectorAll('img');
    expect(shots.length).toBeGreaterThanOrEqual(1);
    for (const img of shots) expect(img.getAttribute('alt').length).toBeGreaterThan(30);
  }
  const question = screen.getByText('Something else is wrong.').closest('details');
  expect(question).not.toHaveAttribute('open');
  userEvent.click(screen.getByText('Something else is wrong.'));
  expect(question).toHaveAttribute('open');
  expect(screen.getAllByRole('link', { name: 'contact@b4pglobal.org' }).length).toBeGreaterThan(0);
});
