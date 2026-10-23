import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import StatCard from '../components/StatCard';
import StatusChip from '../components/StatusChip';
import { extractErrorMessage, fetchPaymentSummary, fetchPayments, fetchUserSummary } from '../services/api';
import { formatDateTime, formatDay, formatInr } from '../lib/format';
import { glassCard, goldGradient } from '../theme/theme';

/** Headline numbers, payments per day for the last week, latest transactions. */
export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchUserSummary(), fetchPaymentSummary(), fetchPayments({ page: 0, size: 5 })])
      .then(([users, payments, latest]) => setData({ users, payments, latest: latest.items }))
      .catch((err) => setError(extractErrorMessage(err, 'Could not load the overview.')));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <CircularProgress />;

  const { users, payments, latest } = data;
  const maxDayAmount = Math.max(...payments.last7Days.map((d) => d.amount), 1);

  return (
    <Box sx={{ animation: 'fadeInUp .4s ease both' }}>
      <Typography variant="h3" sx={{ mb: 0.5 }}>
        Overview
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Customers and payments across CREDPAY.
      </Typography>

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', mb: 4 }}>
        <StatCard label="Customers" value={users.totalUsers} hint={`${users.newUsersLast7Days} new in the last 7 days`} />
        <StatCard label="Cards on file" value={users.totalCards} />
        <StatCard label="Payments today" value={payments.paymentsToday} hint={formatInr(payments.amountToday)} />
        <StatCard label="Success rate" value={`${payments.successRate}%`} hint={`${payments.totalPayments} payments in total`} />
        <StatCard label="Total paid" value={formatInr(payments.totalAmount)} />
        <StatCard label="Average payment" value={formatInr(payments.averageAmount)} />
      </Box>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1fr 1.4fr' } }}>
        <Paper elevation={0} sx={{ ...glassCard, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Amount paid per day
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Last 7 days (IST)
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 200 }}>
            {payments.last7Days.map((day) => (
              <Tooltip key={day.date} title={`${day.count} payments · ${formatInr(day.amount)}`} arrow>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                  <Box sx={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <Box
                      sx={{
                        width: '100%',
                        height: `${Math.max((day.amount / maxDayAmount) * 100, day.amount ? 4 : 1)}%`,
                        background: day.amount ? goldGradient : 'rgba(255,255,255,0.08)',
                        borderRadius: '6px 6px 2px 2px',
                      }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                    {formatDay(day.date)}
                  </Typography>
                </Box>
              </Tooltip>
            ))}
          </Box>
        </Paper>

        <Paper elevation={0} sx={{ ...glassCard, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Latest transactions</Typography>
            <Button component={RouterLink} to="/transactions" size="small">
              View all
            </Button>
          </Box>
          {latest.length === 0 ? (
            <Typography color="text.secondary">No payments yet.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>When</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {latest.map((p) => (
                  <TableRow key={p.transactionId}>
                    <TableCell>{p.userEmail}</TableCell>
                    <TableCell align="right">{formatInr(p.amount)}</TableCell>
                    <TableCell>
                      <StatusChip status={p.status} />
                    </TableCell>
                    <TableCell>{formatDateTime(p.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
