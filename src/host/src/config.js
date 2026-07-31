// Empty (same-origin) in production. In dev, points at the backend's own
// port, a different origin from the host's Vite server (see .env.development).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
