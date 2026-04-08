import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { groupApi } from "@/features/groups/api/groupApi";
import { queryKeys } from "@/shared/query/queryKeys";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [groupCode, setGroupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.all,
    queryFn: groupApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: groupApi.create,
    onSuccess: async () => {
      setName("");
      setError(null);
      setFeedback("Group created successfully.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    },
    onError: () => {
      setFeedback(null);
      setError("Could not create group.");
    },
  });

  const joinMutation = useMutation({
    mutationFn: groupApi.join,
    onSuccess: async (response) => {
      setGroupCode("");
      setError(null);
      setFeedback(response.message ?? "Joined group successfully.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    },
    onError: () => {
      setFeedback(null);
      setError("Could not join group. Check group code.");
    },
  });

  const groups = useMemo(() => {
    return [...(groupsQuery.data ?? [])].sort((a, b) => a.group.name.localeCompare(b.group.name));
  }, [groupsQuery.data]);

  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFeedback(null);

    const normalized = name.trim();

    if (!normalized) {
      setError("Group name is required.");
      return;
    }

    createMutation.mutate({ name: normalized });
  };

  const onJoin = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFeedback(null);

    const normalized = groupCode.trim().toUpperCase();

    if (!normalized) {
      setError("Group code is required.");
      return;
    }

    joinMutation.mutate({ groupCode: normalized });
  };

  return (
    <section className="group-dashboard">
      <div className="group-actions-grid">
        <form className="page-card form-card" onSubmit={onCreate}>
          <h2>Create Group</h2>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Group name" maxLength={80} />
          <button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create"}
          </button>
        </form>

        <form className="page-card form-card" onSubmit={onJoin}>
          <h2>Join Group</h2>
          <input
            value={groupCode}
            onChange={(event) => setGroupCode(event.target.value)}
            placeholder="Group code"
            maxLength={12}
          />
          <button type="submit" disabled={joinMutation.isPending}>
            {joinMutation.isPending ? "Joining..." : "Join"}
          </button>
        </form>
      </div>

      {error ? <p className="error-text page-feedback">{error}</p> : null}
      {feedback ? <p className="success-text page-feedback">{feedback}</p> : null}

      <section className="page-card">
        <h2>Your Groups</h2>
        {groupsQuery.isLoading ? <p className="muted-text">Loading groups...</p> : null}
        {groupsQuery.isError ? <p className="error-text">Could not load groups.</p> : null}

        {!groupsQuery.isLoading && !groupsQuery.isError && groups.length === 0 ? (
          <p className="muted-text">No groups yet. Create one or join by code.</p>
        ) : null}

        <div className="group-list">
          {groups.map((membership) => (
            <article className="group-item" key={membership.id}>
              <div>
                <h3>{membership.group.name}</h3>
                <p className="muted-text">Code: {membership.group.groupCode}</p>
                <p className="muted-text">Role: {membership.role}</p>
              </div>
              <Link className="link-button" to={`/groups/${membership.group.id}`}>
                Open
              </Link>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
