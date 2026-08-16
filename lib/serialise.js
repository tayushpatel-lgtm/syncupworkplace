/** Prisma rows carry Date objects; client components need plain JSON. */
export function serialiseTask(task) {
  return {
    id: task.id,
    title: task.title,
    detail: task.detail,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    assignee: task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null,
    creator: task.creator ? { id: task.creator.id, name: task.creator.name } : null,
    createdAt: task.createdAt.toISOString(),
    attachmentCount: task._count?.attachments || 0,
  };
}
