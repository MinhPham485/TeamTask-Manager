export const queryKeys = {
  auth: {
    profile: ["auth", "profile"] as const,
  },
  groups: {
    all: ["groups"] as const,
    detail: (groupId: string) => ["groups", groupId] as const,
    members: (groupId: string) => ["groups", groupId, "members"] as const,
  },
  board: {
    lists: (groupId: string) => ["board", groupId, "lists"] as const,
    tasks: (groupId: string) => ["board", groupId, "tasks"] as const,
    labels: (groupId: string) => ["board", groupId, "labels"] as const,
  },
  deadline: {
    tasks: (groupId: string) => ["deadline", groupId, "tasks"] as const,
    task: (taskId: string) => ["deadline", "task", taskId] as const,
    summary: (groupId: string) => ["deadline", groupId, "summary"] as const,
    mySummary: ["deadline", "me", "summary"] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    unreadCount: ["notifications", "unread-count"] as const,
  },
  checklists: {
    byTask: (taskId: string) => ["checklists", taskId] as const,
  },
  comments: {
    byTask: (taskId: string) => ["comments", taskId] as const,
  },
  attachments: {
    byTask: (taskId: string) => ["attachments", "task", taskId] as const,
  },
  messages: {
    byGroup: (groupId: string) => ["messages", groupId] as const,
  },
} as const;
