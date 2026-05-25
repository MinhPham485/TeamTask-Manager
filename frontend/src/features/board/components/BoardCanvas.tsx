import { FormEvent } from "react";
import { DndContext, DragEndEvent, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { ListColumn } from "@/features/board/components/ListColumn";
import { List, Task } from "@/shared/types/models";

type BoardCanvasProps = {
  lists: List[];
  tasksByList: Record<string, Task[]>;
  taskDraftByList: Record<string, string>;
  selectedTaskId: string | null;
  onDraftTitleChange: (listId: string, value: string) => void;
  onCreateTask: (listId: string) => (event: FormEvent) => void;
  onSelectTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
};

export function BoardCanvas({
  lists,
  tasksByList,
  taskDraftByList,
  selectedTaskId,
  onDraftTitleChange,
  onCreateTask,
  onSelectTask,
  onDeleteTask,
  onDragStart,
  onDragEnd,
}: BoardCanvasProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  return (
    <section className="board-workspace">
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="board-columns">
          {lists.map((list) => (
            <ListColumn
              key={list.id}
              list={list}
              tasks={tasksByList[list.id] ?? []}
              draftTitle={taskDraftByList[list.id] ?? ""}
              onDraftTitleChange={(value) => onDraftTitleChange(list.id, value)}
              onCreateTask={onCreateTask(list.id)}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              onDeleteTask={onDeleteTask}
            />
          ))}
        </div>
      </DndContext>
    </section>
  );
}
