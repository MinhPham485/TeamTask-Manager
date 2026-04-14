import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { messageApi } from "@/features/chat/api/messageApi";
import { disconnectSocketClient, getSocketClient, reconnectSocketAuthToken } from "@/features/chat/socket/socketClient";
import { groupApi } from "@/features/groups/api/groupApi";
import { authStore } from "@/features/auth/store/authStore";
import { queryKeys } from "@/shared/query/queryKeys";
import { DirectMessage, DirectThread, Message } from "@/shared/types/models";

type AckResponse = {
  ok: boolean;
  error?: string;
  threadId?: string;
  message?: DirectMessage;
};

function formatTime(dateString: string) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Invalid time";
  }

  return date.toLocaleString();
}

export function ChatPage() {
  const socket = useMemo(() => getSocketClient(), []);
  const currentGroupId = authStore((state) => state.currentGroupId);
  const setCurrentGroup = authStore((state) => state.setCurrentGroup);
  const currentUser = authStore((state) => state.user);
  const token = authStore((state) => state.token);

  const [groupMessages, setGroupMessages] = useState<Message[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [directThreads, setDirectThreads] = useState<DirectThread[]>([]);
  const [draft, setDraft] = useState("");
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [chatMode, setChatMode] = useState<"group" | "direct">("group");
  const [directUserId, setDirectUserId] = useState<string | null>(null);
  const joinedGroupRef = useRef<string | null>(null);
  const joinedDirectThreadRef = useRef<string | null>(null);
  const currentGroupRef = useRef<string | null>(currentGroupId);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.all,
    queryFn: groupApi.getAll,
  });

  const messagesQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.messages.byGroup(currentGroupId) : ["messages", "missing"],
    queryFn: () => messageApi.getByGroup(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const membersQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.groups.members(currentGroupId) : ["groups", "members", "missing"],
    queryFn: () => groupApi.getMembers(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const directThreadsQuery = useQuery({
    queryKey: ["messages", "direct", "threads"],
    queryFn: () => messageApi.getDirectThreads(),
  });

  const createDirectThreadMutation = useMutation({
    mutationFn: (peerUserId: string) => messageApi.createOrGetDirectThread(peerUserId),
    onSuccess: (thread) => {
      setDirectThreads((prev) => {
        const index = prev.findIndex((item) => item.id === thread.id);

        if (index >= 0) {
          const next = [...prev];
          next[index] = thread;
          return next;
        }

        return [thread, ...prev];
      });
    },
  });

  const groups = useMemo(() => {
    return [...(groupsQuery.data ?? [])].sort((a, b) => a.group.name.localeCompare(b.group.name));
  }, [groupsQuery.data]);

  const filteredGroups = useMemo(() => {
    const normalizedFilter = groupFilter.trim().toLowerCase();

    if (!normalizedFilter) {
      return groups;
    }

    return groups.filter((membership) => membership.group.name.toLowerCase().includes(normalizedFilter));
  }, [groupFilter, groups]);

  const activeGroup = useMemo(() => {
    return groups.find((membership) => membership.group.id === currentGroupId) ?? null;
  }, [currentGroupId, groups]);

  useEffect(() => {
    if (!currentGroupId && groups.length > 0) {
      setCurrentGroup(groups[0].group.id);
    }
  }, [currentGroupId, groups, setCurrentGroup]);

  useEffect(() => {
    currentGroupRef.current = currentGroupId;
  }, [currentGroupId]);

  useEffect(() => {
    setGroupMessages(messagesQuery.data ?? []);
  }, [messagesQuery.data, currentGroupId]);

  useEffect(() => {
    setDirectThreads(directThreadsQuery.data ?? []);
  }, [directThreadsQuery.data]);

  useEffect(() => {
    setDirectUserId(null);
  }, [currentGroupId]);

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [chatMode, groupMessages, directMessages]);

  useEffect(() => {
    const joinGroup = (groupId: string) => {
      if (joinedGroupRef.current && joinedGroupRef.current !== groupId) {
        socket.emit("chat:leave-group", { groupId: joinedGroupRef.current });
      }

      socket.emit("chat:join-group", { groupId }, (response: AckResponse) => {
        if (!response?.ok) {
          setError(response?.error ?? "Could not join chat room.");
          return;
        }

        joinedGroupRef.current = groupId;
        setError(null);
      });
    };

    const handleConnect = () => {
      setSocketStatus("connected");

      if (currentGroupRef.current) {
        joinGroup(currentGroupRef.current);
      }
    };

    const handleDisconnect = () => {
      setSocketStatus("disconnected");
    };

    const handleConnectError = (connectError: Error) => {
      setSocketStatus("disconnected");
      setError(connectError.message || "Socket connection failed.");
    };

    const handleNewMessage = (message: Message) => {
      if (currentGroupRef.current && message.groupId !== currentGroupRef.current) {
        return;
      }

      setGroupMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) {
          return prev;
        }

        return [...prev, message];
      });
    };

    const handleDeletedMessage = (payload: { id?: string }) => {
      if (!payload?.id) {
        return;
      }

      setGroupMessages((prev) => prev.filter((message) => message.id !== payload.id));
    };

    const handleNewDirectMessage = (message: DirectMessage) => {
      if (joinedDirectThreadRef.current && message.threadId !== joinedDirectThreadRef.current) {
        return;
      }

      setDirectMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) {
          return prev;
        }

        return [...prev, message];
      });
    };

    reconnectSocketAuthToken();
    setSocketStatus("connecting");
    socket.connect();

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("chat:message:new", handleNewMessage);
    socket.on("chat:message:deleted", handleDeletedMessage);
    socket.on("chat:direct-message:new", handleNewDirectMessage);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("chat:message:new", handleNewMessage);
      socket.off("chat:message:deleted", handleDeletedMessage);
      socket.off("chat:direct-message:new", handleNewDirectMessage);
      disconnectSocketClient();
    };
  }, [socket]);

  useEffect(() => {
    reconnectSocketAuthToken();
  }, [token]);

  useEffect(() => {
    if (!currentGroupId || !socket.connected) {
      return;
    }

    if (joinedGroupRef.current === currentGroupId) {
      return;
    }

    if (joinedGroupRef.current) {
      socket.emit("chat:leave-group", { groupId: joinedGroupRef.current });
    }

    socket.emit("chat:join-group", { groupId: currentGroupId }, (response: AckResponse) => {
      if (!response?.ok) {
        setError(response?.error ?? "Could not join chat room.");
        return;
      }

      joinedGroupRef.current = currentGroupId;
      setError(null);
    });
  }, [currentGroupId, socket]);

  const activeDirectThread = useMemo(() => {
    if (!directUserId || !currentUser?.id) {
      return null;
    }

    return (
      directThreads.find((thread) => {
        const isParticipant =
          (thread.userAId === currentUser.id && thread.userBId === directUserId) ||
          (thread.userBId === currentUser.id && thread.userAId === directUserId);

        return isParticipant;
      }) ?? null
    );
  }, [currentUser?.id, directThreads, directUserId]);

  const directMessagesQuery = useQuery({
    queryKey: activeDirectThread ? ["messages", "direct", activeDirectThread.id] : ["messages", "direct", "missing"],
    queryFn: () => messageApi.getDirectMessagesByThread(activeDirectThread!.id),
    enabled: Boolean(activeDirectThread?.id),
  });

  useEffect(() => {
    if (chatMode !== "direct") {
      return;
    }

    if (!activeDirectThread?.id) {
      setDirectMessages([]);
      return;
    }

    setDirectMessages(directMessagesQuery.data ?? []);
  }, [activeDirectThread?.id, chatMode, directMessagesQuery.data]);

  useEffect(() => {
    if (!socket.connected) {
      return;
    }

    if (chatMode !== "direct" || !activeDirectThread?.id) {
      if (joinedDirectThreadRef.current) {
        socket.emit("chat:leave-direct", { threadId: joinedDirectThreadRef.current });
        joinedDirectThreadRef.current = null;
      }
      return;
    }

    if (joinedDirectThreadRef.current && joinedDirectThreadRef.current !== activeDirectThread.id) {
      socket.emit("chat:leave-direct", { threadId: joinedDirectThreadRef.current });
    }

    socket.emit("chat:join-direct", { threadId: activeDirectThread.id }, (response: AckResponse) => {
      if (!response?.ok) {
        setError(response?.error ?? "Could not join direct thread.");
        return;
      }

      joinedDirectThreadRef.current = activeDirectThread.id;
      setError(null);
    });
  }, [activeDirectThread?.id, chatMode, socket, socketStatus]);

  const handleSend = (event: FormEvent) => {
    event.preventDefault();

    if (chatMode === "group" && !currentGroupId) {
      setError("Please select a group.");
      return;
    }

    if (chatMode === "direct" && !directUserId) {
      setError("Please select a user.");
      return;
    }

    const normalizedDraft = draft.trim();

    if (!normalizedDraft) {
      setError("Message content is required.");
      return;
    }

    if (!socket.connected) {
      setError("Socket is disconnected. Please wait for reconnect.");
      return;
    }

    if (chatMode === "direct") {
      socket.emit(
        "chat:send-direct-message",
        { threadId: activeDirectThread?.id, recipientId: directUserId, content: normalizedDraft },
        (response: AckResponse) => {
          if (!response?.ok) {
            setError(response?.error ?? "Could not send direct message.");
            return;
          }

          if (response.threadId && joinedDirectThreadRef.current !== response.threadId) {
            socket.emit("chat:join-direct", { threadId: response.threadId });
            joinedDirectThreadRef.current = response.threadId;
          }

          if (response.message) {
            setDirectMessages((prev) => {
              if (prev.some((item) => item.id === response.message?.id)) {
                return prev;
              }

              return [...prev, response.message as DirectMessage];
            });
          }

          setDraft("");
          setError(null);
        }
      );

      return;
    }

    socket.emit("chat:send-message", { groupId: currentGroupId, content: normalizedDraft }, (response: AckResponse) => {
      if (!response?.ok) {
        setError(response?.error ?? "Could not send message.");
        return;
      }

      setDraft("");
      setError(null);
    });
  };

  const getGroupInitial = (name: string) => {
    return name.trim().charAt(0).toUpperCase() || "#";
  };

  const getSenderName = (message: { senderId: string; sender?: { username?: string } }) => {
    if (message.senderId === currentUser?.id) {
      return "You";
    }

    return message.sender?.username ?? "Unknown";
  };

  const directContacts = useMemo(() => {
    return (membersQuery.data ?? [])
      .filter((member) => member.userId !== currentUser?.id)
      .sort((a, b) => (a.user?.username ?? "").localeCompare(b.user?.username ?? ""));
  }, [membersQuery.data, currentUser?.id]);

  const activeDirectContact = useMemo(() => {
    if (!directUserId) {
      return null;
    }

    return directContacts.find((member) => member.userId === directUserId) ?? null;
  }, [directContacts, directUserId]);

  const getDirectThreadByPeer = (peerUserId: string) => {
    if (!currentUser?.id) {
      return null;
    }

    return (
      directThreads.find(
        (thread) =>
          (thread.userAId === currentUser.id && thread.userBId === peerUserId) ||
          (thread.userBId === currentUser.id && thread.userAId === peerUserId)
      ) ?? null
    );
  };

  const visibleMessages = chatMode === "direct" ? directMessages : groupMessages;

  const threadTitle = chatMode === "direct" ? activeDirectContact?.user?.username ?? "Chat" : activeGroup?.group.name ?? "Group";

  return (
    <section className="chat-page messenger-layout">
      <aside className="page-card messenger-sidebar">
        <div className="messenger-sidebar-header">
          <h2>Chats</h2>
        </div>

        <div className="chat-selector-panel">
          <div className="chat-mode-switch" role="tablist" aria-label="Chat mode switch">
            <button
              type="button"
              role="tab"
              aria-selected={chatMode === "group"}
              className={chatMode === "group" ? "chat-mode-button active" : "chat-mode-button"}
              onClick={() => {
                setChatMode("group");
                setDirectUserId(null);
              }}
            >
              Chat nhom
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chatMode === "direct"}
              className={chatMode === "direct" ? "chat-mode-button active" : "chat-mode-button"}
              onClick={() => setChatMode("direct")}
            >
              Chat ca nhan
            </button>
          </div>

          {chatMode === "group" ? (
            <section className="chat-target-section chat-target-section-group">
              <h3>Danh sach nhom</h3>
              <input
                className="messenger-search"
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                placeholder="Search groups"
              />
              <div className="messenger-room-list">
                {groupsQuery.isLoading ? <p className="muted-text">Loading groups...</p> : null}
                {!groupsQuery.isLoading && filteredGroups.length === 0 ? (
                  <p className="muted-text">No matching groups.</p>
                ) : null}

                {filteredGroups.map((membership) => {
                  const isActive = membership.group.id === currentGroupId;

                  return (
                    <button
                      key={membership.group.id}
                      type="button"
                      className={isActive ? "messenger-room active" : "messenger-room"}
                      onClick={() => setCurrentGroup(membership.group.id)}
                    >
                      <span className="messenger-avatar">{getGroupInitial(membership.group.name)}</span>
                      <span className="messenger-room-copy">
                        <strong>{membership.group.name}</strong>
                        <small>{membership.role}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="chat-target-section chat-target-section-direct">
              <h3>Danh sach nguoi chat</h3>
              <div className="chat-direct-list">
                {directContacts.map((member) => {
                  const isActive = directUserId === member.userId;
                  const username = member.user?.username ?? "User";

                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={isActive ? "messenger-room active" : "messenger-room"}
                      onClick={() => {
                        setDirectUserId(member.userId);

                        if (!getDirectThreadByPeer(member.userId)) {
                          createDirectThreadMutation.mutate(member.userId);
                        }
                      }}
                    >
                      <span className="messenger-avatar">{getGroupInitial(username)}</span>
                      <span className="messenger-room-copy">
                        <strong>{username}</strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </aside>

      <section className="page-card messenger-thread">
        <header className="messenger-thread-header">
          <div className="messenger-thread-title">
            <span className="messenger-avatar large">{getGroupInitial(threadTitle)}</span>
            <div>
              <h3>{threadTitle}</h3>
            </div>
          </div>
        </header>

        {error ? <p className="error-text page-feedback">{error}</p> : null}
        {chatMode === "group" && messagesQuery.isError ? <p className="error-text">Could not load message history.</p> : null}
        {chatMode === "direct" && directMessagesQuery.isError ? <p className="error-text">Could not load direct messages.</p> : null}

        <div className="messenger-message-list" ref={messageListRef}>
          {chatMode === "group" && messagesQuery.isLoading ? <p className="muted-text">Loading messages...</p> : null}
          {chatMode === "direct" && directMessagesQuery.isLoading ? <p className="muted-text">Loading messages...</p> : null}
          {chatMode === "group" && !messagesQuery.isLoading && !messagesQuery.isError && visibleMessages.length === 0 ? (
            <p className="muted-text">No messages yet. Start the conversation.</p>
          ) : null}
          {chatMode === "direct" && !directMessagesQuery.isLoading && !directMessagesQuery.isError && visibleMessages.length === 0 ? (
            <p className="muted-text">No messages yet. Start the conversation.</p>
          ) : null}

          {visibleMessages.map((message) => {
            const isMine = message.senderId === currentUser?.id;

            return (
              <article key={message.id} className={isMine ? "messenger-message mine" : "messenger-message"}>
                <p className={isMine ? "messenger-message-meta mine" : "messenger-message-meta"}>{formatTime(message.createdAt)}</p>
                <div className={isMine ? "messenger-bubble mine" : "messenger-bubble"}>
                  <header>
                    <strong>{getSenderName(message)}</strong>
                  </header>
                  <p>{message.content}</p>
                </div>
              </article>
            );
          })}
        </div>

        <form className="messenger-composer" onSubmit={handleSend}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Aa"
            maxLength={2000}
            disabled={chatMode === "group" ? !currentGroupId : !directUserId}
          />
          <button type="submit" disabled={(chatMode === "group" ? !currentGroupId : !directUserId) || socketStatus !== "connected"}>
            Send
          </button>
        </form>
      </section>
    </section>
  );
}
