// War room: the company target everyone sees every day until the deadline.
// Edit this file to change the targets or the deadline.

export const WAR_ROOM = {
  enabled: true,
  title: 'War Room',
  targets: [
    { value: '100K', label: 'Users' },
    { value: '30', label: 'Paid brands' },
  ],
  // End of 25 December 2026, India time.
  deadline: '2026-12-25T23:59:59+05:30',
  deadlineLabel: '25 December',
};

/** Days / hours / minutes / seconds left until the deadline (all zero once it has passed). */
export function timeLeft(now = Date.now(), deadline = WAR_ROOM.deadline) {
  const ms = Math.max(0, new Date(deadline).getTime() - now);
  const total = Math.floor(ms / 1000);
  return {
    done: ms === 0,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
