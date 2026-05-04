import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authApi } from "@/features/auth/api/authApi";

const resetPasswordSchema = z
  .object({
    email: z.string().email("Email is invalid"),
    code: z.string().min(6, "Code must be 6 digits").max(6, "Code must be 6 digits"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

type ResetPasswordLocationState = {
  email?: string;
};

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const defaultEmail = (location.state as ResetPasswordLocationState | null)?.email ?? "";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: defaultEmail,
      code: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (defaultEmail) {
      setValue("email", defaultEmail);
    }
  }, [defaultEmail, setValue]);

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setError(null);
    setSuccess(null);

    try {
      const response = await authApi.resetPassword({
        email: values.email,
        code: values.code,
        newPassword: values.newPassword,
      });
      setSuccess(response.message ?? "Password reset successful. Redirecting to login...");
      window.setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1200);
    } catch (error) {
      if (axios.isAxiosError<{ error?: string }>(error)) {
        setError(error.response?.data?.error ?? "Unable to reset password. Please try again.");
        return;
      }

      setError("Unable to reset password. Please try again.");
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit(onSubmit)}>
        <h1>Enter reset code</h1>
        <p className="muted-text">Check your email for the 6-digit code.</p>
        <input {...register("email")} type="email" placeholder="Email" />
        {errors.email ? <p className="error-text">{errors.email.message}</p> : null}
        <input {...register("code")} placeholder="6-digit code" />
        {errors.code ? <p className="error-text">{errors.code.message}</p> : null}
        <input {...register("newPassword")} type="password" placeholder="New password" />
        {errors.newPassword ? <p className="error-text">{errors.newPassword.message}</p> : null}
        <input {...register("confirmPassword")} type="password" placeholder="Confirm password" />
        {errors.confirmPassword ? <p className="error-text">{errors.confirmPassword.message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Updating..." : "Reset password"}
        </button>
        <p>
          Need a code? <Link to="/forgot-password">Send another</Link>
        </p>
        <p>
          Back to <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
