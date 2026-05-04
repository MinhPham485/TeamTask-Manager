import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authApi } from "@/features/auth/api/authApi";

const forgotPasswordSchema = z.object({
  email: z.string().email("Email is invalid"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

const RESEND_COOLDOWN_SECONDS = 60;

export function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(value - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  const isCooldownActive = cooldown > 0;
  const cooldownLabel = useMemo(() => {
    if (!isCooldownActive) {
      return "Send reset code";
    }

    return `Resend in ${cooldown}s`;
  }, [cooldown, isCooldownActive]);

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setError(null);
    setSuccess(null);

    try {
      const response = await authApi.forgotPassword(values);
      setSuccess(response.message ?? "If the email exists, a reset code has been sent.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      if (axios.isAxiosError<{ error?: string }>(error)) {
        setError(error.response?.data?.error ?? "Unable to send reset code. Please try again.");
        return;
      }

      setError("Unable to send reset code. Please try again.");
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit(onSubmit)}>
        <h1>Reset password</h1>
        <p className="muted-text">Enter your email and we will send a 6-digit code.</p>
        <input {...register("email")} type="email" placeholder="Email" />
        {errors.email ? <p className="error-text">{errors.email.message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}
        <button type="submit" disabled={isSubmitting || isCooldownActive}>
          {isSubmitting ? "Sending..." : cooldownLabel}
        </button>
        <p>
          Already have a code? <Link to="/reset-password">Reset it now</Link>
        </p>
        <p>
          Remembered your password? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
