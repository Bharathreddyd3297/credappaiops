import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Box, Paper, Typography, Button, Divider, Stack, IconButton, Tooltip } from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import { useState } from 'react';

import { glassCard, goldGradient } from '../theme/theme';

const inr = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(
    Number(n || 0),
  );

function Row({ label, value, copyable, onCopy, copied }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography color="text.secondary">{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontWeight: 700, fontFamily: 'Sora' }}>{value}</Typography>
        {copyable && (
          <Tooltip title={copied ? 'Copied!' : 'Copy'}>
            <IconButton size="small" onClick={onCopy}>
              <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

export default function SuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const state = location.state;

  // Direct visits without payment context: send the user home.
  if (!state || !state.transactionId) {
    return <Navigate to="/dashboard" replace />;
  }

  const { transactionId, amount, status = 'SUCCESS', upiId } = state;

  const copyTxn = async () => {
    try {
      await navigator.clipboard.writeText(transactionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <Paper elevation={0} sx={{ ...glassCard, width: '100%', maxWidth: 480, p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
        {/* Animated success badge */}
        <Box sx={{ position: 'relative', width: 96, height: 96, mx: 'auto', mb: 3 }}>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid',
              borderColor: 'success.main',
              animation: 'ringPulse 1.8s ease-out infinite',
            }}
          />
          <Box
            sx={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg, #34D399, #059669)',
              boxShadow: '0 16px 40px -12px rgba(52,211,153,0.6)',
              animation: 'popCheck .5s ease both',
            }}
          >
            <CheckRoundedIcon sx={{ fontSize: 56, color: '#04130D' }} />
          </Box>
        </Box>

        <Typography variant="h4" sx={{ mb: 0.5 }}>
          Payment Successful
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          Your transaction has been completed.
        </Typography>

        <Typography
          variant="h2"
          sx={{
            my: 2,
            background: goldGradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {inr(amount)}
        </Typography>

        <Box sx={{ textAlign: 'left', mt: 3 }}>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={1.5}>
            <Row label="Transaction ID" value={transactionId} copyable onCopy={copyTxn} copied={copied} />
            {upiId && <Row label="Paid to" value={upiId} />}
            <Row label="Status" value={status} />
          </Stack>
          <Divider sx={{ mt: 2 }} />
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<ReceiptLongRoundedIcon />}
            onClick={() => navigate('/payment-history')}
          >
            View History
          </Button>
          <Button
            fullWidth
            variant="contained"
            startIcon={<DashboardRoundedIcon />}
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
