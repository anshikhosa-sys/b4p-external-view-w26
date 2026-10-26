import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home, { pickShelf, shuffle } from './Home';

test('the home page: welcome, Request supplies, the short overview and a link to the full guide', () => {
  render(<Home />);
  expect(screen.getByRole('heading', { level: 1, name: 'Welcome, clinic' })).toHaveFocus();
  expect(screen.getAllByRole('link', { name: 'Request supplies' })[0]).toHaveAttribute('href', '#/supplies');
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '#/signin');
  expect(screen.getByRole('heading', { level: 2, name: 'How a request travels' })).toBeInTheDocument();
  ['Sign in', 'Fill your list', 'Send it', 'We pack and ship'].forEach((name) => {
    expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument();
  });
  expect(screen.getByRole('link', { name: 'Read the full step-by-step guide' })).toHaveAttribute('href', '#/guide');
});

test('a signed-in clinic is welcomed by name and doesn’t see the Sign in link', () => {
  render(<Home clinic="Riverside Community Clinic" />);
  expect(screen.getByRole('heading', { level: 1, name: 'Welcome, Riverside Community Clinic' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
});

const product = (id, subcategory, quantity, photoId = `photo${id}xxxxxxxxxxxxxxxxxxxx`) => ({
  id: `p${id}`, name: `Supply ${id}`, subcategory, quantity, expiryState: null, onHold: false,
  lots: [{ id, photoId, quantity, expiryState: null }],
});

// A small seeded random number generator, so the random picks are the same on every test run.
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('shuffle is a proper shuffle: same items, order from the random function', () => {
  const list = [1, 2, 3, 4, 5, 6];
  const a = shuffle(list, seeded(7));
  expect([...a].sort()).toEqual(list);
  expect(shuffle(list, seeded(7))).toEqual(a);
  expect(shuffle(list, seeded(99))).not.toEqual(a);
  expect(list).toEqual([1, 2, 3, 4, 5, 6]); // the original is left alone
});

test('the shelf picks in-stock supplies with photos, spread across categories', () => {
  const products = [
    product(1, 'Gloves', 90), product(2, 'Gloves', 80), product(3, 'Gloves', 70),
    product(4, 'IV Supplies', 5), product(5, 'Sutures', 3), product(6, 'Sutures', 0),
    product(7, 'Masks', 9, ''), product(8, 'Airway', 2), product(9, 'Gloves', 60), product(10, 'Gloves', 50),
  ];
  const six = pickShelf(products, 6, seeded(3));
  expect(six).toHaveLength(6);
  const cats = (picks) => picks.map((x) => products.find((p) => p.id === x.id).subcategory);
  expect(new Set(cats(six.slice(0, 4)))).toEqual(new Set(['Gloves', 'IV Supplies', 'Sutures', 'Airway'])); // one of each first
  expect(six.map((s) => s.row)).not.toContain(6); // out of stock
  expect(six.map((s) => s.row)).not.toContain(7); // no photo
  expect(pickShelf(products, 18, seeded(3))).toHaveLength(8); // every eligible supply, no more
  expect(pickShelf(products, 6, seeded(3))).toEqual(six); // same random numbers, same picks
  expect(pickShelf(products, 6, seeded(4)).map((s) => s.id)).not.toEqual(six.map((s) => s.id)); // different visit, different set
});

test('last visit’s supplies are shown only when there aren’t enough others', () => {
  const products = [1, 2, 3, 4, 5, 6].map((i) => product(i, `Cat ${i % 3}`, 10));
  const avoid = new Set(['p1', 'p2', 'p3']);
  const picks = pickShelf(products, 3, seeded(5), avoid).map((s) => s.id);
  expect(picks.sort()).toEqual(['p4', 'p5', 'p6']);
  expect(pickShelf(products, 5, seeded(5), avoid)).toHaveLength(5); // tops up from last visit's
});

test('no photos (or still loading): no shelf, the rest of the page still works', () => {
  render(<Home products={[]} />);
  expect(screen.queryByRole('list', { name: 'Some supplies on our shelves' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'How a request travels' })).toBeInTheDocument();
});

test('each shelf photo links to its supply', () => {
  render(<Home products={[product(3, 'Gloves', 79)]} />);
  const shelf = screen.getByRole('list', { name: 'Some supplies on our shelves' });
  expect(shelf.querySelector('a')).toHaveAttribute('href', '#/item/3');
  expect(screen.getByText(/Real photos of supplies on our shelves today\./)).toBeInTheDocument();
  expect(screen.getByText('Click a supply to view it.')).toBeInTheDocument();
});
