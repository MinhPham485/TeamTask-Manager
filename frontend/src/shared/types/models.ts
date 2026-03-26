export type ApiError = {
  message: string;
};

export type User = {
  id: string;
  username: string;
  email: string;
  role?: "USER" | "ADMIN";
  createdAt?: string;
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
  role: "owner" | "member";
  user?: User;
};

export type GroupMembership = {
  id: string;
  userId: string;
  groupId: string;
  role: "owner" | "member";
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
  listId: string;
  groupId: string;
  assigneeId?: string | null;
  position: number;
  assignee?: User | null;
  taskLabels?: Array<{ label: Label }>;
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
  title: string;
  isCompleted: boolean;
  position: number;
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

export type Message = {
  id: string;
  groupId: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender?: User;
};

export type LoginResponse = {
  token: string;
};
