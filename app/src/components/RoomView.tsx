/**
 * TaskListView — the main panel for a team-todos workspace.
 *
 * Shows open tasks first, then completed tasks. Each task can be toggled,
 * edited (author only), or deleted (author only) in-place.
 */
import React from 'react';
import { useTodoList } from '../hooks/useChatRoom';
import TaskItem from './MessageBubble';
import AddTaskInput from './MessageInput';

interface TaskListViewProps {
  contextId: string;
  executorPublicKey: string | null;
}

export default function TaskListView({ contextId, executorPublicKey }: TaskListViewProps) {
  const todo = useTodoList(contextId, executorPublicKey);

  const openTasks = todo.tasks.filter((t) => !t.done)
    .sort((a, b) => a.created_at - b.created_at);
  const doneTasks = todo.tasks.filter((t) => t.done)
    .sort((a, b) => b.created_at - a.created_at);

  // We compare task.author against the resolved per-context executor key,
  // falling back to the lobby key passed in.
  const selfKey = todo.executorKey ?? executorPublicKey ?? '';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#e2e8f0' }}>
          Tasks
        </h3>
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
          {openTasks.length} open · {doneTasks.length} done
        </span>
      </div>

      {/* Task list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        {todo.loading && todo.tasks.length === 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
            Loading tasks…
          </div>
        )}

        {!todo.loading && todo.tasks.length === 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
            No tasks yet. Add one below!
          </div>
        )}

        {/* Open tasks */}
        {openTasks.length > 0 && (
          <>
            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', paddingLeft: 2 }}>
              Open · {openTasks.length}
            </div>
            {openTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                isSelf={task.author === selfKey}
                onToggle={() => todo.toggleTaskDone(task.id)}
                onEdit={(desc) => todo.editTask(task.id, desc)}
                onDelete={() => todo.deleteTask(task.id)}
              />
            ))}
          </>
        )}

        {/* Completed tasks */}
        {doneTasks.length > 0 && (
          <>
            <div style={{
              fontSize: '0.72rem',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              paddingLeft: 2,
              marginTop: openTasks.length > 0 ? '0.75rem' : 0,
            }}>
              Completed · {doneTasks.length}
            </div>
            {doneTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                isSelf={task.author === selfKey}
                onToggle={() => todo.toggleTaskDone(task.id)}
                onEdit={(desc) => todo.editTask(task.id, desc)}
                onDelete={() => todo.deleteTask(task.id)}
              />
            ))}
          </>
        )}

        {todo.error && (
          <div style={{ color: '#f87171', fontSize: '0.8rem', padding: '0.5rem' }}>
            Error: {todo.error.message}
          </div>
        )}
      </div>

      {/* Add task input */}
      <AddTaskInput
        onAdd={todo.addTask}
        disabled={!todo.executorKey && !executorPublicKey}
      />
    </div>
  );
}
