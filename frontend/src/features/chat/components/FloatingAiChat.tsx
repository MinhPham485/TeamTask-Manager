import { FormEvent, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { aiApi } from "@/features/chat/api/aiApi";

export function FloatingAiChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const askMutation = useMutation({
    mutationFn: (payload: { question: string }) => aiApi.askAssistant(payload),
    onSuccess: (data) => {
      const normalizedQuestion = question.trim();

      if (!normalizedQuestion) {
        return;
      }

      setHistory((prev) => [
        ...prev,
        {
          question: normalizedQuestion,
          answer: data.answer || "No answer returned",
        },
      ]);
      setQuestion("");
      setError(null);
    },
    onError: (mutationError: unknown) => {
      const message =
        (mutationError as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
        (mutationError as Error)?.message ||
        "Could not ask AI assistant.";

      setError(message);
    },
  });

  const canSubmit = useMemo(() => {
    return Boolean(question.trim()) && !askMutation.isPending;
  }, [question, askMutation.isPending]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const normalized = question.trim();

    if (!normalized) {
      return;
    }

    askMutation.mutate({
      question: normalized,
    });
  };

  return (
    <section className="floating-ai-chat" aria-live="polite">
      {isOpen ? (
        <div className="floating-ai-panel">
          <header className="floating-ai-header">
            <h4>AI Assistant</h4>
            <button type="button" className="floating-ai-close" onClick={() => setIsOpen(false)}>
              x
            </button>
          </header>

          <div className="floating-ai-messages">
            {history.length === 0 ? <p className="muted-text">Ask anything about your tasks.</p> : null}

            {history.map((item, index) => (
              <article key={`${item.question}-${index}`} className="floating-ai-item">
                <p className="floating-ai-question">{item.question}</p>
                <p className="floating-ai-answer">{item.answer}</p>
              </article>
            ))}

            {askMutation.isPending ? <p className="muted-text">Thinking...</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
          </div>

          <form className="floating-ai-form" onSubmit={handleSubmit}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask AI..."
              maxLength={800}
            />
            <button type="submit" disabled={!canSubmit}>
              Send
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        className="floating-ai-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Open AI assistant"
      >
        AI
      </button>
    </section>
  );
}
