import { toast } from 'sonner';

const TITLES = {
  success: 'Success',
  error: 'Error',
  info: 'Information',
  warning: 'Warning',
};

function show(type, description, options = {}) {
  const { title = TITLES[type], ...rest } = options;
  return toast[type](title, { description, ...rest });
}

/** Global app toasts — title + description, matching the Sonner layout. */
export const notify = {
  success: (description, options) => show('success', description, options),
  error: (description, options) => show('error', description, options),
  info: (description, options) => show('info', description, options),
  warning: (description, options) => show('warning', description, options),
};
