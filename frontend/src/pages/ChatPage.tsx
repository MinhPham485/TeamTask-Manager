import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { messageApi } from "@/features/chat/api/messageApi";
import { disconnectSocketClient, getSocketClient, reconnectSocketAuthToken } from "@/features/chat/socket/socketClient";
import { groupApi } from "@/features/groups/api/groupApi";
import { authStore } from "@/features/auth/store/authStore";
import { queryKeys } from "@/shared/query/queryKeys";
import { DirectMessage, DirectThread, Message } from "@/shared/types/models";
import { uploadApi } from "@/shared/api/uploadApi";

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);

type AckResponse = {
  ok: boolean;
  error?: string;
  threadId?: string;
  message?: DirectMessage;
};

type ConversationTarget =
  | {
      id: string;
      type: "group";
      title: string;
      subtitle: string;
      groupId: string;
    }
  | {
      id: string;
      type: "direct";
      title: string;
      subtitle: string;
      peerUserId: string;
      avatarUrl?: string | null;
      thread?: DirectThread | null;
    };

function formatTime(dateString: string) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Invalid time";
  }

  return date.toLocaleString();
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function Avatar({
  name,
  avatarUrl,
  className = "messenger-avatar",
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  return (
    <span className={className}>
      {avatarUrl ? <img src={avatarUrl} alt="" /> : name.trim().charAt(0).toUpperCase() || "#"}
    </span>
  );
}

export function ChatPage() {
  const socket = useMemo(() => getSocketClient(), []);
  const currentGroupId = authStore((state) => state.currentGroupId);
  const setCurrentGroup = authStore((state) => state.setCurrentGroup);
  const currentUser = authStore((state) => state.user);
  const token = authStore((state) => state.token);

  const [groupMessageAppends, setGroupMessageAppends] = useState<Record<string, Message[]>>({});
  const [deletedGroupMessageIds, setDeletedGroupMessageIds] = useState<Record<string, string[]>>({});
  const [directMessageAppends, setDirectMessageAppends] = useState<Record<string, DirectMessage[]>>({});
  const [directThreadOverrides, setDirectThreadOverrides] = useState<Record<string, DirectThread>>({});
  const [draft, setDraft] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [conversationFilter, setConversationFilter] = useState("");
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

  const groups = useMemo(() => {
    return [...(groupsQuery.data ?? [])].sort((a, b) => a.group.name.localeCompare(b.group.name));
  }, [groupsQuery.data]);

  const messagesQuery = useQuery({
    queryKey: currentGroupId ? queryKeys.messages.byGroup(currentGroupId) : ["messages", "missing"],
    queryFn: () => messageApi.getByGroup(currentGroupId as string),
    enabled: Boolean(currentGroupId),
  });

  const groupMembersQueries = useQueries({
    queries: groups.map((membership) => ({
      queryKey: queryKeys.groups.members(membership.group.id),
      queryFn: () => groupApi.getMembers(membership.group.id),
      enabled: Boolean(membership.group.id),
    })),
  });

  const directThreadsQuery = useQuery({
    queryKey: ["messages", "direct", "threads"],
    queryFn: () => messageApi.getDirectThreads(),
  });

  const directThreads = useMemo(() => {
    const mergedThreads = [...(directThreadsQuery.data ?? [])];

    Object.values(directThreadOverrides).forEach((thread) => {
      const index = mergedThreads.findIndex((item) => item.id === thread.id);

      if (index >= 0) {
        mergedThreads[index] = thread;
        return;
      }

      mergedThreads.unshift(thread);
    });

    return mergedThreads;
  }, [directThreadOverrides, directThreadsQuery.data]);

  const createDirectThreadMutation = useMutation({
    mutationFn: (peerUserId: string) => messageApi.createOrGetDirectThread(peerUserId),
    onSuccess: (thread) => {
      setDirectThreadOverrides((prev) => ({
        ...prev,
        [thread.id]: thread,
      }));
    },
  });

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

  const groupMessages = useMemo(() => {
    if (!currentGroupId) {
      return [];
    }

    const removedIds = new Set(deletedGroupMessageIds[currentGroupId] ?? []);
    const mergedMessages = (messagesQuery.data ?? []).filter((message) => !removedIds.has(message.id));

    (groupMessageAppends[currentGroupId] ?? []).forEach((message) => {
      if (!removedIds.has(message.id) && !mergedMessages.some((item) => item.id === message.id)) {
        mergedMessages.push(message);
      }
    });

    return mergedMessages;
  }, [currentGroupId, deletedGroupMessageIds, groupMessageAppends, messagesQuery.data]);

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

      setGroupMessageAppends((prev) => {
        const currentMessages = prev[message.groupId] ?? [];

        if (currentMessages.some((item) => item.id === message.id)) {
          return prev;
        }

        return {
          ...prev,
          [message.groupId]: [...currentMessages, message],
        };
      });
    };

    const handleDeletedMessage = (payload: { id?: string }) => {
      if (!payload?.id || !currentGroupRef.current) {
        return;
      }

      setDeletedGroupMessageIds((prev) => ({
        ...prev,
        [currentGroupRef.current as string]: [...(prev[currentGroupRef.current as string] ?? []), payload.id as string],
      }));
    };

    const handleNewDirectMessage = (message: DirectMessage) => {
      if (joinedDirectThreadRef.current && message.threadId !== joinedDirectThreadRef.current) {
        return;
      }

      setDirectMessageAppends((prev) => {
        const currentMessages = prev[message.threadId] ?? [];

        if (currentMessages.some((item) => item.id === message.id)) {
          return prev;
        }

        return {
          ...prev,
          [message.threadId]: [...currentMessages, message],
        };
      });

      setDirectThreadOverrides((prev) => {
        const existingThread = prev[message.threadId] ?? directThreads.find((thread) => thread.id === message.threadId);

        if (!existingThread) {
          return prev;
        }

        return {
          ...prev,
          [message.threadId]: { ...existingThread, updatedAt: message.createdAt, messages: [message] },
        };
      });
    };

    reconnectSocketAuthToken();
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
  }, [directThreads, socket]);

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

  const activeDirectThread = (() => {
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
  })();

  const directMessagesQuery = useQuery({
    queryKey: activeDirectThread ? ["messages", "direct", activeDirectThread.id] : ["messages", "direct", "missing"],
    queryFn: () => messageApi.getDirectMessagesByThread(activeDirectThread!.id),
    enabled: Boolean(activeDirectThread?.id),
  });

  const directMessages = useMemo(() => {
    if (chatMode !== "direct" || !activeDirectThread?.id) {
      return [];
    }

    const mergedMessages = [...(directMessagesQuery.data ?? [])];

    (directMessageAppends[activeDirectThread.id] ?? []).forEach((message) => {
      if (!mergedMessages.some((item) => item.id === message.id)) {
        mergedMessages.push(message);
      }
    });

    return mergedMessages;
  }, [activeDirectThread?.id, chatMode, directMessageAppends, directMessagesQuery.data]);

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [chatMode, groupMessages, directMessages]);

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
            setDirectMessageAppends((prev) => {
              const sentMessage = response.message as DirectMessage;
              const currentMessages = prev[sentMessage.threadId] ?? [];

              if (currentMessages.some((item) => item.id === sentMessage.id)) {
                return prev;
              }

              return {
                ...prev,
                [sentMessage.threadId]: [...currentMessages, sentMessage],
              };
            });

            setDirectThreadOverrides((prev) => {
              const sentMessage = response.message as DirectMessage;
              const existingThread = prev[sentMessage.threadId] ?? directThreads.find((thread) => thread.id === sentMessage.threadId);

              if (!existingThread) {
                return prev;
              }

              return {
                ...prev,
                [sentMessage.threadId]: { ...existingThread, updatedAt: sentMessage.createdAt, messages: [sentMessage] },
              };
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

  const onPickAttachment = (file?: File | null) => {
    if (!file) {
      setAttachmentFile(null);
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setAttachmentError("File type is not allowed.");
      setAttachmentFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setAttachmentError("File size exceeds 3MB.");
      setAttachmentFile(null);
      return;
    }

    setAttachmentFile(file);
    setAttachmentError(null);
  };

  const onUploadAttachment = async () => {
    if (!currentGroupId) {
      setAttachmentError("Please select a group.");
      return;
    }

    if (!attachmentFile) {
      setAttachmentError("Choose a file to upload.");
      return;
    }

    try {
      setAttachmentUploading(true);
      setAttachmentError(null);

      const presign = await uploadApi.presign({
        groupId: currentGroupId,
        fileName: attachmentFile.name,
        mimeType: attachmentFile.type,
        size: attachmentFile.size,
        targetType: "message",
      });

      await axios.put(presign.uploadUrl, attachmentFile, {
        headers: {
          "Content-Type": attachmentFile.type,
        },
      });

      const response = await messageApi.createWithAttachment({
        groupId: currentGroupId,
        content: draft.trim() || undefined,
        fileName: attachmentFile.name,
        mimeType: attachmentFile.type,
        size: attachmentFile.size,
        url: presign.fileUrl,
        key: presign.key,
      });

      setGroupMessageAppends((prev) => {
        if (!currentGroupId) {
          return prev;
        }

        const currentMessages = prev[currentGroupId] ?? [];

        if (currentMessages.some((item) => item.id === response.id)) {
          return prev;
        }

        return {
          ...prev,
          [currentGroupId]: [...currentMessages, response],
        };
      });

      setDraft("");
      setAttachmentFile(null);
    } catch {
      setAttachmentError("Could not upload attachment.");
    } finally {
      setAttachmentUploading(false);
    }
  };

  const getSenderName = (message: { senderId: string; sender?: { username?: string } }) => {
    if (message.senderId === currentUser?.id) {
      return "You";
    }

    return message.sender?.username ?? "Unknown";
  };

  const directContacts = useMemo(() => {
    const contactsByUserId = new Map<string, NonNullable<(typeof groupMembersQueries)[number]["data"]>[number]>();

    groupMembersQueries.forEach((query) => {
      (query.data ?? []).forEach((member) => {
        if (member.userId !== currentUser?.id && !contactsByUserId.has(member.userId)) {
          contactsByUserId.set(member.userId, member);
        }
      });
    });

    directThreads.forEach((thread) => {
      const peer =
        thread.userAId === currentUser?.id
          ? {
              id: thread.userB?.id ?? thread.userBId,
              username: thread.userB?.username ?? "User",
              email: thread.userB?.email ?? "",
              avatarUrl: thread.userB?.avatarUrl ?? null,
            }
          : {
              id: thread.userA?.id ?? thread.userAId,
              username: thread.userA?.username ?? "User",
              email: thread.userA?.email ?? "",
              avatarUrl: thread.userA?.avatarUrl ?? null,
            };

      if (peer.id && peer.id !== currentUser?.id && !contactsByUserId.has(peer.id)) {
        contactsByUserId.set(peer.id, {
          id: `direct-thread:${thread.id}`,
          userId: peer.id,
          groupId: "",
          role: "member",
          user: peer,
        });
      }
    });

    return Array.from(contactsByUserId.values())
      .sort((a, b) => (a.user?.username ?? "").localeCompare(b.user?.username ?? ""));
  }, [currentUser?.id, directThreads, groupMembersQueries]);

  const activeDirectContact = useMemo(() => {
    if (!directUserId) {
      return null;
    }

    return directContacts.find((member) => member.userId === directUserId) ?? null;
  }, [directContacts, directUserId]);

  const conversations = useMemo<ConversationTarget[]>(() => {
    const groupTargets: ConversationTarget[] = groups.map((membership) => ({
      id: `group:${membership.group.id}`,
      type: "group",
      title: membership.group.name,
      subtitle: membership.role,
      groupId: membership.group.id,
    }));

    const directTargets: ConversationTarget[] = directContacts.map((member) => {
      const thread =
        currentUser?.id
          ? directThreads.find(
              (item) =>
                (item.userAId === currentUser.id && item.userBId === member.userId) ||
                (item.userBId === currentUser.id && item.userAId === member.userId)
            ) ?? null
          : null;
      const lastMessage = thread?.messages?.[0];
      const lastSender = lastMessage?.senderId === currentUser?.id ? "You" : lastMessage?.sender?.username;

      return {
        id: `direct:${member.userId}`,
        type: "direct",
        title: member.user?.username ?? "User",
        subtitle: lastMessage ? `${lastSender ?? "User"}: ${lastMessage.content}` : "Direct chat",
        peerUserId: member.userId,
        avatarUrl: member.user?.avatarUrl ?? null,
        thread,
      };
    });

    const normalizedFilter = conversationFilter.trim().toLowerCase();
    const mergedTargets = [...groupTargets, ...directTargets];

    if (!normalizedFilter) {
      return mergedTargets;
    }

    return mergedTargets.filter((target) => {
      return target.title.toLowerCase().includes(normalizedFilter) || target.subtitle.toLowerCase().includes(normalizedFilter);
    });
  }, [conversationFilter, currentUser, directContacts, directThreads, groups]);

  const activeConversationId = chatMode === "direct" && directUserId ? `direct:${directUserId}` : currentGroupId ? `group:${currentGroupId}` : null;

  const visibleMessages = chatMode === "direct" ? directMessages : groupMessages;

  const threadTitle = chatMode === "direct" ? activeDirectContact?.user?.username ?? "Chat" : activeGroup?.group.name ?? "Group";
  const threadSubtitle =
    chatMode === "direct"
      ? activeDirectContact?.user?.email ?? "Direct message"
      : activeGroup
        ? `${activeGroup.role} in this group`
        : "Group conversation";
  const threadKind = chatMode === "direct" ? "Direct" : "Group";

  return (
    <section className="chat-page messenger-layout">
      <aside className="page-card messenger-sidebar">
        <div className="messenger-sidebar-header">
          <h2>Chats</h2>
        </div>

        <div className="chat-selector-panel">
          <input
            className="messenger-search"
            value={conversationFilter}
            onChange={(event) => setConversationFilter(event.target.value)}
            placeholder="Search chats"
          />

          <div className="conversation-table" role="list" aria-label="Chats">
            {groupsQuery.isLoading ? <p className="muted-text">Loading chats...</p> : null}
            {!groupsQuery.isLoading && conversations.length === 0 ? <p className="muted-text">No matching chats.</p> : null}

            {conversations.map((conversation) => {
              const isActive = activeConversationId === conversation.id;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={isActive ? "messenger-room active" : "messenger-room"}
                  onClick={() => {
                    if (conversation.type === "group") {
                      setAttachmentFile(null);
                      setAttachmentError(null);
                      setChatMode("group");
                      setDirectUserId(null);
                      setCurrentGroup(conversation.groupId);
                      return;
                    }

                    setAttachmentFile(null);
                    setAttachmentError(null);
                    setChatMode("direct");
                    setDirectUserId(conversation.peerUserId);

                    if (!conversation.thread) {
                      createDirectThreadMutation.mutate(conversation.peerUserId);
                    }
                  }}
                >
                  <Avatar
                    name={conversation.title}
                    avatarUrl={conversation.type === "direct" ? conversation.avatarUrl : null}
                  />
                  <span className="messenger-room-copy">
                    <strong>{conversation.title}</strong>
                    <small>{conversation.subtitle}</small>
                  </span>
                  <span className="conversation-kind">{conversation.type === "group" ? "Group" : "Direct"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="page-card messenger-thread">
        <header className="messenger-thread-header">
          <div className="messenger-thread-title">
            <Avatar
              name={threadTitle}
              avatarUrl={chatMode === "direct" ? activeDirectContact?.user?.avatarUrl : null}
              className="messenger-avatar large"
            />
            <div>
              <h3>{threadTitle}</h3>
              <p>{threadSubtitle}</p>
            </div>
          </div>
          <div className="messenger-thread-actions">
            <span className="conversation-kind">{threadKind}</span>
            <span className={socketStatus === "connected" ? "chat-status online" : "chat-status"}>{socketStatus}</span>
          </div>
        </header>

        {error ? <p className="error-text page-feedback">{error}</p> : null}
        {attachmentError ? <p className="error-text page-feedback">{attachmentError}</p> : null}
        {chatMode === "group" && messagesQuery.isError ? <p className="error-text">Could not load message history.</p> : null}
        {chatMode === "direct" && directMessagesQuery.isError ? <p className="error-text">Could not load direct messages.</p> : null}

        <div className="messenger-message-list" ref={messageListRef}>
          {chatMode === "group" && messagesQuery.isLoading ? <p className="muted-text">Loading messages...</p> : null}
          {chatMode === "direct" && directMessagesQuery.isLoading ? <p className="muted-text">Loading messages...</p> : null}
          {chatMode === "group" && !messagesQuery.isLoading && !messagesQuery.isError && visibleMessages.length === 0 ? (
            <div className="messenger-empty-state">
              <Avatar name={threadTitle} className="messenger-avatar large" />
              <h3>No messages yet</h3>
              <p className="muted-text">Start the conversation with this group.</p>
            </div>
          ) : null}
          {chatMode === "direct" && !directMessagesQuery.isLoading && !directMessagesQuery.isError && visibleMessages.length === 0 ? (
            <div className="messenger-empty-state">
              <Avatar name={threadTitle} avatarUrl={activeDirectContact?.user?.avatarUrl} className="messenger-avatar large" />
              <h3>No messages yet</h3>
              <p className="muted-text">Send the first direct message.</p>
            </div>
          ) : null}

          {visibleMessages.map((message) => {
            const isMine = message.senderId === currentUser?.id;
            const attachments = "attachments" in message ? message.attachments : undefined;
            const senderName = getSenderName(message);
            const senderAvatarUrl = isMine ? currentUser?.avatarUrl : message.sender?.avatarUrl;

            return (
              <article key={message.id} className={isMine ? "messenger-message mine" : "messenger-message"}>
                <p className={isMine ? "messenger-message-meta mine" : "messenger-message-meta"}>{formatTime(message.createdAt)}</p>
                {!isMine ? <Avatar name={senderName} avatarUrl={senderAvatarUrl} className="messenger-message-avatar" /> : null}
                <div className={isMine ? "messenger-bubble mine" : "messenger-bubble"}>
                  <header>
                    <strong>{senderName}</strong>
                  </header>
                  <p>{message.content}</p>
                  {attachments?.length ? (
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
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        <form className="messenger-composer" onSubmit={handleSend}>
          <label className="chat-upload-button">
            <input
              type="file"
              accept=".pdf,.docx,.xlsx,image/png,image/jpeg"
              onChange={(event) => onPickAttachment(event.target.files?.[0])}
              disabled={chatMode !== "group" || !currentGroupId || attachmentUploading}
            />
            Attach
          </label>
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
          <button
            type="button"
            className="chat-upload-send"
            onClick={onUploadAttachment}
            disabled={chatMode !== "group" || !currentGroupId || attachmentUploading || !attachmentFile}
          >
            {attachmentUploading ? "Uploading..." : "Send file"}
          </button>
        </form>
        {attachmentFile ? (
          <p className="muted-text chat-file-hint">Selected: {attachmentFile.name}</p>
        ) : null}
      </section>
    </section>
  );
}
