// Diff puro para sincronizar los integrantes de equipo (StudentMember) de un
// estudiante cuando se editan desde el modal. Separa lo que hay que crear,
// actualizar y borrar comparando los integrantes que vienen del formulario
// contra los ids ya persistidos.
//
// Reglas:
//   • Integrante sin `id` → se crea.
//   • Integrante con `id` que existe en la BD → se actualiza.
//   • Integrante con `id` que NO existe en la BD → se descarta (no se crea con
//     un id forzado, así no se puede manipular el integrante de otro estudiante
//     ni resucitar uno ya borrado en una carrera).
//   • Id existente que no viene en el payload → se borra.

export interface MemberDiff<I> {
  toCreate: I[];
  toUpdate: (I & { id: string })[];
  toDeleteIds: string[];
}

export function diffStudentMembers<I extends { id?: string | null }>(
  existingIds: string[],
  incoming: I[],
): MemberDiff<I> {
  const existingSet = new Set(existingIds);
  const incomingIds = new Set<string>();

  const toCreate: I[] = [];
  const toUpdate: (I & { id: string })[] = [];

  for (const member of incoming) {
    const id = member.id;
    if (id && existingSet.has(id)) {
      incomingIds.add(id);
      toUpdate.push(member as I & { id: string });
    } else if (!id) {
      toCreate.push(member);
    }
    // id presente pero desconocido → se descarta deliberadamente.
  }

  const toDeleteIds = existingIds.filter((id) => !incomingIds.has(id));

  return { toCreate, toUpdate, toDeleteIds };
}
