// Shown automatically while a route segment is server-rendering — page-to-page
// navigation and any router.refresh() that has real work to do. Delayed via
// CSS so a fast transition never flashes it.
export default function Loading() {
  return <div className="route-loading" aria-hidden="true" />;
}
