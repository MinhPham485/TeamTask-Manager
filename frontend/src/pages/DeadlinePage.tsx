import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deadlineApi } from "@/features/deadline/api/deadlineApi";
import { buildDeadlineColumns, DeadlineColumn, getColumnStats, isTaskDone, toLocalDateKey } from "@/features/deadline/utils/deadlineTimeline";
import { authStore } from "@/features/auth/store/authStore";
import { groupApi } from "@/features/groups/api/groupApi";
import { getChecklistSummary, getPriorityClass, getTaskProgress, sortByPosition } from "@/features/board/utils/boardUtils";
import { queryKeys } from "@/shared/query/queryKeys";
import { ChecklistItem, DeadlineChecklistSection, DeadlineSummary, DeadlineTask, GroupMember, Task } from "@/shared/types/models";

function formatDueDate(task: DeadlineTask) {
  if (!task.dueDate) {
    return "No due date";
  }

  return new Date(task.dueDate).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLeaderName(task: DeadlineTask) {
  return task.taskMemberships?.find((membership) => membership.role === "leader")?.user?.username ?? "No leader";
}

function getMemberInitials(task: DeadlineTask) {
  return (task.taskMemberships ?? [])
    .slice(0, 4)
    .map((membership) => membership.user?.username?.slice(0, 1).toUpperCase() || "?");
}

function buildChecklistItemsFromSections(sections?: DeadlineChecklistSection[]) {
  return (sections ?? []).flatMap((section) => sortByPosition(section.items ?? []));
}

function getDeadlineDisplayProgress(task: DeadlineTask) {
  if (task.checklistSummary?.total) {
    return task.checklistSummary.percent;
  }

  return getTaskProgress(task);
}

function MetricCard({ label, value, tone }: { label: string; value: number | string; tone?: "danger" | "success" }) {
  return (
    <article className={tone ? `deadline-metric ${tone}` : "deadline-metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DeadlineTaskCard({
  task,
  selected,
  onSelect,
}: {
  task: DeadlineTask;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const progress = getDeadlineDisplayProgress(task);
  const initials = getMemberInitials(task);
  const locked = task.viewerCanOpen === false;

  return (
    <button
      type="button"
      className={`${selected ? "deadline-task-card selected" : "deadline-task-card"}${locked ? " locked" : ""}`}
      onClick={onSelect}
    >
      <span className="deadline-task-title">{task.title}</span>
      {locked ? (
        <span className="deadline-task-footer">
          <span>Detail locked</span>
          <span>{formatDueDate(task)}</span>
        </span>
      ) : (
        <>
          <span className="deadline-task-row">
            <span className={getPriorityClass(task.priority)}>{task.priority}</span>
            <span className={task.isOverdue ? "deadline-due overdue" : "deadline-due"}>{formatDueDate(task)}</span>
          </span>
          <span className="deadline-progress" aria-label={`Progress ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </span>
          <span className="deadline-task-footer">
            <span>{progress}%</span>
            <span>{task.checklistSummary?.total ? `${task.checklistSummary.completed}/${task.checklistSummary.total} checklist` : getLeaderName(task)}</span>
          </span>
          {initials.length > 0 ? (
            <span className="deadline-avatars" aria-label={`${initials.length} task members`}>
              {initials.map((initial, index) => (
                <span key={`${task.id}-${index}`}>{initial}</span>
              ))}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}

function TimelineColumn({
  column,
  selected,
  maxTaskCount,
  onSelectColumn,
}: {
  column: DeadlineColumn;
  selected: boolean;
  maxTaskCount: number;
  onSelectColumn: () => void;
}) {
  const stats = getColumnStats(column);
  const barHeight = stats.active > 0 ? Math.max(16, Math.round((stats.active / maxTaskCount) * 180)) : 6;

  return (
    <section className={selected ? `deadline-column ${column.kind} selected` : `deadline-column ${column.kind}`}>
      <button type="button" className="deadline-column-button" onClick={onSelectColumn} aria-pressed={selected}>
        <span className="deadline-column-count">{stats.active}</span>
        <span style={{ height: `${barHeight}px` }} />
        <strong>{column.title}</strong>
        <small>{column.caption}</small>
      </button>
    </section>
  );
}

function SelectedColumnPanel({
  column,
  selectedTask,
  onSelectTask,
  canCreateTasks,
  createTitle,
  createDueDate,
  createPriority,
  createError,
  isCreatingTask,
  isDeletingTask,
  userId,
  onCreateTitleChange,
  onCreateDueDateChange,
  onCreatePriorityChange,
  onCreateTask,
  onDeleteTask,
}: {
  column: DeadlineColumn;
  selectedTask: DeadlineTask | null;
  onSelectTask: (taskId: string) => void;
  canCreateTasks: boolean;
  createTitle: string;
  createDueDate: string;
  createPriority: Task["priority"];
  createError: string | null;
  isCreatingTask: boolean;
  isDeletingTask: boolean;
  userId?: string;
  onCreateTitleChange: (value: string) => void;
  onCreateDueDateChange: (value: string) => void;
  onCreatePriorityChange: (value: Task["priority"]) => void;
  onCreateTask: (event: FormEvent) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  const stats = getColumnStats(column);
  const canDeleteTask = (task: DeadlineTask) => {
    return Boolean(task.viewerCanManage) || canCreateTasks || Boolean(task.taskMemberships?.some((membership) => membership.userId === userId && membership.role === "leader"));
  };

  return (
    <aside className="deadline-side-panel page-card">
      <div className="deadline-panel-heading">
        <div>
          <h2>{column.title}</h2>
          <p className="muted-text">{column.caption}</p>
        </div>
        <strong>{stats.total}</strong>
      </div>

      <div className="deadline-panel-stats">
        <span>{stats.active} active</span>
        <span>{stats.done} done</span>
        <span>{stats.overdue} overdue</span>
      </div>

      {canCreateTasks ? (
        <form className="deadline-create-form" onSubmit={onCreateTask}>
          <h3>Create task</h3>
          <input value={createTitle} onChange={(event) => onCreateTitleChange(event.target.value)} placeholder="Task title" maxLength={120} />
          <div className="deadline-create-grid">
            <label>
              Due date
              <input type="date" value={createDueDate} onChange={(event) => onCreateDueDateChange(event.target.value)} />
            </label>
            <label>
              Priority
              <select value={createPriority} onChange={(event) => onCreatePriorityChange(event.target.value as Task["priority"])}>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="Done">Done</option>
              </select>
            </label>
          </div>
          {createError ? <p className="error-text">{createError}</p> : null}
          <button type="submit" disabled={isCreatingTask}>
            {isCreatingTask ? "Creating..." : "Create task"}
          </button>
        </form>
      ) : null}

      <div className="deadline-panel-list">
        {column.tasks.length === 0 ? <p className="muted-text">No tasks in this column.</p> : null}
        {column.tasks.map((task) => (
          <div key={task.id} className="deadline-panel-task-row">
            <DeadlineTaskCard task={task} selected={selectedTask?.id === task.id} onSelect={() => onSelectTask(task.id)} />
            {canDeleteTask(task) ? (
              <button type="button" className="deadline-delete-button" onClick={() => onDeleteTask(task.id)} disabled={isDeletingTask}>
                Delete
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}

function DeadlineTaskDetail({
  task,
  lockedTaskTitle,
  isLoading,
  isError,
  canManage,
  canManageSections,
  canManageItems,
  groupMembers,
  memberToAdd,
  addMemberError,
  isAddingMember,
  newSectionTitle,
  newChecklistTitle,
  editingSectionId,
  editingSectionTitle,
  editingItemId,
  editingItemTitle,
  checklistError,
  isCreatingSection,
  isCreatingChecklist,
  isUpdatingChecklist,
  isTogglingChecklist,
  isDeletingChecklist,
  onSectionTitleChange,
  onChecklistTitleChange,
  onStartEditSection,
  onCancelEditSection,
  onEditingSectionTitleChange,
  onSaveSection,
  onDeleteSection,
  onStartEditItem,
  onCancelEditItem,
  onEditingItemTitleChange,
  onSaveItem,
  onMemberToAddChange,
  onAddMember,
  onCreateChecklistSection,
  onCreateChecklistItem,
  onToggleChecklistItem,
  onDeleteChecklistItem,
}: {
  task: DeadlineTask | null;
  lockedTaskTitle?: string;
  isLoading: boolean;
  isError: boolean;
  canManage: boolean;
  canManageSections: boolean;
  canManageItems: boolean;
  groupMembers: GroupMember[];
  memberToAdd: string;
  addMemberError: string | null;
  isAddingMember: boolean;
  newSectionTitle: string;
  newChecklistTitle: string;
  editingSectionId: string | null;
  editingSectionTitle: string;
  editingItemId: string | null;
  editingItemTitle: string;
  checklistError: string | null;
  isCreatingSection: boolean;
  isCreatingChecklist: boolean;
  isUpdatingChecklist: boolean;
  isTogglingChecklist: boolean;
  isDeletingChecklist: boolean;
  onSectionTitleChange: (value: string) => void;
  onChecklistTitleChange: (value: string) => void;
  onStartEditSection: (section: DeadlineChecklistSection) => void;
  onCancelEditSection: () => void;
  onEditingSectionTitleChange: (value: string) => void;
  onSaveSection: (event: FormEvent) => void;
  onDeleteSection: (sectionId: string) => void;
  onStartEditItem: (item: ChecklistItem) => void;
  onCancelEditItem: () => void;
  onEditingItemTitleChange: (value: string) => void;
  onSaveItem: (event: FormEvent) => void;
  onMemberToAddChange: (value: string) => void;
  onAddMember: (event: FormEvent) => void;
  onCreateChecklistSection: (event: FormEvent) => void;
  onCreateChecklistItem: (event: FormEvent, sectionId: string) => void;
  onToggleChecklistItem: (itemId: string) => void;
  onDeleteChecklistItem: (itemId: string) => void;
}) {
  if (isLoading) {
    return (
      <section className="deadline-task-detail-card page-card">
        <p className="muted-text">Loading task detail...</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="deadline-task-detail-card page-card">
        <p className="error-text">You need to be added to this task before you can view its detail.</p>
      </section>
    );
  }

  if (lockedTaskTitle) {
    return (
      <section className="deadline-task-detail-card page-card empty">
        <div>
          <h2>{lockedTaskTitle}</h2>
          <p className="muted-text">Everyone in the group can see this task name, but only assigned members, task leaders, or group managers can open its detail.</p>
        </div>
      </section>
    );
  }

  if (!task) {
    return (
      <section className="deadline-task-detail-card page-card empty">
        <p className="muted-text">Click a task in the right panel to see its detail and checklist here.</p>
      </section>
    );
  }

  const checklistSections = sortByPosition(task.checklistSections ?? []);
  const checklistItems = buildChecklistItemsFromSections(checklistSections);
  const checklistSummary = getChecklistSummary(checklistItems);
  const progress = checklistSummary.total > 0 ? checklistSummary.percent : getTaskProgress(task);
  const members = task.taskMemberships ?? [];
  const assignableGroupMembers = groupMembers.filter((membership) => {
    return !members.some((taskMembership) => taskMembership.userId === membership.userId);
  });

  return (
    <section className="deadline-task-detail-card page-card">
      <header className="deadline-detail-header">
        <div>
          <span className={getPriorityClass(task.priority)}>{task.priority}</span>
          <h2>{task.title}</h2>
          <p className="muted-text">{task.description || "No description yet."}</p>
        </div>
        <div className="deadline-detail-status">
          <strong>{progress}%</strong>
          <span>{isTaskDone(task) ? "Done" : task.isOverdue ? `${task.daysOverdue} days overdue` : "Active"}</span>
        </div>
      </header>

      <div className="deadline-detail-progress" aria-label={`Task progress ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <dl className="deadline-detail-grid">
        <div>
          <dt>Due date</dt>
          <dd>{formatDueDate(task)}</dd>
        </div>
        <div>
          <dt>Leader</dt>
          <dd>{getLeaderName(task)}</dd>
        </div>
        <div>
          <dt>Creator</dt>
          <dd>{task.creator?.username ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Members</dt>
          <dd>{members.length ? members.map((membership) => membership.user?.username ?? "Unknown").join(", ") : "No members yet"}</dd>
        </div>
      </dl>

      {canManage ? (
        <section className="deadline-detail-members">
          <div className="task-section-heading">
            <h3>Add member</h3>
            <span>{members.length} assigned</span>
          </div>
          <form className="deadline-member-form" onSubmit={onAddMember}>
            <select value={memberToAdd} onChange={(event) => onMemberToAddChange(event.target.value)}>
              <option value="">Select group member</option>
              {assignableGroupMembers.map((membership) => (
                <option key={membership.userId} value={membership.userId}>
                  {membership.user?.username ?? membership.userId}
                </option>
              ))}
            </select>
            <button type="submit" disabled={isAddingMember || !memberToAdd}>
              {isAddingMember ? "Adding..." : "Add"}
            </button>
          </form>
          {addMemberError ? <p className="error-text">{addMemberError}</p> : null}
        </section>
      ) : null}

      <section className="deadline-detail-checklist">
        <div className="task-section-heading">
          <h3>Checklist</h3>
          <span>
            {checklistSummary.completed}/{checklistSummary.total}
          </span>
        </div>
        <div className="task-checklist-progress" aria-label={`Checklist progress ${checklistSummary.percent}%`}>
          <span style={{ width: `${checklistSummary.percent}%` }} />
        </div>
        {canManageSections ? (
          <form className="deadline-checklist-form" onSubmit={onCreateChecklistSection}>
            <input
              value={newSectionTitle}
              onChange={(event) => onSectionTitleChange(event.target.value)}
              placeholder="Add checklist section"
              maxLength={160}
            />
            <button type="submit" disabled={isCreatingSection}>
              {isCreatingSection ? "Adding..." : "Add section"}
            </button>
          </form>
        ) : null}
        {checklistError ? <p className="error-text">{checklistError}</p> : null}
        {checklistSections.length === 0 ? <p className="muted-text">No checklist sections yet.</p> : null}
        <div className="deadline-checklist-list">
          {checklistSections.map((section) => (
            <div key={section.id} className="task-detail-section">
              <div className="task-section-heading">
                {editingSectionId === section.id ? (
                  <form className="deadline-checklist-form" onSubmit={onSaveSection}>
                    <input
                      value={editingSectionTitle}
                      onChange={(event) => onEditingSectionTitleChange(event.target.value)}
                      placeholder="Section title"
                      maxLength={160}
                    />
                    <button type="submit" disabled={isUpdatingChecklist}>
                      {isUpdatingChecklist ? "Saving..." : "Save"}
                    </button>
                    <button type="button" onClick={onCancelEditSection}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <h3>{section.title}</h3>
                    {canManageSections ? (
                      <div className="task-progress-controls">
                        <button type="button" onClick={() => onStartEditSection(section)}>
                          Edit
                        </button>
                        <button type="button" className="danger-button" onClick={() => onDeleteSection(section.id)} disabled={isDeletingChecklist}>
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              {canManageItems ? (
                <form className="deadline-checklist-form" onSubmit={(event) => onCreateChecklistItem(event, section.id)}>
                  <input
                    value={newChecklistTitle}
                    onChange={(event) => onChecklistTitleChange(event.target.value)}
                    placeholder="Add checklist item"
                    maxLength={160}
                  />
                  <button type="submit" disabled={isCreatingChecklist}>
                    {isCreatingChecklist ? "Adding..." : "Add"}
                  </button>
                </form>
              ) : null}

              {sortByPosition(section.items ?? []).length === 0 ? <p className="muted-text">No checklist items yet.</p> : null}
              {sortByPosition(section.items ?? []).map((item) => (
                <article key={item.id} className={item.isCompleted ? "deadline-checklist-item completed" : "deadline-checklist-item"}>
                  {editingItemId === item.id ? (
                    <form className="deadline-checklist-form" onSubmit={onSaveItem}>
                      <input
                        value={editingItemTitle}
                        onChange={(event) => onEditingItemTitleChange(event.target.value)}
                        placeholder="Checklist item title"
                        maxLength={160}
                      />
                      <button type="submit" disabled={isUpdatingChecklist}>
                        {isUpdatingChecklist ? "Saving..." : "Save"}
                      </button>
                      <button type="button" onClick={onCancelEditItem}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <label>
                        <input type="checkbox" checked={item.isCompleted} onChange={() => onToggleChecklistItem(item.id)} disabled={!canManageItems || isTogglingChecklist} />
                        <span>{item.title}</span>
                      </label>
                      {canManageItems ? (
                        <div className="task-progress-controls">
                          <button type="button" onClick={() => onStartEditItem(item)}>
                            Edit
                          </button>
                          <button type="button" className="danger-button" onClick={() => onDeleteChecklistItem(item.id)} disabled={isDeletingChecklist}>
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </article>
              ))}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function getCompletion(summary?: DeadlineSummary) {
  const active = summary?.statusCounts.active ?? 0;
  const done = summary?.statusCounts.done ?? 0;
  const total = active + done;

  return total > 0 ? `${Math.round((done / total) * 100)}%` : "0%";
}

export function DeadlinePage() {
  const queryClient = useQueryClient();
  const user = authStore((state) => state.user);
  const currentGroupId = authStore((state) => state.currentGroupId);
  const setCurrentGroup = authStore((state) => state.setCurrentGroup);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createDueDateOverride, setCreateDueDateOverride] = useState<string | null>(null);
  const [createPriority, setCreatePriority] = useState<Task["priority"]>("Medium");
  const [createError, setCreateError] = useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemTitle, setEditingItemTitle] = useState("");
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.all,
    queryFn: groupApi.getAll,
  });

  const tasksQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.deadline.tasks(currentGroupId) : ["deadline", "tasks", "missing"],
    queryFn: () => deadlineApi.getTasks(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const summaryQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.deadline.summary(currentGroupId) : ["deadline", "summary", "missing"],
    queryFn: () => deadlineApi.getSummary(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const groupMembersQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.groups.members(currentGroupId) : ["groups", "missing", "members"],
    queryFn: () => groupApi.getMembers(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const selectedTaskForQuery = tasksQuery.data?.find((task) => task.id === selectedTaskId) ?? null;

  const selectedTaskDetailQuery = useQuery({
    queryKey: selectedTaskId ? queryKeys.deadline.task(selectedTaskId) : ["deadline", "task", "missing"],
    queryFn: () => deadlineApi.getTask(selectedTaskId as string),
    enabled: Boolean(selectedTaskId && selectedTaskForQuery?.viewerCanOpen !== false),
  });

  useEffect(() => {
    if (!currentGroupId && groupsQuery.data?.length) {
      setCurrentGroup(groupsQuery.data[0].group.id);
    }
  }, [currentGroupId, groupsQuery.data, setCurrentGroup]);

  const columns = useMemo(() => buildDeadlineColumns(tasksQuery.data ?? []), [tasksQuery.data]);
  const selectedColumn = columns.find((column) => column.id === selectedColumnId) ?? columns.find((column) => column.id === "overdue") ?? columns[0];
  const selectedTask = selectedColumn?.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedTaskLocked = selectedTask?.viewerCanOpen === false;
  const selectedTaskDetail = selectedTaskLocked ? null : selectedTaskDetailQuery.data ?? selectedTask;
  const maxTaskCount = Math.max(1, ...columns.map((column) => getColumnStats(column).active));
  const summary = summaryQuery.data;
  const currentMembership = groupsQuery.data?.find((membership) => membership.group.id === currentGroupId) ?? null;
  const canCreateTasks = currentMembership?.role === "owner" || currentMembership?.role === "manager";

  const createDueDate =
    createDueDateOverride ??
    (selectedColumn ? (selectedColumn.dateKey ?? (selectedColumn.kind === "noDue" ? "" : toLocalDateKey(new Date()))) : "");

  const refreshDeadlineData = async () => {
    if (!currentGroupId) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.deadline.tasks(currentGroupId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.deadline.summary(currentGroupId) }),
    ]);
  };

  const refreshDeadlineTask = async (taskId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.deadline.task(taskId) }),
      currentGroupId ? queryClient.invalidateQueries({ queryKey: queryKeys.deadline.tasks(currentGroupId) }) : Promise.resolve(),
      currentGroupId ? queryClient.invalidateQueries({ queryKey: queryKeys.deadline.summary(currentGroupId) }) : Promise.resolve(),
    ]);
  };

  const createTaskMutation = useMutation({
    mutationFn: (payload: { title: string; groupId: string; dueDate?: string; priority: Task["priority"] }) => deadlineApi.create(payload),
    onSuccess: async () => {
      setCreateTitle("");
      setCreateError(null);
      setCreateDueDateOverride(null);
      await refreshDeadlineData();
    },
    onError: () => setCreateError("Could not create task."),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => deadlineApi.remove(taskId),
    onSuccess: async (_, taskId) => {
      setSelectedTaskId((current) => (current === taskId ? null : current));
      await refreshDeadlineData();
    },
    onError: () => setCreateError("Could not delete task."),
  });

  const createChecklistMutation = useMutation({
    mutationFn: (payload: { taskId: string; sectionId: string; title: string }) => deadlineApi.createChecklistItem(payload.taskId, { sectionId: payload.sectionId, title: payload.title }),
    onSuccess: async (_, payload) => {
      setNewChecklistTitle("");
      setChecklistError(null);
      await refreshDeadlineTask(payload.taskId);
    },
    onError: () => setChecklistError("Could not add checklist item."),
  });

  const createChecklistSectionMutation = useMutation({
    mutationFn: (payload: { taskId: string; title: string }) => deadlineApi.createChecklistSection(payload.taskId, { title: payload.title }),
    onSuccess: async (_, payload) => {
      setNewSectionTitle("");
      setChecklistError(null);
      await refreshDeadlineTask(payload.taskId);
    },
    onError: () => setChecklistError("Could not add checklist section."),
  });

  const updateChecklistMutation = useMutation<unknown, Error, { taskId: string; sectionId?: string; itemId?: string; title: string; kind: "section" | "item" }>({
    mutationFn: (payload: { taskId: string; sectionId?: string; itemId?: string; title: string; kind: "section" | "item" }) => {
      if (payload.kind === "section" && payload.sectionId) {
        return deadlineApi.updateChecklistSection(payload.taskId, payload.sectionId, { title: payload.title });
      }

      if (payload.kind === "item" && payload.itemId) {
        return deadlineApi.updateChecklistItem(payload.taskId, payload.itemId, { title: payload.title });
      }

      throw new Error("Invalid checklist update payload");
    },
    onSuccess: async (_, payload) => {
      setChecklistError(null);
      setEditingSectionId(null);
      setEditingSectionTitle("");
      setEditingItemId(null);
      setEditingItemTitle("");
      await refreshDeadlineTask(payload.taskId);
    },
    onError: () => setChecklistError("Could not update checklist."),    
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: (payload: { taskId: string; itemId: string }) => deadlineApi.toggleChecklistItem(payload.taskId, payload.itemId),
    onSuccess: async (_, payload) => {
      setChecklistError(null);
      await refreshDeadlineTask(payload.taskId);
    },
    onError: () => setChecklistError("Could not update checklist item."),
  });

  const deleteChecklistMutation = useMutation<void, Error, { taskId: string; itemId?: string; sectionId?: string; kind: "section" | "item" }>({
    mutationFn: (payload: { taskId: string; itemId?: string; sectionId?: string; kind: "section" | "item" }) => {
      if (payload.kind === "section" && payload.sectionId) {
        return deadlineApi.removeChecklistSection(payload.taskId, payload.sectionId);
      }

      if (payload.kind === "item" && payload.itemId) {
        return deadlineApi.removeChecklistItem(payload.taskId, payload.itemId);
      }

      throw new Error("Invalid checklist delete payload");
    },
    onSuccess: async (_, payload) => {
      setChecklistError(null);
      await refreshDeadlineTask(payload.taskId);
    },
    onError: () => setChecklistError("Could not delete checklist."),
  });

  const addMemberMutation = useMutation({
    mutationFn: (payload: { taskId: string; userId: string }) => deadlineApi.addMember(payload.taskId, { userId: payload.userId }),
    onSuccess: async (_, payload) => {
      setMemberToAdd("");
      setAddMemberError(null);
      await refreshDeadlineTask(payload.taskId);
    },
    onError: () => setAddMemberError("Could not add this member."),
  });

  const onCreateTask = (event: FormEvent) => {
    event.preventDefault();

    if (!currentGroupId) {
      setCreateError("Select a group first.");
      return;
    }

    const title = createTitle.trim();

    if (!title) {
      setCreateError("Task title is required.");
      return;
    }

    createTaskMutation.mutate({
      title,
      groupId: currentGroupId,
      priority: createPriority,
      dueDate: createDueDate ? new Date(`${createDueDate}T12:00:00`).toISOString() : undefined,
    });
  };

  const onCreateChecklistSection = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTaskId) {
      setChecklistError("Select a task first.");
      return;
    }

    const title = newSectionTitle.trim();

    if (!title) {
      setChecklistError("Checklist section title is required.");
      return;
    }

    createChecklistSectionMutation.mutate({
      taskId: selectedTaskId,
      title,
    });
  };

  const onCreateChecklistItem = (event: FormEvent, sectionId: string) => {
    event.preventDefault();

    if (!selectedTaskId) {
      setChecklistError("Select a task first.");
      return;
    }

    const title = newChecklistTitle.trim();

    if (!title) {
      setChecklistError("Checklist item title is required.");
      return;
    }

    createChecklistMutation.mutate({
      taskId: selectedTaskId,
      sectionId,
      title,
    });
  };

  const onSaveSection = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTaskId || !editingSectionId) {
      return;
    }

    const title = editingSectionTitle.trim();

    if (!title) {
      setChecklistError("Checklist section title is required.");
      return;
    }

    updateChecklistMutation.mutate({
      taskId: selectedTaskId,
      sectionId: editingSectionId,
      title,
      kind: "section",
    });
  };

  const onSaveItem = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTaskId || !editingItemId) {
      return;
    }

    const title = editingItemTitle.trim();

    if (!title) {
      setChecklistError("Checklist item title is required.");
      return;
    }

    updateChecklistMutation.mutate({
      taskId: selectedTaskId,
      itemId: editingItemId,
      title,
      kind: "item",
    });
  };

  const onAddMember = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTaskId || !memberToAdd) {
      setAddMemberError("Select a member first.");
      return;
    }

    addMemberMutation.mutate({
      taskId: selectedTaskId,
      userId: memberToAdd,
    });
  };

  const isLoading = Boolean(currentGroupId) && (tasksQuery.isLoading || summaryQuery.isLoading);
  const isError = Boolean(currentGroupId) && (tasksQuery.isError || summaryQuery.isError);

  return (
    <section className="deadline-page">
      <header className="page-card deadline-toolbar">
        <div>
          <h2>Deadline</h2>
          <p className="muted-text">Timeline view for due work, grouped by day.</p>
        </div>
        <select
          value={currentGroupId ?? ""}
          onChange={(event) => {
            setSelectedColumnId(null);
            setSelectedTaskId(null);
            setCreateDueDateOverride(null);
            setCurrentGroup(event.target.value || null);
          }}
        >
          <option value="">Select group</option>
          {groupsQuery.data?.map((membership) => (
            <option key={membership.group.id} value={membership.group.id}>
              {membership.group.name}
            </option>
          ))}
        </select>
      </header>

      <section className="deadline-metrics">
        <MetricCard label="Overdue" value={summary?.bucketCounts.overdue ?? 0} tone="danger" />
        <MetricCard label="Today" value={summary?.bucketCounts.today ?? 0} />
        <MetricCard label="This week" value={summary?.bucketCounts.week ?? 0} />
        <MetricCard label="Done" value={summary?.statusCounts.done ?? 0} tone="success" />
        <MetricCard label="Completion" value={getCompletion(summary)} />
      </section>

      {!currentGroupId ? (
        <section className="page-card">
          <p className="muted-text">Choose a group to load the deadline timeline.</p>
        </section>
      ) : null}

      {isLoading ? (
        <section className="page-card">
          <p className="muted-text">Loading deadline timeline...</p>
        </section>
      ) : null}

      {isError ? (
        <section className="page-card">
          <p className="error-text">Could not load deadline data.</p>
        </section>
      ) : null}

      {currentGroupId && !isLoading && !isError && selectedColumn ? (
        <section className="deadline-layout">
          <div className="deadline-main">
            <div className="deadline-timeline" aria-label="Deadline timeline columns">
              {columns.map((column) => (
                <TimelineColumn
                  key={column.id}
                  column={column}
                  selected={selectedColumn.id === column.id}
                  maxTaskCount={maxTaskCount}
                  onSelectColumn={() => {
                    setSelectedColumnId(column.id);
                    setSelectedTaskId(null);
                    setCreateDueDateOverride(null);
                    setChecklistError(null);
                    setNewSectionTitle("");
                    setNewChecklistTitle("");
                    setEditingSectionId(null);
                    setEditingSectionTitle("");
                    setEditingItemId(null);
                    setEditingItemTitle("");
                    setAddMemberError(null);
                    setMemberToAdd("");
                  }}
                />
              ))}
            </div>
            <DeadlineTaskDetail
              task={selectedTaskDetail}
              lockedTaskTitle={selectedTaskLocked ? selectedTask?.title : undefined}
              isLoading={Boolean(selectedTaskId) && !selectedTaskDetail && selectedTaskDetailQuery.isLoading}
              isError={selectedTaskDetailQuery.isError}
              canManage={Boolean(selectedTaskDetail?.viewerCanManage)}
              canManageSections={Boolean(selectedTaskDetail?.viewerCanManageSections)}
              canManageItems={Boolean(selectedTaskDetail?.viewerCanManageItems)}
              groupMembers={groupMembersQuery.data ?? []}
              memberToAdd={memberToAdd}
              addMemberError={addMemberError}
              isAddingMember={addMemberMutation.isPending}
              newSectionTitle={newSectionTitle}
              newChecklistTitle={newChecklistTitle}
              editingSectionId={editingSectionId}
              editingSectionTitle={editingSectionTitle}
              editingItemId={editingItemId}
              editingItemTitle={editingItemTitle}
              checklistError={checklistError}
              isCreatingSection={createChecklistSectionMutation.isPending}
              isCreatingChecklist={createChecklistMutation.isPending}
              isUpdatingChecklist={updateChecklistMutation.isPending}
              isTogglingChecklist={toggleChecklistMutation.isPending}
              isDeletingChecklist={deleteChecklistMutation.isPending}
              onSectionTitleChange={setNewSectionTitle}
              onChecklistTitleChange={setNewChecklistTitle}
              onStartEditSection={(section) => {
                setEditingSectionId(section.id);
                setEditingSectionTitle(section.title);
              }}
              onCancelEditSection={() => {
                setEditingSectionId(null);
                setEditingSectionTitle("");
              }}
              onEditingSectionTitleChange={setEditingSectionTitle}
              onSaveSection={onSaveSection}
              onDeleteSection={(sectionId) => {
                if (selectedTaskId) {
                  deleteChecklistMutation.mutate({ taskId: selectedTaskId, sectionId, kind: "section" });
                }
              }}
              onStartEditItem={(item) => {
                setEditingItemId(item.id);
                setEditingItemTitle(item.title);
              }}
              onCancelEditItem={() => {
                setEditingItemId(null);
                setEditingItemTitle("");
              }}
              onEditingItemTitleChange={setEditingItemTitle}
              onSaveItem={onSaveItem}
              onMemberToAddChange={setMemberToAdd}
              onAddMember={onAddMember}
              onCreateChecklistSection={onCreateChecklistSection}
              onCreateChecklistItem={onCreateChecklistItem}
              onToggleChecklistItem={(itemId) => {
                if (selectedTaskId) {
                  toggleChecklistMutation.mutate({ taskId: selectedTaskId, itemId });
                }
              }}
              onDeleteChecklistItem={(itemId) => {
                if (selectedTaskId) {
                  deleteChecklistMutation.mutate({ taskId: selectedTaskId, itemId, kind: "item" });
                }
              }}
            />
          </div>
          <SelectedColumnPanel
            column={selectedColumn}
            selectedTask={selectedTask}
            onSelectTask={(taskId) => {
              setSelectedTaskId(taskId);
              setChecklistError(null);
              setNewSectionTitle("");
              setNewChecklistTitle("");
              setEditingSectionId(null);
              setEditingSectionTitle("");
              setEditingItemId(null);
              setEditingItemTitle("");
              setAddMemberError(null);
              setMemberToAdd("");
            }}
            canCreateTasks={canCreateTasks}
            createTitle={createTitle}
            createDueDate={createDueDate}
            createPriority={createPriority}
            createError={createError}
            isCreatingTask={createTaskMutation.isPending}
            isDeletingTask={deleteTaskMutation.isPending}
            userId={user?.id}
            onCreateTitleChange={setCreateTitle}
            onCreateDueDateChange={setCreateDueDateOverride}
            onCreatePriorityChange={setCreatePriority}
            onCreateTask={onCreateTask}
            onDeleteTask={deleteTaskMutation.mutate}
          />
        </section>
      ) : null}
    </section>
  );
}
