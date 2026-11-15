import { Eye, EyeOff, Lock, LogIn, Mail, UserPlus } from 'lucide-react';
import { useState } from 'react';
import BrandMark from './BrandMark.jsx';
import { API_BASE_URL } from '../lib/api.js';
import { isAuthConfigured, signIn, signInWithGoogle as startGoogleSignIn, signUp } from '../lib/auth.js';

export default function AuthPanel({ locale = 'id', onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [isBusy, setIsBusy] = useState(false);
  const isId = locale === 'id';
  const copy = {
    unavailable: isId
      ? 'Layanan auth belum dikonfigurasi. Isi VITE_API_BASE_URL di environment aplikasi.'
      : 'Auth service is not configured yet. Fill VITE_API_BASE_URL in the app environment.',
    unavailableShort: isId ? 'Layanan auth belum dikonfigurasi.' : 'Auth service is not configured yet.',
    loginSuccess: isId ? 'Login berhasil.' : 'Signed in successfully.',
    registerSuccess: isId ? 'Register berhasil.' : 'Sign-up successful.',
    authFailed: isId ? 'Auth gagal.' : 'Authentication failed.',
    redirectingGoogle: isId ? 'Mengarahkan ke login Google...' : 'Redirecting to Google sign-in...',
    googleFailed: isId ? 'Login Google gagal.' : 'Google sign-in failed.',
    loginTab: isId ? 'Masuk' : 'Sign In',
    registerTab: isId ? 'Daftar' : 'Create Account',
    subtitle:
      mode === 'login'
        ? isId
          ? 'Masuk ke studio desain & kelola job Anda.'
          : 'Sign in to your studio and manage jobs.'
        : isId
          ? 'Buat akun baru dalam beberapa detik.'
          : 'Create a new account in seconds.',
    email: 'Email',
    password: isId ? 'Password' : 'Password',
    submitBusy: isId ? 'Memproses...' : 'Working...',
    submitLogin: isId ? 'Masuk dengan Email' : 'Sign in with email',
    submitRegister: isId ? 'Buat Akun Baru' : 'Create account',
    orDivider: isId ? 'atau' : 'or',
    googleButton: isId ? 'Lanjutkan dengan Google' : 'Continue with Google'
  };

  async function submit(event) {
    event.preventDefault();
    if (!isAuthConfigured) {
      setMessageTone('error');
      setMessage(copy.unavailable);
      return;
    }
    setIsBusy(true);
    setMessage('');
    try {
      const result = mode === 'login' ? await signIn({ email, password }) : await signUp({ email, password });
      if (result.data.session) onSignedIn?.(result.data.session);
      setMessageTone('success');
      setMessage(mode === 'login' ? copy.loginSuccess : copy.registerSuccess);
    } catch (error) {
      setMessageTone('error');
      setMessage(error.message || copy.authFailed);
    } finally {
      setIsBusy(false);
    }
  }

  function signInWithGoogle() {
    if (!isAuthConfigured) {
      setMessageTone('error');
      setMessage(copy.unavailableShort);
      return;
    }
    setIsBusy(true);
    setMessageTone('info');
    setMessage(copy.redirectingGoogle);
    try {
      startGoogleSignIn();
    } catch (error) {
      setMessageTone('error');
      setMessage(error.message || copy.googleFailed);
      setIsBusy(false);
    }
  }

  const googleAuthUrl = isAuthConfigured ? `${API_BASE_URL}/api/auth/google` : '';

  const googleIcon = (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );

  return (
    <section className="rounded-3xl border border-white/15 bg-slate-900/95 p-5 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-6">
      <div className="mb-5 space-y-3">
        <BrandMark compact dark className="justify-start" />
        <p className="text-sm text-slate-300">{copy.subtitle}</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-slate-950/80 p-1">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setMessage('');
          }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            mode === 'login' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          {copy.loginTab}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setMessage('');
          }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            mode === 'register' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {copy.registerTab}
        </button>
      </div>

      <form className="grid gap-3.5" onSubmit={submit}>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-300">{copy.email}</span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950/75 py-2.5 pl-10 pr-3.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/30"
              placeholder="nama@email.com"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-300">{copy.password}</span>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950/75 py-2.5 pl-10 pr-10 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/30"
              placeholder="••••••••"
              minLength={6}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:text-white"
              aria-label={showPassword ? (isId ? 'Sembunyikan password' : 'Hide password') : isId ? 'Lihat password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <button
          type="submit"
          disabled={isBusy}
          className="gradient-bg mt-1 inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:opacity-95 disabled:opacity-60"
        >
          {isBusy ? copy.submitBusy : mode === 'login' ? copy.submitLogin : copy.submitRegister}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
        <div className="h-px flex-1 bg-white/10" />
        <span>{copy.orDivider}</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <a
        href={googleAuthUrl || undefined}
        onClick={(event) => {
          event.preventDefault();
          if (!googleAuthUrl || isBusy) return;
          signInWithGoogle();
        }}
        className={`mt-3 inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold text-white transition-colors ${!googleAuthUrl || isBusy ? 'cursor-not-allowed border-white/20 bg-white/10 text-white/90' : 'border-white/25 bg-white/5 hover:bg-white/15'}`}
        aria-disabled={!googleAuthUrl || isBusy}
      >
        {googleIcon}
        {copy.googleButton}
      </a>

      {message && (
        <p
          className={`mt-3 rounded-xl border px-3.5 py-2.5 text-xs leading-5 ${
            messageTone === 'error'
              ? 'border-red-400/30 bg-red-500/10 text-red-200'
              : messageTone === 'success'
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                : 'border-white/15 bg-white/5 text-slate-200'
          }`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
