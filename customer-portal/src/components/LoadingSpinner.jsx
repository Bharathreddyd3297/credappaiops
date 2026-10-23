import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * Centered branded loading indicator.
 * @param {string} label - optional text shown beneath the spinner
 * @param {boolean} fullHeight - fill the viewport height when true
 */
export default function LoadingSpinner({ label = 'Loading…', fullHeight = false }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        py: 6,
        minHeight: fullHeight ? '60vh' : 'auto',
      }}
    >
      <CircularProgress size={44} thickness={4} sx={{ color: 'primary.main' }} />
      {label && (
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      )}
    </Box>
  );
}
