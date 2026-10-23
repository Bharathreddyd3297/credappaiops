import { useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Box, Paper, Typography, Button, Alert, Stack } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

import { glassCard } from '../theme/theme';
import AuthBranding from './_AuthBranding';

/**
 * Entry page for signed-out customers. Sign-in and registration both happen
 * on CredPay's Keycloak pages (the portal never handles passwords); the
 * customer comes back to /auth/callback when done.
 */
export default function LoginPage() {
  const oidc = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const returnTo = location.state?.from?.pathname || '/dashboard';

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (oidc.isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  const redirectToKeycloak = async (extraArgs = {}) => {
    setError('');
    setBusy(true);
    try {
      await oidc.signinRedirect({ state: { returnTo }, ...extraArgs });
    } catch {
      setError('Cannot reach the sign-in service. Is Keycloak running?');
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      <AuthBranding
        heading="Pay credit card bill for exciting offers"
        subheading="Manage premium cards and pay bills with a seamless, secure experience."
      />

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2.5, sm: 4 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            ...glassCard,
            width: '100%',
            maxWidth: 440,
            p: { xs: 3, sm: 4.5 },
            animation: 'fadeInUp .5s ease both',
          }}
        >
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Welcome to CREDPAY
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Sign in or create an account to manage your cards and pay bills.
          </Typography>

          {params.get('expired') && !error && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
              Your session has ended. Please sign in again.
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Stack spacing={1.5}>
            <Button variant="contained" size="large" disabled={busy} onClick={() => redirectToKeycloak()}>
              {busy ? 'Redirecting…' : 'Sign In'}
            </Button>
            <Button
              variant="outlined"
              size="large"
              disabled={busy}
              onClick={() => redirectToKeycloak({ prompt: 'create' })}
            >
              Create an account
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 3, color: 'text.secondary' }}>
            <LockOutlinedIcon fontSize="small" />
            <Typography variant="body2">
              You sign in on CREDPAY&apos;s secure sign-in page. This app never sees your password.
            </Typography>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
