import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Alert, Box, Button } from '@mui/material';
import { auth, fetchMyProfile, extractErrorMessage } from '../services/api';
import LoadingSpinner from './LoadingSpinner';

/**
 * Guards routes that require a signed-in customer.
 *  - No Keycloak session -> /login (remembering the attempted location).
 *  - Signed in -> loads the CredPay profile once (GET /api/users/me, which
 *    also creates the customer on first login), then renders the page.
 */
export default function ProtectedRoute({ children }) {
  const oidc = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState(() => auth.get());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!oidc.isAuthenticated || profile) return;
    fetchMyProfile()
      .then((p) => {
        auth.save(p);
        setProfile(p);
      })
      .catch((err) => setError(extractErrorMessage(err, 'Could not load your profile.')));
  }, [oidc.isAuthenticated, profile]);

  if (oidc.isLoading) {
    return <LoadingSpinner label="Checking your session…" fullHeight />;
  }

  if (!oidc.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto', mt: 10, px: 2 }}>
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
        <Button variant="outlined" onClick={() => auth.logout()}>
          Sign out
        </Button>
      </Box>
    );
  }

  if (!profile) {
    return <LoadingSpinner label="Loading your account…" fullHeight />;
  }

  return children;
}
