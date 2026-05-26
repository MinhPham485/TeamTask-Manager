import { useEffect, useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authApi } from "@/features/auth/api/authApi";
import { authStore } from "@/features/auth/store/authStore";

const updateProfileSchema = z.object({
  phone: z.string().max(30, "Phone must be 30 characters or fewer"),
  hometown: z.string().max(80, "Hometown must be 80 characters or fewer"),
  bio: z.string().max(280, "Bio must be 280 characters or fewer"),
});

type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>;

function formatDate(value?: string) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

export function ProfilePage() {
  const user = authStore((state) => state.user);
  const setUser = authStore((state) => state.setUser);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      phone: "",
      hometown: "",
      bio: "",
    },
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    reset({
      phone: user.phone ?? "",
      hometown: user.hometown ?? "",
      bio: user.bio ?? "",
    });
  }, [user, reset]);

  const onUpdateProfile = async (values: UpdateProfileFormValues) => {
    setProfileError(null);
    setProfileSuccess(null);

    try {
      const updatedUser = await authApi.updateProfile({
        phone: values.phone,
        hometown: values.hometown,
        bio: values.bio,
      });

      setUser(updatedUser);
      setProfileSuccess("Profile updated successfully.");
    } catch (error) {
      if (axios.isAxiosError<{ error?: string }>(error)) {
        setProfileError(error.response?.data?.error ?? "Could not update profile.");
        return;
      }

      setProfileError("Could not update profile.");
    }
  };

  if (!user) {
    return (
      <section className="page-card">
        <h2>Profile</h2>
        <p className="muted-text">Loading profile...</p>
      </section>
    );
  }

  return (
    <section className="profile-page">
      <div className="page-card profile-summary">
        <div className="profile-avatar" aria-hidden="true">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.username.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h2>{user.username}</h2>
          <p className="muted-text">{user.email}</p>
        </div>
      </div>

      <section className="page-card profile-details">
        <h2>Profile</h2>
        <dl>
          <div>
            <dt>Role</dt>
            <dd>{user.role ?? "User"}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{user.phone || "Not set"}</dd>
          </div>
          <div>
            <dt>Hometown</dt>
            <dd>{user.hometown || "Not set"}</dd>
          </div>
          <div>
            <dt>Bio</dt>
            <dd>{user.bio || "Not set"}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="page-card profile-edit">
        <h2>Edit Profile</h2>
        <form className="profile-form" onSubmit={handleSubmit(onUpdateProfile)}>
          <label>
            <span>Phone</span>
            <input {...register("phone")} placeholder="Phone number" />
          </label>
          {errors.phone ? <p className="error-text">{errors.phone.message}</p> : null}

          <label>
            <span>Hometown</span>
            <input {...register("hometown")} placeholder="Hometown" />
          </label>
          {errors.hometown ? <p className="error-text">{errors.hometown.message}</p> : null}

          <label>
            <span>Bio</span>
            <textarea {...register("bio")} placeholder="Short bio" rows={4} />
          </label>
          {errors.bio ? <p className="error-text">{errors.bio.message}</p> : null}

          {profileError ? <p className="error-text">{profileError}</p> : null}
          {profileSuccess ? <p className="success-text">{profileSuccess}</p> : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save profile"}
          </button>
        </form>
      </section>
    </section>
  );
}
