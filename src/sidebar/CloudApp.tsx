import { useEffect, useMemo, useState } from 'react';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import { ConvexReactClient, useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { createChatSync } from '../services/chatSync';
import type { CloudAccountInfo } from '../services/types';
import App from './App';

// This is a public client endpoint, not a credential. The environment value
// remains an override for builds that target another Convex deployment.
const url = (import.meta.env.VITE_CONVEX_URL as string | undefined)
  || 'https://decisive-puma-800.convex.cloud';
const client = url ? new ConvexReactClient(url) : null;

function SignIn({ onClose }: { onClose: () => void }) {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="fixed inset-0 z-[100] bg-bg/95 flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-labelledby="account-title">
    <form className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-5" onSubmit={async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      if (flow === 'signUp' && data.get('password') !== data.get('confirm')) { setError('Passwords do not match.'); return; }
      setBusy(true); setError('');
      try {
        await signIn('password', { email: String(data.get('email')).trim().toLowerCase(), password: String(data.get('password')), flow });
      } catch { setError(flow === 'signIn' ? 'Could not sign in. Check your email and password, then try again.' : 'Could not create your account. Try signing in if you already have one.'); }
      finally { setBusy(false); }
    }}>
      <h1 id="account-title" className="text-lg font-semibold">{flow === 'signIn' ? 'Sign in to Nerdbot' : 'Create your Nerdbot account'}</h1>
      <p className="text-sm text-muted">Use the same account on your phone and extension to sync text conversations, projects, and pins.</p>
      <label className="block text-sm">Email<input autoFocus required name="email" type="email" autoComplete="email" className="mt-1 w-full rounded-lg border border-border bg-bg p-3" /></label>
      <label className="block text-sm">Password<input required name="password" type="password" minLength={flow === 'signUp' ? 12 : undefined} maxLength={128} autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'} className="mt-1 w-full rounded-lg border border-border bg-bg p-3" /></label>
      {flow === 'signUp' && <><label className="block text-sm">Confirm password<input required name="confirm" type="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-border bg-bg p-3" /></label><p className="text-xs text-muted">Use 12–128 characters. Save your password: email recovery is not available in this preview.</p></>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button disabled={busy} type="submit" className="w-full min-h-11 rounded-lg bg-accent text-white disabled:opacity-50">{busy ? 'Please wait…' : flow === 'signIn' ? 'Sign in' : 'Create account'}</button>
      <button disabled={busy} type="button" className="w-full text-sm text-accent min-h-10" onClick={() => { setFlow(flow === 'signIn' ? 'signUp' : 'signIn'); setError(''); }}>{flow === 'signIn' ? 'Create an account' : 'Already have an account? Sign in'}</button>
      <button disabled={busy} type="button" className="w-full text-sm text-muted min-h-10" onClick={onClose}>Continue on this device</button>
    </form>
  </div>;
}

function AccountSession({ user }: { user: { id: string; email: string } }) {
  const { signOut } = useAuthActions();
  const sync = useMemo(() => createChatSync(client!, user.id), [user.id]);
  const [status, setStatus] = useState(sync.getStatus());
  const [accountError, setAccountError] = useState('');

  useEffect(() => {
    const unsubscribe = sync.subscribe(() => setStatus({ ...sync.getStatus() }));
    const stop = sync.start();
    return () => {
      unsubscribe();
      stop();
    };
  }, [sync]);

  const handleSignOut = async () => {
    if (
      status.pending &&
      !window.confirm(
        'Some changes are still saved only on this device. Sign out? They will sync when you sign back into this account.'
      )
    ) {
      return;
    }
    try {
      await signOut();
    } catch {
      setAccountError('Could not sign out. Please retry.');
    }
  };

  const handleImportLocal = async () => {
    if (
      !window.confirm(
        `Copy this device’s existing text chats, project folders, and pins into ${user.email}? Attachments, API keys and knowledge files stay on this device.`
      )
    ) {
      return;
    }
    try {
      await sync.importLocal();
    } catch {
      setAccountError('Import could not finish. Your original chats are unchanged.');
    }
  };

  const cloudAccount: CloudAccountInfo = {
    user,
    status: {
      message: status.message,
      pending: status.pending,
      error: Boolean(status.error),
      imported: Boolean(status.imported),
    },
    onSignIn: () => {},
    onSignOut: handleSignOut,
    onRetry: () => void sync.retry(),
    onImportLocal: handleImportLocal,
    error: accountError,
  };

  return (
    <div className="h-full flex flex-col bg-bg text-ink">
      <div className="flex-1 min-h-0">
        <App manager={sync.manager} sync={sync} cloudAccount={cloudAccount} />
      </div>
    </div>
  );
}

function Gate() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.sync.me, isAuthenticated ? {} : 'skip');
  const [open, setOpen] = useState(false);

  if (isLoading || (isAuthenticated && user === undefined)) {
    return (
      <div className="h-full grid place-items-center bg-bg text-muted">
        Connecting to your account…
      </div>
    );
  }
  if (isAuthenticated && user) {
    return <AccountSession key={user.id} user={user} />;
  }

  const cloudAccount: CloudAccountInfo = {
    user: null,
    status: {
      message: 'Saved on this device',
    },
    onSignIn: () => setOpen(true),
    onSignOut: async () => {},
    onRetry: () => {},
    onImportLocal: async () => {},
  };

  return (
    <div className="h-full flex flex-col bg-bg text-ink">
      <div className="flex-1 min-h-0">
        <App cloudAccount={cloudAccount} />
      </div>
      {open && <SignIn onClose={() => setOpen(false)} />}
    </div>
  );
}

export default function CloudApp() {
  if (!client) return <App />;
  return <ConvexAuthProvider client={client}><Gate /></ConvexAuthProvider>;
}
