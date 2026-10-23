import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import config from '../config';

/**
 * OpenID Connect client for Keycloak (authorization code flow + PKCE).
 *
 *  - The portal never sees the customer's password: login and registration
 *    happen on Keycloak's own pages, which redirect back to /auth/callback.
 *  - Tokens are kept in sessionStorage (per browser tab, cleared when the
 *    tab closes), never in localStorage.
 *  - automaticSilentRenew uses the refresh token to get a new access token
 *    shortly before the current one (5 minutes) expires.
 *
 * Keycloak address and client id come from src/config.js (runtime config
 * in a container, VITE_* values or defaults with `npm run dev`).
 */
export const userManager = new UserManager({
  authority: config.oidcAuthority,
  client_id: config.oidcClientId,
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: `${window.location.origin}/login`,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
});

/** Removes the authorization code from the address bar after login. */
export function onSigninCallback() {
  window.history.replaceState({}, document.title, window.location.pathname);
}
