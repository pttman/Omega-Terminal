import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './theme.css';
import './motion.css';
import './connections.css';

// Load the bundled font before xterm measures its grid cells.
void Promise.all([
  document.fonts.load('14px "JetBrains Mono"'),
  document.fonts.load('bold 14px "JetBrains Mono"'),
]).catch(()=>{}).then(()=>{
  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
});
