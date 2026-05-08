import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist the mock factories so vi.mock can use them at module-init time
const { spawnMock, accessMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  accessMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));
vi.mock("node:fs/promises", () => ({
  access: accessMock,
  constants: { X_OK: 1 },
}));

import { runPandoc } from "../../src/services/docker-runner.js";

const VAULT = "/path/to/vault";

/**
 * Build a fake child_process.ChildProcess that:
 *   - emits the given stderr to data subscribers as soon as they attach
 *   - emits 'close' with the given exit code as soon as someone subscribes
 *
 * This avoids any test-side scheduling: spawn returns the child, runDocker
 * subscribes to 'close', and the close fires on the next microtask.
 */
function fakeChild(exitCode: number, stderr = ""): unknown {
  return {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (event === "close") {
        queueMicrotask(() => handler(exitCode));
      }
      return this;
    },
    stderr: {
      on(event: string, handler: (...args: unknown[]) => void) {
        if (event === "data" && stderr.length > 0) {
          queueMicrotask(() => handler(Buffer.from(stderr)));
        }
        return this;
      },
    },
    stdout: { on() { return this; } },
  };
}

beforeEach(() => {
  spawnMock.mockReset();
  accessMock.mockReset();
});

describe("runPandoc — docker availability check", () => {
  it("returns null and warns when docker is not on PATH", async () => {
    accessMock.mockRejectedValue(new Error("ENOENT"));
    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runPandoc({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("docker not found")
    );
    expect(spawnMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("runPandoc — happy path", () => {
  it("succeeds on the first attempt with --citeproc", async () => {
    accessMock.mockResolvedValue(undefined);
    const child = fakeChild(0);
    spawnMock.mockReturnValue(child);

    const result = await runPandoc({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });

    expect(result).toBe(`${VAULT}/doc.pdf`);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const argv = spawnMock.mock.calls[0]![1] as string[];
    expect(argv).toContain("--citeproc");
    expect(argv).toContain("--bibliography=/vault/build/refs.bib");
  });
});

describe("runPandoc — citeproc fallback", () => {
  it("retries without --citeproc when the first attempt fails", async () => {
    accessMock.mockResolvedValue(undefined);
    const first = fakeChild(1, "citeproc error");
    const second = fakeChild(0);
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runPandoc({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });

    expect(result).toBe(`${VAULT}/doc.pdf`);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    const secondArgv = spawnMock.mock.calls[1]![1] as string[];
    expect(secondArgv).not.toContain("--citeproc");
    expect(secondArgv.some((a: string) => a.startsWith("--bibliography="))).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("--citeproc failed")
    );
    warnSpy.mockRestore();
  });

  it("returns null when both attempts fail", async () => {
    accessMock.mockResolvedValue(undefined);
    const first = fakeChild(1, "first error");
    const second = fakeChild(2, "second error");
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runPandoc({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });

    expect(result).toBeNull();
    warnSpy.mockRestore();
  });
});
