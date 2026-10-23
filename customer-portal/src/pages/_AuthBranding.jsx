import { Box, Typography, Stack } from '@mui/material';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import { goldGradient } from '../theme/theme';

/**
 * Left-hand brand panel shown on the Login / Register screens.
 * Hidden on small screens (mobile-first: the form takes the full width).
 */
const FEATURES = [
  { icon: <BoltRoundedIcon />, text: 'Instant bill payments' },
  { icon: <ShieldRoundedIcon />, text: 'Bank-grade security' },
  { icon: <VerifiedRoundedIcon />, text: 'Premium card management' },
];

export default function AuthBranding({ heading, subheading }) {
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        flex: 1.1,
        position: 'relative',
        flexDirection: 'column',
        justifyContent: 'space-between',
        p: 6,
        overflow: 'hidden',
        background:
          'radial-gradient(900px 500px at 20% 10%, rgba(200,162,75,0.18), transparent 55%), linear-gradient(160deg, #0E0E10 0%, #050506 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4 }}>
        <Box sx={{ width: 38, height: 27, borderRadius: 1, background: goldGradient }} />
        <Typography sx={{ fontFamily: 'Sora', fontWeight: 800, letterSpacing: '0.2em', fontSize: 20 }}>
          CREDPAY
        </Typography>
      </Box>

      <Box>
        <Typography
          variant="h2"
          sx={{
            fontSize: { md: 44 },
            lineHeight: 1.1,
            mb: 2,
            background: goldGradient,
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'floatShine 4s ease-in-out infinite',
          }}
        >
          {heading}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 400, color: 'text.secondary', maxWidth: 440 }}>
          {subheading}
        </Typography>
      </Box>

      <Stack spacing={2}>
        {FEATURES.map((f) => (
          <Box key={f.text} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                color: 'primary.light',
                background: 'rgba(200,162,75,0.10)',
                border: '1px solid rgba(200,162,75,0.22)',
              }}
            >
              {f.icon}
            </Box>
            <Typography sx={{ fontWeight: 600 }}>{f.text}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
