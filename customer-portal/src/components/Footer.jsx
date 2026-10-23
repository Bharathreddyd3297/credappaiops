import { Box, Typography, Link, Stack } from '@mui/material';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <Box
      component="footer"
      sx={{
        mt: 'auto',
        px: { xs: 2, sm: 4 },
        py: 3,
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Typography variant="body2" color="text.secondary">
        © {year} CREDPAY · Crafted for a premium banking experience.
      </Typography>
      <Stack direction="row" spacing={3}>
        <Link href="#" underline="none" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
          Privacy
        </Link>
        <Link href="#" underline="none" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
          Security
        </Link>
        <Link href="#" underline="none" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
          Support
        </Link>
      </Stack>
    </Box>
  );
}
