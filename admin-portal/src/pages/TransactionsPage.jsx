import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import StatusChip from '../components/StatusChip';
import { extractErrorMessage, fetchPayments } from '../services/api';
import { formatDateTime, formatInr } from '../lib/format';
import useDebounced from '../lib/useDebounced';
import { glassCard } from '../theme/theme';

const STATUSES = ['', 'SUCCESS', 'FAILED', 'PENDING'];

/** Every payment, newest first, filterable by status and searchable. */
export default function TransactionsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, status]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPayments({ status, search: debouncedSearch, page, size })
      .then((data) => active && (setResult(data), setError('')))
      .catch((err) => active && setError(extractErrorMessage(err, 'Could not load transactions.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [status, debouncedSearch, page, size]);

  return (
    <Box sx={{ animation: 'fadeInUp .4s ease both' }}>
      <Typography variant="h3" sx={{ mb: 0.5 }}>
        Transactions
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        All customer payments.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          placeholder="Transaction ID, customer email or UPI ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ width: { xs: '100%', sm: 380 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          size="small"
          sx={{ width: 180 }}
        >
          {STATUSES.map((s) => (
            <MenuItem key={s || 'all'} value={s}>
              {s || 'All statuses'}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...glassCard, overflow: 'hidden' }}>
        {loading && <LinearProgress />}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Transaction ID</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Card</TableCell>
                <TableCell>UPI ID</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>When</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((p) => (
                <TableRow key={p.transactionId} hover>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{p.transactionId}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{p.userName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.userEmail}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {p.cardNumber ? `${p.cardNetwork ?? ''} ${p.cardNumber.slice(-4)}` : '-'}
                  </TableCell>
                  <TableCell>{p.upiId}</TableCell>
                  <TableCell align="right">{formatInr(p.amount)}</TableCell>
                  <TableCell>
                    <StatusChip status={p.status} />
                  </TableCell>
                  <TableCell>{formatDateTime(p.createdAt)}</TableCell>
                </TableRow>
              ))}
              {!loading && result.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
                    No transactions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={result.total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={size}
          onRowsPerPageChange={(e) => {
            setSize(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
        />
      </Paper>
    </Box>
  );
}
