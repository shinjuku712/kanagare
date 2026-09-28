import { useState } from 'react';
import { login } from '../store.ts';
import { Logo } from './ui.tsx';
import { brand } from '../brand.ts';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        <span className="logo">
          <Logo size={64} />
        </span>
        <h1>{brand.name}</h1>
        <p>Sign in to continue</p>
        <form onSubmit={submit}>
          <input
            className="field"
            type="email"
            placeholder="Email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="field"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {/* Only occupy space when there's something to say. */}
        {error && (
          <div className="login-err" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
