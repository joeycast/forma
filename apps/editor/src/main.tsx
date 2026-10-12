import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { AuthGate } from './AuthGate';
import { ErrorBoundary, recordLastValidDocument } from './ErrorBoundary';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ReactFlowProvider>
        <AuthGate onValidDocument={recordLastValidDocument} />
      </ReactFlowProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
