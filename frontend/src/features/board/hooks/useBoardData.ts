import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { UseQueryResult, useQuery } from "@tanstack/react-query";
import { listApi } from "@/features/board/api/listApi";
import { taskApi } from "@/features/board/api/taskApi";
import { authStore } from "@/features/auth/store/authStore";
import { groupApi } from "@/features/groups/api/groupApi";
import { queryKeys } from "@/shared/query/queryKeys";
import { sortByPosition, sortByPriorityThenPosition } from "@/features/board/utils/boardUtils";
import { GroupMembership, List, Task } from "@/shared/types/models";

type UseBoardDataResult = {
  currentGroupId: string | null;
  setCurrentGroup: (groupId: string | null) => void;
  groupsQuery: UseQueryResult<GroupMembership[]>;
  listsQuery: UseQueryResult<List[]>;
  tasksQuery: UseQueryResult<Task[]>;
  localTasks: Task[];
  setLocalTasks: Dispatch<SetStateAction<Task[]>>;
  sortedLists: List[];
  tasksByList: Record<string, Task[]>;
};

export function useBoardData(): UseBoardDataResult {
  const currentGroupId = authStore((state) => state.currentGroupId);
  const setCurrentGroup = authStore((state) => state.setCurrentGroup);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.all,
    queryFn: groupApi.getAll,
  });

  const listsQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.board.lists(currentGroupId) : ["board", "lists", "missing"],
    queryFn: () => listApi.getByGroup(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const tasksQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.board.tasks(currentGroupId) : ["board", "tasks", "missing"],
    queryFn: () => taskApi.getByGroup(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  useEffect(() => {
    if (!currentGroupId && groupsQuery.data?.length) {
      setCurrentGroup(groupsQuery.data[0].group.id);
    }
  }, [currentGroupId, groupsQuery.data, setCurrentGroup]);

  useEffect(() => {
    setLocalTasks(tasksQuery.data ? sortByPosition(tasksQuery.data) : []);
  }, [tasksQuery.data]);

  const sortedLists = useMemo(() => {
    return listsQuery.data ? sortByPosition(listsQuery.data) : [];
  }, [listsQuery.data]);

  const tasksByList = useMemo(() => {
    const map: Record<string, Task[]> = {};

    sortedLists.forEach((list) => {
      map[list.id] = [];
    });

    localTasks.forEach((task) => {
      if (!map[task.listId]) {
        map[task.listId] = [];
      }
      map[task.listId].push(task);
    });

    Object.keys(map).forEach((listId) => {
      map[listId] = sortByPriorityThenPosition(map[listId]);
    });

    return map;
  }, [localTasks, sortedLists]);

  return {
    currentGroupId,
    setCurrentGroup,
    groupsQuery,
    listsQuery,
    tasksQuery,
    localTasks,
    setLocalTasks,
    sortedLists,
    tasksByList,
  };
}
