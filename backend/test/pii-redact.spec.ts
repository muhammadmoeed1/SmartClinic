import { redactPii } from '../src/common/pii-redact';

describe('redactPii', () => {
  it('redacts an email address', () => {
    const { redacted, found } = redactPii('Contact me at ali.khan@example.com please');
    expect(redacted).toBe('Contact me at [REDACTED_EMAIL] please');
    expect(found).toContain('email');
  });

  it('redacts a Pakistani CNIC number', () => {
    const { redacted, found } = redactPii('My CNIC is 42101-1234567-1');
    expect(redacted).toBe('My CNIC is [REDACTED_CNIC]');
    expect(found).toContain('cnic');
  });

  it('redacts a phone number', () => {
    const { redacted, found } = redactPii('Call me on +92-300-1234567 tonight');
    expect(redacted).toContain('[REDACTED_PHONE]');
    expect(found).toContain('phone');
  });

  it('leaves ordinary clinical text untouched', () => {
    const text = 'Patient reports lower back pain for 5 days, severity 7/10, no fever.';
    const { redacted, found } = redactPii(text);
    expect(redacted).toBe(text);
    expect(found).toEqual([]);
  });
});
