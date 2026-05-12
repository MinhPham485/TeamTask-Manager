import { http } from "@/shared/api/http";

export type PresignUploadPayload = {
  groupId: string;
  fileName: string;
  mimeType: string;
  size: number;
  targetType: "task" | "message";
};

export type PresignUploadResponse = {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  expiresInSeconds: number;
};

export const uploadApi = {
  presign: async (payload: PresignUploadPayload) => {
    const response = await http.post<PresignUploadResponse>("/uploads/presign", payload);
    return response.data;
  },
};
