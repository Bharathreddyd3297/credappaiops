import { NavLink } from 'react-router-dom';
import {
  Drawer,
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Button,
  Divider,
} from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import AddCardRoundedIcon from '@mui/icons-material/AddCardRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { auth } from '../services/api';
import { goldGradient } from '../theme/theme';

export const DRAWER_WIDTH = 264;

export const NAV_ITEMS = [
  { label: 'Dashboard', to: '/dashboard', icon: <DashboardRoundedIcon /> },
  { label: 'Add Card', to: '/add-card', icon: <AddCardRoundedIcon /> },
  { label: 'Pay Bill', to: '/pay-bill', icon: <PaymentsRoundedIcon /> },
  { label: 'Payment History', to: '/payment-history', icon: <ReceiptLongRoundedIcon /> },
];

function SidebarContent({ onNavigate }) {

  const handleLogout = () => {
    onNavigate?.();
    auth.logout();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', px: 2, py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, px: 1, mb: 4 }}>
        <Box
          sx={{
            width: 34,
            height: 24,
            borderRadius: 1,
            background: goldGradient,
            boxShadow: '0 6px 16px -6px rgba(200,162,75,0.7)',
          }}
        />
        <Typography sx={{ fontFamily: 'Sora', fontWeight: 800, letterSpacing: '0.18em' }}>
          CREDPAY
        </Typography>
      </Box>

      <Typography
        variant="subtitle2"
        sx={{ px: 1.5, mb: 1, color: 'text.secondary', fontSize: 11 }}
      >
        Menu
      </Typography>

      <List sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {NAV_ITEMS.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            onClick={onNavigate}
            sx={{
              borderRadius: 3,
              color: 'text.secondary',
              '& .MuiListItemIcon-root': { color: 'inherit', minWidth: 40 },
              '&.active': {
                color: 'primary.light',
                background: 'rgba(200,162,75,0.10)',
                border: '1px solid rgba(200,162,75,0.25)',
              },
              '&:hover': { color: 'text.primary', background: 'rgba(255,255,255,0.04)' },
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontWeight: 600 }} primary={item.label} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ my: 2 }} />
      <Button
        fullWidth
        variant="outlined"
        startIcon={<LogoutRoundedIcon />}
        onClick={handleLogout}
        sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}
      >
        Logout
      </Button>
    </Box>
  );
}

/**
 * Responsive navigation drawer.
 *  - permanent on md+ screens
 *  - temporary (overlay) on mobile, controlled via `mobileOpen` / `onClose`
 */
export default function Sidebar({ mobileOpen = false, onClose }) {
  return (
    <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
      {/* Mobile: temporary */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #141417 0%, #0C0C0E 100%)',
            borderRight: '1px solid rgba(255,255,255,0.08)',
          },
        }}
      >
        <SidebarContent onNavigate={onClose} />
      </Drawer>

      {/* Desktop: permanent */}
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #141417 0%, #0C0C0E 100%)',
            borderRight: '1px solid rgba(255,255,255,0.08)',
          },
        }}
      >
        <SidebarContent />
      </Drawer>
    </Box>
  );
}
