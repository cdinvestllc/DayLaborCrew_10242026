import React, { act } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import DisputeCenter from "./DisputeCenter";

jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

describe("DisputeCenter", () => {
  let host;
  let root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
  });

  test("loads a participant case and exposes its conversation and appeal action", async () => {
    axios.get.mockImplementation(url => {
      if (url.includes("/messages")) {
        return Promise.resolve({
          data: {
            dispute: {
              id: "case-1", job_id: "job-1", status: "resolved",
              dispute_type: "job", reason: "The agreed scope was not completed.",
              resolution: "uphold", resolution_notes: "Evidence reviewed.",
              appeal_deadline: "2026-10-29T12:00:00+00:00"
            },
            messages: [{
              id: "message-1", sender_name: "Support", sender_role: "admin",
              body: "We reviewed the submitted evidence.", created_at: "2026-10-22T12:00:00+00:00"
            }],
            can_message: true,
            can_appeal: true
          }
        });
      }
      return Promise.resolve({
        data: [{
          id: "case-1", job_id: "job-1", job_title: "Kitchen repair",
          dispute_type: "job", category: "scope",
          reason: "The agreed scope was not completed.", status: "resolved",
          created_at: "2026-10-22T12:00:00+00:00"
        }]
      });
    });

    await act(async () => {
      root.render(<DisputeCenter jobs={[{ id: "job-1", title: "Kitchen repair", status: "completed_pending_review" }]} />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const caseButton = host.querySelector('[data-testid="participant-dispute-case-1"]');
    expect(caseButton).not.toBeNull();

    await act(async () => {
      caseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(host.querySelector('[data-testid="participant-thread-case-1"]')).not.toBeNull();
    expect(host.textContent).toContain("We reviewed the submitted evidence.");
    expect(host.querySelector('[data-testid="start-dispute-appeal"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="send-dispute-reply"]')).not.toBeNull();
  });
});
