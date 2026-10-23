import { useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import { glassCard } from '../theme/theme';

/** Admins sign in on the same Keycloak as customers; access needs the ADMIN role. */
export default function LoginPage() {
  const oidc = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const returnTo = location.state?.from?.pathname || '/overview';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (oidc.isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  const signIn = async () => {
    setError('');
    setBusy(true);
    try {
      await oidc.signinRedirect({ state: { returnTo } });
    } catch {
      setError('Cannot reach the sign-in service. Is Keycloak running?');
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        background: 'radial-gradient(900px 500px at 20% 10%, rgba(200,162,75,0.14), transparent 55%), #0A0A0B',
      }}
    >
      <Paper elevation={0} sx={{ ...glassCard, width: '100%', maxWidth: 420, p: { xs: 3, sm: 4.5 } }}>
        <Stack spacing={1} alignItems="center" sx={{ mb: 3, textAlign: 'center' }}>
          <AdminPanelSettingsRoundedIcon sx={{ fontSize: 48, color: 'primary.main' }} />
          <Typography variant="h4">CREDPAY Admin</Typography>
          <Typography color="text.secondary">
            Customers, transactions and operations. For administrators only.
          </Typography>
        </Stack>

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

        <Button fullWidth variant="contained" size="large" disabled={busy} onClick={signIn}>
          {busy ? 'Redirecting…' : 'Sign In'}
        </Button>
      </Paper>
    </Box>
  );
}
