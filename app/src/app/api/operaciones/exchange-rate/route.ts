import { NextResponse } from "next/server";
import { getActor, requireActor } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import {
  ExchangeRateUnavailableError,
  getExchangeRate,
  isIsoDate,
} from "@/lib/exchange-rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED = new Set(["USD", "COP"]);

export async function GET(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);

    const { searchParams } = new URL(req.url);
    const rawCurrency = (searchParams.get("currency") ?? "").trim().toUpperCase();
    const rawDate = (searchParams.get("date") ?? "").trim();

    if (!rawCurrency) {
      return jsonError(400, "Parámetro currency requerido");
    }
    if (!SUPPORTED.has(rawCurrency)) {
      return jsonError(
        400,
        `Moneda no soportada para tasa automática: ${rawCurrency}`,
      );
    }
    if (!rawDate || !isIsoDate(rawDate)) {
      return jsonError(400, "Parámetro date requerido (formato YYYY-MM-DD)");
    }

    const result = await getExchangeRate(rawCurrency, rawDate);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ExchangeRateUnavailableError) {
      return jsonError(502, err.message);
    }
    return handleApiError(err);
  }
}
