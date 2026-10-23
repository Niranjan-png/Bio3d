import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { DeterministicProcessTimeline } from "../lib/processLab.ts";

describe("DeterministicProcessTimeline Playback Controls", () => {
  const sampleSequence = "ATGCGTACGTTAGCCATGCA";
  let timeline: DeterministicProcessTimeline;

  beforeEach(() => {
    timeline = new DeterministicProcessTimeline({
      sequence: sampleSequence,
      polymer: "DNA",
      speed: 1,
      autoPlay: false,
      frame: 0,
    });
  });

  afterEach(() => {
    timeline.cleanup();
  });

  test("initial state has valid events and index 0", () => {
    const state = timeline.getState();
    assert.strictEqual(state.currentEventIndex, 0);
    assert.strictEqual(state.isPlaying, false);
    assert.strictEqual(state.isPaused, false);
    assert.ok(state.events.length > 5, "Events should be generated");

    // Timestamps must be strictly monotonically increasing
    for (let i = 1; i < state.events.length; i++) {
      assert.ok(
        state.events[i].timestamp > state.events[i - 1].timestamp,
        `Event ${i} timestamp (${state.events[i].timestamp}) must be > event ${i - 1} timestamp (${state.events[i - 1].timestamp})`
      );
    }
  });

  test("Step Forward advances event index and updates currentTime", () => {
    timeline.stepForward();
    let state = timeline.getState();
    assert.strictEqual(state.currentEventIndex, 1);
    assert.strictEqual(state.currentTime, state.events[1].timestamp);

    timeline.stepForward();
    state = timeline.getState();
    assert.strictEqual(state.currentEventIndex, 2);
    assert.strictEqual(state.currentTime, state.events[2].timestamp);
  });

  test("Step Back moves to previous event", () => {
    timeline.stepForward();
    timeline.stepForward();
    assert.strictEqual(timeline.getState().currentEventIndex, 2);

    timeline.stepBackward();
    const state = timeline.getState();
    assert.strictEqual(state.currentEventIndex, 1);
    assert.strictEqual(state.currentTime, state.events[1].timestamp);

    timeline.stepBackward();
    assert.strictEqual(timeline.getState().currentEventIndex, 0);

    // Cannot step back before index 0
    timeline.stepBackward();
    assert.strictEqual(timeline.getState().currentEventIndex, 0);
  });

  test("Play, Pause, and Resume change playback states", () => {
    timeline.play();
    let state = timeline.getState();
    assert.strictEqual(state.isPlaying, true);
    assert.strictEqual(state.isPaused, false);

    timeline.pause();
    state = timeline.getState();
    assert.strictEqual(state.isPlaying, false);
    assert.strictEqual(state.isPaused, true);

    timeline.resume();
    state = timeline.getState();
    assert.strictEqual(state.isPlaying, true);
    assert.strictEqual(state.isPaused, false);
  });

  test("Reset returns to the initial event and stops playback", () => {
    timeline.stepForward();
    timeline.stepForward();
    timeline.play();
    assert.strictEqual(timeline.getState().isPlaying, true);
    assert.strictEqual(timeline.getState().currentEventIndex, 2);

    timeline.reset();
    const state = timeline.getState();
    assert.strictEqual(state.currentEventIndex, 0);
    assert.strictEqual(state.currentTime, 0);
    assert.strictEqual(state.isPlaying, false);
    assert.strictEqual(state.isPaused, false);
  });

  test("Subscription triggers on state changes", () => {
    const states: number[] = [];
    const unsubscribe = timeline.subscribe((state) => {
      states.push(state.currentEventIndex);
    });

    // Initial subscribe pushes initial index 0
    assert.deepStrictEqual(states, [0]);

    timeline.stepForward();
    assert.deepStrictEqual(states, [0, 1]);

    timeline.stepForward();
    assert.deepStrictEqual(states, [0, 1, 2]);

    timeline.stepBackward();
    assert.deepStrictEqual(states, [0, 1, 2, 1]);

    timeline.reset();
    assert.deepStrictEqual(states, [0, 1, 2, 1, 0]);

    unsubscribe();
    timeline.stepForward();
    // After unsubscribe, no new pushes
    assert.deepStrictEqual(states, [0, 1, 2, 1, 0]);
  });

  test("Playback stops safely at the end of the timeline", async () => {
    // Jump near the end of the events
    const state = timeline.getState();
    const lastIndex = state.events.length - 1;

    // Advance to one before the end
    for (let i = 0; i < lastIndex - 1; i++) {
      timeline.stepForward();
    }
    assert.strictEqual(timeline.getState().currentEventIndex, lastIndex - 1);

    // Set speed high so it completes rapidly
    timeline.setSpeed(5);
    timeline.play();
    assert.strictEqual(timeline.getState().isPlaying, true);

    // Wait for the animation loop to reach the end
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const current = timeline.getState();
        if (!current.isPlaying && current.currentEventIndex === lastIndex) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);

      // Failsafe timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });

    const finalState = timeline.getState();
    assert.strictEqual(finalState.currentEventIndex, lastIndex);
    assert.strictEqual(finalState.isPlaying, false);
    assert.strictEqual(finalState.isPaused, false);
  });
});
