import React, { useState } from "react";
import { apiJson } from "../api";

const ANSWER_ROLES = ["admin", "pa", "lead"];

export default function QnAThread({ feature, onUpdated, currentUser }) {
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [answeringId, setAnsweringId] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [answerLoading, setAnswerLoading] = useState(false);

  const qa = feature.qa || [];
  const pending = qa.filter(q => q.status === "pending");
  const answered = qa.filter(q => q.status === "answered");

  const canAnswer = currentUser && ANSWER_ROLES.includes(currentUser.role);

  async function handleAsk(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await apiJson(`/features/${feature.id}/qa`, {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      onUpdated({ ...feature, qa: [...qa, created] });
      setQuestion("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAnswer(qid) {
    setAnswerLoading(true);
    try {
      const updatedQ = await apiJson(`/features/${feature.id}/qa/${qid}/answer`, {
        method: "PUT",
        body: JSON.stringify({ answer: answerText }),
      });
      const newQa = qa.map(q => q.id === qid ? updatedQ : q);
      onUpdated({ ...feature, qa: newQa });
      setAnsweringId(null);
      setAnswerText("");
    } finally {
      setAnswerLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Q&amp;A Thread</h2>

      <form onSubmit={handleAsk} style={styles.askForm}>
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask a question about this feature…"
          required
          style={{ minHeight: 70 }}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Asking as <strong>{currentUser.username}</strong> ({currentUser.role})
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Posting…" : "Post Question"}
          </button>
        </div>
      </form>

      {pending.length > 0 && (
        <section style={styles.section}>
          <p style={styles.sectionLabel}>Pending ({pending.length})</p>
          {pending.map(q => (
            <QCard
              key={q.id}
              q={q}
              canAnswer={canAnswer}
              answering={answeringId === q.id}
              answerText={answerText}
              answerLoading={answerLoading}
              onStartAnswer={() => { setAnsweringId(q.id); setAnswerText(""); }}
              onCancelAnswer={() => setAnsweringId(null)}
              onAnswerChange={setAnswerText}
              onSubmitAnswer={() => handleAnswer(q.id)}
              currentUser={currentUser}
            />
          ))}
        </section>
      )}

      {answered.length > 0 && (
        <section style={styles.section}>
          <p style={styles.sectionLabel}>Answered ({answered.length})</p>
          {answered.map(q => <QCard key={q.id} q={q} canAnswer={false} />)}
        </section>
      )}

      {qa.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No questions yet. Be the first to ask!</p>
      )}
    </div>
  );
}

function QCard({ q, canAnswer, answering, answerText, answerLoading, onStartAnswer, onCancelAnswer, onAnswerChange, onSubmitAnswer, currentUser }) {
  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span className={q.status === "answered" ? "badge-answered" : "badge-pending"}>{q.status}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{q.id} · {q.asked_by} · {new Date(q.asked_at).toLocaleString()}</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 500 }}>{q.question}</p>
        </div>
        {q.status === "pending" && canAnswer && !answering && (
          <button className="btn-secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }} onClick={onStartAnswer}>Answer</button>
        )}
      </div>

      {q.status === "answered" && (
        <div style={styles.answer}>
          <span style={styles.answerMeta}>↳ {q.answered_by} · {new Date(q.answered_at).toLocaleString()}</span>
          <p style={{ fontSize: 13, marginTop: 4 }}>{q.answer}</p>
        </div>
      )}

      {answering && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea value={answerText} onChange={e => onAnswerChange(e.target.value)} placeholder="Type your answer…" style={{ minHeight: 70 }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Answering as <strong>{currentUser.username}</strong>
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn-ghost" onClick={onCancelAnswer}>Cancel</button>
            <button className="btn-primary" onClick={onSubmitAnswer} disabled={answerLoading || !answerText}>
              {answerLoading ? "Saving…" : "Submit Answer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: 18 },
  title: { fontSize: 16, fontWeight: 600 },
  askForm: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  section: { display: "flex", flexDirection: "column", gap: 10 },
  sectionLabel: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  card: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "12px 14px",
  },
  answer: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
  },
  answerMeta: { fontSize: 11, color: "var(--accent2)" },
};
