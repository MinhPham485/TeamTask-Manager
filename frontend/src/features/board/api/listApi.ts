import { http } from "@/shared/api/http";
import { List } from "@/shared/types/models";

export type CreateListPayload = {
  groupId: string;
  name: string;
  position?: number;
};

export const listApi = {
  getByGroup: async (groupId: string) => {
    const response = await http.get<List[]>(`/lists/group/${groupId}`);
    return response.data;
  },
  create: async (payload: CreateListPayload) => {
    const response = await http.post<List>("/lists", payload);
    return response.data;
  },
  update: async (listId: string, payload: Partial<Pick<List, "name" | "position">>) => {
    const response = await http.put<List>(`/lists/${listId}`, payload);
    return response.data;
  },
  reorder: async (groupId: string, listIds: string[]) => {
    const response = await http.put<List[]>("/lists/reorder", { groupId, listIds });
    return response.data;
  },
  remove: async (listId: string) => {
    await http.delete(`/lists/${listId}`);
  },
};
