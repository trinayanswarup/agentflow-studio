/**
 * Thin, fixed progress bar shown by Next.js App Router's loading.tsx
 * convention during a route transition. Indeterminate (no real progress
 * value), so it's a decorative status indicator rather than a real
 * <progress> — role="progressbar" without aria-valuenow communicates that
 * correctly to assistive tech.
 *
 * Uses accent-400 (lighter than the standard accent-500 chrome color) plus
 * the existing accent-glow shadow token — both already in the design system
 * (tailwind.config.ts), not new colors. A loading indicator needs to read
 * instantly at a glance at only 3px tall against a near-black background;
 * the glow adds perceived contrast beyond what the fill color alone gives.
 * z-[100] is deliberately above every other fixed/overlay element in the
 * app (the highest existing one, GuidedTour's tooltip, sits at z-[52]).
 */
export function TopLoadingBar() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-transparent"
      role="progressbar"
      aria-label="Loading"
    >
      <div className="h-full w-1/4 animate-loading-bar bg-accent-400 shadow-accent-glow" />
    </div>
  );
}
