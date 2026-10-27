import { fireEvent, render, screen } from '@testing-library/react';
import Home from './Home';

test('the home page: welcome, three steps, the demo video and where to start', () => {
  const { container } = render(<Home />);
  expect(screen.getByRole('heading', { level: 1, name: 'Welcome, clinic' })).toHaveFocus();
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByRole('link', { name: 'Request supplies' })).toHaveAttribute('href', '#/supplies');
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '#/signin');
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  const video = container.querySelector('video');
  expect(video).toHaveAttribute('preload', 'none'); // nothing downloads until someone presses play
  expect(video).toHaveAttribute('poster', '/demo.jpg');
  expect(screen.getByText('Watch how to request supplies (1 minute)')).toBeInTheDocument();
});

test('a signed-in clinic is welcomed by name and doesn’t see the Sign in button', () => {
  render(<Home clinic="Riverside Community Clinic" />);
  expect(screen.getByRole('heading', { level: 1, name: 'Welcome, Riverside Community Clinic' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
});

test('if the video file is missing, its box goes away and the steps stay', () => {
  const { container } = render(<Home />);
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  fireEvent.error(container.querySelector('source'));
  expect(screen.queryByText(/Watch how to request supplies/)).not.toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
});
