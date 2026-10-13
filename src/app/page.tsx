"use client";

import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { ArenaView } from "@/components/ArenaView";
import { SettingsModal } from "@/components/SettingsModal";
import { CommandPalette } from "@/components/CommandPalette";
import { ArtifactCanvas } from "@/components/ArtifactCanvas";
import { useApp } from "@/lib/store";

export default function Home() {
  const { state } = useApp();

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-main relative">
      <Sidebar />
      {state.activeView === 'arena' ? <ArenaView /> : <ChatArea />}
      <ArtifactCanvas />
      <SettingsModal />
      <CommandPalette />
    </main>
  );
}
