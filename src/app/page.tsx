"use client";

import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { SettingsModal } from "@/components/SettingsModal";
import { useApp } from "@/lib/store";

export default function Home() {
  const { state } = useApp();

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-main relative">
      <Sidebar />
      <ChatArea />
      <SettingsModal />
    </main>
  );
}
