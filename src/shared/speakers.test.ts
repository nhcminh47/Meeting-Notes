import { describe, expect, it } from "vitest";
import { resolveSpeakerDisplay } from "./speakers";

describe("resolveSpeakerDisplay", () => {
  it("uses metadata name, label, turn name, stable ID, then UNKNOWN", () => {
    expect(resolveSpeakerDisplay({ speakerId: "SPEAKER_01", speakerName: "Old name" }, [
      { id: "SPEAKER_01", label: "Speaker 1", name: "Minh" }
    ])).toBe("Minh");
    expect(resolveSpeakerDisplay({ speakerId: "SPEAKER_01", speakerName: "Old name" }, [
      { id: "SPEAKER_01", label: "Speaker 1", name: null }
    ])).toBe("Speaker 1");
    expect(resolveSpeakerDisplay({ speakerId: "SPEAKER_02", speakerName: "John" }, [])).toBe("John");
    expect(resolveSpeakerDisplay({ speakerId: "SPEAKER_02" }, [])).toBe("SPEAKER_02");
    expect(resolveSpeakerDisplay({}, [])).toBe("UNKNOWN");
  });
});
