import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import config from '../config';

/**
 * OpenID Connect client for Keycloak (authorization code flow + PKCE),
 * same setup as the customer portal but with the admin-portal client.
 * Tokens live in sessionStorage (per tab) and are refreshed automatically.
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

/**
 * Keycloak realm roles from the access token (realm_access.roles).
 * Only used to decide what to show - every admin API checks the role again.
 */
export function realmRoles(user) {
  try {
    const payload = user.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).realm_access?.roles ?? [];
  } catch {
    return [];
  }
}
