import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Stack,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@mui/material';
import AddCardRoundedIcon from '@mui/icons-material/AddCardRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';

import CardTile from '../components/CardTile';
import LoadingSpinner from '../components/LoadingSpinner';
import { auth, listCards, paymentHistory } from '../services/api';
import { goldGradient } from '../theme/theme';

const inr = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(n || 0),
  );

function StatCard({ icon, label, value, accent }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: 3,
            display: 'grid',
            placeItems: 'center',
            color: '#0A0A0B',
            background: accent || goldGradient,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: 11 }}>
            {label}
          </Typography>
          <Typography variant="h5">{value}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = auth.get();
  const [cards, setCards] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [cardsResult, paymentsResult] = await Promise.allSettled([
        listCards(),
        paymentHistory(),
      ]);
      if (!active) return;

      // Use real data from the API. Empty arrays are valid (new users have
      // no cards/payments yet) and render proper empty states below.
      setCards(
        cardsResult.status === 'fulfilled' && Array.isArray(cardsResult.value)
          ? cardsResult.value
          : [],
      );
      setPayments(
        paymentsResult.status === 'fulfilled' && Array.isArray(paymentsResult.value)
          ? paymentsResult.value
          : [],
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingSpinner label="Loading your dashboard…" fullHeight />;

  const totalSpent = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <Box sx={{ animation: 'fadeInUp .5s ease both' }}>
      {/* Greeting */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" sx={{ mb: 0.5 }}>
          Welcome,{' '}
          <Box component="span" sx={{ background: goldGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {user?.fullName || 'Member'}
          </Box>
        </Typography>
        <Typography color="text.secondary">Here's an overview of your account today.</Typography>
      </Box>

      {/* Stats */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <StatCard icon={<CreditCardRoundedIcon />} label="ACTIVE CARDS" value={cards.length} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard icon={<ReceiptLongRoundedIcon />} label="TOTAL PAYMENTS" value={payments.length} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            icon={<TrendingUpRoundedIcon />}
            label="TOTAL SPENT"
            value={inr(totalSpent)}
            accent="linear-gradient(135deg,#B8C0CC,#7E8794)"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* My Cards */}
        <Grid item xs={12} lg={7}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h5">My Cards</Typography>
            <Button
              size="small"
              startIcon={<AddCardRoundedIcon />}
              onClick={() => navigate('/add-card')}
            >
              Add Card
            </Button>
          </Box>
          {cards.length === 0 ? (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 5 }}>
                <CreditCardRoundedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  You haven't added any cards yet.
                </Typography>
                <Button variant="contained" startIcon={<AddCardRoundedIcon />} onClick={() => navigate('/add-card')}>
                  Add Your First Card
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Grid container spacing={2.5}>
              {cards.map((card) => (
                <Grid item xs={12} sm={6} key={card.id}>
                  <CardTile card={card} />
                </Grid>
              ))}
            </Grid>
          )}
        </Grid>

        {/* Quick Actions + Recent Payments */}
        <Grid item xs={12} lg={5}>
          <Typography variant="h5" sx={{ mb: 2 }}>
            Quick Actions
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
            <Button fullWidth variant="contained" startIcon={<PaymentsRoundedIcon />} onClick={() => navigate('/pay-bill')}>
              Pay Bill
            </Button>
            <Button fullWidth variant="outlined" startIcon={<ReceiptLongRoundedIcon />} onClick={() => navigate('/payment-history')}>
              History
            </Button>
          </Stack>

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Recent Payments
              </Typography>
              <Divider sx={{ mb: 1 }} />
              {payments.length === 0 ? (
                <Typography color="text.secondary" variant="body2" sx={{ py: 3, textAlign: 'center' }}>
                  No payments yet.
                </Typography>
              ) : (
              <Table size="small">
                <TableBody>
                  {payments.slice(0, 4).map((p) => (
                    <TableRow key={p.transactionId} sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell sx={{ px: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {p.transactionId}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ px: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {inr(p.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ px: 0, pl: 1 }}>
                        <Chip
                          label={p.status}
                          size="small"
                          color={p.status === 'SUCCESS' ? 'success' : 'warning'}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
