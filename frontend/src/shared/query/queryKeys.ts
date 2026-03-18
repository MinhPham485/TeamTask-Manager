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
  checklists: {
    byTask: (taskId: string) => ["checklists", taskId] as const,
  },
  comments: {
    byTask: (taskId: string) => ["comments", taskId] as const,
  },
  messages: {
    byGroup: (groupId: string) => ["messages", groupId] as const,
  },
} as const;
