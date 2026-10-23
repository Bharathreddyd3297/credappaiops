import { Paper, Typography } from '@mui/material';
import { glassCard } from '../theme/theme';

/** One headline number on the Overview page. */
export default function StatCard({ label, value, hint }) {
  return (
    <Paper elevation={0} sx={{ ...glassCard, p: 2.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" sx={{ mt: 0.5, fontFamily: 'Sora', fontWeight: 700 }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}
