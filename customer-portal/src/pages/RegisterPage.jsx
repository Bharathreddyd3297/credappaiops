import { useEffect, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import LoadingSpinner from '../components/LoadingSpinner';

/**
 * /register opens Keycloak's registration page directly (OIDC prompt=create),
 * so links to /register keep working.
 */
export default function RegisterPage() {
  const oidc = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React StrictMode runs effects twice in dev
    started.current = true;
    oidc.signinRedirect({ prompt: 'create', state: { returnTo: '/dashboard' } });
  }, [oidc]);

  return <LoadingSpinner label="Opening registration…" fullHeight />;
}
