import Link from "next/link";
import { COLORS } from "../../_lib/tokens";

// Pill segmented control to switch between the operational table and the
// secondary kanban board. Server-renderable so each page composes its
// filter-preserving href on the server without a hydration boundary.
export function ViewToggle({
  activeView,
  tableHref,
  kanbanHref,
}: {
  activeView: "table" | "kanban";
  tableHref: string;
  kanbanHref: string;
}) {
  const items: Array<{ view: "table" | "kanban"; label: string; href: string }> = [
    { view: "table", label: "Tabla", href: tableHref },
    { view: "kanban", label: "Kanban", href: kanbanHref },
  ];
  return (
    <nav
      aria-label="Cambiar vista de seguimientos"
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 3,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 999,
        backgroundColor: COLORS.surface,
      }}
    >
      {items.map((item) => {
        const active = item.view === activeView;
        return (
          <Link
            key={item.view}
            href={item.href}
            aria-current={active ? "page" : undefined}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              color: active ? COLORS.surface : COLORS.textSoft,
              backgroundColor: active ? COLORS.brand : "transparent",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
