/**
 * Lightweight skeleton for an election card. Purely presentational and
 * aria-hidden: the parent announces loading through a live status region,
 * so screen readers hear one message instead of a dozen grey boxes.
 */
export function ElectionCardSkeleton() {
  return (
    <div aria-hidden="true" className="card flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-5 w-4/5" />
        </div>
        <div className="skeleton h-6 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-8 w-full" />
        <div className="skeleton h-8 w-full" />
      </div>
      <div className="space-y-2">
        <div className="skeleton h-3 w-1/3" />
        <div className="skeleton h-3 w-full rounded-full" />
      </div>
      <div className="skeleton mt-auto h-11 w-full" />
    </div>
  );
}
