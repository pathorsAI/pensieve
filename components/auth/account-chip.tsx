/** Signed-in account chip on the auth screens: avatar initial + email + caption. */
export function AccountChip({ email, caption }: Readonly<{ email: string; caption: string }>) {
  return (
    <div className="auth-acct">
      <span className="av" aria-hidden="true">{email.slice(0, 1)}</span>
      <div><b>{email}</b><small>{caption}</small></div>
    </div>
  );
}
