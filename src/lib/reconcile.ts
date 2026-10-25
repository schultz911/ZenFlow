import type { Task, User, QueuedMutation } from '../types';

export function reconcileSnapshot(snapshot: { tasks: Task[]; users: User[] }, queue: QueuedMutation[], localTasks: Task[]) {
  const tasks = new Map(snapshot.tasks.map(task => [task.id, task]));
  const users = new Map(snapshot.users.map(user => [user.id, user]));
  const local = new Map(localTasks.map(task => [task.id, task]));
  for (const item of queue) {
    const id = decodeURIComponent(item.endpoint.split('/').at(-1) || '');
    if (item.type === 'delete_task') tasks.delete(id);
    else if (item.type === 'delete_user') {
      users.delete(id);
      for (const [taskId, task] of tasks) if (task.userId === id) tasks.delete(taskId);
    } else if (item.type === 'create_task') {
      const task = local.get(item.payload?.id) || item.payload;
      if (task?.id) tasks.set(task.id, task);
    } else if (Array.isArray(item.payload?.updates)) {
      for (const update of item.payload.updates) {
        const task = tasks.get(update.id) || local.get(update.id);
        if (task) tasks.set(update.id, { ...task, ...update });
      }
    } else {
      const task = tasks.get(id) || local.get(id);
      if (task) tasks.set(id, { ...task, ...item.payload });
    }
  }
  return { users: [...users.values()], tasks: [...tasks.values()] };
}
