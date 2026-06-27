import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ token: string }>;
}

const required = z.string().trim().min(1, "Campo obligatorio");
const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => v ?? "");
const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.toLowerCase() : ""));

const onboardingSchema = z.object({
  nombre: optional,
  apellidos: optional,
  whatsapp: required,
  correoPrincipal: z
    .string()
    .trim()
    .email("Correo principal inválido")
    .transform((v) => v.toLowerCase()),
  correoSecundario: optionalEmail,
  direccionPostal: required,
  ciudad: required,
  region: required,
  pais: required,
  nombreLegal: required,
  tipoDocumento: required,
  numeroDocumento: required,
  tiendaActiva: required,
  paisOpera: required,
  nombreTienda: optional,
  facturacionActual: optional,
  plataformaLogistica: optional,
  comoNosConociste: required,
  otroMedio: optional,
  porQueMundoDigital: required,
  tiempoSemanal: required,
  presupuestoInicial: required,
  queEsperasLograr: required,
});

// Envío público del onboarding por token. No requiere login: el token ES la
// autorización. Actualiza los datos legales del estudiante y guarda el resto de
// respuestas comerciales en onboardingResponses. No toca producto, pagos,
// contrato ni accesos.
export async function POST(req: Request, { params }: Params) {
  try {
    const { token } = await params;
    if (!token) return jsonError(404, "Enlace de onboarding inválido");

    const student = await prisma.student.findUnique({
      where: { onboardingToken: token },
      select: { id: true },
    });
    if (!student) return jsonError(404, "Enlace de onboarding inválido o vencido");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const data = onboardingSchema.parse(body);

    const fullName = [data.nombre, data.apellidos]
      .filter((part) => part.length > 0)
      .join(" ")
      .trim();

    const onboardingResponses = {
      correoSecundario: data.correoSecundario,
      tiendaActiva: data.tiendaActiva,
      paisOpera: data.paisOpera,
      nombreTienda: data.nombreTienda,
      facturacionActual: data.facturacionActual,
      plataformaLogistica: data.plataformaLogistica,
      comoNosConociste: data.comoNosConociste,
      otroMedio: data.otroMedio,
      porQueMundoDigital: data.porQueMundoDigital,
      tiempoSemanal: data.tiempoSemanal,
      presupuestoInicial: data.presupuestoInicial,
      queEsperasLograr: data.queEsperasLograr,
    };

    await prisma.student.update({
      where: { id: student.id },
      data: {
        ...(fullName ? { fullName } : {}),
        email: data.correoPrincipal,
        phone: data.whatsapp,
        legalName: data.nombreLegal,
        documentType: data.tipoDocumento,
        documentNumber: data.numeroDocumento,
        legalAddress: data.direccionPostal,
        legalCity: data.ciudad,
        legalState: data.region,
        legalCountry: data.pais,
        onboardingResponses,
        onboardingCompletedAt: new Date(),
      },
    });

    await writeAudit({
      actorId: null,
      action: "operaciones.student.complete_onboarding",
      target: student.id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
