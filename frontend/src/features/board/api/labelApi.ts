import { http } from "@/shared/api/http";
import { Label } from "@/shared/types/models";

export const labelApi = {
  getByGroup: async (groupId: string) => {
    const response = await http.get<Label[]>(`/labels/group/${groupId}`);
    return response.data;
  },
  create: async (payload: Pick<Label, "groupId" | "name" | "color">) => {
    const response = await http.post<Label>("/labels", payload);
    return response.data;
  },
  update: async (labelId: string, payload: Partial<Pick<Label, "name" | "color">>) => {
    const response = await http.put<Label>(`/labels/${labelId}`, payload);
    return response.data;
  },
  remove: async (labelId: string) => {
    await http.delete(`/labels/${labelId}`);
  },
};
