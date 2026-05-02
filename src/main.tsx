import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { FavoritesProvider } from './favorites';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FavoritesProvider>
      <App />
    </FavoritesProvider>
  </StrictMode>,
);
