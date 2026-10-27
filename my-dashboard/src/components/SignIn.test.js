import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignIn } from './SignIn';

const CONTACT = 'contact@b4pglobal.org';

// A fake server: sign-in returns a ticket (and, in preview, the code); verify checks both.
function mockServer({ code = '123456', email = 'ana@clinic.org' } = {}) {
  const calls = [];
  jest.spyOn(global, 'fetch').mockImplementation((url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push([url.replace(/^.*?(\/api\/)/, '$1'), body]);
    const json = (status, data) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
    if (url.endsWith('/api/auth/sign-in')) return json(200, { sent: true, ticket: 'T', preview_code: code, minutes: 10 });
    if (url.endsWith('/api/auth/verify')) {
      return body.code === code && body.ticket === 'T'
        ? json(200, { token: 'S', email })
        : json(400, { detail: 'That code isn’t right. Check it and try again.' });
    }
    return json(404, {});
  });
  return calls;
}

afterEach(() => jest.restoreAllMocks());

const askForCode = (email = 'ana@clinic.org') => {
  userEvent.type(screen.getByLabelText('Your work email'), email);
  userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
};

test('checks the email before sending anything', () => {
  const calls = mockServer();
  render(<SignIn onSignedIn={jest.fn()} contactEmail={CONTACT} />);
  askForCode('ana@clinic');
  expect(screen.getByText(/doesn’t look like an email address/)).toBeInTheDocument();
  expect(calls).toEqual([]);
});

test('offers a fix for a mistyped email', () => {
  render(<SignIn onSignedIn={jest.fn()} contactEmail={CONTACT} />);
  userEvent.type(screen.getByLabelText('Your work email'), 'ana@gmial.com');
  userEvent.click(screen.getByRole('button', { name: 'Use this' }));
  expect(screen.getByLabelText('Your work email')).toHaveValue('ana@gmail.com');
});

test('email, then code, then the clinic name the first time', async () => {
  const calls = mockServer();
  const onSignedIn = jest.fn();
  render(<SignIn onSignedIn={onSignedIn} contactEmail={CONTACT} knownOrg={() => ''} />);
  askForCode('  Ana@Clinic.ORG ');
  expect(await screen.findByText('123456')).toBeInTheDocument(); // preview: the code is on the page
  expect(calls[0]).toEqual(['/api/auth/sign-in', { email: 'ana@clinic.org' }]);
  userEvent.type(screen.getByLabelText('Code from the email'), '123 456');
  userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByLabelText('Clinic name')).toHaveFocus();
  expect(calls[1]).toEqual(['/api/auth/verify', { email: 'ana@clinic.org', code: '123456', ticket: 'T' }]);
  userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('Enter your clinic’s name.')).toBeInTheDocument();
  userEvent.type(screen.getByLabelText('Clinic name'), 'Riverside Community Clinic');
  userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(onSignedIn).toHaveBeenCalledWith({ email: 'ana@clinic.org', token: 'S', org: 'Riverside Community Clinic' }, { welcome: true });
});

test('a clinic already known on this device skips the name step', async () => {
  mockServer();
  const onSignedIn = jest.fn();
  render(<SignIn onSignedIn={onSignedIn} contactEmail={CONTACT} knownOrg={(e) => (e === 'ana@clinic.org' ? 'Riverside' : '')} />);
  askForCode();
  userEvent.type(await screen.findByLabelText('Code from the email'), '123456');
  userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith({ email: 'ana@clinic.org', token: 'S', org: 'Riverside' }));
});

test('a wrong code says so and lets you try again', async () => {
  mockServer();
  render(<SignIn onSignedIn={jest.fn()} contactEmail={CONTACT} />);
  askForCode();
  userEvent.type(await screen.findByLabelText('Code from the email'), '12345');
  userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByText(/The code is 6 numbers/)).toBeInTheDocument();
  userEvent.type(screen.getByLabelText('Code from the email'), '9');
  userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('That code isn’t right. Check it and try again.')).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
  expect(screen.getByLabelText('Your work email')).toBeInTheDocument();
});

test('coming from Review, says the list is saved', () => {
  render(<SignIn next="review" lineCount={3} onSignedIn={jest.fn()} contactEmail={CONTACT} />);
  expect(screen.getByRole('heading', { name: 'Sign in to send your request' })).toBeInTheDocument();
  expect(screen.getByText(/Your list of 3 supplies is saved/)).toBeInTheDocument();
});
