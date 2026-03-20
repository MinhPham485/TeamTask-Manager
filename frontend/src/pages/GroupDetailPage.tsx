import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { authStore } from "@/features/auth/store/authStore";
import { groupApi } from "@/features/groups/api/groupApi";
import { queryKeys } from "@/shared/query/queryKeys";

export function GroupDetailPage() {
	const { groupId } = useParams<{ groupId: string }>();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const user = authStore((state) => state.user);
	const [nextName, setNextName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<string | null>(null);

	const detailQuery = useQuery({
		queryKey: groupId ? queryKeys.groups.detail(groupId) : ["groups", "missing"],
		queryFn: async () => {
			try {
				return await groupApi.getDetail(groupId as string);
			} catch (error) {
				if (axios.isAxiosError<{ error?: string }>(error)) {
					const status = error.response?.status;
					const message = error.response?.data?.error || error.message;
					throw new Error(status ? `[${status}] ${message}` : message);
				}

				throw error;
			}
		},
		enabled: Boolean(groupId),
	});

	const membersQuery = useQuery({
		queryKey: groupId ? queryKeys.groups.members(groupId) : ["groups", "missing", "members"],
		queryFn: () => groupApi.getMembers(groupId as string),
		enabled: Boolean(groupId),
	});

	const renameMutation = useMutation({
		mutationFn: (name: string) => groupApi.update(groupId as string, { name }),
		onSuccess: async () => {
			setNextName("");
			setError(null);
			setFeedback("Group renamed successfully.");
			await queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
			await queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId as string) });
		},
		onError: () => {
			setFeedback(null);
			setError("Could not rename group.");
		},
	});

	const removeMemberMutation = useMutation({
		mutationFn: (memberUserId: string) => groupApi.removeMember(groupId as string, memberUserId),
		onSuccess: async () => {
			setError(null);
			setFeedback("Member removed.");
			await queryClient.invalidateQueries({ queryKey: queryKeys.groups.members(groupId as string) });
			await queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId as string) });
		},
		onError: () => {
			setFeedback(null);
			setError("Could not remove member.");
		},
	});

	const deleteMutation = useMutation({
		mutationFn: () => groupApi.removeGroup(groupId as string),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
			navigate("/dashboard", { replace: true });
		},
		onError: () => {
			setFeedback(null);
			setError("Could not delete group.");
		},
	});

	const group = detailQuery.data;
	const members = membersQuery.data ?? [];
	const isOwner = useMemo(() => {
		if (!group || !user) {
			return false;
		}

		return group.ownerId === user.id;
	}, [group, user]);

	const onRename = (event: FormEvent) => {
		event.preventDefault();
		setError(null);
		setFeedback(null);

		const normalized = nextName.trim();
		if (!normalized) {
			setError("Group name is required.");
			return;
		}

		renameMutation.mutate(normalized);
	};

	const onDeleteGroup = () => {
		const ok = window.confirm("Delete this group permanently?");
		if (!ok) {
			return;
		}

		deleteMutation.mutate();
	};

	if (!groupId) {
		return (
			<section className="page-card">
				<h2>Invalid group</h2>
				<p className="error-text">Missing group id.</p>
				<Link className="link-button" to="/dashboard">
					Back
				</Link>
			</section>
		);
	}

	if (detailQuery.isLoading) {
		return (
			<section className="page-card">
				<h2>Loading group...</h2>
			</section>
		);
	}

	if (detailQuery.isError || !group) {
		return (
			<section className="page-card">
				<h2>Group unavailable</h2>
				<p className="error-text">
					{detailQuery.error instanceof Error ? detailQuery.error.message : "Could not load group detail."}
				</p>
				<Link className="link-button" to="/dashboard">
					Back
				</Link>
			</section>
		);
	}

	return (
		<section className="group-detail-page">
			<article className="page-card">
				<div className="group-header-row">
					<div>
						<h2>{group.name}</h2>
						<p className="muted-text">Code: {group.groupCode}</p>
					</div>
					<Link className="link-button" to="/dashboard">
						Back
					</Link>
				</div>

				{error ? <p className="error-text page-feedback">{error}</p> : null}
				{feedback ? <p className="success-text page-feedback">{feedback}</p> : null}

				{isOwner ? (
					<div className="owner-actions-grid">
						<form className="form-card" onSubmit={onRename}>
							<h3>Rename Group</h3>
							<input
								value={nextName}
								onChange={(event) => setNextName(event.target.value)}
								placeholder="New group name"
							/>
							<button type="submit" disabled={renameMutation.isPending}>
								{renameMutation.isPending ? "Saving..." : "Save name"}
							</button>
						</form>

						<div className="form-card danger-card">
							<h3>Danger Zone</h3>
							<p className="muted-text">Delete group and all related data.</p>
							<button className="danger-button" onClick={onDeleteGroup} disabled={deleteMutation.isPending}>
								{deleteMutation.isPending ? "Deleting..." : "Delete group"}
							</button>
						</div>
					</div>
				) : null}
			</article>

			<article className="page-card">
				<h2>Members</h2>
				{membersQuery.isLoading ? <p className="muted-text">Loading members...</p> : null}
				{membersQuery.isError ? <p className="error-text">Failed to load members.</p> : null}

				<div className="member-list">
					{members.map((member) => {
						const isSelf = user?.id === member.userId;
						const canRemove = isOwner && !isSelf && member.userId !== group.ownerId;

						return (
							<div className="member-item" key={member.id}>
								<div>
									<p className="member-name">{member.user?.username ?? "Unknown user"}</p>
									<p className="muted-text">{member.user?.email ?? "-"}</p>
									<p className="muted-text">Role: {member.role}</p>
								</div>
								{canRemove ? (
									<button
										className="danger-button"
										onClick={() => removeMemberMutation.mutate(member.userId)}
										disabled={removeMemberMutation.isPending}
									>
										Remove
									</button>
								) : null}
							</div>
						);
					})}
				</div>
			</article>
		</section>
	);
}
