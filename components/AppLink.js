import Link from 'next/link';

/** True for same-app paths like `/tasks` (not `//evil.com` or `https://…`). */
export function isInternalPath(href) {
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
}

/**
 * Internal routes use Next.js client navigation; external URLs open in a new tab.
 * Use this anywhere a card or button links within the app.
 */
export default function AppLink({
  href,
  children,
  className,
  style,
  external,
  prefetch = false,
  ...rest
}) {
  const internal = !external && isInternalPath(href);

  if (internal) {
    return (
      <Link href={href} className={className} style={style} prefetch={prefetch} {...rest}>
        {children}
      </Link>
    );
  }

  const isHttp = href && /^https?:\/\//i.test(href);
  return (
    <a
      href={href || '#'}
      className={className}
      style={style}
      target={isHttp ? '_blank' : undefined}
      rel={isHttp ? 'noreferrer' : undefined}
      {...rest}
    >
      {children}
    </a>
  );
}
