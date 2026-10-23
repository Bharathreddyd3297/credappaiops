import { Chip } from '@mui/material';

const COLORS = { SUCCESS: 'success', FAILED: 'error', PENDING: 'warning' };

export default function StatusChip({ status }) {
  return <Chip label={status} size="small" color={COLORS[status] || 'default'} variant="outlined" />;
}
