import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { goldGradient } from '../theme/theme';

const DRAWER_WIDTH = 248;

const NAV_ITEMS = [
  { label: 'Overview', to: '/overview', icon: <DashboardRoundedIcon /> },
  { label: 'Users', to: '/users', icon: <PeopleAltRoundedIcon /> },
  { label: 'Transactions', to: '/transactions', icon: <ReceiptLongRoundedIcon /> },
  { label: 'Monitoring', to: '/monitoring', icon: <MonitorHeartRoundedIcon /> },
];

/** Sidebar + top bar around every admin page. */
export default function AdminLayout() {
  const oidc = useAuth();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            background: '#0E0E10',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            px: 2,
            py: 3,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, mb: 4 }}>
          <Box component="img" src="/credpay.svg" alt="" sx={{ width: 34, height: 34 }} />
          <Box>
            <Typography
              sx={{
                fontFamily: 'Sora',
                fontWeight: 800,
                letterSpacing: 1,
                background: goldGradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              CREDPAY
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Admin Portal
            </Typography>
          </Box>
        </Box>

        <List sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {NAV_ITEMS.map((item) => (
            <ListItemButton
              key={item.to}
              component={NavLink}
              to={item.to}
              sx={{
                borderRadius: '10px',
                '&.active': { background: 'rgba(200,162,75,0.12)', color: 'primary.light' },
                '&.active .MuiListItemIcon-root': { color: 'primary.main' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{ background: 'rgba(10,10,11,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Toolbar sx={{ justifyContent: 'flex-end', gap: 2 }}>
            <Chip label="ADMIN" size="small" color="primary" variant="outlined" />
            <Typography variant="body2" color="text.secondary">
              {oidc.user?.profile?.email}
            </Typography>
            <Button size="small" startIcon={<LogoutRoundedIcon />} onClick={() => oidc.signoutRedirect()}>
              Logout
            </Button>
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flexGrow: 1, px: { xs: 2, md: 5 }, py: 4 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
