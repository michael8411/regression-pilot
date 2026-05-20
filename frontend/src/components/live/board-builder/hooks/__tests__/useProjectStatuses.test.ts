import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/components/live/lib/api", () => ({
  getJiraProjectStatuses: vi.fn(),
}));

import { useProjectStatuses } from "../useProjectStatuses";
import { getJiraProjectStatuses } from "@/components/live/lib/api";

const mocked = getJiraProjectStatuses as unknown as ReturnType<typeof vi.fn>;

describe("useProjectStatuses", () => {
  beforeEach(() => {
    mocked.mockReset();
  });
  afterEach(() => {
    mocked.mockReset();
  });

  it("fetches on project change", async () => {
    mocked.mockResolvedValueOnce({
      project_key: "FM",
      statuses: [
        { name: "Done", category: "done", issue_types: ["Story"] },
      ],
      fetched_at: "x",
    });
    const { result } = renderHook(() => useProjectStatuses("FM"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statuses.map((s) => s.name)).toEqual(["Done"]);
    expect(mocked).toHaveBeenCalledWith("FM");
  });

  it("hits the session cache on second select of the same project", async () => {
    mocked.mockResolvedValueOnce({
      project_key: "FM2",
      statuses: [
        { name: "In Progress", category: "indeterminate", issue_types: [] },
      ],
      fetched_at: "x",
    });
    const first = renderHook(() => useProjectStatuses("FM2"));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(mocked).toHaveBeenCalledTimes(1);

    first.unmount();
    const second = renderHook(() => useProjectStatuses("FM2"));
    await waitFor(() =>
      expect(second.result.current.statuses.length).toBe(1),
    );
    // No additional call — the second mount served from cache.
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it("returns empty statuses + clears error when projectKey is null", async () => {
    const { result } = renderHook(() => useProjectStatuses(null));
    expect(result.current.statuses).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mocked).not.toHaveBeenCalled();
  });
});
