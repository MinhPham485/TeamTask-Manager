import { FormEvent } from "react";
import { GroupMembership } from "@/shared/types/models";

type BoardToolbarProps = {
  groups: GroupMembership[];
  currentGroupId: string | null;
  newListName: string;
  error: string | null;
  isCreatingList: boolean;
  onCurrentGroupChange: (groupId: string | null) => void;
  onNewListNameChange: (value: string) => void;
  onCreateList: (event: FormEvent) => void;
};

export function BoardToolbar({
  groups,
  currentGroupId,
  newListName,
  error,
  isCreatingList,
  onCurrentGroupChange,
  onNewListNameChange,
  onCreateList,
}: BoardToolbarProps) {
  return (
    <header className="page-card board-toolbar">
      <h2> DashBoard</h2>
      <div className="board-toolbar-controls">
        <select
          value={currentGroupId ?? ""}
          onChange={(event) => {
            onCurrentGroupChange(event.target.value || null);
          }}
        >
          <option value="">Select group</option>
          {groups.map((membership) => (
            <option key={membership.group.id} value={membership.group.id}>
              {membership.group.name}
            </option>
          ))}
        </select>

        <form className="board-create-list" onSubmit={onCreateList}>
          <input value={newListName} onChange={(event) => onNewListNameChange(event.target.value)} placeholder="New list" maxLength={60} />
          <button type="submit" disabled={isCreatingList}>
            {isCreatingList ? "Adding..." : "Add list"}
          </button>
        </form>
      </div>
      {error ? <p className="error-text page-feedback">{error}</p> : null}
    </header>
  );
}
