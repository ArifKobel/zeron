import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { bootstrap, SessionProvider } from '@/session';
import '@/styles/index.css';

const root = createRoot(document.getElementById('root')!);

bootstrap().then(
  (session) =>
    root.render(
      <StrictMode>
        <SessionProvider session={session}>
          <App />
        </SessionProvider>
      </StrictMode>,
    ),
  (error: Error) =>
    root.render(
      <div className="app">
        <div className="pane-placeholder">Zeron couldn't start: {error.message}</div>
      </div>,
    ),
);
