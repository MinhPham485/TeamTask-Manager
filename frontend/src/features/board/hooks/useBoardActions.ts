import { Dispatch, FormEvent, SetStateAction, useState } from "react";
import { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { listApi } from "@/features/board/api/listApi";
import { taskApi } from "@/features/board/api/taskApi";
import { applyMove, sortByPosition } from "@/features/board/utils/boardUtils";
import { queryKeys } from "@/shared/query/queryKeys";
import { List, Task } from "@/shared/types/models";

type UseBoardActionsArgs = {
  currentGroupId: string | null;
  localTasks: Task[];
  setLocalTasks: Dispatch<SetStateAction<Task[]>>;
  sourceTasks?: Task[];
  sortedLists: List[];
  tasksByList: Record<string, Task[]>;
  selectedTaskId: string | null;
  clearSelectedTask: () => void;
  setError: (message: string | null) => void;
};

export function useBoardActions({
  currentGroupId,
  localTasks,
  setLocalTasks,
  sourceTasks,
  sortedLists,
  tasksByList,
  selectedTaskId,
  clearSelectedTask,
  setError,
}: UseBoardActionsArgs) {
  const queryClient = useQueryClient();
  const [newListName, setNewListName] = useState("");
  const [taskDraftByList, setTaskDraftByList] = useState<Record<string, string>>({});
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

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
      setLocalTasks(sourceTasks ? sortByPosition(sourceTasks) : []);
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
        clearSelectedTask();
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.board.tasks(currentGroupId as string) });
    },
    onError: () => setError("Could not delete task."),
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

  const onDraftTitleChange = (listId: string, value: string) => {
    setTaskDraftByList((prev) => ({ ...prev, [listId]: value }));
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

  return {
    activeTaskId,
    newListName,
    setNewListName,
    taskDraftByList,
    isCreatingList: createListMutation.isPending,
    onCreateList,
    onCreateTask,
    onDraftTitleChange,
    onDragStart,
    onDragEnd,
    onDeleteTask: deleteTaskMutation.mutate,
  };
}
