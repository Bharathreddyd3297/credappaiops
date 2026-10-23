const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const shortDay = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric' });

export const formatInr = (amount) => inr.format(amount ?? 0);
export const formatDateTime = (iso) => (iso ? dateTime.format(new Date(iso)) : '-');
// '2026-10-22' -> 'Thu 22' (parsed as a local date, not UTC midnight)
export const formatDay = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return shortDay.format(new Date(y, m - 1, d));
};
