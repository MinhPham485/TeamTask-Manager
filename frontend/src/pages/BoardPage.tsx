import { useState } from "react";
import { BoardCanvas } from "@/features/board/components/BoardCanvas";
import { BoardToolbar } from "@/features/board/components/BoardToolbar";
import { TaskDetailModal } from "@/features/board/components/TaskDetailModal";
import { useBoardActions } from "@/features/board/hooks/useBoardActions";
import { useBoardData } from "@/features/board/hooks/useBoardData";
import { useTaskDetail } from "@/features/board/hooks/useTaskDetail";
import { authStore } from "@/features/auth/store/authStore";

export function BoardPage() {
  const user = authStore((state) => state.user);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const board = useBoardData();
  const taskDetail = useTaskDetail({
    currentGroupId: board.currentGroupId,
    localTasks: board.localTasks,
    setLocalTasks: board.setLocalTasks,
    selectedTaskId,
    setSelectedTaskId,
    setError,
  });
  const boardActions = useBoardActions({
    currentGroupId: board.currentGroupId,
    localTasks: board.localTasks,
    setLocalTasks: board.setLocalTasks,
    sourceTasks: board.tasksQuery.data,
    sortedLists: board.sortedLists,
    tasksByList: board.tasksByList,
    selectedTaskId,
    clearSelectedTask: taskDetail.closeTaskDetail,
    setError,
  });

  const isBoardLoading = Boolean(board.currentGroupId) && (board.listsQuery.isLoading || board.tasksQuery.isLoading);
  const isBoardError = Boolean(board.currentGroupId) && (board.listsQuery.isError || board.tasksQuery.isError);
  const canShowBoard = Boolean(board.currentGroupId) && !board.listsQuery.isLoading && !board.tasksQuery.isLoading && !isBoardError;

  return (
    <section className="board-page">
      <BoardToolbar
        groups={board.groupsQuery.data ?? []}
        currentGroupId={board.currentGroupId}
        newListName={boardActions.newListName}
        error={error}
        isCreatingList={boardActions.isCreatingList}
        onCurrentGroupChange={board.setCurrentGroup}
        onNewListNameChange={boardActions.setNewListName}
        onCreateList={boardActions.onCreateList}
      />

      {!board.currentGroupId ? (
        <section className="page-card">
          <p className="muted-text">Choose a group to load its board.</p>
        </section>
      ) : null}

      {isBoardLoading ? (
        <section className="page-card">
          <p className="muted-text">Loading board...</p>
        </section>
      ) : null}

      {isBoardError ? (
        <section className="page-card">
          <p className="error-text">Could not load board data.</p>
        </section>
      ) : null}

      {canShowBoard ? (
        <BoardCanvas
          lists={board.sortedLists}
          tasksByList={board.tasksByList}
          taskDraftByList={boardActions.taskDraftByList}
          selectedTaskId={selectedTaskId}
          onDraftTitleChange={boardActions.onDraftTitleChange}
          onCreateTask={boardActions.onCreateTask}
          onSelectTask={taskDetail.openTaskDetail}
          onDeleteTask={boardActions.onDeleteTask}
          onDragStart={boardActions.onDragStart}
          onDragEnd={boardActions.onDragEnd}
        />
      ) : null}

      {taskDetail.modalProps ? <TaskDetailModal {...taskDetail.modalProps} userId={user?.id} /> : null}

      {boardActions.activeTaskId ? <p className="muted-text">Moving task...</p> : null}
    </section>
  );
}
