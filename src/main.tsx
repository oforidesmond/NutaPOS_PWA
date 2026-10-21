import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { db } from '@/db/schema';
import { text } from '@/theme';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@/styles/app.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element missing');
}

db.open().then(
  () => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Could not open the local database.';
    root.replaceChildren();
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    Object.assign(paragraph.style, text.body);
    paragraph.style.padding = '24px';
    root.append(paragraph);
  },
);
