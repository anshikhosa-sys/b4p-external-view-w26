import { cleanEmail, codeError, emailError, emailTypo, passwordChecks, validateNewPassword, validateSignIn } from './validate';

test('emails are trimmed and lowercased before checking', () => {
  expect(cleanEmail('  Ana@Clinic.ORG ')).toBe('ana@clinic.org');
  expect(emailError(' ana@clinic.org ')).toBeNull();
});

test('sign-in needs a real-looking email and a password', () => {
  expect(validateSignIn({ email: '', password: '' })).toEqual({ email: expect.any(String), password: expect.any(String) });
  expect(validateSignIn({ email: 'ana@clinic', password: 'x' }).email).toMatch(/email address/);
  expect(validateSignIn({ email: 'ana@clinic.org', password: 'x'.repeat(129) }).password).toMatch(/128/);
  expect(validateSignIn({ email: 'ana@clinic.org', password: 'anything' })).toEqual({});
});

test('new passwords: length, not the email, not common', () => {
  const ok = (p) => passwordChecks(p, 'ana.morales@clinic.org').every((c) => c.ok);
  expect(ok('short')).toBe(false);
  expect(ok('ana.morales-2026')).toBe(false);
  expect(ok('password123')).toBe(false);
  expect(ok('aaaaaaaaaaaa')).toBe(false);
  expect(ok('river bend supplies')).toBe(true);
});

test('the two passwords must match', () => {
  const base = { email: 'ana@clinic.org', password: 'river bend supplies' };
  expect(validateNewPassword({ ...base, confirm: 'river bend' }).confirm).toMatch(/match/);
  expect(validateNewPassword({ ...base, confirm: base.password })).toEqual({});
});

test('common email typos get a suggestion; real addresses don’t', () => {
  expect(emailTypo('ana@gmial.com')).toBe('ana@gmail.com');
  expect(emailTypo('Ana@Gmail.con')).toBe('ana@gmail.com');
  expect(emailTypo('ana@hotmal.com')).toBe('ana@hotmail.com');
  expect(emailTypo('ana@riverside.ogr')).toBe('ana@riverside.org');
  for (const ok of ['ana@gmail.com', 'ana@mail.com', 'ana@ymail.com', 'ana@riverside.org', 'ana@clinic.co', 'ana@clinic']) {
    expect(emailTypo(ok)).toBeNull();
  }
});

test('reset codes are six digits; spaces are fine', () => {
  expect(codeError('042 913')).toBeNull();
  expect(codeError('')).toMatch(/6-digit/);
  expect(codeError('12345')).toMatch(/6 numbers/);
  expect(codeError('12345a')).toMatch(/6 numbers/);
});
