import axios from 'axios';
import { userManager } from '../auth/oidc';
import appConfig from '../config';

/**
 * API layer for the admin portal. Every call carries the admin's Keycloak
 * access token; the services allow /api/admin/** for the ADMIN role only.
 *
 *  - userApi    -> user-service     (/api/admin/users)
 *  - paymentApi -> payment-service  (/api/admin/payments)
 */

const USER_BASE_URL = appConfig.userApiUrl;
const PAYMENT_BASE_URL = appConfig.paymentApiUrl;

export const userApi = axios.create({ baseURL: USER_BASE_URL, timeout: 15000 });
export const paymentApi = axios.create({ baseURL: PAYMENT_BASE_URL, timeout: 15000 });

for (const api of [userApi, paymentApi]) {
  api.interceptors.request.use(async (config) => {
    const user = await userManager.getUser();
    if (user?.access_token) {
      config.headers.Authorization = `Bearer ${user.access_token}`;
    }
    return config;
  });

  // 401 = the session ended: sign in again
  api.interceptors.response.use(undefined, async (error) => {
    if (error?.response?.status === 401) {
      await userManager.removeUser();
      window.location.assign('/login?expired=1');
    }
    return Promise.reject(error);
  });
}

/** Both services return { detail } on errors. */
export function extractErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data;
  if (!data) {
    if (error?.code === 'ECONNABORTED') return 'Request timed out. Is the backend running?';
    if (error?.message === 'Network Error') return 'Cannot reach the server. Is the backend running?';
    return fallback;
  }
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail) && data.detail.length) {
    return data.detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
  }
  return fallback;
}

// --- user-service -------------------------------------------------------
export async function fetchUserSummary() {
  const { data } = await userApi.get('/api/admin/users/summary');
  return data; // { totalUsers, newUsersLast7Days, totalCards }
}

export async function fetchUsers({ search, page, size }) {
  const { data } = await userApi.get('/api/admin/users', { params: { search: search || undefined, page, size } });
  return data; // { items: [{ id, fullName, email, createdAt, cardCount }], total, page, size }
}

// --- payment-service ----------------------------------------------------
export async function fetchPaymentSummary() {
  const { data } = await paymentApi.get('/api/admin/payments/summary');
  return data; // { totalPayments, totalAmount, averageAmount, successRate, paymentsToday, amountToday, last7Days }
}

export async function fetchPayments({ status, search, page, size }) {
  const { data } = await paymentApi.get('/api/admin/payments', {
    params: { status: status || undefined, search: search || undefined, page, size },
  });
  return data; // { items: [{ transactionId, amount, status, upiId, createdAt, userEmail, userName, cardNumber, cardNetwork }], total, page, size }
}
