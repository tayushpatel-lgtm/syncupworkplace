'use client';

import { useRouter } from '../lib/useRouter';

export default function MonthPicker({ hrefBase, months, selectedMonth }) {
  const router = useRouter();

  function selectMonth(event, month) {
    event.currentTarget.closest('details')?.removeAttribute('open');
    router.push(`${hrefBase}${month}`);
  }

  return (
    <details className="month-picker">
      <summary className="on">This month</summary>
      <div className="month-picker-menu">
        {months.map(([month, label]) => (
          <button
            key={month}
            type="button"
            className={month === selectedMonth ? 'selected' : ''}
            onClick={(event) => selectMonth(event, month)}
          >
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}