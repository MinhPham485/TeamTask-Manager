import { http } from "@/shared/api/http";
import { ChecklistItem, DeadlineSummary, DeadlineTask, Task } from "@/shared/types/models";

export type CreateDeadlineTaskPayload = {
  title: string;
  description?: string;
  groupId: string;
  dueDate?: string;
  progress?: number;
  priority?: Task["priority"];
};

function normalizeDeadlineChecklistItem(item: ChecklistItem) {
  return {
    ...item,
    taskId: item.taskId ?? item.deadlineTaskId ?? "",
  };
}

function normalizeDeadlineTask(task: DeadlineTask) {
  return {
    ...task,
    checklistItems: task.checklistItems?.map(normalizeDeadlineChecklistItem) ?? [],
  };
}

export const deadlineApi = {
  getTasks: async (groupId: string) => {
    const response = await http.get<DeadlineTask[]>(`/deadline-tasks/group/${groupId}`);
    return response.data.map(normalizeDeadlineTask);
  },
  getSummary: async (groupId: string) => {
    const response = await http.get<DeadlineSummary>(`/deadline-tasks/group/${groupId}/summary`);
    return response.data;
  },
  getTask: async (taskId: string) => {
    const response = await http.get<DeadlineTask>(`/deadline-tasks/${taskId}`);
    return normalizeDeadlineTask(response.data);
  },
  create: async (payload: CreateDeadlineTaskPayload) => {
    const response = await http.post<DeadlineTask>("/deadline-tasks", payload);
    return normalizeDeadlineTask(response.data);
  },
  remove: async (taskId: string) => {
    await http.delete(`/deadline-tasks/${taskId}`);
  },
  addMember: async (taskId: string, payload: { userId: string; role?: "leader" | "member" }) => {
    const response = await http.post<DeadlineTask>(`/deadline-tasks/${taskId}/members`, payload);
    return normalizeDeadlineTask(response.data);
  },
  createChecklistItem: async (taskId: string, payload: { title: string }) => {
    const response = await http.post<ChecklistItem>(`/deadline-tasks/${taskId}/checklist`, payload);
    return normalizeDeadlineChecklistItem(response.data);
  },
  toggleChecklistItem: async (taskId: string, itemId: string) => {
    const response = await http.patch<ChecklistItem>(`/deadline-tasks/${taskId}/checklist/${itemId}/toggle`);
    return normalizeDeadlineChecklistItem(response.data);
  },
  removeChecklistItem: async (taskId: string, itemId: string) => {
    await http.delete(`/deadline-tasks/${taskId}/checklist/${itemId}`);
  },
};
