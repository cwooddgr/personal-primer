import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, User, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import TodayView from './views/TodayView';
import HistoryView from './views/HistoryView';
import ArcView from './views/ArcView';
import ConversationHistoryView from './views/ConversationHistoryView';
import AboutView from './views/AboutView';
import { register, forgotPassword, getUserProfile, markAboutAsSeen as markAboutAsSeenAPI } from './api/client';

// Firebase config - replace with your project's config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

type AuthView = 'login' | 'signup' | 'forgot-password';

function AuthForm({ onLogin }: { onLogin: () => void }) {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[AuthForm] Attempting sign in:', email);
    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log('[AuthForm] Sign in successful');
      onLogin();
    } catch (err) {
      console.error('[AuthForm] Sign in failed:', err);
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      await register(email, password);
      // Auto-login after successful registration
      await signInWithEmailAndPassword(auth, email, password);
      onLogin();
    } catch (err) {
      console.error('[AuthForm] Registration failed:', err);
      setError(err instanceof Error ? err.message : 'Registration failed');
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await forgotPassword(email);
      setSuccess(result.message);
    } catch (err) {
      console.error('[AuthForm] Forgot password failed:', err);
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const switchView = (newView: AuthView) => {
    resetForm();
    setView(newView);
  };

  return (
    <div className="login-container">
      <h1>Primer</h1>

      {view === 'login' && (
        <form onSubmit={handleLogin} className="login-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <div className="auth-links">
            <button type="button" className="link-button" onClick={() => switchView('signup')}>
              Create account
            </button>
            <button type="button" className="link-button" onClick={() => switchView('forgot-password')}>
              Forgot password?
            </button>
          </div>
        </form>
      )}

      {view === 'signup' && (
        <form onSubmit={handleSignup} className="login-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          <div className="auth-links">
            <button type="button" className="link-button" onClick={() => switchView('login')}>
              Back to sign in
            </button>
          </div>
        </form>
      )}

      {view === 'forgot-password' && (
        <form onSubmit={handleForgotPassword} className="login-form">
          <p className="form-description">
            Enter your email address and we'll send you a link to reset your password.
          </p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
          />
          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
          <div className="auth-links">
            <button type="button" className="link-button" onClick={() => switchView('login')}>
              Back to sign in
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSeenAbout, setHasSeenAbout] = useState<boolean | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    console.log('[App] Setting up auth state listener...');
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('[App] Auth state changed:', user ? { uid: user.uid, email: user.email } : 'signed out');
      setUser(user);
      setLoading(false);
      // Reset profile state when user changes
      if (!user) {
        setHasSeenAbout(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch user profile when user is authenticated
  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;

      setProfileLoading(true);
      try {
        const profile = await getUserProfile();
        console.log('[App] User profile loaded:', profile);
        setHasSeenAbout(profile.hasSeenAbout);
      } catch (err) {
        console.error('[App] Failed to load profile:', err);
        // On error, assume they've seen it to avoid blocking access
        setHasSeenAbout(true);
      } finally {
        setProfileLoading(false);
      }
    }

    fetchProfile();
  }, [user]);

  const markAboutAsSeen = useCallback(() => {
    // Fire and forget - no need to wait
    markAboutAsSeenAPI()
      .then(() => {
        setHasSeenAbout(true);
      })
      .catch((err) => {
        console.error('[App] Failed to mark about as seen:', err);
        // Still update local state
        setHasSeenAbout(true);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log('[App] Signed out');
    } catch (err) {
      console.error('[App] Sign out failed:', err);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <AuthForm onLogin={() => {}} />;
  }

  // Wait for profile to load before showing the app
  if (profileLoading || hasSeenAbout === null) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-links">
          <a href="/">Today</a>
          <a href="/arc">Arc</a>
          <a href="/history">History</a>
        </div>
        <div className="nav-right">
          <a href="/about">About</a>
          <button className="logout-link" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <main className="main">
        <Routes>
          <Route
            path="/"
            element={
              hasSeenAbout ? (
                <TodayView />
              ) : (
                <Navigate to="/about" replace />
              )
            }
          />
          <Route path="/arc" element={<ArcView />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/history/:date/conversation" element={<ConversationHistoryView />} />
          <Route
            path="/about"
            element={
              <AboutView
                isFirstTime={!hasSeenAbout}
                onMarkSeen={markAboutAsSeen}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
