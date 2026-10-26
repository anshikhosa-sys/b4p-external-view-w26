import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEMO } from '../auth/mockAuth';
import { ForgotPassword, SignIn, Welcome } from './SignIn';

const CONTACT = 'contact@b4pglobal.org';
beforeEach(() => window.localStorage.clear());

const fill = (email, password) => {
  userEvent.clear(screen.getByLabelText('Email'));
  userEvent.type(screen.getByLabelText('Email'), email);
  userEvent.type(screen.getByLabelText('Password'), password);
  userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

test('checks the email before sending anything', () => {
  const onSignedIn = jest.fn();
  render(<SignIn onSignedIn={onSignedIn} contactEmail={CONTACT} />);
  fill('ana@clinic', 'whatever');
  expect(screen.getByText(/doesn’t look like an email address/)).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toHaveFocus();
  expect(onSignedIn).not.toHaveBeenCalled();
});

test('signs in with a trimmed, lowercased email', async () => {
  const onSignedIn = jest.fn();
  render(<SignIn onSignedIn={onSignedIn} contactEmail={CONTACT} />);
  fill('  Clinic@Riverside.ORG ', DEMO.password);
  await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ email: DEMO.email })), { timeout: 2000 });
});

test('a wrong password clears the field and says so, then five misses pause sign-in', async () => {
  render(<SignIn onSignedIn={jest.fn()} contactEmail={CONTACT} />);
  fill(DEMO.email, 'not-the-password');
  expect(await screen.findByText('That email and password don’t match.', {}, { timeout: 2000 })).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toHaveValue('');
  expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument();
  for (let i = 0; i < 4; i += 1) {
    userEvent.type(screen.getByLabelText('Password'), `wrong-${i}`);
    userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: 'Sign in' }, { timeout: 2000 }); // done sending
  }
  expect(await screen.findByText('Too many tries.', {}, { timeout: 2000 })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
});

test('invite setup shows the clinic and blocks weak or mismatched passwords', async () => {
  const onSignedIn = jest.fn();
  render(<Welcome token={DEMO.invite} onSignedIn={onSignedIn} contactEmail={CONTACT} />);
  expect(await screen.findByText('Hillside Health Center', {}, { timeout: 2000 })).toBeInTheDocument();
  userEvent.type(screen.getByLabelText('New password'), 'password123');
  userEvent.type(screen.getByLabelText('Confirm password'), 'password12');
  userEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
  expect(screen.getByText(/not a common password/)).toBeInTheDocument();
  expect(screen.getByText('The two passwords don’t match.')).toBeInTheDocument();
  expect(onSignedIn).not.toHaveBeenCalled();
});

test('an invite works until the account is set up, then says it was used', async () => {
  window.localStorage.clear();
  const { unmount } = render(<Welcome token="demo-invite" onSignedIn={jest.fn()} contactEmail={CONTACT} />);
  expect(await screen.findByRole('heading', { name: /^Welcome/ }, { timeout: 2000 })).toBeInTheDocument();
  unmount();

  window.localStorage.setItem('b4p.mock.accounts.v1', JSON.stringify({ 'nurse@hillside.org': { org: 'Hillside Health Center', name: 'Joseph', password: 'x' } }));
  render(<Welcome token="demo-invite" onSignedIn={jest.fn()} contactEmail={CONTACT} />);
  expect(await screen.findByText('This invite was already used', {}, { timeout: 2000 })).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: 'Reset this demo invite' }));
  expect(await screen.findByRole('heading', { name: /^Welcome/ }, { timeout: 2000 })).toBeInTheDocument();
  window.localStorage.clear();
});

test('a mistyped email provider gets a one-click fix', () => {
  render(<SignIn onSignedIn={jest.fn()} contactEmail={CONTACT} />);
  userEvent.type(screen.getByLabelText('Email'), 'ana@gmial.com');
  expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
  userEvent.tab();
  expect(screen.getByText('ana@gmail.com')).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Use this' }));
  expect(screen.getByLabelText('Email')).toHaveValue('ana@gmail.com');
  expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
});

test('forgot password: emailed code, then a new password, then signed in', async () => {
  const onSignedIn = jest.fn();
  render(<ForgotPassword onSignedIn={onSignedIn} contactEmail={CONTACT} />);
  userEvent.type(screen.getByLabelText('Email'), DEMO.email);
  userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
  expect(await screen.findByRole('heading', { name: 'Check your email' }, { timeout: 2000 })).toBeInTheDocument();
  const code = screen.getByText(/^\d{6}$/).textContent;

  userEvent.type(screen.getByLabelText('Code from the email'), code === '000000' ? '111111' : '000000');
  userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('That code isn’t right.', {}, { timeout: 2000 })).toBeInTheDocument();

  userEvent.type(screen.getByLabelText('Code from the email'), `${code.slice(0, 3)} ${code.slice(3)}`);
  userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByRole('heading', { name: 'Choose a new password' }, { timeout: 2000 })).toBeInTheDocument();
  userEvent.type(screen.getByLabelText('New password'), 'new river bend supplies');
  userEvent.type(screen.getByLabelText('Confirm password'), 'new river bend supplies');
  userEvent.click(screen.getByRole('button', { name: 'Save and sign in' }));
  await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ email: DEMO.email }), { reset: true }), { timeout: 2000 });
});

test('forgot password: an unknown email looks the same, and no code works for it', async () => {
  render(<ForgotPassword onSignedIn={jest.fn()} contactEmail={CONTACT} />);
  userEvent.type(screen.getByLabelText('Email'), 'nobody@clinic.org');
  userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
  expect(await screen.findByText(/we’ve emailed it a 6-digit code/, {}, { timeout: 2000 })).toBeInTheDocument();
  userEvent.type(screen.getByLabelText('Code from the email'), '123456');
  userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('That code has run out.', {}, { timeout: 2000 })).toBeInTheDocument();
});
