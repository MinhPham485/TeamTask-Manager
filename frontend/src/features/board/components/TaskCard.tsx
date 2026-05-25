import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getChecklistSummary, getPriorityClass, getTaskProgress } from "@/features/board/utils/boardUtils";
import { Task } from "@/shared/types/models";

type TaskCardProps = {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  onDelete: (taskId: string) => void;
};

export function TaskCard({ task, selected, onSelect, onDelete }: TaskCardProps) {
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
