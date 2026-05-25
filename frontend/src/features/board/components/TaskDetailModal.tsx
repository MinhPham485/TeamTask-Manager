import { FormEvent } from "react";
import { formatDate, formatFileSize, getPriorityClass, sortByPosition } from "@/features/board/utils/boardUtils";
import { Attachment, ChecklistItem, Task, TaskComment } from "@/shared/types/models";

type ChecklistSummary = {
  completed: number;
  percent: number;
  total: number;
};

type TaskDetailModalProps = {
  task: Task;
  userId?: string;
  descriptionDraft: string;
  progressDraft: number;
  priorityDraft: Task["priority"];
  newChecklistTitle: string;
  newComment: string;
  attachmentError: string | null;
  attachmentUploading: boolean;
  hasAttachmentFile: boolean;
  checklistItems: ChecklistItem[];
  checklistSummary: ChecklistSummary;
  comments: TaskComment[];
  attachments: Attachment[];
  isChecklistLoading: boolean;
  isChecklistError: boolean;
  isAttachmentsLoading: boolean;
  isAttachmentsError: boolean;
  isUpdatingTask: boolean;
  isCreatingChecklist: boolean;
  isTogglingChecklist: boolean;
  isDeletingChecklist: boolean;
  isCreatingComment: boolean;
  onClose: () => void;
  onDescriptionDraftChange: (value: string) => void;
  onProgressDraftChange: (value: number) => void;
  onPriorityDraftChange: (value: Task["priority"]) => void;
  onChecklistTitleChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onSaveDescription: (event: FormEvent) => void;
  onSaveProgress: (event: FormEvent) => void;
  onSavePriority: (event: FormEvent) => void;
  onCreateChecklistItem: (event: FormEvent) => void;
  onToggleChecklistItem: (payload: { itemId: string; taskId: string; isCompleted: boolean }) => void;
  onDeleteChecklistItem: (payload: { itemId: string; taskId: string }) => void;
  onCreateComment: (event: FormEvent) => void;
  onDeleteComment: (commentId: string) => void;
  onPickAttachment: (file?: File | null) => void;
  onUploadAttachment: () => void;
};

export function TaskDetailModal({
  task,
  userId,
  descriptionDraft,
  progressDraft,
  priorityDraft,
  newChecklistTitle,
  newComment,
  attachmentError,
  attachmentUploading,
  hasAttachmentFile,
  checklistItems,
  checklistSummary,
  comments,
  attachments,
  isChecklistLoading,
  isChecklistError,
  isAttachmentsLoading,
  isAttachmentsError,
  isUpdatingTask,
  isCreatingChecklist,
  isTogglingChecklist,
  isDeletingChecklist,
  isCreatingComment,
  onClose,
  onDescriptionDraftChange,
  onProgressDraftChange,
  onPriorityDraftChange,
  onChecklistTitleChange,
  onCommentChange,
  onSaveDescription,
  onSaveProgress,
  onSavePriority,
  onCreateChecklistItem,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  onCreateComment,
  onDeleteComment,
  onPickAttachment,
  onUploadAttachment,
}: TaskDetailModalProps) {
  return (
    <div className="task-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="task-modal-header">
          <div>
            <h2 id="task-modal-title">{task.title}</h2>
            <p className="muted-text">
              Created {formatDate(task.createdAt)} by {task.creator?.username ?? "Unknown"}
            </p>
          </div>
          <button type="button" className="task-modal-close" onClick={onClose} aria-label="Close task detail">
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
                  onChange={(event) => onDescriptionDraftChange(event.target.value)}
                  placeholder="Nhap mo ta task"
                  rows={5}
                />
                <button type="submit" disabled={isUpdatingTask}>
                  {isUpdatingTask ? "Saving..." : "Save description"}
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
                  onChange={(event) => onChecklistTitleChange(event.target.value)}
                  placeholder="Add checklist item"
                  maxLength={160}
                />
                <button type="submit" disabled={isCreatingChecklist}>
                  {isCreatingChecklist ? "Adding..." : "Add"}
                </button>
              </form>

              {isChecklistLoading ? <p className="muted-text">Loading checklist...</p> : null}
              {isChecklistError ? <p className="error-text">Could not load checklist.</p> : null}
              {!isChecklistLoading && !isChecklistError && checklistItems.length === 0 ? <p className="muted-text">No checklist items yet.</p> : null}
              <div className="task-detail-list">
                {sortByPosition(checklistItems).map((item) => (
                  <article key={item.id} className={item.isCompleted ? "task-detail-list-item completed" : "task-detail-list-item"}>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.isCompleted}
                        onChange={(event) =>
                          onToggleChecklistItem({
                            itemId: item.id,
                            taskId: item.taskId,
                            isCompleted: event.target.checked,
                          })
                        }
                        disabled={isTogglingChecklist}
                      />
                      <span>{item.title}</span>
                    </label>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => onDeleteChecklistItem({ itemId: item.id, taskId: item.taskId })}
                      disabled={isDeletingChecklist}
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
                <input value={newComment} onChange={(event) => onCommentChange(event.target.value)} placeholder="Write a comment" />
                <button type="submit" disabled={isCreatingComment}>
                  {isCreatingComment ? "Posting..." : "Post"}
                </button>
              </form>

              <div className="task-detail-list">
                {comments.map((comment) => (
                  <article key={comment.id} className="task-comment-item">
                    <p>{comment.content}</p>
                    <small className="muted-text">
                      {comment.sender?.username ?? "Unknown"} • {new Date(comment.createdAt).toLocaleString()}
                    </small>
                    {comment.senderId === userId ? (
                      <button type="button" className="danger-button" onClick={() => onDeleteComment(comment.id)}>
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
                    onChange={(event) => onProgressDraftChange(Number(event.target.value))}
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
                      onProgressDraftChange(Number.isNaN(nextValue) ? 0 : nextValue);
                    }}
                  />
                  <button type="submit" disabled={isUpdatingTask}>
                    Save
                  </button>
                </div>
              </form>
              <form className="task-priority-form compact" onSubmit={onSavePriority}>
                <label>
                  Priority
                  <select value={priorityDraft} onChange={(event) => onPriorityDraftChange(event.target.value as Task["priority"])}>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Done">Done</option>
                  </select>
                </label>
                <span className={getPriorityClass(priorityDraft)}>{priorityDraft}</span>
                <button type="submit" disabled={isUpdatingTask}>
                  Save
                </button>
              </form>
              <p className="muted-text">Assignee: {task.assignee?.username ?? "Chua co"}</p>
              <p className="muted-text">Due date: {formatDate(task.dueDate)}</p>
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
                <button type="button" onClick={onUploadAttachment} disabled={attachmentUploading || !hasAttachmentFile}>
                  {attachmentUploading ? "Uploading..." : "Upload file"}
                </button>
              </div>
              {isAttachmentsLoading ? <p className="muted-text">Loading attachments...</p> : null}
              {isAttachmentsError ? <p className="error-text">Could not load attachments.</p> : null}
              {!isAttachmentsLoading && !isAttachmentsError && attachments.length === 0 ? <p className="muted-text">No attachments yet.</p> : null}
              <div className="attachment-list">
                {attachments.map((attachment) => (
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
  );
}
