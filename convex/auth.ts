import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile(params) {
      const email = String(params.email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
      return { email };
    },
    validatePasswordRequirements(password) {
      if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
        throw new Error('Use a password between 12 and 128 characters.');
      }
    },
  })],
});
