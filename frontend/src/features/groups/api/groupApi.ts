import { http } from "@/shared/api/http";
import { Group, GroupMember } from "@/shared/types/models";

export type CreateGroupPayload = {
  name: string;
};

export type JoinGroupPayload = {
  inviteCode: string;
};

export const groupApi = {
  getAll: async () => {
    const response = await http.get<Group[]>("/groups");
    return response.data;
  },
  create: async (payload: CreateGroupPayload) => {
    const response = await http.post<Group>("/groups", payload);
    return response.data;
  },
  join: async (payload: JoinGroupPayload) => {
    const response = await http.post<Group>("/groups/join", payload);
    return response.data;
  },
  getDetail: async (groupId: string) => {
    const response = await http.get<Group>(`/groups/${groupId}`);
    return response.data;
  },
  getMembers: async (groupId: string) => {
    const response = await http.get<GroupMember[]>(`/groups/${groupId}/members`);
    return response.data;
  },
};
