import { Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Alert, Box, Button, CircularProgress } from '@mui/material';

/** Keycloak redirects here after sign-in; continue to the page asked for. */
export default function AuthCallbackPage() {
  const oidc = useAuth();

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
    return <Navigate to={oidc.user?.state?.returnTo || '/overview'} replace />;
  }

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <CircularProgress />
    </Box>
  );
}
