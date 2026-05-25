import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checklistApi } from "@/features/board/api/checklistApi";
import { commentApi } from "@/features/board/api/commentApi";
import { taskApi } from "@/features/board/api/taskApi";
import { getChecklistSummary, getTaskProgress } from "@/features/board/utils/boardUtils";
import { uploadApi } from "@/shared/api/uploadApi";
import { queryKeys } from "@/shared/query/queryKeys";
import { Task } from "@/shared/types/models";

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);

type UseTaskDetailArgs = {
  currentGroupId: string | null;
  localTasks: Task[];
  setLocalTasks: Dispatch<SetStateAction<Task[]>>;
  selectedTaskId: string | null;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setError: (message: string | null) => void;
};

export function useTaskDetail({ currentGroupId, localTasks, setLocalTasks, selectedTaskId, setSelectedTaskId, setError }: UseTaskDetailArgs) {
  const queryClient = useQueryClient();
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [progressDraft, setProgressDraft] = useState(0);
  const [priorityDraft, setPriorityDraft] = useState<Task["priority"]>("Low");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);

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
    setSelectedTaskId(null);
  }, [currentGroupId, setSelectedTaskId]);

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
  }, [selectedTaskId, setSelectedTaskId]);

  const checklistSummary = useMemo(() => {
    return getChecklistSummary(checklistQuery.data ?? selectedTask?.checklistItems);
  }, [checklistQuery.data, selectedTask?.checklistItems]);

  const updateTaskMutation = useMutation({
    mutationFn: (payload: { taskId: string; description?: string; progress?: number; priority?: Task["priority"] }) =>
      taskApi.update(payload.taskId, {
        description: payload.description,
        progress: payload.progress,
        priority: payload.priority,
      }),
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

  const onSaveDescription = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTask) {
      return;
    }

    updateTaskMutation.mutate({ taskId: selectedTask.id, description: descriptionDraft.trim() });
  };

  const onSaveProgress = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTask) {
      return;
    }

    updateTaskMutation.mutate({ taskId: selectedTask.id, progress: progressDraft });
  };

  const onSavePriority = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTask) {
      return;
    }

    updateTaskMutation.mutate({ taskId: selectedTask.id, priority: priorityDraft });
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

  return {
    selectedTask,
    openTaskDetail: setSelectedTaskId,
    closeTaskDetail: () => setSelectedTaskId(null),
    modalProps: selectedTask
      ? {
          task: selectedTask,
          descriptionDraft,
          progressDraft,
          priorityDraft,
          newChecklistTitle,
          newComment,
          attachmentError,
          attachmentUploading,
          hasAttachmentFile: Boolean(attachmentFile),
          checklistItems: checklistQuery.data ?? [],
          checklistSummary,
          comments: commentsQuery.data ?? [],
          attachments: attachmentsQuery.data ?? [],
          isChecklistLoading: checklistQuery.isLoading,
          isChecklistError: checklistQuery.isError,
          isAttachmentsLoading: attachmentsQuery.isLoading,
          isAttachmentsError: attachmentsQuery.isError,
          isUpdatingTask: updateTaskMutation.isPending,
          isCreatingChecklist: createChecklistMutation.isPending,
          isTogglingChecklist: toggleChecklistMutation.isPending,
          isDeletingChecklist: deleteChecklistMutation.isPending,
          isCreatingComment: createCommentMutation.isPending,
          onClose: () => setSelectedTaskId(null),
          onDescriptionDraftChange: setDescriptionDraft,
          onProgressDraftChange: setProgressDraft,
          onPriorityDraftChange: setPriorityDraft,
          onChecklistTitleChange: setNewChecklistTitle,
          onCommentChange: setNewComment,
          onSaveDescription,
          onSaveProgress,
          onSavePriority,
          onCreateChecklistItem,
          onToggleChecklistItem: toggleChecklistMutation.mutate,
          onDeleteChecklistItem: deleteChecklistMutation.mutate,
          onCreateComment,
          onDeleteComment: deleteCommentMutation.mutate,
          onPickAttachment,
          onUploadAttachment,
        }
      : null,
  };
}
