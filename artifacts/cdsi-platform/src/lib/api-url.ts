export function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim().length > 0 && !envUrl.includes('localhost')) {
    return envUrl.trim();
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://cdsi-3kq1.onrender.com';
  }
  return envUrl || 'http://localhost:8080';
}
