import { http } from "@/shared/api/http";
import { Notification } from "@/shared/types/models";

type UnreadCountResponse = {
  count: number;
};

export const notificationApi = {
  getAll: async () => {
    const response = await http.get<Notification[]>("/notifications");
    return response.data;
  },
  getUnreadCount: async () => {
    const response = await http.get<UnreadCountResponse>("/notifications/unread-count");
    return response.data.count;
  },
  markAllAsRead: async () => {
    const response = await http.patch<UnreadCountResponse>("/notifications/read-all");
    return response.data.count;
  },
};
