import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragStartEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { commentApi } from "@/features/board/api/commentApi";
import { listApi } from "@/features/board/api/listApi";
import { taskApi } from "@/features/board/api/taskApi";
import { groupApi } from "@/features/groups/api/groupApi";
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

function formatDate(dateString?: string) {
  if (!dateString) {
    return "Chua co";
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Chua co";
  }

  return date.toLocaleString();
}

function TaskCard({
  task,
  selected,
  onSelect,
  onDelete,
}: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  onDelete: (taskId: string) => void;
}) {
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
      <button
        type="button"
        className="task-card-delete"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete(task.id);
        }}
      >
        Delete
      </button>
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
  onDeleteTask,
}: {
  list: List;
  tasks: Task[];
  draftTitle: string;
  onDraftTitleChange: (value: string) => void;
  onCreateTask: (event: FormEvent) => void;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
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
            <TaskCard
              key={task.id}
              task={task}
              selected={selectedTaskId === task.id}
              onSelect={() => onSelectTask(task.id)}
              onDelete={onDeleteTask}
            />
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
  const user = authStore((state) => state.user);

  const [newListName, setNewListName] = useState("");
  const [taskDraftByList, setTaskDraftByList] = useState<Record<string, string>>({});
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [newComment, setNewComment] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    setDescriptionDraft(selectedTask?.description ?? "");
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
    mutationFn: (payload: { taskId: string; description: string }) =>
      taskApi.update(payload.taskId, { description: payload.description }),
    onSuccess: async (updatedTask) => {
      setError(null);
      setLocalTasks((prev) => prev.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)));
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.tasks(currentGroupId as string) });
    },
    onError: () => setError("Could not update description."),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => taskApi.remove(taskId),
    onSuccess: async (_, taskId) => {
      setError(null);
      setLocalTasks((prev) => prev.filter((task) => task.id !== taskId));
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.tasks(currentGroupId as string) });
    },
    onError: () => setError("Could not delete task."),
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

  const onSaveDescription = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTask) {
      return;
    }

    updateTaskMutation.mutate({
      taskId: selectedTask.id,
      description: descriptionDraft.trim(),
    });
  };

  const onDeleteTask = (taskId: string) => {
    deleteTaskMutation.mutate(taskId);
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
        <section className="board-workspace">
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
                  onDeleteTask={onDeleteTask}
                />
              ))}
            </div>
          </DndContext>

          {selectedTask ? (
            <section className="page-card task-detail-panel">
              <header className="task-detail-header">
                <h3>Task Detail</h3>
                <p className="muted-text">{selectedTask.title}</p>
              </header>

              <section className="task-detail-section">
                <h4>Thong tin</h4>
                <p className="muted-text">Ngay tao: {formatDate(selectedTask.createdAt)}</p>
                <p className="muted-text">Nguoi tao: {selectedTask.creator?.username ?? "Chua co du lieu tu API"}</p>
                <form className="task-detail-form" onSubmit={onSaveDescription}>
                  <textarea
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    placeholder="Nhap mo ta task"
                    rows={4}
                  />
                  <button type="submit" disabled={updateTaskMutation.isPending}>
                    {updateTaskMutation.isPending ? "Saving..." : "Save description"}
                  </button>
                </form>
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
          ) : (
            <section className="page-card task-detail-panel task-detail-empty">
              <p className="muted-text">Select a task card to open detail panel.</p>
            </section>
          )}
        </section>
      ) : null}

      {activeTaskId ? <p className="muted-text">Moving task...</p> : null}
    </section>
  );
}
