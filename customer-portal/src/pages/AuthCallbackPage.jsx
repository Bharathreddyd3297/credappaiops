import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Alert, Box, Button } from '@mui/material';
import { auth } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

/**
 * Keycloak redirects here after login or registration. AuthProvider
 * exchanges the authorization code for tokens; this page waits for that,
 * then continues to the page the customer originally asked for.
 */
export default function AuthCallbackPage() {
  const oidc = useAuth();

  // A new login may be a different customer: drop any cached profile
  useEffect(() => {
    auth.clear();
  }, []);

  if (oidc.error) {
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto', mt: 10, px: 2 }}>
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          Sign-in failed: {oidc.error.message}
        </Alert>
        <Button variant="contained" href="/login">
          Back to sign in
        </Button>
      </Box>
    );
  }

  if (oidc.isAuthenticated) {
    return <Navigate to={oidc.user?.state?.returnTo || '/dashboard'} replace />;
  }

  return <LoadingSpinner label="Signing you in…" fullHeight />;
}
