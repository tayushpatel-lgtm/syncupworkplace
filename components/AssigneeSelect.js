'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const radius = 'rounded-[6px]';
const PANEL_H = 280;
const SEARCH_H = 48;
const GAP = 4;
const EDGE = 8;

export default function AssigneeSelect({ id, people, currentUserId, value, onChange }) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [box, setBox] = useState(null);

  const selected = people.find((p) => p.id === value);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, query]);

  function place() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    const placeBelow = below >= 140 || below >= above;
    const available = Math.max(120, placeBelow ? below : above);
    const height = Math.min(PANEL_H, available);
    setBox({
      top: placeBelow ? rect.bottom + GAP : rect.top - GAP - height,
      left: rect.left,
      width: rect.width,
      height,
    });
  }

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return undefined;
    }
    place();
    const onWin = () => place();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const idx = people.findIndex((p) => p.id === value);
    setActive(idx < 0 ? 0 : idx);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !box) return;
    const el = searchRef.current || panelRef.current?.querySelector('input');
    el?.focus();
  }, [open, box]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, matches, open]);

  function pick(person) {
    onChange(person.id);
    setOpen(false);
  }

  function onSearchKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, matches.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const person = matches[active];
      if (person) pick(person);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  const label = selected
    ? `${selected.name}${selected.id === currentUserId ? ' (you)' : ''}`
    : 'Pick someone';
  const listH = box ? Math.max(64, box.height - SEARCH_H) : 0;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-1.5 border border-input bg-transparent px-2.5 py-1 text-left text-base md:text-sm outline-none select-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          radius,
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && box && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className={cn(
                'fixed z-[80] flex flex-col overflow-hidden bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10',
                radius,
              )}
              style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
            >
              <div className="shrink-0 p-2" style={{ height: SEARCH_H }}>
                <Input
                  ref={searchRef}
                  type="text"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search by name"
                  className={radius}
                  aria-label="Search by name"
                />
              </div>
              <ul
                ref={listRef}
                role="listbox"
                className="scroll-hidden min-h-0 p-1"
                style={{ height: listH }}
              >
                {matches.length === 0 ? (
                  <li className="px-2 py-2 text-sm text-muted-foreground">No one matches</li>
                ) : (
                  matches.map((p, i) => {
                    const you = p.id === currentUserId;
                    const isOn = p.id === value;
                    return (
                      <li key={p.id} role="option" aria-selected={isOn}>
                        <button
                          type="button"
                          data-active={i === active}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-1.5 rounded-[6px] py-1.5 pr-2 pl-1.5 text-left text-sm',
                            i === active ? 'bg-accent text-accent-foreground' : null,
                          )}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => pick(p)}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {p.name}
                            {you ? ' (you)' : ''}
                          </span>
                          {isOn ? <Check className="size-4 shrink-0" /> : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
