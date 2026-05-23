import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { redirect } from "next/navigation";
import { MentoresClient } from "./mentores-client";

export const dynamic = "force-dynamic";

export default async function MentoresPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const mentors = await prisma.user.findMany({
    where: { role: "MENTOR" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      ghlUserName: true,
      active: true,
      _count: { select: { studentsAsMentor: true } },
    },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Mentores</h1>
      <MentoresClient mentors={mentors} canCreate={actor.role === "ADMIN"} />
    </div>
  );
}
