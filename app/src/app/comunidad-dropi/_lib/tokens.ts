// Shared design tokens for the Comunidad Dropi module so every page stays
// visually aligned with Operaciones without re-declaring colors and labels.

export const COLORS = {
  brand: "#E03A18",
  text: "#111110",
  textSoft: "#5C5C52",
  textMuted: "#9C9B93",
  surface: "#FFFFFF",
  border: "#E5E4DF",
  background: "#F7F6F2",
  success: "#15803D",
  warning: "#D97706",
  danger: "#B91C1C",
};

export const SUBNAV = [
  { href: "/comunidad-dropi", label: "Resumen" },
  { href: "/comunidad-dropi/miembros", label: "Miembros" },
  { href: "/comunidad-dropi/importaciones", label: "Importaciones" },
  { href: "/comunidad-dropi/seguimientos", label: "Seguimientos" },
];

export const SEGMENT_LABELS: Record<string, string> = {
  ZERO_SALES: "Sin ventas",
  NEW_SELLER: "Nuevo",
  LOW_VOLUME: "Bajo volumen",
  GROWING: "Creciendo",
  DROPPING: "En caída",
  HIGH_RETURN_RISK: "Devol. altas",
  RECOVERED: "Recuperado",
  TOP_PERFORMER: "Mejor vendedor",
  STABLE: "Estable",
};

export const SEGMENT_COLORS: Record<string, { bg: string; text: string }> = {
  ZERO_SALES: { bg: "#FEE2E2", text: "#991B1B" },
  NEW_SELLER: { bg: "#E0F2FE", text: "#075985" },
  LOW_VOLUME: { bg: "#FEF3C7", text: "#92400E" },
  GROWING: { bg: "#DCFCE7", text: "#166534" },
  DROPPING: { bg: "#FEE2E2", text: "#991B1B" },
  HIGH_RETURN_RISK: { bg: "#FFE4E6", text: "#9F1239" },
  RECOVERED: { bg: "#E0E7FF", text: "#3730A3" },
  TOP_PERFORMER: { bg: "#FAE8FF", text: "#86198F" },
  STABLE: { bg: "#F1F5F9", text: "#475569" },
};

export const PRIORITY_LABELS: Record<string, string> = {
  P1: "P1 · Urgente",
  P2: "P2 · Importante",
  P3: "P3 · Seguimiento",
  P4: "P4 · Caso éxito",
};

export const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  P1: { bg: "#FEE2E2", text: "#991B1B" },
  P2: { bg: "#FEF3C7", text: "#92400E" },
  P3: { bg: "#F1F5F9", text: "#475569" },
  P4: { bg: "#FAE8FF", text: "#86198F" },
};

export const FOLLOW_UP_REASON_LABELS: Record<string, string> = {
  ZERO_SALES: "Sin ventas",
  DROP: "Caída",
  HIGH_RETURN: "Devoluciones altas",
  LOW_VOLUME: "Bajo volumen",
  TOP_PERFORMER: "Mejor vendedor",
  OTHER: "Otro",
};

export const FOLLOW_UP_STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En curso",
  DONE: "Hecho",
  DISMISSED: "Descartado",
};

// Structured outcome of the last contact attempt. Internal codes stay in
// English; only the UI labels are localised.
export const FOLLOW_UP_OUTCOME_LABELS: Record<string, string> = {
  ANSWERED: "Respondió",
  NO_ANSWER: "No contesta",
  INTERESTED: "Interesado",
  NOT_INTERESTED: "No interesado",
  SCHEDULED: "Agendado",
  NO_REPLY: "Sin respuesta",
  OTHER: "Otro",
};

export const FOLLOW_UP_OUTCOME_COLORS: Record<
  string,
  { bg: string; text: string }
> = {
  ANSWERED: { bg: "#DCFCE7", text: "#166534" },
  NO_ANSWER: { bg: "#FEF3C7", text: "#92400E" },
  INTERESTED: { bg: "#E0F2FE", text: "#075985" },
  NOT_INTERESTED: { bg: "#FEE2E2", text: "#991B1B" },
  SCHEDULED: { bg: "#FAE8FF", text: "#86198F" },
  NO_REPLY: { bg: "#F1F5F9", text: "#475569" },
  OTHER: { bg: "#F1F5F9", text: "#475569" },
};

// Channel the operator used to reach the member. Free-form "OTHER" exists so
// the picker stays honest about edge cases (DM, in-person, etc.) without
// inviting label sprawl.
export const CONTACT_CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  CALL: "Llamada",
  EMAIL: "Email",
  OTHER: "Otro",
};

export const CONTACT_CHANNEL_COLORS: Record<
  string,
  { bg: string; text: string }
> = {
  WHATSAPP: { bg: "#DCFCE7", text: "#166534" },
  CALL: { bg: "#E0F2FE", text: "#075985" },
  EMAIL: { bg: "#FEF3C7", text: "#92400E" },
  OTHER: { bg: "#F1F5F9", text: "#475569" },
};
