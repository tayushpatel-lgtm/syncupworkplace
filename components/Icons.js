// Hairline icons, drawn to sit quietly next to text at 18px.

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const Icon = {
  bolt: (p) => (
    <svg {...base} {...p}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  ),
  list: (p) => (
    <svg {...base} {...p}>
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  ),
  calendar: (p) => (
    <svg {...base} {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  ),
  doc: (p) => (
    <svg {...base} {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  ),
  clock: (p) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
  users: (p) => (
    <svg {...base} {...p}>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
      <circle cx="9.5" cy="7" r="3.2" />
      <path d="M17 11a3 3 0 1 0-1.5-5.6M21 20v-1.5a3.7 3.7 0 0 0-2.5-3.4" />
    </svg>
  ),
  chart: (p) => (
    <svg {...base} {...p}>
      <path d="M4 20V5" />
      <path d="M8 20v-6M13 20V9M18 20v-9" />
      <path d="M4 20h16" />
    </svg>
  ),
  gear: (p) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z" />
    </svg>
  ),
  edit: (p) => (
    <svg {...base} {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  ),
  check: (p) => (
    <svg {...base} {...p}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  plus: (p) => (
    <svg {...base} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  close: (p) => (
    <svg {...base} {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  paperclip: (p) => (
    <svg {...base} {...p}>
      <path d="M21 11.5 12.4 20a4.7 4.7 0 0 1-6.6-6.6l8-8a3.2 3.2 0 0 1 4.5 4.5l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.1-7.1" />
    </svg>
  ),
  image: (p) => (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="9" cy="9" r="1.8" />
      <path d="M21 15l-5.5-5.5L3 21" />
    </svg>
  ),
  key: (p) => (
    <svg {...base} {...p}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8M15 8l2.5 2.5M18 5l2.5 2.5" />
    </svg>
  ),
  grid: (p) => (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="8" height="8" rx="1.6" />
      <rect x="13" y="3" width="8" height="8" rx="1.6" />
      <rect x="3" y="13" width="8" height="8" rx="1.6" />
      <rect x="13" y="13" width="8" height="8" rx="1.6" />
    </svg>
  ),
  eye: (p) => (
    <svg {...base} {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  trash: (p) => (
    <svg {...base} {...p}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  ),
  exit: (p) => (
    <svg {...base} {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  play: (p) => (
    <svg {...base} {...p}>
      <path d="M6 4l14 8-14 8V4Z" />
    </svg>
  ),
  pause: (p) => (
    <svg {...base} {...p}>
      <path d="M9 4v16M15 4v16" />
    </svg>
  ),
  send: (p) => (
    <svg {...base} {...p}>
      <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4L21 3Z" />
    </svg>
  ),
  download: (p) => (
    <svg {...base} {...p}>
      <path d="M12 3v12M7 11l5 5 5-5M4 21h16" />
    </svg>
  ),
  copy: (p) => (
    <svg {...base} {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  ),
  robot: (p) => (
    <svg {...base} {...p}>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4M9 14h.01M15 14h.01M9 17.5h6" />
    </svg>
  ),
  slack: (p) => (
    <svg {...base} {...p}>
      <path d="M9 3.5a1.6 1.6 0 1 1 0 3.2H7.4A1.6 1.6 0 1 1 7.4 3.5H9ZM3.5 15a1.6 1.6 0 1 0 3.2 0v-1.6a1.6 1.6 0 1 0-3.2 0V15Z" />
      <path d="M15 20.5a1.6 1.6 0 1 1 0-3.2h1.6a1.6 1.6 0 1 1 0 3.2H15ZM20.5 9a1.6 1.6 0 1 0-3.2 0v1.6a1.6 1.6 0 1 0 3.2 0V9Z" />
      <path d="M10.6 10.6h2.8v2.8h-2.8z" />
    </svg>
  ),
  clipboard: (p) => (
    <svg {...base} {...p}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 10h6M9 14h4" />
    </svg>
  ),
  sun: (p) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  spinner: (p) => (
    <svg {...base} {...p} className={`spin ${p?.className || ''}`}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  ),
};

export default Icon;
