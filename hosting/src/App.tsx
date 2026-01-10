import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
  const [showAboutFirst, setShowAboutFirst] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
      if (!user) {
        setShowAboutFirst(false);
        setProfileChecked(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Check profile once when user signs in
  useEffect(() => {
    async function checkProfile() {
      if (!user || profileChecked) return;

      console.log('[App] Checking profile for user:', user.uid);
      try {
        const profile = await getUserProfile();
        console.log('[App] Profile response:', profile);
        console.log('[App] hasSeenAbout value:', profile.hasSeenAbout, 'type:', typeof profile.hasSeenAbout);

        if (!profile.hasSeenAbout) {
          console.log('[App] First time user - showing about page');
          setShowAboutFirst(true);
          console.log('[App] Calling markAboutAsSeenAPI...');
          const result = await markAboutAsSeenAPI();
          console.log('[App] markAboutAsSeenAPI result:', result);
        } else {
          console.log('[App] User has already seen about page');
        }
      } catch (err) {
        console.error('[App] Failed to check profile:', err);
      } finally {
        setProfileChecked(true);
      }
    }

    checkProfile();
  }, [user, profileChecked]);

  const handleGetStarted = () => {
    setShowAboutFirst(false);
  };

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

  // Wait for profile check before showing the app
  if (!profileChecked) {
    return <div className="loading">Loading...</div>;
  }

  // First time user - show About page before anything else
  if (showAboutFirst) {
    return (
      <div className="app">
        <main className="main">
          <AboutView isFirstTime={true} onGetStarted={handleGetStarted} />
        </main>
      </div>
    );
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
          <Route path="/" element={<TodayView />} />
          <Route path="/arc" element={<ArcView />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/history/:date/conversation" element={<ConversationHistoryView />} />
          <Route path="/about" element={<AboutView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
