import { http } from "@/shared/api/http";
import { TaskComment } from "@/shared/types/models";

export const commentApi = {
  getByTask: async (taskId: string) => {
    const response = await http.get<TaskComment[]>(`/comments/task/${taskId}`);
    return response.data;
  },
  create: async (payload: { taskId: string; content: string }) => {
    const response = await http.post<TaskComment>("/comments", payload);
    return response.data;
  },
  update: async (commentId: string, content: string) => {
    const response = await http.put<TaskComment>(`/comments/${commentId}`, { content });
    return response.data;
  },
  remove: async (commentId: string) => {
    await http.delete(`/comments/${commentId}`);
  },
};
