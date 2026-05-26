import { authStore } from "@/features/auth/store/authStore";

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
    </section>
  );
}
