import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { realmRoles } from '../auth/oidc';

/**
 * Only signed-in users with the Keycloak ADMIN role get past this guard.
 * A customer who signs in here sees "Access denied" (and the admin APIs
 * would refuse them anyway with 403).
 */
export default function RequireAdmin({ children }) {
  const oidc = useAuth();
  const location = useLocation();

  if (oidc.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!oidc.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!realmRoles(oidc.user).includes('ADMIN')) {
    return (
      <Box sx={{ maxWidth: 520, mx: 'auto', mt: 12, px: 2 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>
          Access denied
        </Typography>
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {oidc.user?.profile?.email} does not have the ADMIN role. The admin portal is for CREDPAY
          administrators only.
        </Alert>
        <Button variant="outlined" onClick={() => oidc.signoutRedirect()}>
          Sign out
        </Button>
      </Box>
    );
  }

  return children;
}
