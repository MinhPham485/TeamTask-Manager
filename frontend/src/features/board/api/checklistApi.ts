import { http } from "@/shared/api/http";
import { ChecklistItem } from "@/shared/types/models";

export const checklistApi = {
  getByTask: async (taskId: string) => {
    const response = await http.get<ChecklistItem[]>(`/checklists/task/${taskId}`);
    return response.data;
  },
  create: async (payload: Pick<ChecklistItem, "taskId" | "content">) => {
    const response = await http.post<ChecklistItem>("/checklists", payload);
    return response.data;
  },
  update: async (itemId: string, payload: Partial<Pick<ChecklistItem, "content" | "position" | "isCompleted">>) => {
    const response = await http.put<ChecklistItem>(`/checklists/${itemId}`, payload);
    return response.data;
  },
  toggle: async (itemId: string, isCompleted: boolean) => {
    const response = await http.patch<ChecklistItem>(`/checklists/${itemId}/toggle`, { isCompleted });
    return response.data;
  },
  reorder: async (taskId: string, itemIdsInOrder: string[]) => {
    const response = await http.put<ChecklistItem[]>("/checklists/reorder", { taskId, itemIdsInOrder });
    return response.data;
  },
  remove: async (itemId: string) => {
    await http.delete(`/checklists/${itemId}`);
  },
};
