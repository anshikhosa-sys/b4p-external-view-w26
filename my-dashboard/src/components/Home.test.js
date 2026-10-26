import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home, { pickShelf } from './Home';

test('the home page: welcome, Request supplies, the short overview and a link to the full guide', () => {
  render(<Home signedIn={false} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Free medical supplies, straight from our warehouse' })).toHaveFocus();
  expect(screen.getAllByRole('link', { name: 'Request supplies' })[0]).toHaveAttribute('href', '#/supplies');
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '#/signin');
  expect(screen.getByRole('heading', { level: 2, name: 'How a request travels' })).toBeInTheDocument();
  ['Sign in', 'Fill your list', 'Send it', 'We pack and ship'].forEach((name) => {
    expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument();
  });
  expect(screen.getByRole('link', { name: 'Read the full step-by-step guide' })).toHaveAttribute('href', '#/guide');
});

test('signed-in clinics don’t see the Sign in link', () => {
  render(<Home signedIn />);
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
});

const product = (id, subcategory, quantity, photoId = `photo${id}xxxxxxxxxxxxxxxxxxxx`) => ({
  id: `p${id}`, name: `Supply ${id}`, subcategory, quantity, expiryState: null, onHold: false,
  lots: [{ id, photoId, quantity, expiryState: null }],
});

test('the shelf shows six in-stock supplies with photos, one per category first', () => {
  const products = [
    product(1, 'Gloves', 90), product(2, 'Gloves', 80), product(3, 'Gloves', 70),
    product(4, 'IV Supplies', 5), product(5, 'Sutures', 3), product(6, 'Sutures', 0),
    product(7, 'Masks', 9, ''), product(8, 'Airway', 2), product(9, 'Gloves', 60), product(10, 'Gloves', 50),
  ];
  const six = pickShelf(products, 6);
  expect(six).toHaveLength(6);
  expect(pickShelf(products)).toHaveLength(8); // up to 18: every in-stock supply with a photo
  expect(six.slice(0, 4).map((s) => s.row)).toEqual([1, 4, 5, 8]); // one per category, most stocked first
  expect(six.map((s) => s.row)).not.toContain(6); // out of stock
  expect(six.map((s) => s.row)).not.toContain(7); // no photo
  expect(six[0]).toEqual({ id: 'p1', name: 'Supply 1', row: 1, photoId: 'photo1xxxxxxxxxxxxxxxxxxxx' });
});

test('no photos (or still loading): no shelf, the rest of the page still works', () => {
  render(<Home signedIn={false} products={[]} />);
  expect(screen.queryByRole('list', { name: 'Some supplies on our shelves' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'How a request travels' })).toBeInTheDocument();
});

test('each shelf photo links to its supply', () => {
  render(<Home signedIn={false} products={[product(3, 'Gloves', 79)]} />);
  const shelf = screen.getByRole('list', { name: 'Some supplies on our shelves' });
  expect(shelf.querySelector('a')).toHaveAttribute('href', '#/item/3');
  expect(screen.getByText(/Real photos of supplies on our shelves today\./)).toBeInTheDocument();
  expect(screen.getByText('Click a supply to view it.')).toBeInTheDocument();
});
