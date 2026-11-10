import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import './styles/global.css';

// A data router only so the publish page can use useBlocker, which needs
// one. Every path goes to the one splat route, and AppRoutes keeps matching
// with <Routes> as before.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    ),
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');

createRoot(root).render(
  <StrictMode>
    {/* The list search box takes its value from ?q=. In a transition the
        input lags behind the keys and drops characters and IME input. */}
    <RouterProvider router={router} useTransitions={false} />
  </StrictMode>,
);
