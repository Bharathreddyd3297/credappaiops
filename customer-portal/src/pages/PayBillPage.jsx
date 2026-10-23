import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  InputAdornment,
  Stack,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CurrencyRupeeRoundedIcon from '@mui/icons-material/CurrencyRupeeRounded';
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded';

import CardTile from '../components/CardTile';
import LoadingSpinner from '../components/LoadingSpinner';
import { listCards, payBill, extractErrorMessage } from '../services/api';

const QUICK_AMOUNTS = [500, 1000, 2500, 5000];

export default function PayBillPage() {
  const navigate = useNavigate();

  const [cards, setCards] = useState([]);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [amount, setAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // One key per payment attempt: a retry after a network failure reuses it,
  // so the server cannot charge the same payment twice.
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    let active = true;
    (async () => {
      let data;
      try {
        data = await listCards();
      } catch {
        data = null;
      }
      if (!active) return;
      const finalCards = Array.isArray(data) ? data : [];
      setCards(finalCards);
      setSelectedCardId(finalCards[0]?.id ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePay = async (e) => {
    e.preventDefault();
    setError('');
    const amt = Number(amount);
    if (!selectedCardId) return setError('Please select a card.');
    if (!amt || amt <= 0) return setError('Enter a valid amount greater than 0.');
    if (upiId.trim().length < 3) return setError('Enter a valid UPI ID.');

    setSubmitting(true);
    try {
      const result = await payBill(
        {
          cardId: selectedCardId,
          amount: amt,
          upiId: upiId.trim(),
        },
        idempotencyKey.current,
      );
      navigate('/success', {
        state: {
          transactionId: result.transactionId,
          amount: result.amount,
          status: result.status,
          upiId: upiId.trim(),
        },
      });
    } catch (err) {
      // The server answered (e.g. validation error): the next try is a new attempt.
      // No answer (network failure): keep the key so a retry cannot pay twice.
      if (err?.response) {
        idempotencyKey.current = crypto.randomUUID();
      }
      setError(extractErrorMessage(err, 'Payment failed. Please try again.'));
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading your cards…" fullHeight />;

  return (
    <Box sx={{ animation: 'fadeInUp .5s ease both' }}>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/dashboard')} sx={{ mb: 2 }}>
        Back to Dashboard
      </Button>

      <Typography variant="h3" sx={{ mb: 0.5 }}>
        Pay Bill
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Select a card, enter the amount and complete your payment securely.
      </Typography>

      <Grid container spacing={4}>
        {/* Saved cards */}
        <Grid item xs={12} md={6}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Saved Cards
          </Typography>
          {cards.length === 0 ? (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 5 }}>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  You have no saved cards. Add a card before making a payment.
                </Typography>
                <Button variant="contained" onClick={() => navigate('/add-card')}>
                  Add a Card
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={2.5}>
              {cards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  selectable
                  selected={selectedCardId === card.id}
                  onClick={() => setSelectedCardId(card.id)}
                />
              ))}
            </Stack>
          )}
        </Grid>

        {/* Payment form */}
        <Grid item xs={12} md={6}>
          <Card component="form" onSubmit={handlePay}>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
              <Typography variant="h6" sx={{ mb: 2.5 }}>
                Payment Details
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
                  {error}
                </Alert>
              )}

              <Stack spacing={2.5}>
                <TextField
                  label="Amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  inputProps={{ min: 1, step: '0.01' }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <CurrencyRupeeRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {QUICK_AMOUNTS.map((q) => (
                    <Button
                      key={q}
                      size="small"
                      variant="outlined"
                      onClick={() => setAmount(String(q))}
                      sx={{ borderRadius: 2 }}
                    >
                      ₹{q.toLocaleString('en-IN')}
                    </Button>
                  ))}
                </Stack>

                <TextField
                  label="UPI ID"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  required
                  placeholder="name@bank"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AccountBalanceRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />

                <Button type="submit" variant="contained" size="large" disabled={submitting || cards.length === 0}>
                  {submitting ? 'Processing…' : `Pay Now${amount ? ` · ₹${Number(amount).toLocaleString('en-IN')}` : ''}`}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
