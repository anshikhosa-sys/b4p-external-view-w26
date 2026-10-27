import { cleanEmail, codeError, emailError, emailTypo } from './validate';

test('emails are trimmed and lowercased before checking', () => {
  expect(cleanEmail('  Ana@Clinic.ORG ')).toBe('ana@clinic.org');
  expect(emailError(' ana@clinic.org ')).toBeNull();
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

test('sign-in codes are six digits; spaces are fine', () => {
  expect(codeError('042 913')).toBeNull();
  expect(codeError('')).toMatch(/6-digit/);
  expect(codeError('12345')).toMatch(/6 numbers/);
  expect(codeError('12345a')).toMatch(/6 numbers/);
});
