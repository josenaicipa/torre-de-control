import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { canAccessStudent } from "@/lib/access";
import { isStudentPending } from "@/lib/student-payments-finance";
import {
  isStudentPendingNormalization,
  PENDING_NORMALIZATION_LABEL,
} from "@/lib/student-normalization";
import { AvancesTab } from "./avances-tab";
import { PagosTab } from "./pagos-tab";
import { MetricasTab } from "./metricas-tab";
import { ProductosTab } from "./productos-tab";
import { DeleteStudentButton } from "../delete-student-button";
import { StudentDataEditForm } from "./student-data-edit-form";
import { studentStatusLabel } from "@/lib/student-status";

export const dynamic = "force-dynamic";

interface StudentMemberRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  documentType: string | null;
  documentNumber: string | null;
  isPrimaryContact: boolean;
  isContractSigner: boolean;
}

const TABS = [
  { key: "info", label: "Info" },
  { key: "pagos", label: "Pagos" },
  { key: "avances", label: "Avances" },
  { key: "metricas", label: "Métricas" },
  { key: "ventas", label: "Ventas" },
  { key: "cursos-lw", label: "Cursos LW" },
];

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { id } = await params;
  const { tab: activeTab = "info" } = await searchParams;

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      mentorUser: { select: { id: true, name: true, email: true } },
      closerUser: { select: { id: true, name: true, email: true } },
      members: true,
      enrollments: {
        select: {
          status: true,
          accessStatus: true,
          payments: { select: { initialPaymentType: true } },
        },
      },
      _count: {
        select: {
          paymentSchedules: true,
          payments: true,
          progressUpdates: true,
          monthlyMetrics: true,
          sales: true,
        },
      },
    },
  });
  if (!student) notFound();
  if (!canAccessStudent(actor, student.mentorUserId)) notFound();
  const canWritePayments = actor.role === "ADMIN" || actor.role === "OPERATOR";

  // Ficha llegada desde GHL/n8n sin normalizar: ocultamos programa/duración
  // "reales" (son defaults técnicos) hasta que un operador la diligencie.
  const pendingNormalization = isStudentPendingNormalization({
    durationAssumed: student.durationAssumed,
    enrollmentCount: student.enrollments.length,
  });

  // Listas para los selects de mentor/closer en el editor de datos (mismo
  // criterio que el formulario de creación de estudiante). Sólo se necesitan
  // cuando el actor puede editar y está viendo la pestaña Info.
  const [mentors, closers] =
    canWritePayments && activeTab === "info"
      ? await Promise.all([
          prisma.user.findMany({
            where: { role: "MENTOR", active: true },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
          }),
          prisma.user.findMany({
            where: {
              active: true,
              OR: [{ position: "CLOSER" }, { position: "ADMIN" }],
            },
            select: { id: true, name: true, email: true, position: true },
            orderBy: { name: "asc" },
          }),
        ])
      : [[], []];
  const canWriteProgress =
    actor.role === "ADMIN" ||
    actor.role === "OPERATOR" ||
    (actor.role === "MENTOR" && actor.mentorUserId === student.mentorUserId);

  return (
    <div>
      <Link href="/operaciones/estudiantes" className="text-sm text-slate-500 hover:text-slate-900">
        ← Estudiantes
      </Link>
      <div className="mt-2 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{student.fullName}</h1>
          <p className="text-sm text-slate-500">{student.email}</p>
        </div>
        <div className="text-right text-sm text-slate-600">
          {pendingNormalization || isStudentPending(student.enrollments) ? (
            <>
              <p>Inicio: Pendiente</p>
              <p>Fin: Pendiente</p>
            </>
          ) : (
            <>
              <p>Inicio: {student.startDate.toISOString().slice(0, 10)}</p>
              <p>Fin: {student.endDate.toISOString().slice(0, 10)}</p>
            </>
          )}
          <p className="mt-1">Mentor: {student.mentorUser?.name ?? student.mentorUser?.email ?? "—"}</p>
          {actor.role === "ADMIN" && (
            <div className="mt-3 flex justify-end">
              <DeleteStudentButton
                studentId={student.id}
                studentName={student.fullName}
                variant="full"
                redirectTo="/operaciones/estudiantes"
              />
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 border-b border-slate-200">
        <nav className="-mb-px flex space-x-4">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/operaciones/estudiantes/${id}?tab=${t.key}`}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                activeTab === t.key
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {activeTab === "pagos" ? (
        <PagosTab studentId={student.id} canWrite={canWritePayments} />
      ) : activeTab === "avances" ? (
        <AvancesTab studentId={student.id} canWrite={canWriteProgress} />
      ) : activeTab === "metricas" ? (
        <MetricasTab studentId={student.id} canWrite={canWriteProgress} />
      ) : activeTab === "ventas" ? (
        <ProductosTab studentId={student.id} canWrite={canWritePayments} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          {activeTab === "info" && (
            <InfoTab
              student={student}
              canWriteLegal={canWritePayments}
              pendingNormalization={pendingNormalization}
              mentors={mentors}
              closers={closers}
            />
          )}
          {activeTab !== "info" && (
          <p className="text-sm text-slate-500">
            Esta pestaña se implementa en Sprint 2.
          </p>
          )}
        </div>
      )}
    </div>
  );
}

function InfoTab({
  student,
  canWriteLegal,
  pendingNormalization,
  mentors,
  closers,
}: {
  student: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    startDate: Date;
    durationMonths: number;
    status: string;
    mentorUserId: string | null;
    closerUserId: string | null;
    legalName: string | null;
    documentType: string | null;
    documentNumber: string | null;
    legalAddress: string | null;
    legalCity: string | null;
    legalState: string | null;
    legalCountry: string | null;
    notes: string | null;
    personality: string | null;
    ghlContactId: string | null;
    driveFolderUrl: string | null;
    driveFolderId: string | null;
    closerUser: { name: string | null; email: string } | null;
    members: StudentMemberRow[];
  };
  canWriteLegal: boolean;
  pendingNormalization: boolean;
  mentors: { id: string; name: string | null; email: string }[];
  closers: { id: string; name: string | null; email: string; position: string }[];
}) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="font-medium text-slate-500">Nombre legal</dt>
          <dd className="text-slate-900">{student.legalName ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Teléfono</dt>
          <dd className="text-slate-900">{student.phone ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Tipo de documento</dt>
          <dd className="text-slate-900">{student.documentType ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Número de documento</dt>
          <dd className="text-slate-900">{student.documentNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Dirección / domicilio</dt>
          <dd className="text-slate-900">{student.legalAddress ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Ciudad</dt>
          <dd className="text-slate-900">{student.legalCity ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Departamento / Estado / Provincia</dt>
          <dd className="text-slate-900">{student.legalState ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">País</dt>
          <dd className="text-slate-900">{student.legalCountry ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Programa</dt>
          <dd className="text-slate-900">
            {pendingNormalization ? (
              <span className="text-amber-700">{PENDING_NORMALIZATION_LABEL}</span>
            ) : (
              "Nivel 5 + Clases Avanzadas"
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Duración</dt>
          <dd className="text-slate-900">
            {pendingNormalization ? (
              <span className="text-amber-700">{PENDING_NORMALIZATION_LABEL}</span>
            ) : (
              `${student.durationMonths} meses`
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Estado</dt>
          <dd className="text-slate-900">
            {pendingNormalization ? (
              <span className="text-amber-700">{PENDING_NORMALIZATION_LABEL}</span>
            ) : (
              studentStatusLabel(student.status)
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Closer</dt>
          <dd className="text-slate-900">{student.closerUser?.name ?? student.closerUser?.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">ID contacto GHL</dt>
          <dd className="text-slate-900">{student.ghlContactId ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Carpeta Drive</dt>
          <dd className="text-slate-900">
            {(() => {
              const driveUrl =
                student.driveFolderUrl ??
                (student.driveFolderId && /^[A-Za-z0-9_-]+$/.test(student.driveFolderId)
                  ? `https://drive.google.com/drive/folders/${student.driveFolderId}`
                  : null);
              if (driveUrl) {
                return (
                  <>
                    <a
                      href={driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Abrir carpeta en Drive
                    </a>
                    <p className="mt-1 break-all text-xs text-slate-400">{driveUrl}</p>
                  </>
                );
              }
              if (student.driveFolderId) {
                return <span className="break-all">{student.driveFolderId}</span>;
              }
              return "—";
            })()}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="font-medium text-slate-500">Personalidad</dt>
          <dd className="text-slate-900">{student.personality ?? "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-medium text-slate-500">Notas</dt>
          <dd className="whitespace-pre-wrap text-slate-900">{student.notes ?? "—"}</dd>
        </div>
      </dl>

      {canWriteLegal && (
        <StudentDataEditForm
          studentId={student.id}
          mentors={mentors}
          closers={closers}
          members={student.members.map((m) => ({
            id: m.id,
            fullName: m.fullName,
            email: m.email,
            phone: m.phone,
            documentType: m.documentType,
            documentNumber: m.documentNumber,
            isPrimaryContact: m.isPrimaryContact,
            isContractSigner: m.isContractSigner,
          }))}
          initial={{
            fullName: student.fullName,
            email: student.email,
            phone: student.phone,
            startDate: student.startDate.toISOString().slice(0, 10),
            durationMonths: student.durationMonths,
            mentorUserId: student.mentorUserId,
            closerUserId: student.closerUserId,
            status: student.status,
            notes: student.notes,
            personality: student.personality,
            ghlContactId: student.ghlContactId,
            legalName: student.legalName,
            documentType: student.documentType,
            documentNumber: student.documentNumber,
            legalAddress: student.legalAddress,
            legalCity: student.legalCity,
            legalState: student.legalState,
            legalCountry: student.legalCountry,
          }}
        />
      )}
    </>
  );
}
