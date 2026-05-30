"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COLORS, SUBNAV } from "../_lib/tokens";

// Pill-style sub-navigation rendered inside each Comunidad Dropi page. Kept
// separate from the operations shell sidebar so the module owns its own
// sections without touching the global navigation tree.
export function SubNav() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 18,
      }}
    >
      {SUBNAV.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/comunidad-dropi" &&
            pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              textDecoration: "none",
              color: active ? COLORS.surface : COLORS.textSoft,
              backgroundColor: active ? COLORS.brand : COLORS.surface,
              border: `1px solid ${active ? COLORS.brand : COLORS.border}`,
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
