// Compatibilidad: /comunidad-dropi/acciones quedó deprecada cuando Seguimientos
// absorbió la cola operativa. El radar y los enlaces externos antiguos siguen
// llegando aquí, así que reenviamos al embudo oficial preservando hash/params
// en cuanto Next nos los entrega.
//
// Mantenemos el segmento como redirect seguro (server component) para no
// romper bookmarks. La carpeta también se conserva por si scripts/cron viejos
// referencian la ruta exacta — borrarla rompería esos consumidores en frío.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

export default async function AccionesRedirectPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  // Reabrimos los queries útiles de la cola antigua sobre Seguimientos. El
  // único filtro relevante era `tab`, que mapeaba estados de DropiFollowUp.
  const params = new URLSearchParams();
  const tab = typeof sp.tab === "string" ? sp.tab : null;
  if (tab === "DONE" || tab === "DISMISSED") {
    params.set("status", tab);
  }
  const qs = params.toString();
  redirect(`/comunidad-dropi/seguimientos${qs ? `?${qs}` : ""}`);
}
