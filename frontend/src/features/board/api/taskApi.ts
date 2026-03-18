import { http } from "@/shared/api/http";
import { Task } from "@/shared/types/models";

export type CreateTaskPayload = {
  title: string;
  description?: string;
  groupId: string;
  listId: string;
  position?: number;
  dueDate?: string;
  assigneeId?: string;
};

export const taskApi = {
  getByGroup: async (groupId: string) => {
    const response = await http.get<Task[]>(`/tasks/group/${groupId}`);
    return response.data;
  },
  create: async (payload: CreateTaskPayload) => {
    const response = await http.post<Task>("/tasks", payload);
    return response.data;
  },
  update: async (taskId: string, payload: Partial<Omit<Task, "id">>) => {
    const response = await http.put<Task>(`/tasks/${taskId}`, payload);
    return response.data;
  },
  move: async (taskId: string, payload: { listId: string; position: number }) => {
    const response = await http.put<Task>(`/tasks/${taskId}/move`, payload);
    return response.data;
  },
  reorder: async (listId: string, taskIdsInOrder: string[]) => {
    const response = await http.put<Task[]>("/tasks/reorder", { listId, taskIdsInOrder });
    return response.data;
  },
};
