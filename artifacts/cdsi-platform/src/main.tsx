import { createRoot } from 'react-dom/client';

import App from './App';
import { setBaseUrl } from '@workspace/api-client-react';

import './index.css';

import { getApiUrl } from './lib/api-url';

// Set API base URL for production
setBaseUrl(getApiUrl());

createRoot(document.getElementById('root')!).render(<App />);
