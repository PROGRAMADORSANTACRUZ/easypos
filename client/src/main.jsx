import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ReservaPublica from './pages/ReservaPublica.jsx';
import './styles.css';

const esReservaPublica = /^\/reservar(\/|$)/.test(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {esReservaPublica ? <ReservaPublica /> : (
      <>
        {window.POS_DESKTOP && <div className="desktop-titlebar" aria-hidden="true" />}
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </>
    )}
  </React.StrictMode>
);
