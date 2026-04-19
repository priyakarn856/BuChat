import toast from 'react-hot-toast';

export const notify = {
  success: (message) => toast.success(message, {
    duration: 3000,
    position: 'top-right',
    style: {
      background: '#10b981',
      color: '#fff',
      borderRadius: '10px',
      padding: '16px',
    },
  }),

  error: (message) => toast.error(message, {
    duration: 4000,
    position: 'top-right',
    style: {
      background: '#ef4444',
      color: '#fff',
      borderRadius: '10px',
      padding: '16px',
    },
  }),

  info: (message) => toast(message, {
    duration: 3000,
    position: 'top-right',
    icon: 'ℹ️',
    style: {
      background: '#3b82f6',
      color: '#fff',
      borderRadius: '10px',
      padding: '16px',
    },
  }),

  warning: (message) => toast(message, {
    duration: 3000,
    position: 'top-right',
    icon: '⚠️',
    style: {
      background: '#f59e0b',
      color: '#fff',
      borderRadius: '10px',
      padding: '16px',
    },
  }),

  promise: (promise, messages) => toast.promise(
    promise,
    {
      loading: messages.loading || 'Loading...',
      success: messages.success || 'Success!',
      error: messages.error || 'Error occurred',
    },
    {
      style: {
        borderRadius: '10px',
        padding: '16px',
      },
    }
  ),
};
