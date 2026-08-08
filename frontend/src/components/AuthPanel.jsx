import { LogIn } from 'lucide-react';
import { useState } from 'react';
import BrandMark from './BrandMark.jsx';
import { isSupabaseConfigured, supabase, SUPABASE_URL } from '../lib/supabase.js';

const runtimeConfig = window.__APP_CONFIG__ || {};
const GOOGLE_REDIRECT_TO = runtimeConfig.googleOAuthRedirectTo || import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_TO || window.location.origin;

function buildGoogleAuthUrl() {
  if (!SUPABASE_URL) return '';
  const authUrl = new URL(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/authorize`);
  authUrl.searchParams.set('provider', 'google');
  authUrl.searchParams.set('redirect_to', GOOGLE_REDIRECT_TO);
  return authUrl.toString();
}

export default function AuthPanel({ locale = 'id', onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const isId = locale === 'id';
  const copy = {
    unavailable: isId ? 'Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY di environment aplikasi.' : 'Supabase is not configured yet. Fill SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the app environment.',
    unavailableShort: isId ? 'Supabase belum dikonfigurasi.' : 'Supabase is not configured yet.',
    loginSuccess: isId ? 'Login berhasil.' : 'Signed in successfully.',
    registerSuccess: isId ? 'Register berhasil. Cek email jika konfirmasi diwajibkan.' : 'Sign-up successful. Check your email if confirmation is required.',
    authFailed: isId ? 'Auth gagal.' : 'Authentication failed.',
    redirectingGoogle: isId ? 'Mengarahkan ke login Google...' : 'Redirecting to Google sign-in...',
    googleFailed: isId ? 'Login Google gagal.' : 'Google sign-in failed.',
    title: mode === 'login' ? (isId ? 'Login' : 'Sign In') : isId ? 'Register' : 'Create Account',
    email: 'Email',
    password: isId ? 'Password' : 'Password',
    submitBusy: isId ? 'Memproses' : 'Working',
    submitLogin: isId ? 'Login email' : 'Sign in with email',
    submitRegister: isId ? 'Buat akun' : 'Create account',
    googleButton: isId ? 'Login dengan Google' : 'Continue with Google',
    switchToRegister: isId ? 'Belum punya akun? Register' : "Don't have an account? Create one",
    switchToLogin: isId ? 'Sudah punya akun? Login' : 'Already have an account? Sign in'
  };

  async function submit(event) {
    event.preventDefault();
    if (!isSupabaseConfigured) {
      setMessage(copy.unavailable);
      return;
    }
    setIsBusy(true);
    setMessage('');
    try {
      const result =
        mode === 'login'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (result.data.session) onSignedIn?.(result.data.session);
      setMessage(mode === 'login' ? copy.loginSuccess : copy.registerSuccess);
    } catch (error) {
      setMessage(error.message || copy.authFailed);
    } finally {
      setIsBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured) {
      setMessage(copy.unavailableShort);
      return;
    }
    setIsBusy(true);
    setMessage(copy.redirectingGoogle);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: GOOGLE_REDIRECT_TO,
        skipBrowserRedirect: true
      }
    });
    if (error) {
      setMessage(error.message || copy.googleFailed);
      setIsBusy(false);
      return;
    }
    window.location.href = data?.url || googleAuthUrl;
  }

  const googleAuthUrl = buildGoogleAuthUrl();

  const googleIcon = (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 space-y-3">
        <BrandMark compact className="justify-start" />
        <div className="flex items-center gap-2">
          <LogIn className="h-5 w-5 text-spruce" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">{copy.title}</h2>
        </div>
      </div>

      <form className="grid gap-3" onSubmit={submit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{copy.email}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
            placeholder="nama@email.com"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{copy.password}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
            minLength={6}
            required
          />
        </label>
        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex min-h-11 items-center justify-center border border-spruce bg-spruce px-4 py-2.5 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {isBusy ? copy.submitBusy : mode === 'login' ? copy.submitLogin : copy.submitRegister}
        </button>
      </form>

      <a
        href={googleAuthUrl || undefined}
        onClick={(event) => {
          event.preventDefault();
          if (!googleAuthUrl || isBusy) return;
          signInWithGoogle();
        }}
        className={`mt-3 inline-flex min-h-11 w-full items-center justify-center gap-3 border px-4 py-2.5 text-sm font-semibold text-white transition-colors ${!googleAuthUrl || isBusy ? 'cursor-not-allowed border-white/20 bg-white/10 text-white/90' : 'border-white/30 bg-white/5 hover:bg-white/10'}`}
        aria-disabled={!googleAuthUrl || isBusy}
      >
        {googleIcon}
        {copy.googleButton}
      </a>

      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        className="mt-3 text-sm font-semibold text-spruce"
      >
        {mode === 'login' ? copy.switchToRegister : copy.switchToLogin}
      </button>

      {message && <p className="mt-3 border border-line bg-panel px-3 py-2 text-sm text-gray-700">{message}</p>}
    </section>
  );
}
