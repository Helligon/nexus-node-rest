import { createRoot } from 'react-dom/client';
import App from './App';
import { logError } from './logger';
import './styles.css';

window.addEventListener('error', (event) => logError(event.error));
window.addEventListener('unhandledrejection', (event) => logError(event.reason));

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
