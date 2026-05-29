import { describe, expect, it } from "vitest";
import {
  computeStudentFinanceTotals,
  isStudentPending,
  paymentUsdValue,
} from "./student-payments-finance";

describe("paymentUsdValue", () => {
  it("usa officialAmountUsd cuando viene seteado, sin importar la moneda", () => {
    expect(
      paymentUsdValue({ amount: "1500000", currency: "COP", officialAmountUsd: "411.34" }),
    ).toBe(411.34);
    expect(
      paymentUsdValue({ amount: "20", currency: "USD", officialAmountUsd: "11.34" }),
    ).toBe(11.34);
  });

  it("cae a amount sólo si la moneda es USD y no hay officialAmountUsd", () => {
    expect(paymentUsdValue({ amount: "120.50", currency: "USD" })).toBe(120.5);
    expect(paymentUsdValue({ amount: 200, currency: "usd" })).toBe(200);
  });

  it("devuelve 0 si la moneda no es USD y no hay USD oficial", () => {
    expect(paymentUsdValue({ amount: "1500000", currency: "COP" })).toBe(0);
    expect(
      paymentUsdValue({ amount: "1500000", currency: "COP", officialAmountUsd: null }),
    ).toBe(0);
  });
});

describe("computeStudentFinanceTotals", () => {
  it("caso real: programa USD 2900 con pago COP 1500000 / USD oficial 411.34", () => {
    const enrollments = [
      { totalAmountUsd: "2900", balanceUsd: "2488.66" },
    ];
    const payments = [
      { amount: "1500000", currency: "COP", officialAmountUsd: "411.34" },
    ];
    expect(computeStudentFinanceTotals(enrollments, payments)).toEqual({
      totalUsd: 2900,
      paidUsd: 411.34,
      balanceUsd: 2488.66,
    });
  });

  it("calcula saldo desde total - pagado si ningún enrollment trae balanceUsd", () => {
    const enrollments = [{ totalAmountUsd: "1000", balanceUsd: null }];
    const payments = [{ amount: "250", currency: "USD" }];
    expect(computeStudentFinanceTotals(enrollments, payments)).toEqual({
      totalUsd: 1000,
      paidUsd: 250,
      balanceUsd: 750,
    });
  });

  it("nunca devuelve saldo negativo desde el fallback", () => {
    const enrollments = [{ totalAmountUsd: "100", balanceUsd: null }];
    const payments = [{ amount: "500", currency: "USD" }];
    const res = computeStudentFinanceTotals(enrollments, payments);
    expect(res.balanceUsd).toBe(0);
  });

  it("ignora pagos COP sin USD oficial al sumar pagado", () => {
    const enrollments = [{ totalAmountUsd: "2900", balanceUsd: "2900" }];
    const payments = [
      { amount: "1500000", currency: "COP" },
      { amount: "100", currency: "USD" },
    ];
    const res = computeStudentFinanceTotals(enrollments, payments);
    expect(res.paidUsd).toBe(100);
    expect(res.balanceUsd).toBe(2900);
  });
});

describe("isStudentPending", () => {
  it("sin enrollments (legacy) => no pendiente, se respetan las fechas reales", () => {
    expect(isStudentPending([])).toBe(false);
  });

  it("acceso ACTIVE en algún enrollment => no pendiente", () => {
    expect(
      isStudentPending([
        { accessStatus: "ACTIVE", payments: [{ initialPaymentType: "RESERVATION" }] },
      ]),
    ).toBe(false);
  });

  it("accessStatus PENDING y nadie ACTIVO => pendiente", () => {
    expect(
      isStudentPending([
        { accessStatus: "PENDING", payments: [{ initialPaymentType: "DOWN_PAYMENT" }] },
      ]),
    ).toBe(true);
  });

  it("pago inicial RESERVATION sin acceso activo => pendiente", () => {
    expect(
      isStudentPending([
        { accessStatus: "SUSPENDED", payments: [{ initialPaymentType: "RESERVATION" }] },
      ]),
    ).toBe(true);
  });

  it("sólo accesos REVOKED sin reserva ni pending => no pendiente", () => {
    expect(
      isStudentPending([
        { accessStatus: "REVOKED", payments: [{ initialPaymentType: "FULL_PAYMENT" }] },
      ]),
    ).toBe(false);
  });
});
