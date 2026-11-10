import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');

createRoot(root).render(
  <StrictMode>
    {/* The list search box takes its value from ?q=. In a transition the
        input lags behind the keys and drops characters and IME input. */}
    <BrowserRouter useTransitions={false}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
