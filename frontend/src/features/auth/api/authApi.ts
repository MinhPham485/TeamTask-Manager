import { http } from "@/shared/api/http";
import { LoginResponse, User } from "@/shared/types/models";

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
};

export type LoginPayload = {
  username: string;
  password: string;
};

export const authApi = {
  register: async (payload: RegisterPayload) => {
    const response = await http.post<User>("/auth/register", payload);
    return response.data;
  },
  login: async (payload: LoginPayload) => {
    const response = await http.post<LoginResponse>("/auth/login", payload);
    return response.data;
  },
  profile: async () => {
    const response = await http.get<User>("/auth/profile");
    return response.data;
  },
};
