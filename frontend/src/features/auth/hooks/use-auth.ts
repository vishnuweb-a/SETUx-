import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '../auth-context';

/**
 * Reads the application's authentication state.
 *
 * Throws outside an `AuthProvider` rather than returning a default: a component
 * silently believing nobody is signed in is a far harder bug to find than a
 * loud one at mount.
 */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
};
