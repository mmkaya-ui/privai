// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

let shouldThrow = true;
function Bomb({ text = "ok" }: { text?: string }) {
    if (shouldThrow) throw new Error("kaboom");
    return <p>{text}</p>;
}

describe("ErrorBoundary", () => {
    afterEach(() => {
        cleanup();
        shouldThrow = true;
    });

    // React logs caught render errors; keep test output clean.
    const silence = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

    it("renders children when nothing throws", () => {
        shouldThrow = false;
        render(<ErrorBoundary><Bomb text="hello" /></ErrorBoundary>);
        expect(screen.getByText("hello")).toBeTruthy();
    });

    it("contains a crash to an inline fallback and leaves siblings alive", () => {
        silence();
        render(
            <div>
                <ErrorBoundary label="Message" variant="inline"><Bomb /></ErrorBoundary>
                <p>sibling survives</p>
            </div>
        );
        expect(screen.getByRole("alert").textContent).toContain("Message failed to render: kaboom");
        expect(screen.getByText("sibling survives")).toBeTruthy();
    });

    it("Retry re-renders the children once the cause is fixed", () => {
        silence();
        const onReset = vi.fn();
        render(<ErrorBoundary label="Chat" variant="panel" onReset={onReset}><Bomb text="recovered" /></ErrorBoundary>);
        expect(screen.getByText("Chat crashed")).toBeTruthy();

        shouldThrow = false;
        fireEvent.click(screen.getByText("Try again"));
        expect(onReset).toHaveBeenCalledOnce();
        expect(screen.getByText("recovered")).toBeTruthy();
    });

    it("resets automatically when resetKeys change", () => {
        silence();
        function Harness() {
            const [session, setSession] = useState("a");
            return (
                <>
                    <button onClick={() => { shouldThrow = false; setSession("b"); }}>switch</button>
                    <ErrorBoundary variant="panel" resetKeys={[session]}><Bomb text={`session ${session}`} /></ErrorBoundary>
                </>
            );
        }
        render(<Harness />);
        expect(screen.getByRole("alert")).toBeTruthy();
        fireEvent.click(screen.getByText("switch"));
        expect(screen.getByText("session b")).toBeTruthy();
    });

    it("uses a custom fallback when provided", () => {
        silence();
        render(<ErrorBoundary fallback={<span>custom</span>}><Bomb /></ErrorBoundary>);
        expect(screen.getByText("custom")).toBeTruthy();
    });
});
