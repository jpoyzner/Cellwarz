import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isTouchDevice } from './game/touchDevice';
import './styles/cellwarz.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

// Everything touch-specific in the stylesheet hangs off this class, so desktop browsers never see it.
if (isTouchDevice()) document.documentElement.classList.add('touch-device');

createRoot(root).render(<App />);
