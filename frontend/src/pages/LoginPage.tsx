import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authApi } from "@/features/auth/api/authApi";
import { authStore } from "@/features/auth/store/authStore";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setToken = authStore((state) => state.setToken);
  const setSession = authStore((state) => state.setSession);
  const clearSession = authStore((state) => state.clearSession);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setError(null);

    try {
      queryClient.clear();
      const loginResponse = await authApi.login(values);
      setToken(loginResponse.token);
      const profile = await authApi.profile();
      setSession({ token: loginResponse.token, user: profile });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      clearSession();
      if (axios.isAxiosError<{ error?: string }>(error)) {
        setError(error.response?.data?.error ?? "Login failed. Check credentials and try again.");
        return;
      }

      setError("Login failed. Check credentials and try again.");
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit(onSubmit)}>
        <h1>Sign in</h1>
        <input {...register("username")} placeholder="Username" />
        {errors.username ? <p className="error-text">{errors.username.message}</p> : null}
        <input {...register("password")} type="password" placeholder="Password" />
        {errors.password ? <p className="error-text">{errors.password.message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Login"}
        </button>
        <p>
          No account? <Link to="/register">Create one</Link>
        </p>
      </form>
    </div>
  );
}
