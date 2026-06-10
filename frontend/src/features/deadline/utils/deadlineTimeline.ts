import { DeadlineTask } from "@/shared/types/models";

export type DeadlineColumnKind = "overdue" | "day" | "later" | "noDue";

export type DeadlineColumn = {
  id: string;
  kind: DeadlineColumnKind;
  title: string;
  caption: string;
  dateKey?: string;
  tasks: DeadlineTask[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfLocalDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function toLocalDateKey(date: Date | string) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDayTitle(date: Date, offset: number) {
  if (offset === 0) {
    return "Today";
  }

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
  });
}

function formatDayCaption(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function compareTasks(first: DeadlineTask, second: DeadlineTask) {
  const firstDue = first.dueDate ? new Date(first.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  const secondDue = second.dueDate ? new Date(second.dueDate).getTime() : Number.MAX_SAFE_INTEGER;

  if (firstDue !== secondDue) {
    return firstDue - secondDue;
  }

  return first.title.localeCompare(second.title);
}

export function isTaskDone(task: DeadlineTask) {
  return task.priority === "Done" || task.progress === 100;
}

export function buildDeadlineColumns(tasks: DeadlineTask[], dayCount = 14): DeadlineColumn[] {
  const today = startOfLocalDay();
  const dayColumns: DeadlineColumn[] = Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(today, index);
    const dateKey = toLocalDateKey(date);

    return {
      id: dateKey,
      kind: "day",
      title: formatDayTitle(date, index),
      caption: formatDayCaption(date),
      dateKey,
      tasks: [],
    };
  });
  const dayMap = new Map(dayColumns.map((column) => [column.dateKey, column]));
  const overdue: DeadlineColumn = {
    id: "overdue",
    kind: "overdue",
    title: "Overdue",
    caption: "Needs attention",
    tasks: [],
  };
  const later: DeadlineColumn = {
    id: "later",
    kind: "later",
    title: "Later",
    caption: "After this range",
    tasks: [],
  };
  const noDue: DeadlineColumn = {
    id: "noDue",
    kind: "noDue",
    title: "No due",
    caption: "Unscheduled",
    tasks: [],
  };

  tasks.forEach((task) => {
    if (task.deadlineBucket === "overdue") {
      overdue.tasks.push(task);
      return;
    }

    if (!task.dueDate) {
      noDue.tasks.push(task);
      return;
    }

    const dateKey = toLocalDateKey(task.dueDate);
    const column = dayMap.get(dateKey);

    if (column) {
      column.tasks.push(task);
      return;
    }

    later.tasks.push(task);
  });

  return [overdue, ...dayColumns, later, noDue].map((column) => ({
    ...column,
    tasks: [...column.tasks].sort(compareTasks),
  }));
}

export function getColumnStats(column: DeadlineColumn) {
  const done = column.tasks.filter(isTaskDone).length;
  const overdue = column.tasks.filter((task) => task.isOverdue).length;
  const active = column.tasks.length - done;

  return {
    active,
    done,
    overdue,
    total: column.tasks.length,
  };
}
