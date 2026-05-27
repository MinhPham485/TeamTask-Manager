import { ChangeEvent, useEffect, useState } from "react";
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

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
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

  const onAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setAvatarError(null);
    setAvatarSuccess(null);

    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
      setAvatarError("Avatar must be a PNG, JPG, or WEBP image.");
      return;
    }

    if (file.size <= 0 || file.size > MAX_AVATAR_SIZE) {
      setAvatarError("Avatar must be 2MB or smaller.");
      return;
    }

    setIsAvatarUploading(true);

    try {
      const { uploadUrl, key } = await authApi.createAvatarUploadUrl({
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
      });

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Avatar upload failed.");
      }

      const updatedUser = await authApi.updateAvatar({ key });
      setUser(updatedUser);
      setAvatarSuccess("Avatar updated successfully.");
    } catch (error) {
      if (axios.isAxiosError<{ error?: string }>(error)) {
        setAvatarError(error.response?.data?.error ?? "Could not update avatar.");
        return;
      }

      setAvatarError(error instanceof Error ? error.message : "Could not update avatar.");
    } finally {
      setIsAvatarUploading(false);
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
          <div className="profile-avatar-actions">
            <label className={isAvatarUploading ? "avatar-upload-button disabled" : "avatar-upload-button"}>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatarChange} disabled={isAvatarUploading} />
              {isAvatarUploading ? "Uploading..." : "Upload avatar"}
            </label>
          </div>
          {avatarError ? <p className="error-text profile-inline-feedback">{avatarError}</p> : null}
          {avatarSuccess ? <p className="success-text profile-inline-feedback">{avatarSuccess}</p> : null}
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
