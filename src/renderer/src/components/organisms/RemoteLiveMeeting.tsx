import { useEffect, useRef, useState } from "react";
import type { LiveConnectionEvent, LiveMeetingStatus } from "../../../../shared/apiTypes";
import { Button } from "../atoms/Button";

const INITIAL: LiveMeetingStatus = { state: "stopped", meetingId: null, message: "Ready." };

export function RemoteLiveMeeting() {
  const [status, setStatus] = useState(INITIAL);
  const [partial, setPartial] = useState("");
  const [turns, setTurns] = useState<Extract<LiveConnectionEvent, { type: "turn_final" }>[] >([]);
  const timer = useRef<number | null>(null);

  function stopDevSource() {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }

  useEffect(() => {
    window.localStudio.liveMeeting.getStatus().then(setStatus).catch(() => undefined);
    const unsubscribe = window.localStudio.liveMeeting.onEvent((payload) => {
      if (payload.type === "status") { setStatus(payload.status); return; }
      const event = payload.event;
      if (event.type === "partial") setPartial(event.text);
      if (event.type === "turn_final") {
        setPartial("");
        setTurns((current) => [...current, event]);
      }
      if (event.type === "session_closed") stopDevSource();
      if (event.type === "error") stopDevSource();
    });
    return () => { unsubscribe(); stopDevSource(); };
  }, []);

  async function start() {
    setPartial("");
    setTurns([]);
    const next = await window.localStudio.liveMeeting.startRemoteEnglishMeeting();
    setStatus(next);
    if (next.state !== "recording") return;
    // Development-only source: 250 ms of silent 16 kHz mono signed 16-bit PCM.
    timer.current = window.setInterval(() => {
      window.localStudio.liveMeeting.sendAudioChunk(new Uint8Array(8_000)).catch(() => {
        stopDevSource();
      });
    }, 250);
  }

  async function stop() {
    stopDevSource();
    setStatus(await window.localStudio.liveMeeting.stop());
  }

  const active = ["connecting", "connected", "recording", "stopping"].includes(status.state);
  return (
    <section className="remote-live" aria-labelledby="remote-live-title">
      <div className="remote-live__heading">
        <div>
          <p className="eyebrow">Remote processing</p>
          <h2 id="remote-live-title">Remote English Live Meeting</h2>
        </div>
        <span className={`remote-live__status remote-live__status--${status.state}`}>{status.state.replace("_", " ")}</span>
      </div>
      <p className="remote-live__notice">Development audio source — streams silent PCM through the real authenticated WebSocket. Microphone PCM capture is pending.</p>
      <div className="remote-live__actions">
        <Button onClick={() => void start()} disabled={active}>Start remote live</Button>
        <Button variant="danger" onClick={() => void stop()} disabled={!active || status.state === "stopping"}>Stop remote live</Button>
      </div>
      <p className={status.state === "error" ? "remote-live__error" : "remote-live__message"} role="status">{status.message}</p>
      <div className="remote-live__transcripts">
        <div><strong>Partial (not saved)</strong><p>{partial || "Waiting for speech…"}</p></div>
        <div><strong>Final speaker turns (saved locally)</strong>
          {turns.length ? <ol>{turns.map((turn) => <li key={turn.turnId}><b>{turn.speaker}</b> {turn.text}</li>)}</ol> : <p>No finalized turns yet.</p>}
        </div>
      </div>
    </section>
  );
}
