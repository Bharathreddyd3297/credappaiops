import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { glassCard } from '../theme/theme';

const COMING = [
  { name: 'Prometheus & Grafana', text: 'Service and Kubernetes metrics, dashboards and alerts.' },
  { name: 'Dynatrace', text: 'Traces, logs and Davis AI problems with their root cause.' },
  { name: 'AIOps assistant', text: 'Plain-English summaries of problems and logs, powered by Azure OpenAI.' },
];

/** Placeholder: monitoring and AIOps arrive with the Kubernetes phase. */
export default function MonitoringPage() {
  return (
    <Box sx={{ animation: 'fadeInUp .4s ease both' }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="h3">Monitoring</Typography>
        <Chip label="Kubernetes phase" size="small" color="primary" variant="outlined" />
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 4, maxWidth: 720 }}>
        Monitoring and AIOps are set up when CREDPAY runs on Kubernetes (AKS). These views will
        appear here then.
      </Typography>

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {COMING.map((item) => (
          <Paper key={item.name} elevation={0} sx={{ ...glassCard, p: 3, opacity: 0.8 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {item.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.text}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
