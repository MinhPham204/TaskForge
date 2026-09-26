import { Toaster } from 'react-hot-toast';

const FeedbackHost = () => (
  <Toaster
    position="top-right"
    toastOptions={{
      duration: 4500,
      style: {
        background: 'var(--surface)',
        color: 'var(--content)',
        border: '1px solid var(--border)',
      },
      success: { iconTheme: { primary: '#047857', secondary: '#ecfdf5' } },
      error: { iconTheme: { primary: '#b91c1c', secondary: '#fef2f2' } },
    }}
  />
);

export default FeedbackHost;
