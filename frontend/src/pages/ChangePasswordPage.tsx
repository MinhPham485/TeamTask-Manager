import { useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authApi } from "@/features/auth/api/authApi";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Confirm password must be at least 6 characters"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordPage() {
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      const response = await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });

      reset();
      setPasswordSuccess(response.message ?? "Password changed successfully.");
    } catch (error) {
      if (axios.isAxiosError<{ error?: string }>(error)) {
        setPasswordError(error.response?.data?.error ?? "Could not change password.");
        return;
      }

      setPasswordError("Could not change password.");
    }
  };

  return (
    <section className="profile-page">
      <section className="page-card profile-password">
        <h2>Change Password</h2>
        <form className="profile-form" onSubmit={handleSubmit(onSubmit)}>
          <label>
            <span>Current password</span>
            <input {...register("currentPassword")} type="password" autoComplete="current-password" />
          </label>
          {errors.currentPassword ? <p className="error-text">{errors.currentPassword.message}</p> : null}

          <label>
            <span>New password</span>
            <input {...register("newPassword")} type="password" autoComplete="new-password" />
          </label>
          {errors.newPassword ? <p className="error-text">{errors.newPassword.message}</p> : null}

          <label>
            <span>Confirm new password</span>
            <input {...register("confirmPassword")} type="password" autoComplete="new-password" />
          </label>
          {errors.confirmPassword ? <p className="error-text">{errors.confirmPassword.message}</p> : null}

          {passwordError ? <p className="error-text">{passwordError}</p> : null}
          {passwordSuccess ? <p className="success-text">{passwordSuccess}</p> : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Changing..." : "Change password"}
          </button>
        </form>
      </section>
    </section>
  );
}
