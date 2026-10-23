import { createTheme } from '@mui/material/styles';

/**
 * CREDPAY design system — dark luxury fintech theme.
 *
 * Palette: charcoal/black surfaces, champagne-gold metallic accent,
 * platinum secondary, near-white typography. Exported alongside a few
 * reusable style tokens (gradients, glass surfaces) used across the app.
 */

// --- Brand tokens (importable by components) ---------------------------
export const GOLD = '#C8A24B';
export const GOLD_LIGHT = '#F3D98B';
export const GOLD_DARK = '#9C7B2E';
export const PLATINUM = '#B8C0CC';

export const goldGradient = `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 48%, ${GOLD_DARK} 100%)`;
export const darkPanelGradient =
  'linear-gradient(160deg, rgba(28,28,32,0.92) 0%, rgba(16,16,19,0.92) 100%)';

/** Glassmorphism surface — spread into a component's `sx`. */
export const glassCard = {
  background:
    'linear-gradient(160deg, rgba(32,32,38,0.72) 0%, rgba(18,18,22,0.72) 100%)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
  boxShadow: '0 24px 60px -28px rgba(0,0,0,0.85)',
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: GOLD, light: GOLD_LIGHT, dark: GOLD_DARK, contrastText: '#0A0A0B' },
    secondary: { main: PLATINUM, contrastText: '#0A0A0B' },
    success: { main: '#34D399' },
    error: { main: '#F87171' },
    warning: { main: '#FBBF24' },
    background: { default: '#0A0A0B', paper: '#141417' },
    text: {
      primary: '#F5F6F7',
      secondary: 'rgba(245,246,247,0.62)',
      disabled: 'rgba(245,246,247,0.35)',
    },
    divider: 'rgba(255,255,255,0.08)',
  },

  shape: { borderRadius: 16 },

  typography: {
    fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, letterSpacing: '-0.02em' },
    h2: { fontFamily: "'Sora', sans-serif", fontWeight: 800, letterSpacing: '-0.02em' },
    h3: { fontFamily: "'Sora', sans-serif", fontWeight: 700, letterSpacing: '-0.015em' },
    h4: { fontFamily: "'Sora', sans-serif", fontWeight: 700, letterSpacing: '-0.01em' },
    h5: { fontFamily: "'Sora', sans-serif", fontWeight: 700 },
    h6: { fontFamily: "'Sora', sans-serif", fontWeight: 600 },
    button: { fontWeight: 700, textTransform: 'none', letterSpacing: '0.01em' },
    subtitle1: { color: 'rgba(245,246,247,0.62)' },
    subtitle2: { fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#0A0A0B' },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 999,
          padding: '10px 22px',
          transition: 'transform .2s ease, box-shadow .2s ease, opacity .2s ease',
        },
        containedPrimary: {
          background: goldGradient,
          color: '#0A0A0B',
          boxShadow: '0 10px 30px -12px rgba(200,162,75,0.6)',
          '&:hover': {
            background: goldGradient,
            transform: 'translateY(-1px)',
            boxShadow: '0 16px 36px -12px rgba(200,162,75,0.75)',
          },
        },
        outlined: {
          borderColor: 'rgba(255,255,255,0.18)',
          color: '#F5F6F7',
          '&:hover': {
            borderColor: GOLD,
            background: 'rgba(200,162,75,0.08)',
          },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          background:
            'linear-gradient(160deg, rgba(32,32,38,0.72) 0%, rgba(18,18,22,0.72) 100%)',
          backdropFilter: 'blur(18px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          boxShadow: '0 24px 60px -28px rgba(0,0,0,0.85)',
        },
      },
    },

    MuiTextField: {
      defaultProps: { variant: 'outlined', fullWidth: true },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          background: 'rgba(255,255,255,0.03)',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255,255,255,0.12)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255,255,255,0.24)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: GOLD,
            borderWidth: 1.5,
          },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, letterSpacing: '0.02em' },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: 'rgba(255,255,255,0.07)' },
        head: {
          color: 'rgba(245,246,247,0.6)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontSize: 12,
        },
      },
    },
  },
});

export default theme;
