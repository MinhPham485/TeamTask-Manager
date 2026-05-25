import { FormEvent, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragStartEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { checklistApi } from "@/features/board/api/checklistApi";
import { commentApi } from "@/features/board/api/commentApi";
import { listApi } from "@/features/board/api/listApi";
import { taskApi } from "@/features/board/api/taskApi";
import { groupApi } from "@/features/groups/api/groupApi";
import { authStore } from "@/features/auth/store/authStore";
import { queryKeys } from "@/shared/query/queryKeys";
import { uploadApi } from "@/shared/api/uploadApi";
import { Attachment, ChecklistItem, List, Task } from "@/shared/types/models";

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);

function sortByPosition<T extends { position: number }>(items: T[]) {
  return [...items].sort((a, b) => a.position - b.position);
}

const PRIORITY_ORDER: Record<Task["priority"], number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  Done: 3,
};

function sortByPriorityThenPosition(items: Task[]) {
  return [...items].sort((a, b) => {
    const priorityDifference = PRIORITY_ORDER[a.priority ?? "Low"] - PRIORITY_ORDER[b.priority ?? "Low"];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return a.position - b.position;
  });
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

function formatDate(dateString?: string | null) {
  if (!dateString) {
    return "Chua co";
  }

  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? "Chua co" : date.toLocaleString();
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(2)} MB`;
}

function getTaskProgress(task: Task) {
  return Math.max(0, Math.min(100, task.progress ?? 0));
}

function getPriorityClass(priority?: Task["priority"]) {
  return `priority-badge priority-${(priority ?? "Low").toLowerCase()}`;
}

function getChecklistSummary(items?: ChecklistItem[]) {
  const total = items?.length ?? 0;
  const completed = items?.filter((item) => item.isCompleted).length ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, percent, total };
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
  const checklistSummary = getChecklistSummary(task.checklistItems);

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
      <small className="task-card-progress-label">Progress</small>
      <div className="task-card-progress" aria-label={`Progress ${getTaskProgress(task)}%`}>
        <span style={{ width: `${getTaskProgress(task)}%` }} />
      </div>
      <div className="task-card-meta">
        <small className="muted-text">{getTaskProgress(task)}%</small>
        <span className={getPriorityClass(task.priority)}>{task.priority ?? "Low"}</span>
      </div>
      {checklistSummary.total > 0 ? (
        <div className="task-card-checklist" aria-label={`Checklist ${checklistSummary.completed} of ${checklistSummary.total}`}>
          <span>Checklist</span>
          <strong>
            {checklistSummary.completed}/{checklistSummary.total}
          </strong>
        </div>
      ) : null}
      {task.assignee?.username ? <small className="muted-text">@{task.assignee.username}</small> : null}
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
  const [progressDraft, setProgressDraft] = useState(0);
  const [priorityDraft, setPriorityDraft] = useState<Task["priority"]>("Low");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
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

  const attachmentsQuery = useQuery({
    queryKey: selectedTaskId ? queryKeys.attachments.byTask(selectedTaskId) : ["attachments", "missing"],
    queryFn: () => taskApi.getAttachments(selectedTaskId as string),
    enabled: Boolean(selectedTaskId),
  });

  const checklistQuery = useQuery({
    queryKey: selectedTaskId ? queryKeys.checklists.byTask(selectedTaskId) : ["checklists", "missing"],
    queryFn: () => checklistApi.getByTask(selectedTaskId as string),
    enabled: Boolean(selectedTaskId),
  });

  useEffect(() => {
    if (!currentGroupId && groupsQuery.data?.length) {
      setCurrentGroup(groupsQuery.data[0].group.id);
    }
  }, [currentGroupId, groupsQuery.data, setCurrentGroup]);

  useEffect(() => {
    setLocalTasks(tasksQuery.data ? sortByPosition(tasksQuery.data) : []);
  }, [tasksQuery.data]);

  useEffect(() => {
    setSelectedTaskId(null);
  }, [currentGroupId]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) {
      return null;
    }

    return localTasks.find((task) => task.id === selectedTaskId) ?? null;
  }, [localTasks, selectedTaskId]);

  useEffect(() => {
    setDescriptionDraft(selectedTask?.description ?? "");
    setProgressDraft(selectedTask ? getTaskProgress(selectedTask) : 0);
    setPriorityDraft(selectedTask?.priority ?? "Low");
    setNewChecklistTitle("");
    setAttachmentFile(null);
    setAttachmentError(null);
  }, [selectedTask]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedTaskId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTaskId]);

  const checklistSummary = useMemo(() => {
    return getChecklistSummary(checklistQuery.data ?? selectedTask?.checklistItems);
  }, [checklistQuery.data, selectedTask?.checklistItems]);

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
      map[listId] = sortByPriorityThenPosition(map[listId]);
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

  const updateTaskMutation = useMutation({
    mutationFn: (payload: { description?: string; progress?: number; priority?: Task["priority"] }) =>
      taskApi.update(selectedTaskId as string, payload),
    onSuccess: async (updatedTask) => {
      setError(null);
      setLocalTasks((prev) => prev.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)));
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.tasks(currentGroupId as string) });
    },
    onError: () => setError("Could not update task."),
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

  const refreshChecklist = async (taskId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.checklists.byTask(taskId) }),
      currentGroupId ? queryClient.invalidateQueries({ queryKey: queryKeys.board.tasks(currentGroupId) }) : Promise.resolve(),
    ]);
  };

  const createChecklistMutation = useMutation({
    mutationFn: (payload: { taskId: string; title: string }) => checklistApi.create(payload),
    onSuccess: async (_, payload) => {
      setError(null);
      setNewChecklistTitle("");
      await refreshChecklist(payload.taskId);
    },
    onError: () => setError("Could not add checklist item."),
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: (payload: { itemId: string; taskId: string; isCompleted: boolean }) =>
      checklistApi.toggle(payload.itemId, payload.isCompleted),
    onSuccess: async (_, payload) => {
      setError(null);
      await refreshChecklist(payload.taskId);
    },
    onError: () => setError("Could not update checklist item."),
  });

  const deleteChecklistMutation = useMutation({
    mutationFn: (payload: { itemId: string; taskId: string }) => checklistApi.remove(payload.itemId),
    onSuccess: async (_, payload) => {
      setError(null);
      await refreshChecklist(payload.taskId);
    },
    onError: () => setError("Could not delete checklist item."),
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

  const onDeleteTask = (taskId: string) => {
    deleteTaskMutation.mutate(taskId);
  };

  const openTaskDetail = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const closeTaskDetail = () => {
    setSelectedTaskId(null);
  };

  const onSaveDescription = (event: FormEvent) => {
    event.preventDefault();
    updateTaskMutation.mutate({ description: descriptionDraft.trim() });
  };

  const onSaveProgress = (event: FormEvent) => {
    event.preventDefault();
    updateTaskMutation.mutate({ progress: progressDraft });
  };

  const onSavePriority = (event: FormEvent) => {
    event.preventDefault();
    updateTaskMutation.mutate({ priority: priorityDraft });
  };

  const onCreateChecklistItem = (event: FormEvent) => {
    event.preventDefault();

    if (!selectedTask) {
      return;
    }

    const title = newChecklistTitle.trim();
    if (!title) {
      setError("Checklist item title is required.");
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

  const onPickAttachment = (file?: File | null) => {
    if (!file) {
      setAttachmentFile(null);
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setAttachmentError("File type is not allowed.");
      setAttachmentFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setAttachmentError("File size exceeds 3MB.");
      setAttachmentFile(null);
      return;
    }

    setAttachmentFile(file);
    setAttachmentError(null);
  };

  const onUploadAttachment = async () => {
    if (!selectedTask || !attachmentFile) {
      setAttachmentError("Choose a file to upload.");
      return;
    }

    try {
      setAttachmentUploading(true);
      setAttachmentError(null);

      const presign = await uploadApi.presign({
        groupId: selectedTask.groupId,
        fileName: attachmentFile.name,
        mimeType: attachmentFile.type,
        size: attachmentFile.size,
        targetType: "task",
      });

      await axios.put(presign.uploadUrl, attachmentFile, {
        headers: {
          "Content-Type": attachmentFile.type,
        },
      });

      await taskApi.createAttachment(selectedTask.id, {
        fileName: attachmentFile.name,
        mimeType: attachmentFile.type,
        size: attachmentFile.size,
        url: presign.fileUrl,
        key: presign.key,
      });

      setAttachmentFile(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.attachments.byTask(selectedTask.id) });
    } catch (uploadError) {
      setAttachmentError("Could not upload attachment.");
    } finally {
      setAttachmentUploading(false);
    }
  };

  return (
    <section className="board-page">
      <header className="page-card board-toolbar">
        <h2> DashBoard</h2>
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
                  onSelectTask={openTaskDetail}
                  onDeleteTask={onDeleteTask}
                />
              ))}
            </div>
          </DndContext>
        </section>
      ) : null}

      {selectedTask ? (
        <div className="task-modal-backdrop" role="presentation" onMouseDown={closeTaskDetail}>
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="task-modal-header">
              <div>
                <h2 id="task-modal-title">{selectedTask.title}</h2>
                <p className="muted-text">
                  Created {formatDate(selectedTask.createdAt)} by {selectedTask.creator?.username ?? "Unknown"}
                </p>
              </div>
              <button type="button" className="task-modal-close" onClick={closeTaskDetail} aria-label="Close task detail">
                x
              </button>
            </header>

            <div className="task-modal-body">
              <main className="task-modal-main">
                <section className="task-detail-section">
                  <h3>Description</h3>
                  <form className="task-detail-form" onSubmit={onSaveDescription}>
                    <textarea
                      value={descriptionDraft}
                      onChange={(event) => setDescriptionDraft(event.target.value)}
                      placeholder="Nhap mo ta task"
                      rows={5}
                    />
                    <button type="submit" disabled={updateTaskMutation.isPending}>
                      {updateTaskMutation.isPending ? "Saving..." : "Save description"}
                    </button>
                  </form>
                </section>

                <section className="task-detail-section">
                  <div className="task-section-heading">
                    <h3>Checklist</h3>
                    <span>
                      {checklistSummary.completed}/{checklistSummary.total}
                    </span>
                  </div>
                  <div className="task-checklist-progress" aria-label={`Checklist progress ${checklistSummary.percent}%`}>
                    <span style={{ width: `${checklistSummary.percent}%` }} />
                  </div>
                  <form className="task-detail-inline" onSubmit={onCreateChecklistItem}>
                    <input
                      value={newChecklistTitle}
                      onChange={(event) => setNewChecklistTitle(event.target.value)}
                      placeholder="Add checklist item"
                      maxLength={160}
                    />
                    <button type="submit" disabled={createChecklistMutation.isPending}>
                      {createChecklistMutation.isPending ? "Adding..." : "Add"}
                    </button>
                  </form>

                  {checklistQuery.isLoading ? <p className="muted-text">Loading checklist...</p> : null}
                  {checklistQuery.isError ? <p className="error-text">Could not load checklist.</p> : null}
                  {!checklistQuery.isLoading && !checklistQuery.isError && (checklistQuery.data ?? []).length === 0 ? (
                    <p className="muted-text">No checklist items yet.</p>
                  ) : null}
                  <div className="task-detail-list">
                    {sortByPosition(checklistQuery.data ?? []).map((item) => (
                      <article key={item.id} className={item.isCompleted ? "task-detail-list-item completed" : "task-detail-list-item"}>
                        <label>
                          <input
                            type="checkbox"
                            checked={item.isCompleted}
                            onChange={(event) =>
                              toggleChecklistMutation.mutate({
                                itemId: item.id,
                                taskId: item.taskId,
                                isCompleted: event.target.checked,
                              })
                            }
                            disabled={toggleChecklistMutation.isPending}
                          />
                          <span>{item.title}</span>
                        </label>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => deleteChecklistMutation.mutate({ itemId: item.id, taskId: item.taskId })}
                          disabled={deleteChecklistMutation.isPending}
                        >
                          Delete
                        </button>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="task-detail-section">
                  <h3>Comments</h3>
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
                          <button type="button" className="danger-button" onClick={() => deleteCommentMutation.mutate(comment.id)}>
                            Delete
                          </button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              </main>

              <aside className="task-modal-side">
                <section className="task-detail-section">
                  <h3>Actions</h3>
                  <form className="task-progress-form" onSubmit={onSaveProgress}>
                    <div className="task-progress-summary">
                      <span>{progressDraft}%</span>
                    </div>
                    <div className="task-progress-bar" aria-label={`Progress ${progressDraft}%`}>
                      <span style={{ width: `${progressDraft}%` }} />
                    </div>
                    <label>
                      Progress
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={progressDraft}
                        onChange={(event) => setProgressDraft(Number(event.target.value))}
                      />
                    </label>
                    <div className="task-progress-controls">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={progressDraft}
                        onChange={(event) => {
                          const nextValue = Math.max(0, Math.min(100, Number(event.target.value)));
                          setProgressDraft(Number.isNaN(nextValue) ? 0 : nextValue);
                        }}
                      />
                      <button type="submit" disabled={updateTaskMutation.isPending}>
                        Save
                      </button>
                    </div>
                  </form>
                  <form className="task-priority-form compact" onSubmit={onSavePriority}>
                    <label>
                      Priority
                      <select value={priorityDraft} onChange={(event) => setPriorityDraft(event.target.value as Task["priority"])}>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Done">Done</option>
                      </select>
                    </label>
                    <span className={getPriorityClass(priorityDraft)}>{priorityDraft}</span>
                    <button type="submit" disabled={updateTaskMutation.isPending}>
                      Save
                    </button>
                  </form>
                  <p className="muted-text">Assignee: {selectedTask.assignee?.username ?? "Chua co"}</p>
                  <p className="muted-text">Due date: {formatDate(selectedTask.dueDate)}</p>
                </section>

                <section className="task-detail-section">
                  <h3>Attachments</h3>
                  {attachmentError ? <p className="error-text page-feedback">{attachmentError}</p> : null}
                  <div className="task-attachment-actions">
                    <input
                      type="file"
                      className="task-attachment-input"
                      accept=".pdf,.docx,.xlsx,image/png,image/jpeg"
                      onChange={(event) => onPickAttachment(event.target.files?.[0])}
                    />
                    <button type="button" onClick={onUploadAttachment} disabled={attachmentUploading || !attachmentFile}>
                      {attachmentUploading ? "Uploading..." : "Upload file"}
                    </button>
                  </div>
                  {attachmentsQuery.isLoading ? <p className="muted-text">Loading attachments...</p> : null}
                  {attachmentsQuery.isError ? <p className="error-text">Could not load attachments.</p> : null}
                  {!attachmentsQuery.isLoading && !attachmentsQuery.isError && (attachmentsQuery.data ?? []).length === 0 ? (
                    <p className="muted-text">No attachments yet.</p>
                  ) : null}
                  <div className="attachment-list">
                    {(attachmentsQuery.data ?? []).map((attachment: Attachment) => (
                      <article key={attachment.id} className="attachment-item">
                        <a className="attachment-link" href={attachment.url} target="_blank" rel="noreferrer">
                          {attachment.fileName}
                        </a>
                        <small className="muted-text">{formatFileSize(attachment.size)}</small>
                      </article>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </section>
        </div>
      ) : null}

      {activeTaskId ? <p className="muted-text">Moving task...</p> : null}
    </section>
  );
}
