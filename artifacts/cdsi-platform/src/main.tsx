import { createRoot } from 'react-dom/client';

import App from './App';
import { setBaseUrl } from '@workspace/api-client-react';

import './index.css';

// Set API base URL for production
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
setBaseUrl(apiUrl);

createRoot(document.getElementById('root')!).render(<App />);
