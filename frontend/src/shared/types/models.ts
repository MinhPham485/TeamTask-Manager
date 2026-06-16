export type ApiError = {
  message: string;
};

export type User = {
  id: string;
  username: string;
  email: string;
  role?: "User" | "Admin";
  createdAt?: string;
  phone?: string | null;
  hometown?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
};

export type Group = {
  id: string;
  name: string;
  groupCode: string;
  ownerId: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GroupMember = {
  id: string;
  groupId: string;
  userId: string;
  role: "owner" | "manager" | "member";
  user?: User;
};

export type GroupMembership = {
  id: string;
  userId: string;
  groupId: string;
  role: "owner" | "manager" | "member";
  group: Group;
};

export type GroupDetail = Group & {
  members: GroupMember[];
};

export type List = {
  id: string;
  name: string;
  groupId: string;
  position: number;
};

export type Task = {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  createdAt?: string;
  listId: string;
  groupId: string;
  assigneeId?: string | null;
  position: number;
  assignee?: User | null;
  creator?: User | null;
  taskLabels?: Array<{ label: Label }>;
  checklistItems?: ChecklistItem[];
  taskMemberships?: TaskMembership[];
  progress: number;
  priority: "High" | "Medium" | "Low" | "Done";
};

export type TaskMembership = {
  id: string;
  taskId: string;
  userId: string;
  role: "leader" | "member";
  completedAt?: string | null;
  createdAt?: string;
  user?: User;
};

export type DeadlineBucket = "overdue" | "today" | "week" | "later" | "noDue";

export type DeadlineTask = Task & {
  deadlineBucket: DeadlineBucket;
  isOverdue: boolean;
  daysOverdue: number;
  viewerCanOpen?: boolean;
  viewerCanManage?: boolean;
  viewerCanManageSections?: boolean;
  viewerCanManageItems?: boolean;
  checklistSections?: DeadlineChecklistSection[];
  checklistSummary?: {
    completed: number;
    total: number;
    percent: number;
  };
};

export type DeadlineSummary = {
  bucketCounts: Record<DeadlineBucket, number>;
  calendarDays: Array<{
    date: string;
    total: number;
    overdue: number;
    done: number;
  }>;
  statusCounts: {
    active: number;
    done: number;
  };
  workloadByMember: Array<{
    userId: string;
    username: string;
    email: string;
    total: number;
    overdue: number;
    dueThisWeek: number;
    active: number;
    done: number;
  }>;
};

export type Label = {
  id: string;
  name: string;
  color: string;
  groupId: string;
};

export type ChecklistItem = {
  id: string;
  taskId: string;
  deadlineTaskId?: string;
  sectionId?: string;
  title: string;
  isCompleted: boolean;
  position: number;
  viewerCanManage?: boolean;
};

export type DeadlineChecklistSection = {
  id: string;
  deadlineTaskId: string;
  title: string;
  position: number;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  viewerCanManage?: boolean;
  items: ChecklistItem[];
};

export type TaskComment = {
  id: string;
  taskId: string;
  senderId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  sender?: User;
};

export type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  key: string;
  taskId?: string | null;
  messageId?: string | null;
  uploaderId?: string;
  createdAt?: string;
};

export type Message = {
  id: string;
  groupId: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender?: User;
  attachments?: Attachment[];
};

export type DirectMessage = {
  id: string;
  threadId: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender?: User;
};

export type DirectThread = {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: string;
  updatedAt: string;
  userA?: User;
  userB?: User;
  messages?: DirectMessage[];
};

export type LoginResponse = {
  token: string;
  user: User;
};
