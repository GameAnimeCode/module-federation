// In production the host's compiled assets are copied into the same
// wwwroot the .NET backend serves (see scripts/build.sh), so the API,
// extension bundles, and host are all same-origin and relative URLs just
// work. In dev, the host runs on Vite's dev server (port 5173) while the
// backend runs separately via `dotnet run` (port 5080) — a different
// origin — so VITE_API_BASE_URL (see .env.development) points the dev host
// at it. This is also exactly the CORS boundary the backend's DevClients
// policy exists for (see backend/Program.cs).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
