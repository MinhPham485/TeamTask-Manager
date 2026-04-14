import { http } from "@/shared/api/http";

type AskGroupAssistantPayload = {
  groupId: string;
  question: string;
};

type AskGroupAssistantResponse = {
  answer: string;
  suggestions?: string[];
  meta?: {
    groupId?: string;
    userId?: string;
    questionLength?: number;
    source?: string;
    model?: string;
  };
};

export const aiApi = {
  askAssistant: async (payload: { question: string; groupId?: string }) => {
    const response = await http.post<AskGroupAssistantResponse>("/ai/ask", payload);
    return response.data;
  },
  askGroupAssistant: async ({ groupId, question }: AskGroupAssistantPayload) => {
    const response = await http.post<AskGroupAssistantResponse>(`/ai/group/${groupId}/ask`, {
      question,
    });

    return response.data;
  },
};
