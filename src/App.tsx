import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AppRouter } from './app/AppRouter';

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
