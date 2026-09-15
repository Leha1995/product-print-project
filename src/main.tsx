import * as React from 'react';
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { applyStoredFavicon } from './lib/favicon'

applyStoredFavicon();

createRoot(document.getElementById("root")!).render(<App />);