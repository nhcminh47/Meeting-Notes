import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  root: "",
  convert: vi.fn(),
  transcribe: vi.fn()
}));

vi.mock("../runtime/runtimePaths", () => ({
  getRuntimePaths: () => ({
    runtimeRoot: path.join(mocks.root, "runtime"),
    manifestPath: path.join(mocks.root, "runtime", "manifest.local.json"),
    downloadsRoot: path.join(mocks.root, "runtime", "downloads"),
    tempRoot: path.join(mocks.root, "runtime", "downloads", "temp"),
    workRoot: path.join(mocks.root, "work")
  })
}));
vi.mock("../audio/ffmpegService", () => ({
  convertToWav16kMono: mocks.convert
}));
vi.mock("./whisperService", () => ({
  transcribeAudioFile: mocks.transcribe
}));

import {
  cancelLiveTranscriptSession,
  enqueueLiveTranscriptChunk,
  finishLiveTranscriptSession,
  startLiveTranscriptSession,
  validateLiveTranscriptText
} from "./liveTranscriptSessionManager";

async function exists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

beforeEach(async () => {
  mocks.root = await mkdtemp(path.join(os.tmpdir(), "live-transcript-test-"));
  mocks.convert.mockReset();
  mocks.transcribe.mockReset();
  mocks.convert.mockImplementation(async ({ outputPath }: { outputPath: string }) => {
    await writeFile(outputPath, "wav");
    return { outputPath };
  });
});

afterEach(async () => {
  await rm(mocks.root, { recursive: true, force: true });
});

describe("live transcript session manager", () => {
  it("transcribes chunks sequentially and preserves chunk results", async () => {
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];
    mocks.transcribe.mockImplementation(
      async ({ outputPrefix }: { outputPrefix: string }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const chunkIndex = outputPrefix.includes("chunk-00000") ? 0 : 1;
        order.push(chunkIndex);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { text: `chunk ${chunkIndex}`, outputFiles: [`${outputPrefix}.txt`] };
      }
    );

    const session = startLiveTranscriptSession({ model: "small", language: "en" });
    const first = enqueueLiveTranscriptChunk({
      sessionId: session.sessionId,
      chunkIndex: 0,
      data: new Uint8Array([1]),
      mimeType: "audio/webm",
      durationMs: 8000
    });
    const second = enqueueLiveTranscriptChunk({
      sessionId: session.sessionId,
      chunkIndex: 1,
      data: new Uint8Array([2]),
      mimeType: "audio/webm",
      durationMs: 8000
    });

    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { chunkIndex: 0, text: "chunk 0", status: "appended" },
      { chunkIndex: 1, text: "chunk 1", status: "appended" }
    ]);
    expect(order).toEqual([0, 1]);
    expect(maxActive).toBe(1);
  });

  it("passes live chunk mode to whisper and suppresses rejected chunks", async () => {
    mocks.transcribe.mockResolvedValue({
      text: "Hãy subscribe cho kênh Ghiền Mì Gõ Để không bỏ lỡ những video hấp dẫn",
      outputFiles: []
    });
    const session = startLiveTranscriptSession({ model: "small", language: "vi" });

    const result = await enqueueLiveTranscriptChunk({
      sessionId: session.sessionId,
      chunkIndex: 0,
      data: new Uint8Array([1]),
      mimeType: "audio/webm",
      durationMs: 3000
    });

    expect(mocks.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ liveChunkMode: true })
    );
    expect(result).toMatchObject({
      chunkIndex: 0,
      text: "",
      status: "waiting for speech"
    });
  });

  it("skips undecodable live audio segments without failing the session", async () => {
    mocks.convert.mockRejectedValue(
      new Error("Error opening input: End of file. EBML header parsing failed")
    );
    const session = startLiveTranscriptSession({ model: "small", language: "vi" });
    const sessionRoot = path.join(mocks.root, "work", "live-transcripts", session.sessionId);

    const result = await enqueueLiveTranscriptChunk({
      sessionId: session.sessionId,
      chunkIndex: 27,
      data: new Uint8Array([0, 0, 0, 0]),
      mimeType: "audio/webm",
      durationMs: 3000
    });

    expect(result).toMatchObject({
      chunkIndex: 27,
      text: "",
      status: "waiting for speech"
    });
    expect(mocks.transcribe).not.toHaveBeenCalled();
    await expect(exists(path.join(sessionRoot, "chunks", "chunk-00027", "audio.webm"))).resolves.toBe(
      false
    );
  });

  it("still surfaces non-live-runtime conversion errors", async () => {
    mocks.convert.mockRejectedValue(new Error("FFmpeg executable does not exist"));
    const session = startLiveTranscriptSession({ model: "small", language: "vi" });

    await expect(
      enqueueLiveTranscriptChunk({
        sessionId: session.sessionId,
        chunkIndex: 0,
        data: new Uint8Array([1]),
        mimeType: "audio/webm",
        durationMs: 3000
      })
    ).rejects.toThrow("FFmpeg executable does not exist");
  });

  it("saves finalized transcript text when requested", async () => {
    mocks.transcribe.mockResolvedValue({ text: "", outputFiles: [] });
    const session = startLiveTranscriptSession({ model: "small", language: "en" });

    const result = await finishLiveTranscriptSession({
      sessionId: session.sessionId,
      finalText: "Final local transcript",
      saveTranscript: true
    });

    expect(result.text).toBe("Final local transcript");
    expect(result.outputFiles).toHaveLength(1);
    await expect(exists(result.outputFiles[0])).resolves.toBe(true);
  });

  it("cleans temporary session files on cancel", async () => {
    const session = startLiveTranscriptSession({ model: "small", language: "en" });
    const sessionRoot = path.join(mocks.root, "work", "live-transcripts", session.sessionId);
    await enqueueLiveTranscriptChunk({
      sessionId: session.sessionId,
      chunkIndex: 0,
      data: new Uint8Array([1]),
      mimeType: "audio/webm",
      durationMs: 8000
    }).catch(() => undefined);

    await cancelLiveTranscriptSession(session.sessionId);

    await expect(exists(path.join(sessionRoot, "chunks", "chunk-00000", "audio.webm"))).resolves.toBe(
      false
    );
  });
});

describe("validateLiveTranscriptText", () => {
  it("rejects Vietnamese subscription and outro boilerplate", () => {
    expect(
      validateLiveTranscriptText(
        "Hãy subscribe cho kênh Ghiền Mì Gõ Để không bỏ lỡ những video hấp dẫn",
        { durationMs: 3000, language: "vi" }
      )
    ).toMatchObject({ text: "", rejectionReason: "vietnamese-boilerplate" });
    expect(
      validateLiveTranscriptText("Hẹn gặp lại video này!", {
        durationMs: 3000,
        language: "vi"
      })
    ).toMatchObject({ text: "", rejectionReason: "vietnamese-boilerplate" });
  });

  it("rejects repeated phrase loops", () => {
    expect(
      validateLiveTranscriptText("tình yêu lệnh, tình yêu lệnh, tình yêu lệnh", {
        durationMs: 3000,
        language: "vi"
      })
    ).toMatchObject({ text: "", rejectionReason: "repetitive-text" });
  });

  it("rejects implausibly long text for a short live chunk", () => {
    expect(
      validateLiveTranscriptText(
        "Hôm nay chúng ta sẽ nói rất nhiều nội dung khác nhau trong một đoạn âm thanh cực kỳ ngắn nhưng kết quả này dài hơn nhiều so với khả năng nói tự nhiên.",
        { durationMs: 3000, language: "vi" }
      )
    ).toMatchObject({ text: "", rejectionReason: "implausibly-long" });
  });

  it("allows normal Vietnamese speech snippets", () => {
    expect(
      validateLiveTranscriptText("xin chào mọi người hôm nay mình họp nhanh", {
        durationMs: 3000,
        language: "vi"
      })
    ).toEqual({ text: "xin chào mọi người hôm nay mình họp nhanh" });
  });
});
