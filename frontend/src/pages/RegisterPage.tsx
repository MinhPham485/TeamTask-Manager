import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authApi } from "@/features/auth/api/authApi";
import { authStore } from "@/features/auth/store/authStore";

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Email is invalid"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const setToken = authStore((state) => state.setToken);
  const setSession = authStore((state) => state.setSession);
  const clearSession = authStore((state) => state.clearSession);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setError(null);

    try {
      await authApi.register(values);
      const loginResponse = await authApi.login({
        username: values.username,
        password: values.password,
      });
      setToken(loginResponse.token);
      const profile = await authApi.profile();
      setSession({ token: loginResponse.token, user: profile });
      navigate("/dashboard", { replace: true });
    } catch {
      clearSession();
      setError("Registration failed. Please try another email/username.");
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit(onSubmit)}>
        <h1>Create account</h1>
        <input {...register("username")} placeholder="Username" />
        {errors.username ? <p className="error-text">{errors.username.message}</p> : null}
        <input {...register("email")} type="email" placeholder="Email" />
        {errors.email ? <p className="error-text">{errors.email.message}</p> : null}
        <input {...register("password")} type="password" placeholder="Password" />
        {errors.password ? <p className="error-text">{errors.password.message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Register"}
        </button>
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
