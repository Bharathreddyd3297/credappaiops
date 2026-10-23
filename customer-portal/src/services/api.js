import axios from 'axios';
import { userManager } from '../auth/oidc';
import appConfig from '../config';

/**
 * Centralized API layer for CREDPAY.
 *
 *  - userApi    -> Spring Boot User Service    (/api/users, /api/cards)
 *  - paymentApi -> FastAPI Payment Service     (/api/payment)
 *
 * Every request carries the signed-in customer's Keycloak access token
 * (Authorization: Bearer ...). The services take the customer's identity
 * from that token, so no request ever sends a userId.
 *
 * Base URLs default to '' (relative). Behind the Kubernetes Ingress, the
 * frontend, user-service and payment-service are all reached through the
 * SAME origin (the Ingress IP), so relative calls like `/api/cards`
 * resolve correctly without CORS. Vite env vars (see .env.example) only need
 * to be set for local development, where the Vite dev server (:5173) calls
 * the backends directly on different ports/origins.
 *
 * NOTE: Vite inlines VITE_* env vars at BUILD time, not at container
 * runtime. Never bake an absolute backend URL into the production image -
 * leave these unset (the default) so the same image works behind any
 * Ingress IP/hostname.
 */

const USER_BASE_URL = appConfig.userApiUrl;
const PAYMENT_BASE_URL = appConfig.paymentApiUrl;

export const userApi = axios.create({
  baseURL: USER_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

export const paymentApi = axios.create({
  baseURL: PAYMENT_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

for (const api of [userApi, paymentApi]) {
  // Attach the current access token to every call
  api.interceptors.request.use(async (config) => {
    const user = await userManager.getUser();
    if (user?.access_token) {
      config.headers.Authorization = `Bearer ${user.access_token}`;
    }
    return config;
  });

  // 401 = the session ended (expired or revoked in Keycloak): sign in again
  api.interceptors.response.use(undefined, async (error) => {
    if (error?.response?.status === 401) {
      auth.clear();
      await userManager.removeUser();
      window.location.assign('/login?expired=1');
    }
    return Promise.reject(error);
  });
}

/**
 * Normalize backend errors. Both services return { detail } (an RFC 9457
 * problem detail from Spring; FastAPI's detail is a string, or an array for
 * 422 validation errors).
 */
export function extractErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data;
  if (!data) {
    if (error?.code === 'ECONNABORTED') return 'Request timed out. Is the backend running?';
    if (error?.message === 'Network Error') return 'Cannot reach the server. Is the backend running?';
    return fallback;
  }
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.message === 'string') return data.message;
  if (Array.isArray(data.detail) && data.detail.length) {
    return data.detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
  }
  return fallback;
}

// --- Auth / session helpers -------------------------------------------
// The customer's CredPay profile ({ userId, fullName, email }), cached for
// this browser tab after login. The access token itself is managed by
// oidc-client-ts (see auth/oidc.js).
const PROFILE_KEY = 'credpay.profile';

export const auth = {
  save(profile) {
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  },
  get() {
    const raw = sessionStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  clear() {
    sessionStorage.removeItem(PROFILE_KEY);
  },
  /** Ends the Keycloak session too, then returns to /login. */
  async logout() {
    this.clear();
    await userManager.signoutRedirect();
  },
};

// --- User Service endpoints -------------------------------------------
export async function fetchMyProfile() {
  const { data } = await userApi.get('/api/users/me');
  return data; // { userId, fullName, email }
}

export async function addCard({ cardHolder, cardNumber, cardNetwork, expiryMonth, expiryYear }) {
  const { data } = await userApi.post('/api/cards', {
    cardHolder,
    cardNumber,
    cardNetwork,
    expiryMonth,
    expiryYear,
  });
  return data; // { message }
}

export async function listCards() {
  const { data } = await userApi.get('/api/cards');
  return data; // [{ id, cardHolder, cardNumber, cardNetwork }]
}

// --- Payment Service endpoints ----------------------------------------
/**
 * idempotencyKey: one value per payment attempt. Retrying with the same key
 * (double click, network retry) returns the original payment instead of
 * charging twice.
 */
export async function payBill({ cardId, amount, upiId }, idempotencyKey) {
  const { data } = await paymentApi.post(
    '/api/payment/pay',
    { cardId, amount, upiId },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data; // { transactionId, status, amount }
}

export async function paymentHistory() {
  const { data } = await paymentApi.get('/api/payment/history');
  return data; // [{ transactionId, amount, status, createdAt }]
}
