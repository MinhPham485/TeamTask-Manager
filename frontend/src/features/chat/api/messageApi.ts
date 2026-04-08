import { http } from "@/shared/api/http";
import { DirectMessage, DirectThread, Message } from "@/shared/types/models";

export const messageApi = {
  getByGroup: async (groupId: string) => {
    const response = await http.get<Message[]>(`/messages/group/${groupId}`);
    return response.data;
  },
  create: async (payload: { groupId: string; content: string }) => {
    const response = await http.post<Message>("/messages", payload);
    return response.data;
  },
  getDirectThreads: async () => {
    const response = await http.get<DirectThread[]>("/messages/direct/threads");
    return response.data;
  },
  createOrGetDirectThread: async (peerUserId: string) => {
    const response = await http.post<DirectThread>("/messages/direct/threads", { peerUserId });
    return response.data;
  },
  getDirectMessagesByThread: async (threadId: string) => {
    const response = await http.get<DirectMessage[]>(`/messages/direct/threads/${threadId}/messages`);
    return response.data;
  },
  createDirectMessage: async (payload: { threadId?: string; recipientId?: string; content: string }) => {
    const response = await http.post<{ threadId: string; message: DirectMessage }>("/messages/direct/messages", payload);
    return response.data;
  },
  remove: async (messageId: string) => {
    await http.delete(`/messages/${messageId}`);
  },
};
