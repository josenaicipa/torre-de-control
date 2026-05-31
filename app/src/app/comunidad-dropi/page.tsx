import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ComunidadDropiHome() {
  redirect("/comunidad-dropi/radar");
}
