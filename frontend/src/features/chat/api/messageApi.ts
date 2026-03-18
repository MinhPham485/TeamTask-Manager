import { http } from "@/shared/api/http";
import { Message } from "@/shared/types/models";

export const messageApi = {
  getByGroup: async (groupId: string) => {
    const response = await http.get<Message[]>(`/messages/group/${groupId}`);
    return response.data;
  },
  create: async (payload: { groupId: string; content: string }) => {
    const response = await http.post<Message>("/messages", payload);
    return response.data;
  },
  remove: async (messageId: string) => {
    await http.delete(`/messages/${messageId}`);
  },
};
