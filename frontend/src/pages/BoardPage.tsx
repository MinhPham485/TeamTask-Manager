import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragStartEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { checklistApi } from "@/features/board/api/checklistApi";
import { commentApi } from "@/features/board/api/commentApi";
import { labelApi } from "@/features/board/api/labelApi";
import { groupApi } from "@/features/groups/api/groupApi";
import { listApi } from "@/features/board/api/listApi";
import { taskApi } from "@/features/board/api/taskApi";
import { authStore } from "@/features/auth/store/authStore";
import { queryKeys } from "@/shared/query/queryKeys";
import { List, Task } from "@/shared/types/models";

function sortByPosition<T extends { position: number }>(items: T[]) {
  return [...items].sort((a, b) => a.position - b.position);
}

function applyMove(tasks: Task[], taskId: string, targetListId: string, targetIndex: number) {
  const next = [...tasks];
  const movingIndex = next.findIndex((task) => task.id === taskId);

  if (movingIndex < 0) {
    return tasks;
  }

  const [movingTask] = next.splice(movingIndex, 1);
  const normalizedTask = { ...movingTask, listId: targetListId };

  const beforeTarget = next.filter((task) => task.listId === targetListId);
  const insertAt = Math.max(0, Math.min(targetIndex, beforeTarget.length));

  const targetIds = beforeTarget.map((task) => task.id);
  const anchorId = targetIds[insertAt];

  if (!anchorId) {
    next.push(normalizedTask);
  } else {
    const absoluteIndex = next.findIndex((task) => task.id === anchorId);
    next.splice(absoluteIndex, 0, normalizedTask);
  }

  const perList = new Map<string, Task[]>();

  next.forEach((task) => {
    if (!perList.has(task.listId)) {
      perList.set(task.listId, []);
    }

    perList.get(task.listId)?.push(task);
  });

  perList.forEach((listTasks) => {
    listTasks.forEach((task, index) => {
      task.position = index;
    });
  });

  return next;
}

function toLocalDateTimeInput(isoDate?: string | null) {
  if (!isoDate) {
    return "";
  }

  const date = new Date(isoDate);
  const timezoneOffset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - timezoneOffset * 60000);
  return localDate.toISOString().slice(0, 16);
}

function TaskCard({ task, selected, onSelect }: { task: Task; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  return (
    <article
      ref={setNodeRef}
      className={isDragging ? "task-card dragging" : selected ? "task-card selected" : "task-card"}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <p>{task.title}</p>
      <small className="muted-text">{task.assignee?.username ? `@${task.assignee.username}` : "Unassigned"}</small>
    </article>
  );
}

function ListColumn({
  list,
  tasks,
  draftTitle,
  onDraftTitleChange,
  onCreateTask,
  selectedTaskId,
  onSelectTask,
}: {
  list: List;
  tasks: Task[];
  draftTitle: string;
  onDraftTitleChange: (value: string) => void;
  onCreateTask: (event: FormEvent) => void;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: list.id });

  return (
    <section ref={setNodeRef} className={isOver ? "board-column over" : "board-column"}>
      <header className="board-column-header">
        <h3>{list.name}</h3>
        <span>{tasks.length}</span>
      </header>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="task-stack">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} selected={selectedTaskId === task.id} onSelect={() => onSelectTask(task.id)} />
          ))}
        </div>
      </SortableContext>

      <form className="task-quick-create" onSubmit={onCreateTask}>
        <input value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} placeholder="New task title" />
        <button type="submit">Add</button>
      </form>
    </section>
  );
}

export function BoardPage() {
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const currentGroupId = authStore((state) => state.currentGroupId);
  const setCurrentGroup = authStore((state) => state.setCurrentGroup);
  const [newListName, setNewListName] = useState("");
  const [taskDraftByList, setTaskDraftByList] = useState<Record<string, string>>({});
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskTitleDraft, setTaskTitleDraft] = useState("");
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState("");
  const [taskDueDateDraft, setTaskDueDateDraft] = useState("");
  const [taskAssigneeDraft, setTaskAssigneeDraft] = useState("");
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#fca311");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const user = authStore((state) => state.user);

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.all,
    queryFn: groupApi.getAll,
  });

  const listsQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.board.lists(currentGroupId) : ["board", "lists", "missing"],
    queryFn: () => listApi.getByGroup(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const tasksQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.board.tasks(currentGroupId) : ["board", "tasks", "missing"],
    queryFn: () => taskApi.getByGroup(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const membersQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.groups.members(currentGroupId) : ["groups", "members", "missing"],
    queryFn: () => groupApi.getMembers(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const labelsQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.board.labels(currentGroupId) : ["board", "labels", "missing"],
    queryFn: () => labelApi.getByGroup(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const checklistQuery = useQuery({
    queryKey: selectedTaskId ? queryKeys.checklists.byTask(selectedTaskId) : ["checklists", "missing"],
    queryFn: () => checklistApi.getByTask(selectedTaskId as string),
    enabled: Boolean(selectedTaskId),
  });

  const commentsQuery = useQuery({
    queryKey: selectedTaskId ? queryKeys.comments.byTask(selectedTaskId) : ["comments", "missing"],
    queryFn: () => commentApi.getByTask(selectedTaskId as string),
    enabled: Boolean(selectedTaskId),
  });

  useEffect(() => {
    if (!currentGroupId && groupsQuery.data?.length) {
      setCurrentGroup(groupsQuery.data[0].group.id);
    }
  }, [currentGroupId, groupsQuery.data, setCurrentGroup]);

  useEffect(() => {
    setSelectedTaskId(null);
  }, [currentGroupId]);

  useEffect(() => {
    setLocalTasks(tasksQuery.data ? sortByPosition(tasksQuery.data) : []);
  }, [tasksQuery.data]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) {
      return null;
    }

    return localTasks.find((task) => task.id === selectedTaskId) ?? null;
  }, [localTasks, selectedTaskId]);

  useEffect(() => {
    if (!selectedTask) {
      setTaskTitleDraft("");
      setTaskDescriptionDraft("");
      setTaskDueDateDraft("");
      setTaskAssigneeDraft("");
      setSelectedLabelIds([]);
      return;
    }

    setTaskTitleDraft(selectedTask.title);
    setTaskDescriptionDraft(selectedTask.description ?? "");
    setTaskDueDateDraft(toLocalDateTimeInput(selectedTask.dueDate));
    setTaskAssigneeDraft(selectedTask.assigneeId ?? "");
    setSelectedLabelIds(selectedTask.taskLabels?.map((item) => item.label.id) ?? []);
  }, [selectedTask]);

  const sortedLists = useMemo(() => {
    return listsQuery.data ? sortByPosition(listsQuery.data) : [];
  }, [listsQuery.data]);

  const tasksByList = useMemo(() => {
    const map: Record<string, Task[]> = {};

    sortedLists.forEach((list) => {
      map[list.id] = [];
    });

    localTasks.forEach((task) => {
      if (!map[task.listId]) {
        map[task.listId] = [];
      }
      map[task.listId].push(task);
    });

    Object.keys(map).forEach((listId) => {
      map[listId] = sortByPosition(map[listId]);
    });

    return map;
  }, [localTasks, sortedLists]);

  const createListMutation = useMutation({
    mutationFn: (payload: { groupId: string; name: string }) => listApi.create(payload),
    onSuccess: async () => {
      setNewListName("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.lists(currentGroupId as string) });
    },
    onError: () => setError("Could not create list."),
  });

  const createTaskMutation = useMutation({
    mutationFn: (payload: { title: string; groupId: string; listId: string }) => taskApi.create(payload),
    onSuccess: async (_, payload) => {
      setTaskDraftByList((prev) => ({ ...prev, [payload.listId]: "" }));
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.tasks(currentGroupId as string) });
    },
    onError: () => setError("Could not create task."),
  });

  const moveTaskMutation = useMutation({
    mutationFn: (payload: { taskId: string; listId: string; position: number }) =>
      taskApi.updatePosition(payload.taskId, { listId: payload.listId, position: payload.position }),
    onError: () => {
      setError("Could not move task.");
      setLocalTasks(tasksQuery.data ? sortByPosition(tasksQuery.data) : []);
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.tasks(currentGroupId as string) });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: (payload: { taskId: string; title: string; description: string; dueDate: string; assignedTo: string }) =>
      taskApi.update(payload.taskId, {
        title: payload.title,
        description: payload.description || undefined,
        dueDate: payload.dueDate ? new Date(payload.dueDate).toISOString() : null,
        assignedTo: payload.assignedTo || null,
      }),
    onSuccess: async (updatedTask) => {
      setError(null);
      setLocalTasks((prev) => prev.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)));
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.tasks(currentGroupId as string) });
    },
    onError: () => setError("Could not update task details."),
  });

  const createLabelMutation = useMutation({
    mutationFn: (payload: { groupId: string; name: string; color: string }) => labelApi.create(payload),
    onSuccess: async () => {
      setError(null);
      setNewLabelName("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.labels(currentGroupId as string) });
    },
    onError: () => setError("Could not create label."),
  });

  const deleteLabelMutation = useMutation({
    mutationFn: (labelId: string) => labelApi.remove(labelId),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.labels(currentGroupId as string) });
    },
    onError: () => setError("Could not delete label."),
  });

  const updateLabelMutation = useMutation({
    mutationFn: (payload: { labelId: string; name: string; color: string }) =>
      labelApi.update(payload.labelId, { name: payload.name, color: payload.color }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.labels(currentGroupId as string) });
    },
    onError: () => setError("Could not update label."),
  });

  const assignLabelsMutation = useMutation({
    mutationFn: (payload: { taskId: string; labelIds: string[] }) => taskApi.assignLabels(payload.taskId, payload.labelIds),
    onSuccess: async (updatedTask) => {
      setError(null);
      setLocalTasks((prev) => prev.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)));
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.tasks(currentGroupId as string) });
    },
    onError: () => setError("Could not assign labels."),
  });

  const createChecklistMutation = useMutation({
    mutationFn: (payload: { taskId: string; title: string }) => checklistApi.create(payload),
    onSuccess: async (_, payload) => {
      setError(null);
      setNewChecklistTitle("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.checklists.byTask(payload.taskId) });
    },
    onError: () => setError("Could not create checklist item."),
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: (payload: { itemId: string; isCompleted: boolean }) => checklistApi.toggle(payload.itemId, payload.isCompleted),
    onSuccess: async () => {
      setError(null);
      if (selectedTaskId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.checklists.byTask(selectedTaskId) });
      }
    },
    onError: () => setError("Could not update checklist item."),
  });

  const deleteChecklistMutation = useMutation({
    mutationFn: (itemId: string) => checklistApi.remove(itemId),
    onSuccess: async () => {
      setError(null);
      if (selectedTaskId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.checklists.byTask(selectedTaskId) });
      }
    },
    onError: () => setError("Could not remove checklist item."),
  });

  const createCommentMutation = useMutation({
    mutationFn: (payload: { taskId: string; content: string }) => commentApi.create(payload),
    onSuccess: async (_, payload) => {
      setError(null);
      setNewComment("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.comments.byTask(payload.taskId) });
    },
    onError: () => setError("Could not post comment."),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => commentApi.remove(commentId),
    onSuccess: async () => {
      setError(null);
      if (selectedTaskId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.comments.byTask(selectedTaskId) });
      }
    },
    onError: () => setError("Could not delete comment."),
  });

  const onCreateList = (event: FormEvent) => {
    event.preventDefault();

    if (!currentGroupId) {
      setError("Select a group first.");
      return;
    }

    const normalizedName = newListName.trim();
    if (!normalizedName) {
      setError("List name is required.");
      return;
    }

    createListMutation.mutate({ groupId: currentGroupId, name: normalizedName });
  };

  const onCreateTask = (listId: string) => (event: FormEvent) => {
    event.preventDefault();

    if (!currentGroupId) {
      setError("Select a group first.");
      return;
    }

    const title = (taskDraftByList[listId] ?? "").trim();
    if (!title) {
      setError("Task title is required.");
      return;
    }

    createTaskMutation.mutate({ title, groupId: currentGroupId, listId });
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTaskId(null);

    if (!over || !currentGroupId) {
      return;
    }

    const taskId = String(active.id);
    const activeTask = localTasks.find((task) => task.id === taskId);

    if (!activeTask) {
      return;
    }

    const overId = String(over.id);
    const overTask = localTasks.find((task) => task.id === overId);
    const targetListId = overTask ? overTask.listId : overId;

    if (!sortedLists.some((list) => list.id === targetListId)) {
      return;
    }

    const targetTasks = tasksByList[targetListId] ?? [];
    const targetIndex = overTask ? Math.max(0, targetTasks.findIndex((task) => task.id === overTask.id)) : targetTasks.length;

    if (activeTask.listId === targetListId && activeTask.position === targetIndex) {
      return;
    }

    const nextTasks = applyMove(localTasks, taskId, targetListId, targetIndex);
    setLocalTasks(nextTasks);

    moveTaskMutation.mutate({
      taskId,
      listId: targetListId,
      position: targetIndex,
    });
  };

  const onSaveTaskDetails = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTask) {
      return;
    }

    const normalizedTitle = taskTitleDraft.trim();
    if (!normalizedTitle) {
      setError("Task title is required.");
      return;
    }

    updateTaskMutation.mutate({
      taskId: selectedTask.id,
      title: normalizedTitle,
      description: taskDescriptionDraft.trim(),
      dueDate: taskDueDateDraft,
      assignedTo: taskAssigneeDraft,
    });
  };

  const onCreateLabel = (event: FormEvent) => {
    event.preventDefault();

    if (!currentGroupId) {
      return;
    }

    const name = newLabelName.trim();
    if (!name) {
      setError("Label name is required.");
      return;
    }

    createLabelMutation.mutate({
      groupId: currentGroupId,
      name,
      color: newLabelColor,
    });
  };

  const onApplyLabels = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTask) {
      return;
    }

    assignLabelsMutation.mutate({
      taskId: selectedTask.id,
      labelIds: selectedLabelIds,
    });
  };

  const onCreateChecklist = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTask) {
      return;
    }

    const title = newChecklistTitle.trim();
    if (!title) {
      setError("Checklist title is required.");
      return;
    }

    createChecklistMutation.mutate({ taskId: selectedTask.id, title });
  };

  const onCreateComment = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTask) {
      return;
    }

    const content = newComment.trim();
    if (!content) {
      setError("Comment content is required.");
      return;
    }

    createCommentMutation.mutate({ taskId: selectedTask.id, content });
  };

  return (
    <section className="board-page">
      <header className="page-card board-toolbar">
        <h2>Kanban Board</h2>
        <div className="board-toolbar-controls">
          <select
            value={currentGroupId ?? ""}
            onChange={(event) => {
              setCurrentGroup(event.target.value || null);
            }}
          >
            <option value="">Select group</option>
            {(groupsQuery.data ?? []).map((membership) => (
              <option key={membership.group.id} value={membership.group.id}>
                {membership.group.name}
              </option>
            ))}
          </select>

          <form className="board-create-list" onSubmit={onCreateList}>
            <input
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder="New list"
              maxLength={60}
            />
            <button type="submit" disabled={createListMutation.isPending}>
              {createListMutation.isPending ? "Adding..." : "Add list"}
            </button>
          </form>
        </div>
        {error ? <p className="error-text page-feedback">{error}</p> : null}
      </header>

      {!currentGroupId ? (
        <section className="page-card">
          <p className="muted-text">Choose a group to load its board.</p>
        </section>
      ) : null}

      {currentGroupId && (listsQuery.isLoading || tasksQuery.isLoading) ? (
        <section className="page-card">
          <p className="muted-text">Loading board...</p>
        </section>
      ) : null}

      {currentGroupId && (listsQuery.isError || tasksQuery.isError) ? (
        <section className="page-card">
          <p className="error-text">Could not load board data.</p>
        </section>
      ) : null}

      {currentGroupId && !listsQuery.isLoading && !tasksQuery.isLoading && !listsQuery.isError && !tasksQuery.isError ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="board-columns">
            {sortedLists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                tasks={tasksByList[list.id] ?? []}
                draftTitle={taskDraftByList[list.id] ?? ""}
                onDraftTitleChange={(value) => setTaskDraftByList((prev) => ({ ...prev, [list.id]: value }))}
                onCreateTask={onCreateTask(list.id)}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
              />
            ))}
          </div>
        </DndContext>
      ) : null}

      {selectedTask ? (
        <section className="page-card task-detail-panel">
          <header className="task-detail-header">
            <h3>Task Detail</h3>
            <p className="muted-text">{selectedTask.title}</p>
          </header>

          <form className="task-detail-form" onSubmit={onSaveTaskDetails}>
            <input value={taskTitleDraft} onChange={(event) => setTaskTitleDraft(event.target.value)} placeholder="Task title" />
            <textarea
              value={taskDescriptionDraft}
              onChange={(event) => setTaskDescriptionDraft(event.target.value)}
              placeholder="Task description"
              rows={3}
            />

            <div className="task-detail-grid">
              <label>
                Due date
                <input
                  type="datetime-local"
                  value={taskDueDateDraft}
                  onChange={(event) => setTaskDueDateDraft(event.target.value)}
                />
              </label>

              <label>
                Assignee
                <select value={taskAssigneeDraft} onChange={(event) => setTaskAssigneeDraft(event.target.value)}>
                  <option value="">Unassigned</option>
                  {(membersQuery.data ?? []).map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.user?.username ?? member.userId}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="submit" disabled={updateTaskMutation.isPending}>
              {updateTaskMutation.isPending ? "Saving..." : "Save details"}
            </button>
          </form>

          <section className="task-detail-section">
            <h4>Labels</h4>
            <form className="task-detail-inline" onSubmit={onCreateLabel}>
              <input value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} placeholder="New label name" />
              <input type="color" value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)} />
              <button type="submit" disabled={createLabelMutation.isPending}>
                {createLabelMutation.isPending ? "Adding..." : "Add label"}
              </button>
            </form>

            <form className="task-label-list" onSubmit={onApplyLabels}>
              {(labelsQuery.data ?? []).map((label) => {
                const checked = selectedLabelIds.includes(label.id);

                return (
                  <label key={label.id} className="task-label-item">
                    <span className="task-label-pill" style={{ background: label.color }} />
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setSelectedLabelIds((prev) => {
                          if (event.target.checked) {
                            return [...prev, label.id];
                          }

                          return prev.filter((id) => id !== label.id);
                        });
                      }}
                    />
                    <span>{label.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const renamed = window.prompt("Rename label", label.name);

                        if (!renamed) {
                          return;
                        }

                        const normalized = renamed.trim();

                        if (!normalized) {
                          return;
                        }

                        updateLabelMutation.mutate({
                          labelId: label.id,
                          name: normalized,
                          color: label.color,
                        });
                      }}
                      disabled={updateLabelMutation.isPending}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => deleteLabelMutation.mutate(label.id)}
                      disabled={deleteLabelMutation.isPending}
                    >
                      Delete
                    </button>
                  </label>
                );
              })}

              <button type="submit" disabled={assignLabelsMutation.isPending}>
                {assignLabelsMutation.isPending ? "Applying..." : "Apply labels"}
              </button>
            </form>
          </section>

          <section className="task-detail-section">
            <h4>Checklist</h4>
            <form className="task-detail-inline" onSubmit={onCreateChecklist}>
              <input
                value={newChecklistTitle}
                onChange={(event) => setNewChecklistTitle(event.target.value)}
                placeholder="Checklist item"
              />
              <button type="submit" disabled={createChecklistMutation.isPending}>
                {createChecklistMutation.isPending ? "Adding..." : "Add item"}
              </button>
            </form>

            <div className="task-detail-list">
              {(checklistQuery.data ?? []).map((item) => (
                <div key={item.id} className="task-detail-list-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={item.isCompleted}
                      onChange={() => toggleChecklistMutation.mutate({ itemId: item.id, isCompleted: !item.isCompleted })}
                    />
                    <span>{item.title}</span>
                  </label>
                  <button type="button" className="danger-button" onClick={() => deleteChecklistMutation.mutate(item.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="task-detail-section">
            <h4>Comments</h4>
            <form className="task-detail-inline" onSubmit={onCreateComment}>
              <input value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Write a comment" />
              <button type="submit" disabled={createCommentMutation.isPending}>
                {createCommentMutation.isPending ? "Posting..." : "Post"}
              </button>
            </form>

            <div className="task-detail-list">
              {(commentsQuery.data ?? []).map((comment) => (
                <article key={comment.id} className="task-comment-item">
                  <p>{comment.content}</p>
                  <small className="muted-text">
                    {comment.sender?.username ?? "Unknown"} • {new Date(comment.createdAt).toLocaleString()}
                  </small>
                  {comment.senderId === user?.id ? (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => deleteCommentMutation.mutate(comment.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {activeTaskId ? <p className="muted-text">Moving task...</p> : null}
    </section>
  );
}
