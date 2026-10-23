"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Polymer } from "../lib/helix";
import DeterministicProcessTimeline, { type TimelineEvent, ProcessLabUtils } from "../lib/processLab";

type ProcessLabMode = "replication" | "transcription" | "translation" | "combined";

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
  const [validation, setValidation] = useState({ valid: true, errors: [] as string[] });

  const timelineRef = useRef<DeterministicProcessTimeline | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Initialize timeline
  useEffect(() => {
    const newTimeline = new DeterministicProcessTimeline(config);
    setTimeline(newTimeline);
    timelineRef.current = newTimeline;
    
    return () => {
      if (timelineRef.current) {
        timelineRef.current.cleanup();
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Update validation
  useEffect(() => {
    setValidation(ProcessLabUtils.validateSequence(sequence, polymer));
  }, [sequence, polymer]);

  // Update timeline when config changes
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.updateConfig(config);
    }
  }, [config]);

  // Animation loop
  const animate = useCallback((timestamp: number) => {
    if (!timelineRef.current || !isPlaying || isPaused) {
      animationFrameRef.current = requestAnimationFrame(animate);
      return;
    }

    const deltaTime = (timestamp - lastUpdateRef.current) * speed;
    lastUpdateRef.current = timestamp;

    const state = timelineRef.current.getState();
    let nextEventIndex = state.currentEventIndex;
    let nextTime = state.currentTime + deltaTime;

    // Find next event to advance to
    while (nextEventIndex < state.events.length - 1 && 
           nextTime >= state.events[nextEventIndex + 1].timestamp) {
      nextEventIndex++;
    }

    if (nextEventIndex !== state.currentEventIndex) {
      setCurrentEventIndex(nextEventIndex);
      setCurrentTime(nextTime);
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isPlaying, isPaused, speed]);

  // Start/stop animation
  useEffect(() => {
    if (isPlaying && !isPaused) {
      lastUpdateRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animate);
    } else if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isPaused, animate]);

  // Update timeline state from ref
  useEffect(() => {
    if (timelineRef.current) {
      const state = timelineRef.current.getState();
      setCurrentEventIndex(state.currentEventIndex);
      setCurrentTime(state.currentTime);
      setIsPlaying(state.isPlaying);
      setIsPaused(state.isPaused);
      setSpeed(state.speed);
      setSelectedFrame(state.selectedFrame);
    }
  }, [timeline]);

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
    if (timelineRef.current) {
      timelineRef.current.stepForward();
    }
  }, []);

  const handleStepBackward = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.stepBackward();
    }
  }, []);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    if (timelineRef.current) {
      timelineRef.current.setSpeed(newSpeed);
    }
  }, []);

  const handleFrameChange = useCallback((frame: number) => {
    setSelectedFrame(frame);
    setConfig(prev => ({ ...prev, frame }));
  }, []);

  const currentEvent = timeline?.getState().events[currentEventIndex];
  const processSummary = currentEvent ? ProcessLabUtils.getProcessSummary([...timeline.getState().events]) : null;

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
                disabled={isPlaying || isPaused}
              >
                Reset
              </button>
            </div>
            <div className="navigation-buttons">
              <button 
                onClick={handleStepBackward}
                disabled={currentEventIndex === 0}
              >
                Step Back
              </button>
              <button 
                onClick={handleStepForward}
                disabled={currentEventIndex >= (timeline?.getState().events.length ?? 0) - 1}
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
              Reading frame determines where translation starts (0, 1, or 2 bases offset).
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
                  className={mode === modeValue ? "active" : ""}
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
              {timeline?.getState().events.map((event, index) => (
                <div
                  key={event.index}
                  className={`timeline-event ${index === currentEventIndex ? "active" : ""} ${event.type}`}
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
                <p>No event selected. Start the process to begin.</p>
              </div>
            )}
          </div>

          {processSummary && (
            <div className="process-summary">
              <h3>Process Summary</h3>
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="label">Replication:</span>
                  <span className={`status ${processSummary.replicationComplete ? "complete" : "incomplete"}`">
                    {processSummary.replicationComplete ? "✓ Complete" : "✗ Incomplete"}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">Transcription:</span>
                  <span className={`status ${processSummary.transcriptionComplete ? "complete" : "incomplete"}`">
                    {processSummary.transcriptionComplete ? "✓ Complete" : "✗ Incomplete"}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">Translation:</span>
                  <span className={`status ${processSummary.translationComplete ? "complete" : "incomplete"}`">
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
          <li><strong>Deterministic timeline:</strong> Each step occurs at fixed intervals for educational clarity.</li>
          <li><strong>Reading frames:</strong> Translation starts at specified frame; incomplete codons at end are ignored.</li>
          <li><strong>Stop codons:</strong> Translation terminates at first stop codon encountered.</li>
          <li><strong>Sequence limits:</strong> Maximum 10,000 bases; longer sequences are truncated for performance.</li>
          <li><strong>Base pairing:</strong> Standard Watson-Crick pairing (A-T/U, C-G) with no wobble or modified bases.</li>
        </ul>
      </div>
    </section>
  );
}