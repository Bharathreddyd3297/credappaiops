/**
 * Runtime configuration.
 *
 * In a container, /config.js is generated when the container starts, from
 * environment variables (see docker/40-runtime-config.sh), and sets
 * window.__CREDPAY_CONFIG__. That lets ONE image run in dev, qa and prod.
 *
 * With `npm run dev`, public/config.js is an empty placeholder, so the
 * VITE_* values from .env (or the defaults below) are used.
 *
 * An empty string is a valid value: '' for an API URL means "same origin"
 * (behind the Kubernetes Ingress).
 */
const runtime = window.__CREDPAY_CONFIG__ || {};

const pick = (runtimeValue, buildValue, fallback) => runtimeValue ?? buildValue ?? fallback;

const config = {
  userApiUrl: pick(runtime.userApiUrl, import.meta.env.VITE_USER_API_URL, 'http://localhost:8080'),
  paymentApiUrl: pick(runtime.paymentApiUrl, import.meta.env.VITE_PAYMENT_API_URL, 'http://localhost:8000'),
  oidcAuthority: pick(runtime.oidcAuthority, import.meta.env.VITE_OIDC_AUTHORITY, 'http://localhost:8081/realms/credpay'),
  oidcClientId: pick(runtime.oidcClientId, import.meta.env.VITE_OIDC_CLIENT_ID, 'admin-portal'),
};

export default config;
