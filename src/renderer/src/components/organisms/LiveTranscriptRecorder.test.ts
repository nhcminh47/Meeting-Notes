import { describe, expect, it } from "vitest";
import { LIVE_SEGMENT_MS, liveTranscriptReducer } from "./LiveTranscriptRecorder";

describe("LIVE_SEGMENT_MS", () => {
  it("uses short complete segments for lower live transcript latency", () => {
    expect(LIVE_SEGMENT_MS).toBe(3000);
  });
});

describe("liveTranscriptReducer", () => {
  it("moves through the live recording lifecycle", () => {
    expect(liveTranscriptReducer("idle", { type: "request-permission" })).toBe(
      "requesting-permission"
    );
    expect(liveTranscriptReducer("requesting-permission", { type: "start-listening" })).toBe(
      "listening"
    );
    expect(
      liveTranscriptReducer("listening", { type: "chunk-started", queueDepth: 1 })
    ).toBe("transcribing");
    expect(
      liveTranscriptReducer("transcribing", {
        type: "chunk-appended",
        queueDepth: 0
      })
    ).toBe("listening");
    expect(liveTranscriptReducer("listening", { type: "stop" })).toBe("stopping");
    expect(liveTranscriptReducer("stopping", { type: "finalized" })).toBe(
      "finalized"
    );
  });

  it("reports catching up while queued chunks remain", () => {
    expect(
      liveTranscriptReducer("listening", { type: "chunk-started", queueDepth: 3 })
    ).toBe("catching-up");
    expect(
      liveTranscriptReducer("catching-up", {
        type: "waiting-for-speech",
        queueDepth: 1
      })
    ).toBe("catching-up");
  });

  it("can enter error and reset to idle", () => {
    expect(liveTranscriptReducer("listening", { type: "error" })).toBe("error");
    expect(liveTranscriptReducer("error", { type: "reset" })).toBe("idle");
  });
});
