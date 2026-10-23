import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  MenuItem,
  Button,
  Alert,
  Stack,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';

import CardTile from '../components/CardTile';
import { addCard, extractErrorMessage } from '../services/api';

const NETWORKS = ['VISA', 'MASTERCARD', 'RUPAY', 'AMEX'];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR + i);

/** Build a masked preview from the raw number being typed. */
function maskPreview(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 4) return '**** **** **** ****';
  return `**** **** **** ${digits.slice(-4)}`;
}

export default function AddCardPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    cardHolder: '',
    cardNumber: '',
    cardNetwork: 'VISA',
    expiryMonth: 12,
    expiryYear: CURRENT_YEAR + 2,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const digits = form.cardNumber.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) {
      setError('Card number must be 13–19 digits.');
      return;
    }
    setLoading(true);
    try {
      await addCard({
        cardHolder: form.cardHolder,
        cardNumber: digits,
        cardNetwork: form.cardNetwork,
        expiryMonth: Number(form.expiryMonth),
        expiryYear: Number(form.expiryYear),
      });
      navigate('/dashboard');
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not add card. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const previewCard = {
    cardHolder: form.cardHolder || 'YOUR NAME',
    cardNumber: maskPreview(form.cardNumber),
    cardNetwork: form.cardNetwork,
    expiryMonth: form.expiryMonth,
    expiryYear: form.expiryYear,
  };

  return (
    <Box sx={{ animation: 'fadeInUp .5s ease both' }}>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/dashboard')} sx={{ mb: 2 }}>
        Back to Dashboard
      </Button>

      <Typography variant="h3" sx={{ mb: 0.5 }}>
        Add a New Card
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Only the last four digits are stored. Your full card number is never saved.
      </Typography>

      <Grid container spacing={4}>
        {/* Live preview */}
        <Grid item xs={12} md={5}>
          <Box sx={{ position: { md: 'sticky' }, top: 100 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
              Live Preview
            </Typography>
            <CardTile card={previewCard} />
          </Box>
        </Grid>

        {/* Form */}
        <Grid item xs={12} md={7}>
          <Card component="form" onSubmit={handleSubmit}>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
              {error && (
                <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
                  {error}
                </Alert>
              )}

              <Stack spacing={2.5}>
                <TextField
                  label="Card Holder"
                  name="cardHolder"
                  value={form.cardHolder}
                  onChange={handleChange}
                  required
                  placeholder="Name as printed on the card"
                />
                <TextField
                  label="Card Number"
                  name="cardNumber"
                  value={form.cardNumber}
                  onChange={handleChange}
                  required
                  inputProps={{ inputMode: 'numeric', maxLength: 19 }}
                  placeholder="1234 5678 1234 5678"
                  helperText="13–19 digits"
                />
                <TextField
                  select
                  label="Card Network"
                  name="cardNetwork"
                  value={form.cardNetwork}
                  onChange={handleChange}
                  required
                >
                  {NETWORKS.map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </TextField>

                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      select
                      label="Expiry Month"
                      name="expiryMonth"
                      value={form.expiryMonth}
                      onChange={handleChange}
                      required
                    >
                      {MONTHS.map((m) => (
                        <MenuItem key={m} value={m}>
                          {String(m).padStart(2, '0')}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      select
                      label="Expiry Year"
                      name="expiryYear"
                      value={form.expiryYear}
                      onChange={handleChange}
                      required
                    >
                      {YEARS.map((y) => (
                        <MenuItem key={y} value={y}>
                          {y}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>

                <Button type="submit" variant="contained" size="large" disabled={loading}>
                  {loading ? 'Saving…' : 'Save Card'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
