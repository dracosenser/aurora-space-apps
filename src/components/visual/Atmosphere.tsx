/**
 * The page's ground: the faint measuring grid of a technical sheet, nothing
 * more. Paper fibre and film grain are applied in the stylesheet (body::before
 * and .grain), so there is no lit layer anywhere behind the content.
 */
export function Atmosphere() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="plate-grid absolute inset-0" />
    </div>
  )
}
