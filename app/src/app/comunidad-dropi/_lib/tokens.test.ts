import { describe, expect, it } from "vitest";
import {
  CONTACT_CHANNEL_LABELS,
  FOLLOW_UP_OUTCOME_COLORS,
  FOLLOW_UP_OUTCOME_LABELS,
} from "./tokens";

describe("FOLLOW_UP_OUTCOME_LABELS", () => {
  it("provides Spanish labels for every outcome value the drawer can set", () => {
    expect(FOLLOW_UP_OUTCOME_LABELS.ANSWERED).toBe("Respondió");
    expect(FOLLOW_UP_OUTCOME_LABELS.NO_ANSWER).toBe("No contesta");
    expect(FOLLOW_UP_OUTCOME_LABELS.INTERESTED).toBe("Interesado");
    expect(FOLLOW_UP_OUTCOME_LABELS.NOT_INTERESTED).toBe("No interesado");
    expect(FOLLOW_UP_OUTCOME_LABELS.SCHEDULED).toBe("Agendado");
    expect(FOLLOW_UP_OUTCOME_LABELS.NO_REPLY).toBe("Sin respuesta");
    expect(FOLLOW_UP_OUTCOME_LABELS.OTHER).toBe("Otro");
  });
});

describe("FOLLOW_UP_OUTCOME_COLORS", () => {
  it("provides a color tuple for every outcome label", () => {
    for (const key of Object.keys(FOLLOW_UP_OUTCOME_LABELS)) {
      const color = FOLLOW_UP_OUTCOME_COLORS[key];
      expect(color).toBeDefined();
      expect(color.bg).toMatch(/^#[0-9A-F]{3,6}$/i);
      expect(color.text).toMatch(/^#[0-9A-F]{3,6}$/i);
    }
  });
});

describe("CONTACT_CHANNEL_LABELS", () => {
  it("provides Spanish labels for each contact channel", () => {
    expect(CONTACT_CHANNEL_LABELS.WHATSAPP).toBe("WhatsApp");
    expect(CONTACT_CHANNEL_LABELS.CALL).toBe("Llamada");
    expect(CONTACT_CHANNEL_LABELS.EMAIL).toBe("Email");
    expect(CONTACT_CHANNEL_LABELS.OTHER).toBe("Otro");
  });
});
