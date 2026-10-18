'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useText } from './Lang';
import { postJson } from './post';

type Field = 'email' | 'name' | 'terms';
type Errors = Partial<Record<Field | 'form', string>>;

const isField = (value: string | undefined): value is Field =>
  value === 'email' || value === 'name' || value === 'terms';

/** Email, name, optional invite and the terms box. The cabinet opens only after the letter. */
export function SignupForm() {
  const t = useText();
  const MESSAGES = t.signup.errors;
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [terms, setTerms] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const local: Errors = {};
    if (!email.trim()) local.email = MESSAGES.email;
    if (!name.trim() || name.trim().length > 60) local.name = MESSAGES.name;
    if (!terms) local.terms = MESSAGES.terms;
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    setSending(true);
    const { status, error } = await postJson('/api/pro/signup', {
      email: email.trim(),
      name: name.trim(),
      invite: invite.trim(),
      terms,
    });
    setSending(false);
    if (status === 202) return setSent(true);
    if (status === 400 && isField(error)) return setErrors({ [error]: MESSAGES[error] });
    setErrors({ form: t.common.tryLater });
  }

  const describe = (field: Field) => (errors[field] ? `signup-${field}-error` : undefined);
  const fieldError = (field: Field) =>
    errors[field] && (
      <span id={`signup-${field}-error`} className="field-error" role="alert">
        {errors[field]}
      </span>
    );

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="signup-email">{t.common.email}</label>
        <input
          id="signup-email"
          className="input"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describe('email')}
        />
        {fieldError('email')}
      </div>
      <div className="field">
        <label htmlFor="signup-name">{t.signup.name}</label>
        <input
          id="signup-name"
          className="input"
          autoComplete="organization"
          maxLength={60}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describe('name')}
        />
        {fieldError('name')}
      </div>
      <div className="field">
        <label htmlFor="signup-invite">{t.signup.invite}</label>
        <input
          id="signup-invite"
          className="input mono"
          autoComplete="off"
          autoCapitalize="characters"
          value={invite}
          onChange={(event) => setInvite(event.target.value)}
        />
      </div>
      <div className="field">
        <label className="check" htmlFor="signup-terms">
          <input
            id="signup-terms"
            type="checkbox"
            checked={terms}
            onChange={(event) => setTerms(event.target.checked)}
            aria-invalid={errors.terms ? true : undefined}
            aria-describedby={describe('terms')}
          />
          <span>
            {t.signup.termsBefore}
            <Link href="/terms">{t.signup.termsLink}</Link>
            {t.signup.termsAfter}
          </span>
        </label>
        {fieldError('terms')}
      </div>
      <button className="btn" type="submit" disabled={sending}>
        {t.signup.submit}
      </button>
      {errors.form && (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      )}
      {sent && (
        <div className="card notice" role="status">
          <strong>{t.signup.sentTitle}</strong>
          <span className="muted">{t.signup.sentText}</span>
        </div>
      )}
      <p className="muted alt">
        {t.signup.haveCabinet} <Link href="/login">{t.common.signIn}</Link>
      </p>
    </form>
  );
}
