import { http } from "@/shared/api/http";
import { ChecklistItem, DeadlineChecklistSection, DeadlineSummary, DeadlineTask, MyDeadlineSummary, Task } from "@/shared/types/models";

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

function normalizeDeadlineChecklistSection(section: DeadlineChecklistSection) {
  return {
    ...section,
    items: (section.items ?? []).map(normalizeDeadlineChecklistItem),
  };
}

function normalizeDeadlineTask(task: DeadlineTask) {
  const checklistSections = task.checklistSections?.map(normalizeDeadlineChecklistSection) ?? [];
  const checklistItems = task.checklistItems?.map(normalizeDeadlineChecklistItem)
    ?? checklistSections.flatMap((section) => section.items);

  return {
    ...task,
    checklistItems,
    checklistSections,
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
  getMySummary: async () => {
    const response = await http.get<MyDeadlineSummary>("/deadline-tasks/me/summary");
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
  createChecklistSection: async (taskId: string, payload: { title: string }) => {
    const response = await http.post<DeadlineChecklistSection>(`/deadline-tasks/${taskId}/checklist/sections`, payload);
    return normalizeDeadlineChecklistSection(response.data);
  },
  updateChecklistSection: async (taskId: string, sectionId: string, payload: { title: string }) => {
    const response = await http.put<DeadlineChecklistSection>(`/deadline-tasks/${taskId}/checklist/sections/${sectionId}`, payload);
    return normalizeDeadlineChecklistSection(response.data);
  },
  removeChecklistSection: async (taskId: string, sectionId: string) => {
    await http.delete(`/deadline-tasks/${taskId}/checklist/sections/${sectionId}`);
  },
  createChecklistItem: async (taskId: string, payload: { sectionId: string; title: string }) => {
    const response = await http.post<ChecklistItem>(`/deadline-tasks/${taskId}/checklist/items`, payload);
    return normalizeDeadlineChecklistItem(response.data);
  },
  updateChecklistItem: async (taskId: string, itemId: string, payload: { title: string }) => {
    const response = await http.put<ChecklistItem>(`/deadline-tasks/${taskId}/checklist/items/${itemId}`, payload);
    return normalizeDeadlineChecklistItem(response.data);
  },
  toggleChecklistItem: async (taskId: string, itemId: string) => {
    const response = await http.patch<ChecklistItem>(`/deadline-tasks/${taskId}/checklist/items/${itemId}/toggle`);
    return normalizeDeadlineChecklistItem(response.data);
  },
  removeChecklistItem: async (taskId: string, itemId: string) => {
    await http.delete(`/deadline-tasks/${taskId}/checklist/items/${itemId}`);
  },
};
