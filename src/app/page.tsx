"use client";

import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { ArenaView } from "@/components/ArenaView";
import { SettingsModal } from "@/components/SettingsModal";
import { CommandPalette } from "@/components/CommandPalette";
import { ArtifactCanvas } from "@/components/ArtifactCanvas";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useApp } from "@/lib/store";

export default function Home() {
  const { state, dispatch } = useApp();

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-main relative">
      <ErrorBoundary label="Sidebar" variant="panel">
        <Sidebar />
      </ErrorBoundary>
      <ErrorBoundary
        label={state.activeView === 'arena' ? "Battle Arena" : "Chat"}
        variant="panel"
        resetKeys={[state.activeView, state.currentSessionId]}
      >
        {state.activeView === 'arena' ? <ArenaView /> : <ChatArea />}
      </ErrorBoundary>
      <ErrorBoundary
        label="Artifact canvas"
        variant="panel"
        resetKeys={[state.activeArtifact?.id]}
        onReset={() => dispatch({ type: 'CLOSE_ARTIFACT' })}
      >
        <ArtifactCanvas />
      </ErrorBoundary>
      <ErrorBoundary label="Settings" variant="panel" onReset={() => dispatch({ type: 'TOGGLE_SETTINGS', open: false })}>
        <SettingsModal />
      </ErrorBoundary>
      <ErrorBoundary label="Command palette" variant="inline" onReset={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false })}>
        <CommandPalette />
      </ErrorBoundary>
    </main>
  );
}
