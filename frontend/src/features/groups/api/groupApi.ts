import { http } from "@/shared/api/http";
import { Group, GroupDetail, GroupMember, GroupMembership } from "@/shared/types/models";

export type CreateGroupPayload = {
  name: string;
};

export type JoinGroupPayload = {
  groupCode: string;
};

export const groupApi = {
  getAll: async () => {
    const response = await http.get<GroupMembership[]>("/groups");
    return response.data;
  },
  create: async (payload: CreateGroupPayload) => {
    const response = await http.post<Group>("/groups", payload);
    return response.data;
  },
  join: async (payload: JoinGroupPayload) => {
    const response = await http.post<{ message: string }>("/groups/join", payload);
    return response.data;
  },
  getDetail: async (groupId: string) => {
    const response = await http.get<GroupDetail>(`/groups/${groupId}`);
    return response.data;
  },
  getMembers: async (groupId: string) => {
    const response = await http.get<GroupMember[]>(`/groups/${groupId}/members`);
    return response.data;
  },
  update: async (groupId: string, payload: { name: string }) => {
    const response = await http.put<Group>(`/groups/${groupId}`, payload);
    return response.data;
  },
  removeMember: async (groupId: string, userId: string) => {
    const response = await http.delete<{ message: string }>(`/groups/${groupId}/members/${userId}`);
    return response.data;
  },
  removeGroup: async (groupId: string) => {
    const response = await http.delete<{ message: string }>(`/groups/${groupId}`);
    return response.data;
  },
};
