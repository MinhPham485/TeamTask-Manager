import { ChecklistItem, Task } from "@/shared/types/models";

const PRIORITY_ORDER: Record<Task["priority"], number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  Done: 3,
};

export function sortByPosition<T extends { position: number }>(items: T[]) {
  return [...items].sort((a, b) => a.position - b.position);
}

export function sortByPriorityThenPosition(items: Task[]) {
  return [...items].sort((a, b) => {
    const priorityDifference = PRIORITY_ORDER[a.priority ?? "Low"] - PRIORITY_ORDER[b.priority ?? "Low"];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return a.position - b.position;
  });
}

export function applyMove(tasks: Task[], taskId: string, targetListId: string, targetIndex: number) {
  const next = [...tasks];
  const movingIndex = next.findIndex((task) => task.id === taskId);

  if (movingIndex < 0) {
    return tasks;
  }

  const [movingTask] = next.splice(movingIndex, 1);
  const normalizedTask = { ...movingTask, listId: targetListId };

  const beforeTarget = next.filter((task) => task.listId === targetListId);
  const insertAt = Math.max(0, Math.min(targetIndex, beforeTarget.length));
  const targetIds = beforeTarget.map((task) => task.id);
  const anchorId = targetIds[insertAt];

  if (!anchorId) {
    next.push(normalizedTask);
  } else {
    const absoluteIndex = next.findIndex((task) => task.id === anchorId);
    next.splice(absoluteIndex, 0, normalizedTask);
  }

  const perList = new Map<string, Task[]>();

  next.forEach((task) => {
    if (!perList.has(task.listId)) {
      perList.set(task.listId, []);
    }

    perList.get(task.listId)?.push(task);
  });

  perList.forEach((listTasks) => {
    listTasks.forEach((task, index) => {
      task.position = index;
    });
  });

  return next;
}

export function formatDate(dateString?: string | null) {
  if (!dateString) {
    return "Chua co";
  }

  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? "Chua co" : date.toLocaleString();
}

export function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(2)} MB`;
}

export function getTaskProgress(task: Task) {
  return Math.max(0, Math.min(100, task.progress ?? 0));
}

export function getPriorityClass(priority?: Task["priority"]) {
  return `priority-badge priority-${(priority ?? "Low").toLowerCase()}`;
}

export function getChecklistSummary(items?: ChecklistItem[]) {
  const total = items?.length ?? 0;
  const completed = items?.filter((item) => item.isCompleted).length ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, percent, total };
}
