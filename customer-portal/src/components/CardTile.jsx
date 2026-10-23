import { Box, Typography } from '@mui/material';
import ContactlessIcon from '@mui/icons-material/Contactless';

/**
 * Premium credit-card visual.
 *
 * @param {object}  card      - { id, cardHolder, cardNumber (masked), cardNetwork, expiryMonth?, expiryYear? }
 * @param {boolean} selected  - highlight as the active selection
 * @param {boolean} selectable- show pointer + hover lift
 * @param {function} onClick
 */
const NETWORK_GRADIENTS = {
  VISA: 'linear-gradient(135deg, #1a2a6c 0%, #2a4d9c 45%, #0f1733 100%)',
  MASTERCARD: 'linear-gradient(135deg, #2b2b30 0%, #3a3a42 45%, #131316 100%)',
  RUPAY: 'linear-gradient(135deg, #0b3d2e 0%, #14654a 45%, #062019 100%)',
  AMEX: 'linear-gradient(135deg, #155e63 0%, #1f8a91 45%, #08282b 100%)',
  DEFAULT: 'linear-gradient(135deg, #2a2316 0%, #4a3c1d 45%, #14100a 100%)',
};

export default function CardTile({ card, selected = false, selectable = false, onClick }) {
  const network = (card?.cardNetwork || 'DEFAULT').toUpperCase();
  const gradient = NETWORK_GRADIENTS[network] || NETWORK_GRADIENTS.DEFAULT;
  const expiry =
    card?.expiryMonth && card?.expiryYear
      ? `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`
      : '••/••';

  return (
    <Box
      onClick={onClick}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: 380,
        aspectRatio: '1.586 / 1',
        borderRadius: 4,
        p: { xs: 2.5, sm: 3 },
        color: '#fff',
        background: gradient,
        overflow: 'hidden',
        cursor: selectable ? 'pointer' : 'default',
        border: selected ? '2px solid' : '1px solid rgba(255,255,255,0.14)',
        borderColor: selected ? 'primary.main' : 'rgba(255,255,255,0.14)',
        boxShadow: selected
          ? '0 18px 50px -18px rgba(200,162,75,0.6)'
          : '0 22px 50px -24px rgba(0,0,0,0.9)',
        transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
        '&:hover': selectable
          ? { transform: 'translateY(-4px)', boxShadow: '0 26px 60px -22px rgba(0,0,0,0.95)' }
          : {},
        // metallic sheen
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.16) 48%, transparent 62%)',
          pointerEvents: 'none',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ fontFamily: 'Sora', fontWeight: 800, letterSpacing: '0.18em', fontSize: 14 }}>
          CREDPAY
        </Typography>
        <ContactlessIcon sx={{ opacity: 0.85, transform: 'rotate(90deg)' }} />
      </Box>

      {/* EMV chip */}
      <Box
        sx={{
          mt: { xs: 2, sm: 2.5 },
          width: 46,
          height: 34,
          borderRadius: 1.2,
          background: 'linear-gradient(135deg, #F3D98B, #B8902F)',
          boxShadow: 'inset 0 0 6px rgba(0,0,0,0.35)',
        }}
      />

      <Typography
        sx={{
          mt: { xs: 1.5, sm: 2 },
          fontFamily: 'Sora',
          fontWeight: 600,
          fontSize: { xs: 17, sm: 20 },
          letterSpacing: '0.12em',
        }}
      >
        {card?.cardNumber || '**** **** **** ****'}
      </Typography>

      <Box
        sx={{
          position: 'absolute',
          left: { xs: 20, sm: 24 },
          right: { xs: 20, sm: 24 },
          bottom: { xs: 18, sm: 22 },
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 9, letterSpacing: '0.18em', opacity: 0.6 }}>
            CARD HOLDER
          </Typography>
          <Typography sx={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.04em' }}>
            {card?.cardHolder || 'YOUR NAME'}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: 9, letterSpacing: '0.18em', opacity: 0.6 }}>VALID THRU</Typography>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{expiry}</Typography>
        </Box>
        <Typography sx={{ fontFamily: 'Sora', fontWeight: 800, fontSize: 16, letterSpacing: '0.06em' }}>
          {network === 'DEFAULT' ? '' : network}
        </Typography>
      </Box>
    </Box>
  );
}
