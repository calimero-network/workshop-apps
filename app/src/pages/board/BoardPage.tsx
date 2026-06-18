import { useCallback, useEffect, useState } from 'react';
import { useSubscription } from '@calimero-network/mero-react';
import { useBoardWorkspace } from '../../hooks/useBoardWorkspace';
import { useBoardContext } from '../../hooks/useBoardContext';
import type { Task } from '../../api/board/BoardClient';
import Sidebar from '../../components/Sidebar';
import BoardView from '../../components/BoardView';
import TaskDetailPanel from '../../components/TaskDetailPanel';
import CreateTaskModal from '../../components/CreateTaskModal';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import WorkspacesEmptyState from '../../components/WorkspacesEmptyState';

export default function BoardPage() {
  const workspace = useBoardWorkspace();

  const board = useBoardContext(
    workspace.boardContextId,
    workspace.executorPublicKey,
  );

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createTaskStatus, setCreateTaskStatus] = useState('todo');
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Keep selectedTask in sync with board task list (handles task mutations from peers).
  useEffect(() => {
    if (!selectedTask) return;
    const updated = board.tasks.find((t) => t.id === selectedTask.id);
    if (updated) setSelectedTask(updated);
    else setSelectedTask(null); // task was deleted
  }, [board.tasks, selectedTask?.id]);

  // Poll members while board page is open (no SSE for namespace membership).
  useEffect(() => {
    if (!workspace.namespaceId) return;
    const interval = setInterval(() => { workspace.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [workspace.namespaceId, workspace.refetchMembers]);

  // Refresh tasks on board events
  useSubscription(
    workspace.boardContextId ? [workspace.boardContextId] : [],
    () => {
      void board.refreshTasks();
      if (board.selectedTaskId) void board.refreshComments(board.selectedTaskId);
      workspace.refetchMembers();
    },
  );

  const handleCreateTask = useCallback(async (title: string, description: string, priority: string) => {
    await board.createTask(title, description, priority);
  }, [board]);

  const handleSelectTask = useCallback((task: Task) => {
    setSelectedTask(task);
    board.setSelectedTaskId(task.id);
  }, [board]);

  const handleCloseTask = useCallback(() => {
    setSelectedTask(null);
    board.setSelectedTaskId(null);
  }, [board]);

  const handleUpdateStatus = useCallback(async (newStatus: string) => {
    if (!selectedTask) return;
    await board.updateTaskStatus(selectedTask.id, newStatus);
  }, [board, selectedTask]);

  const handleAssign = useCallback(async (taskId: string, assignee: string) => {
    await board.assignTask(taskId, assignee);
  }, [board]);

  const handleAddComment = useCallback(async (body: string) => {
    if (!selectedTask) return;
    await board.addComment(selectedTask.id, body);
  }, [board, selectedTask]);

  // Welcome screen when no workspaces exist.
  if (workspace.workspaces.length === 0 && !workspace.workspacesLoading) {
    return (
      <>
        <WorkspacesEmptyState
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          onJoin={() => setShowJoin(true)}
        />
        {showCreateWorkspace && (
          <CreateWorkspaceModal
            onCreate={async (name) => { await workspace.createWorkspace(name); }}
            onClose={() => setShowCreateWorkspace(false)}
          />
        )}
        {showJoin && (
          <JoinModal
            onJoin={async (json) => {
              await workspace.joinWorkspace(json);
              setShowJoin(false);
            }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </>
    );
  }

  return (
    <div style={{ background: 'var(--c-paper)', color: 'var(--c-ink)' }}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          workspaces={workspace.workspaces}
          selectedNamespaceId={workspace.namespaceId}
          onSelectWorkspace={workspace.selectWorkspace}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          workspaceAlias={workspace.selectedWorkspace?.alias}
          members={workspace.members}
          selfIdentity={workspace.selfIdentity}
          onInvite={() => setShowInvite(true)}
          viewerIsAdmin={workspace.isAdmin}
          onSetMemberRole={workspace.setMemberRole}
          onRemoveMember={workspace.removeMember}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {workspace.boardContextId ? (
            <BoardView
              tasks={board.tasks}
              tasksLoading={board.tasksLoading}
              members={workspace.members}
              selfIdentity={workspace.selfIdentity}
              onSelectTask={handleSelectTask}
              onCreateTask={(status) => { setCreateTaskStatus(status); setShowCreateTask(true); }}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 14, textAlign: 'center', padding: 24,
            }}>
              <div style={{
                width: 56, height: 56, display: 'grid', placeItems: 'center',
                borderRadius: 16, background: 'rgba(164,255,17,0.14)',
                border: '1px solid rgba(164,255,17,0.4)',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--c-green-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--c-ink)' }}>
                Connecting to board…
              </div>
              <div style={{ fontSize: 14, color: 'var(--c-muted)', maxWidth: 320, lineHeight: 1.55 }}>
                Select a board from the sidebar or create a new one.
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Task detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          comments={board.comments}
          commentsLoading={board.commentsLoading}
          members={workspace.members}
          selfIdentity={workspace.selfIdentity}
          onClose={handleCloseTask}
          onUpdateStatus={handleUpdateStatus}
          onAssign={handleAssign}
          onAddComment={handleAddComment}
          onEditComment={board.editComment}
          onDeleteComment={board.deleteComment}
        />
      )}

      {/* Modals */}
      {showCreateTask && (
        <CreateTaskModal
          defaultStatus={createTaskStatus}
          onSubmit={handleCreateTask}
          onClose={() => setShowCreateTask(false)}
        />
      )}
      {showInvite && (
        <InviteModal
          onInvite={workspace.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await workspace.createWorkspace(name); }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (json) => {
            await workspace.joinWorkspace(json);
            setShowJoin(false);
          }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  );
}
