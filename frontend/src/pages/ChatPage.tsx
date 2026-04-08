import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { messageApi } from "@/features/chat/api/messageApi";
import { disconnectSocketClient, getSocketClient, reconnectSocketAuthToken } from "@/features/chat/socket/socketClient";
import { groupApi } from "@/features/groups/api/groupApi";
import { authStore } from "@/features/auth/store/authStore";
import { queryKeys } from "@/shared/query/queryKeys";
import { Message } from "@/shared/types/models";

type AckResponse = {
  ok: boolean;
  error?: string;
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

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [chatMode, setChatMode] = useState<"group" | "direct">("group");
  const [directUserId, setDirectUserId] = useState<string | null>(null);
  const joinedGroupRef = useRef<string | null>(null);
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
    setMessages(messagesQuery.data ?? []);
  }, [messagesQuery.data, currentGroupId]);

  useEffect(() => {
    setChatMode("group");
    setDirectUserId(null);
  }, [currentGroupId]);

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages]);

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

      setMessages((prev) => {
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

      setMessages((prev) => prev.filter((message) => message.id !== payload.id));
    };

    reconnectSocketAuthToken();
    setSocketStatus("connecting");
    socket.connect();

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("chat:message:new", handleNewMessage);
    socket.on("chat:message:deleted", handleDeletedMessage);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("chat:message:new", handleNewMessage);
      socket.off("chat:message:deleted", handleDeletedMessage);
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

  const handleSend = (event: FormEvent) => {
    event.preventDefault();

    if (!currentGroupId) {
      setError("Please select a group.");
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

  const getSenderName = (message: Message) => {
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

  const visibleMessages = useMemo(() => {
    if (chatMode !== "direct" || !directUserId || !currentUser?.id) {
      return messages;
    }

    return messages.filter(
      (message) =>
        (message.senderId === currentUser.id && message.senderId !== directUserId) ||
        message.senderId === directUserId
    );
  }, [chatMode, currentUser?.id, directUserId, messages]);

  const threadTitle = chatMode === "direct" ? activeDirectContact?.user?.username ?? "Chat" : activeGroup?.group.name ?? "Group";

  return (
    <section className="chat-page messenger-layout">
      <aside className="page-card messenger-sidebar">
        <div className="messenger-sidebar-header">
          <h2>Chats</h2>
        </div>

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

        <div className="chat-targets-grid">
          <section className="chat-target-section">
            <h3>Chat nhom</h3>
            <button
              type="button"
              className={chatMode === "group" ? "messenger-room active" : "messenger-room"}
              onClick={() => {
                setChatMode("group");
                setDirectUserId(null);
              }}
            >
              <span className="messenger-avatar">#</span>
              <span className="messenger-room-copy">
                <strong>{activeGroup?.group.name ?? "Group"}</strong>
              </span>
            </button>
          </section>

          <section className="chat-target-section">
            <h3>Chat ca nhan</h3>
            <div className="chat-direct-list">
              {directContacts.map((member) => {
                const isActive = chatMode === "direct" && directUserId === member.userId;
                const username = member.user?.username ?? "User";

                return (
                  <button
                    key={member.id}
                    type="button"
                    className={isActive ? "messenger-room active" : "messenger-room"}
                    onClick={() => {
                      setChatMode("direct");
                      setDirectUserId(member.userId);
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
        {messagesQuery.isError ? <p className="error-text">Could not load message history.</p> : null}

        <div className="messenger-message-list" ref={messageListRef}>
          {messagesQuery.isLoading ? <p className="muted-text">Loading messages...</p> : null}
          {!messagesQuery.isLoading && !messagesQuery.isError && messages.length === 0 ? (
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
            placeholder={currentGroupId ? "Aa" : "Choose a group"}
            maxLength={2000}
            disabled={!currentGroupId}
          />
          <button type="submit" disabled={!currentGroupId || socketStatus !== "connected"}>
            Send
          </button>
        </form>
      </section>
    </section>
  );
}
