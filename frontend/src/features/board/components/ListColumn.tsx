import { FormEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "@/features/board/components/TaskCard";
import { List, Task } from "@/shared/types/models";

type ListColumnProps = {
  list: List;
  tasks: Task[];
  draftTitle: string;
  selectedTaskId: string | null;
  onDraftTitleChange: (value: string) => void;
  onCreateTask: (event: FormEvent) => void;
  onSelectTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
};

export function ListColumn({
  list,
  tasks,
  draftTitle,
  selectedTaskId,
  onDraftTitleChange,
  onCreateTask,
  onSelectTask,
  onDeleteTask,
}: ListColumnProps) {
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
