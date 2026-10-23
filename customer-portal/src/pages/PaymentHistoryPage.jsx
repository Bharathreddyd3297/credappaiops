import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Button,
  Stack,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';

import LoadingSpinner from '../components/LoadingSpinner';
import { paymentHistory } from '../services/api';

const inr = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(
    Number(n || 0),
  );

const formatDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function PaymentHistoryPage() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      let data;
      try {
        data = await paymentHistory();
      } catch {
        data = null;
      }
      if (!active) return;
      setPayments(Array.isArray(data) ? data : []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingSpinner label="Loading payment history…" fullHeight />;

  return (
    <Box sx={{ animation: 'fadeInUp .5s ease both' }}>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/dashboard')} sx={{ mb: 2 }}>
        Back to Dashboard
      </Button>

      <Typography variant="h3" sx={{ mb: 0.5 }}>
        Payment History
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        A complete record of your transactions, newest first.
      </Typography>

      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          {payments.length === 0 ? (
            <Stack alignItems="center" spacing={1.5} sx={{ py: 8 }}>
              <ReceiptLongRoundedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
              <Typography color="text.secondary">No payments yet.</Typography>
            </Stack>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Transaction ID</TableCell>
                    <TableCell>Date &amp; Time</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="center">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow
                      key={p.transactionId}
                      sx={{ '&:hover': { background: 'rgba(255,255,255,0.03)' } }}
                    >
                      <TableCell sx={{ fontFamily: 'Sora', fontWeight: 600 }}>
                        {p.transactionId}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{formatDate(p.createdAt)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {inr(p.amount)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={p.status}
                          size="small"
                          color={p.status === 'SUCCESS' ? 'success' : p.status === 'FAILED' ? 'error' : 'warning'}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
