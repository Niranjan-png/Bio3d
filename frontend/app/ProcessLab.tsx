"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Polymer } from "../lib/helix";
import DeterministicProcessTimeline, { type ProcessLabMode, ProcessLabUtils } from "../lib/processLab";

interface ProcessLabProps {
  readonly sequence: string;
  readonly polymer: Polymer;
  readonly initialMode?: ProcessLabMode;
  readonly initialFrame?: number;
  readonly className?: string;
}

export default function ProcessLab({ 
  sequence, 
  polymer, 
  initialMode = "combined",
  initialFrame = 0,
  className = ""
}: ProcessLabProps) {
  const [mode, setMode] = useState<ProcessLabMode>(initialMode);
  const [timeline, setTimeline] = useState<DeterministicProcessTimeline | null>(null);
  const [config, setConfig] = useState({
    sequence,
    polymer,
    frame: initialFrame,
    speed: 1,
    autoPlay: false,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedFrame, setSelectedFrame] = useState(initialFrame);
  const [speed, setSpeed] = useState(1);

  const timelineRef = useRef<DeterministicProcessTimeline | null>(null);
  const validation = ProcessLabUtils.validateSequence(sequence, polymer, selectedFrame);
  const activeMode = polymer === "RNA" && (mode === "replication" || mode === "transcription")
    ? "translation"
    : mode;

  // Initialize timeline and subscribe to state changes
  useEffect(() => {
    const newTimeline = new DeterministicProcessTimeline(config);
    setTimeline(newTimeline);
    timelineRef.current = newTimeline;
    
    const unsubscribe = newTimeline.subscribe((state) => {
      setCurrentEventIndex(state.currentEventIndex);
      setCurrentTime(state.currentTime);
      setIsPlaying(state.isPlaying);
      setIsPaused(state.isPaused);
      setSpeed(state.speed);
      setSelectedFrame(state.selectedFrame);
    });

    return () => {
      unsubscribe();
      newTimeline.cleanup();
    };
  }, []);

  // Sync config when props change
  useEffect(() => {
    setConfig(prev => ({ ...prev, sequence, polymer }));
  }, [sequence, polymer]);

  // Update timeline when config changes
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.updateConfig(config);
    }
  }, [config]);

  const handlePlay = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.play();
    }
  }, []);

  const handlePause = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.pause();
    }
  }, []);

  const handleResume = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.resume();
    }
  }, []);

  const handleReset = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.reset();
    }
  }, []);

  const handleStepForward = useCallback(() => {
    const currentTimeline = timelineRef.current;
    if (!currentTimeline) return;
    const state = currentTimeline.getState();
    const visibleEvents = ProcessLabUtils.getEventsForMode(state.events, activeMode);
    const currentEvent = ProcessLabUtils.getCurrentEventForMode(visibleEvents, state.currentEventIndex);
    const currentVisibleIndex = currentEvent ? visibleEvents.findIndex(event => event.index === currentEvent.index) : -1;
    const nextEvent = visibleEvents[currentVisibleIndex + 1];
    if (nextEvent) currentTimeline.goToEvent(nextEvent.index);
  }, [activeMode]);

  const handleStepBackward = useCallback(() => {
    const currentTimeline = timelineRef.current;
    if (!currentTimeline) return;
    const state = currentTimeline.getState();
    const visibleEvents = ProcessLabUtils.getEventsForMode(state.events, activeMode);
    const currentEvent = ProcessLabUtils.getCurrentEventForMode(visibleEvents, state.currentEventIndex);
    const currentVisibleIndex = currentEvent ? visibleEvents.findIndex(event => event.index === currentEvent.index) : -1;
    const previousEvent = visibleEvents[currentVisibleIndex - 1];
    if (previousEvent) currentTimeline.goToEvent(previousEvent.index);
  }, [activeMode]);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    if (timelineRef.current) {
      timelineRef.current.setSpeed(newSpeed);
    }
  }, []);

  const handleFrameChange = useCallback((frame: number) => {
    setSelectedFrame(frame);
    setConfig(prev => ({ ...prev, frame }));
    if (timelineRef.current) {
      timelineRef.current.setFrame(frame);
    }
  }, []);

  const allEvents = timeline?.getState().events ?? [];
  const visibleEvents = ProcessLabUtils.getEventsForMode(allEvents, activeMode);
  const currentEvent = ProcessLabUtils.getCurrentEventForMode(visibleEvents, currentEventIndex);
  const currentVisibleIndex = currentEvent ? visibleEvents.findIndex(event => event.index === currentEvent.index) : -1;
  const processSummary = ProcessLabUtils.getProcessSummary(visibleEvents);

  return (
    <section className={`process-lab ${className}`} aria-labelledby="process-lab-heading">
      <div className="lab-header">
        <div>
          <p className="eyebrow">Milestone 4 · Educational process lab</p>
          <h2 id="process-lab-heading">DNA Replication, Transcription & Translation</h2>
          <p className="educational-note">
            <strong>Educational simplified mechanistic illustrations</strong> — NOT atomistic physical simulations/MD.
            Shows deterministic, step-by-step molecular processes with documented simplifications and conventions.
          </p>
        </div>
        <a href="#dna-lab" className="back-link">Back to DNA helix viewer ↑</a>
      </div>

      <div className="process-lab-grid">
        <aside className="process-controls">
          <div className="control-section">
            <h3>Process Controls</h3>
            <div className="button-group">
              <button 
                onClick={handlePlay}
                disabled={!validation.valid || isPlaying}
                className="primary"
              >
                Play
              </button>
              <button 
                onClick={handlePause}
                disabled={!isPlaying}
              >
                Pause
              </button>
              <button 
                onClick={handleResume}
                disabled={!isPaused}
              >
                Resume
              </button>
              <button 
                onClick={handleReset}
                disabled={!isPlaying && !isPaused && currentEventIndex === 0}
              >
                Reset
              </button>
            </div>
            <div className="navigation-buttons">
              <button 
                onClick={handleStepBackward}
                disabled={currentVisibleIndex <= 0 || isPlaying}
              >
                Step Back
              </button>
              <button 
                onClick={handleStepForward}
                disabled={currentVisibleIndex >= visibleEvents.length - 1 || isPlaying}
              >
                Step Forward
              </button>
            </div>
          </div>

          <div className="control-section">
            <h3>Speed Control</h3>
            <div className="speed-slider">
              <label>Animation Speed: {speed.toFixed(1)}×</label>
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.1"
                value={speed}
                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                disabled={!validation.valid}
              />
            </div>
          </div>

          <div className="control-section">
            <h3>Reading Frame</h3>
            <div className="frame-selector">
              {[0, 1, 2].map(frame => (
                <button
                  key={frame}
                  onClick={() => handleFrameChange(frame)}
                  className={selectedFrame === frame ? "active" : ""}
                  disabled={!validation.valid}
                >
                  Frame {frame}
                </button>
              ))}
            </div>
            <p className="frame-help">
              Reading frame sets the starting offset (0, 1, or 2); start-codon recognition is not modeled.
            </p>
          </div>

          <div className="control-section">
            <h3>Process View</h3>
            <div className="mode-selector">
              {(
                [
                  ["replication", "Replication"],
                  ["transcription", "Transcription"],
                  ["translation", "Translation"],
                  ["combined", "Combined"],
                ] as const
              ).map(([modeValue, label]) => (
                <button
                  key={modeValue}
                  onClick={() => setMode(modeValue)}
                  className={activeMode === modeValue ? "active" : ""}
                  disabled={polymer === "RNA" && (modeValue === "replication" || modeValue === "transcription")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="validation-section">
            {!validation.valid && (
              <div className="validation-error">
                <strong>Validation errors:</strong> {validation.errors.join(", ")}
              </div>
            )}
            {validation.valid && polymer === "RNA" && (
              <div className="sequence-info">
                RNA is treated as 5′→3′ mRNA for translation only; DNA replication and transcription are unavailable.
              </div>
            )}
            {validation.valid && (
              <div className="sequence-info">
                <p><strong>Sequence:</strong> {sequence}</p>
                <p><strong>Length:</strong> {sequence.length} bases</p>
                <p><strong>Polymer:</strong> {polymer}</p>
              </div>
            )}
          </div>
        </aside>

        <main className="process-display">
          <div className="event-timeline">
            <h3>Event Timeline</h3>
            <div className="timeline-container">
              {visibleEvents.map((event, index) => (
                <div
                  key={event.index}
                  className={`timeline-event ${event.index === currentEvent?.index ? "active" : ""} ${event.type}`}
                >
                  <div className="event-marker">
                    <span className="event-index">{index + 1}</span>
                    <span className="event-type">{event.type.replace("_", " ")}</span>
                  </div>
                  <div className="event-content">
                    <div className="event-explanation">{event.explanation}</div>
                    {event.state.replication && (
                      <div className="event-details replication">
                        <p>Parental: {event.state.replication.parental}</p>
                        <p>New: {event.state.replication.new}</p>
                        <p>Progress: {(event.state.replication.progress * 100).toFixed(0)}%</p>
                      </div>
                    )}
                    {event.state.transcription && (
                      <div className="event-details transcription">
                        <p>Template: {event.state.transcription.template}</p>
                        <p>RNA: {event.state.transcription.rna}</p>
                        <p>Progress: {(event.state.transcription.progress * 100).toFixed(0)}%</p>
                      </div>
                    )}
                    {event.state.translation && (
                      <div className="event-details translation">
                        <p>mRNA: {event.state.translation.mrna}</p>
                        <p>Peptides: {event.state.translation.peptides.join("")}</p>
                        <p>Ribosome: {event.state.translation.ribosomePosition}</p>
                        <p>Progress: {(event.state.translation.progress * 100).toFixed(0)}%</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="current-event-display">
            <h3>Current Event</h3>
            {currentEvent ? (
              <div className="event-card">
                <div className="event-header">
                  <span className="event-type-badge">{currentEvent.type}</span>
                  <span className="event-timestamp">{ProcessLabUtils.formatTime(currentEvent.timestamp)}</span>
                </div>
                <div className="event-body">
                  <p className="event-explanation-main">{currentEvent.explanation}</p>
                  {currentEvent.state.replication && (
                    <div className="biological-process replication">
                      <h4>DNA Replication</h4>
                      <p><strong>Parental strand:</strong> {currentEvent.state.replication.parental}</p>
                      <p><strong>New complementary strand:</strong> {currentEvent.state.replication.new}</p>
                      <p><strong>Synthesis progress:</strong> {(currentEvent.state.replication.progress * 100).toFixed(0)}%</p>
                    </div>
                  )}
                  {currentEvent.state.transcription && (
                    <div className="biological-process transcription">
                      <h4>Transcription</h4>
                      <p><strong>DNA template:</strong> {currentEvent.state.transcription.template}</p>
                      <p><strong>mRNA product:</strong> {currentEvent.state.transcription.rna}</p>
                      <p><strong>RNA polymerase progress:</strong> {(currentEvent.state.transcription.progress * 100).toFixed(0)}%</p>
                    </div>
                  )}
                  {currentEvent.state.translation && (
                    <div className="biological-process translation">
                      <h4>Translation</h4>
                      <p><strong>mRNA:</strong> {currentEvent.state.translation.mrna}</p>
                      <p><strong>Current peptide:</strong> {currentEvent.state.translation.peptides.join("")}</p>
                      <p><strong>Ribosome position:</strong> {currentEvent.state.translation.ribosomePosition}</p>
                      <p><strong>Translation progress:</strong> {(currentEvent.state.translation.progress * 100).toFixed(0)}%</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="no-event">
                <p>{!validation.valid ? "Correct the sequence or reading frame to generate process events." : visibleEvents.length ? "No event in this mode has occurred yet." : "No events available for this mode."}</p>
              </div>
            )}
          </div>

          {processSummary && (
            <div className="process-summary">
              <h3>Process Summary</h3>
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="label">Replication:</span>
                  <span className={`status ${processSummary.replicationComplete ? "complete" : "incomplete"}`}>
                    {processSummary.replicationComplete ? "✓ Complete" : "✗ Incomplete"}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">Transcription:</span>
                  <span className={`status ${processSummary.transcriptionComplete ? "complete" : "incomplete"}`}>
                    {processSummary.transcriptionComplete ? "✓ Complete" : "✗ Incomplete"}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">Translation:</span>
                  <span className={`status ${processSummary.translationComplete ? "complete" : "incomplete"}`}>
                    {processSummary.translationComplete ? "✓ Complete" : "✗ Incomplete"}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">Final peptide:</span>
                  <span className="peptide">{processSummary.finalPeptide || "(none)"}</span>
                </div>
                <div className="summary-item">
                  <span className="label">Total events:</span>
                  <span>{processSummary.totalEvents}</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <div className="conventions-note">
        <h4>Conventions & Limitations</h4>
        <ul>
          <li><strong>Simplified mechanics:</strong> Shows idealized processes without molecular crowding, enzyme kinetics, or cellular context.</li>
          <li><strong>Strand convention:</strong> The supplied DNA strand is treated as parental; its new complement is the transcription template. RNA input is treated as 5′→3′ mRNA.</li>
          <li><strong>Deterministic timeline:</strong> Each step occurs at fixed intervals for educational clarity.</li>
          <li><strong>Reading frames:</strong> Translation starts at the selected offset; incomplete trailing codons are ignored and start-codon recognition is not modeled.</li>
          <li><strong>Stop codons:</strong> The first standard stop codon terminates translation and is not included in the peptide.</li>
          <li><strong>Sequence limits:</strong> Maximum 10,000 bases; longer sequences are rejected.</li>
          <li><strong>Base pairing:</strong> Standard Watson-Crick pairing (A-T/U, C-G) with no wobble or modified bases.</li>
        </ul>
      </div>
    </section>
  );
}