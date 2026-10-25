import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createMolecularVisualProjector, DeterministicProcessTimeline, ProcessLabUtils } from "../lib/processLab.ts";
import { REPLICATION_STRUCTURE } from "../lib/replicationStructure.ts";
import { TRANSCRIPTION_STRUCTURE } from "../lib/transcriptionStructure.ts";
import { getTranslationStructureReadout, RIBOSOME_STRUCTURE } from "../lib/translationStructure.ts";
import { getProcessAnimationState } from "../lib/processAnimation.ts";
import { createStructureCoordinateLoader } from "../lib/structureCoordinates.ts";
import { getProcessLabSequence, parseSequence } from "../lib/helix.ts";

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

  test("rapid repeated playback controls keep a single deterministic timeline state", () => {
    timeline.play();
    timeline.play();
    assert.strictEqual(timeline.getState().isPlaying, true);

    timeline.pause();
    timeline.pause();
    assert.strictEqual(timeline.getState().isPlaying, false);
    assert.strictEqual(timeline.getState().isPaused, true);

    timeline.resume();
    timeline.resume();
    assert.strictEqual(timeline.getState().isPlaying, true);
    timeline.reset();
    assert.strictEqual(timeline.getState().currentEventIndex, 0);
    assert.strictEqual(timeline.getState().isPlaying, false);
    assert.strictEqual(timeline.getState().isPaused, false);

    timeline.stepForward();
    timeline.stepBackward();
    assert.strictEqual(timeline.getState().currentEventIndex, 0);
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

describe("Process mode event selection", () => {
  const timeline = new DeterministicProcessTimeline({
    sequence: "ATGCGTACGTTAGCCATGCA",
    polymer: "DNA",
    speed: 1,
    autoPlay: false,
    frame: 0,
  });
  const events = timeline.getState().events;

  afterEach(() => {
    timeline.cleanup();
  });

  for (const mode of ["replication", "transcription", "translation"] as const) {
    test(`${mode} mode contains only its events`, () => {
      const visibleEvents = ProcessLabUtils.getEventsForMode(events, mode);
      assert.ok(visibleEvents.length > 0);
      assert.ok(visibleEvents.every(event => event.type.startsWith(`${mode}_`)));
      assert.ok(visibleEvents.every(event => events[event.index] === event));
    });
  }

  test("combined mode contains all events in their original order", () => {
    assert.deepStrictEqual(ProcessLabUtils.getEventsForMode(events, "combined"), events);
  });

  test("mode selection resolves to a valid preceding visible event", () => {
    const replicationEvents = ProcessLabUtils.getEventsForMode(events, "replication");
    const firstHiddenIndex = events.findIndex(event => event.type.startsWith("transcription_"));
    const selectedEvent = ProcessLabUtils.getCurrentEventForMode(replicationEvents, firstHiddenIndex);

    assert.strictEqual(selectedEvent?.index, replicationEvents[replicationEvents.length - 1].index);
    assert.strictEqual(ProcessLabUtils.getCurrentEventForMode(
      ProcessLabUtils.getEventsForMode(events, "translation"),
      0,
    ), null);
  });

  test("switching to a process selects its first event instead of a blank stage", () => {
    for (const mode of ["replication", "transcription", "translation"] as const) {
      const event = ProcessLabUtils.getFirstEventForMode(events, mode);
      assert.ok(event);
      assert.ok(event.type.startsWith(`${mode}_`));
      const visual = createMolecularVisualProjector(events, mode)(event.index, event.timestamp, 0);
      assert.strictEqual(visual?.process, mode);
    }
  });

  test("navigation can jump to a visible event without leaving an invalid index", () => {
    const translationEvents = ProcessLabUtils.getEventsForMode(events, "translation");
    const target = translationEvents[0];
    timeline.goToEvent(target.index);
    assert.strictEqual(timeline.getState().currentEventIndex, target.index);
    assert.strictEqual(timeline.getState().currentTime, target.timestamp);

    timeline.goToEvent(events.length);
    assert.strictEqual(timeline.getState().currentEventIndex, target.index);
  });
});

describe("Molecular stage event mapping", () => {
  test("replication structure metadata identifies the experimental CMG-DNA assembly", () => {
    assert.strictEqual(REPLICATION_STRUCTURE.id, "6XTX");
    assert.strictEqual(REPLICATION_STRUCTURE.assembly, "1");
    assert.strictEqual(REPLICATION_STRUCTURE.dnaAuthChain, "M");
    assert.deepStrictEqual(REPLICATION_STRUCTURE.mcmAuthChains, ["2", "3", "4", "5", "6", "7"]);
    assert.deepStrictEqual(REPLICATION_STRUCTURE.ginsAuthChains, ["A", "B", "C", "D"]);
    assert.strictEqual(REPLICATION_STRUCTURE.cdc45AuthChain, "E");
    assert.strictEqual(REPLICATION_STRUCTURE.resolution, "3.29 Å cryo-EM");
    assert.match(REPLICATION_STRUCTURE.url, /6XTX-assembly1\.cif$/);
    assert.match(REPLICATION_STRUCTURE.title, /CMG helicase.*DNA/);
  });

  test("transcription structure identifies resolved Pol II, bubble DNA, and nascent RNA chains", () => {
    assert.strictEqual(TRANSCRIPTION_STRUCTURE.id, "5C4X");
    assert.strictEqual(TRANSCRIPTION_STRUCTURE.rpb1AuthChain, "A");
    assert.strictEqual(TRANSCRIPTION_STRUCTURE.rpb2AuthChain, "B");
    assert.strictEqual(TRANSCRIPTION_STRUCTURE.nascentRnaAuthChain, "R");
    assert.strictEqual(TRANSCRIPTION_STRUCTURE.nonTemplateDnaAuthChain, "S");
    assert.strictEqual(TRANSCRIPTION_STRUCTURE.templateDnaAuthChain, "U");
    assert.strictEqual(TRANSCRIPTION_STRUCTURE.nascentRnaLength, 9);
    assert.strictEqual(TRANSCRIPTION_STRUCTURE.resolution, "4.0 Å X-ray diffraction");
  });

  test("translation structure overlay follows codon, peptide, and timeline progress", () => {
    const timeline = new DeterministicProcessTimeline({
      sequence: "AUGGCCUAA",
      polymer: "RNA",
      speed: 1,
      autoPlay: false,
      frame: 0,
    });
    try {
      const events = timeline.getState().events;
      const project = createMolecularVisualProjector(events, "translation");
      const first = events.find(event => event.type === "translation_progress");
      const second = events.find(event => event.type === "translation_progress" && event.state.translation?.peptides.length === 2);
      assert.ok(first);
      assert.ok(second);

      const firstVisual = project(first.index, first.timestamp, 0);
      const secondVisual = project(second.index, second.timestamp, 0);
      assert.ok(firstVisual);
      assert.ok(secondVisual);
      assert.deepStrictEqual(getTranslationStructureReadout(firstVisual), {
        progress: firstVisual.progress,
        codonNumber: 1,
        codon: "AUG",
        peptide: "M",
      });
      assert.deepStrictEqual(getTranslationStructureReadout(secondVisual), {
        progress: secondVisual.progress,
        codonNumber: 2,
        codon: "GCC",
        peptide: "MA",
      });
      const firstAction = getProcessAnimationState(firstVisual);
      const secondAction = getProcessAnimationState(secondVisual);
      assert.strictEqual(firstAction.activeCodon, "AUG");
      assert.strictEqual(firstAction.peptide, "M");
      assert.match(secondAction.actionLabel, /Codon 2/);
      assert.strictEqual(secondAction.activeCodon, "GCC");
      assert.strictEqual(secondAction.peptide, "MA");
      const completeEvent = events.find(event => event.type === "translation_complete");
      assert.ok(completeEvent);
      const completeVisual = project(completeEvent.index, completeEvent.timestamp, 0);
      assert.ok(completeVisual);
      const completeAction = getProcessAnimationState(completeVisual);
      assert.strictEqual(completeAction.activeCodon, completeVisual.codons.at(-1));
      assert.strictEqual(completeAction.actionLabel, "Translation complete");
      assert.strictEqual(RIBOSOME_STRUCTURE.id, "4V9D");
      assert.strictEqual(RIBOSOME_STRUCTURE.resolution, "3.0 Å X-ray diffraction");
    } finally {
      timeline.cleanup();
    }
  });

  test("replication maps fork progress and the growing complementary strand", () => {
    const timeline = new DeterministicProcessTimeline({
      sequence: "ATGCGTAC",
      polymer: "DNA",
      speed: 1,
      autoPlay: false,
    });
    try {
      const events = timeline.getState().events;
      const project = createMolecularVisualProjector(events, "replication");
      const initial = project(0, 0, 0);
      assert.strictEqual(initial?.process, "replication");
      assert.strictEqual(initial?.progress, 0);
      assert.strictEqual(initial?.primarySequence, "ATGCGTAC");
      assert.strictEqual(initial?.secondarySequence, "TACGCATG");

      timeline.stepForward();
      const state = timeline.getState();
      const progressing = project(state.currentEventIndex, state.currentTime, 0);
      assert.strictEqual(progressing?.process, "replication");
      assert.strictEqual(progressing?.progress, 1 / 3);
      assert.strictEqual(progressing?.actorPosition, 8 / 3);
      const action = getProcessAnimationState(progressing!);
      assert.strictEqual(action.actionLabel, "DNA unwinding");
      assert.strictEqual(action.synthesizedBases, 2);
      assert.strictEqual(action.product, "TA");
      assert.strictEqual(action.forkPosition, 1 / 3);
    } finally {
      timeline.cleanup();
    }
  });

  test("transcription maps polymerase position and the growing RNA product", () => {
    const timeline = new DeterministicProcessTimeline({
      sequence: "ATGCGTAC",
      polymer: "DNA",
      speed: 1,
      autoPlay: false,
    });
    try {
      const events = timeline.getState().events;
      const project = createMolecularVisualProjector(events, "transcription");
      const start = events.find(event => event.type === "transcription_start");
      assert.ok(start);
      const initial = project(start.index, start.timestamp, 0);
      assert.strictEqual(initial?.process, "transcription");
      assert.strictEqual(initial?.progress, 0);
      assert.strictEqual(initial?.primarySequence, "TACGCATG");
      assert.strictEqual(initial?.productSequence, "AUGCGUAC");

      const progress = events.find(event => event.type === "transcription_progress");
      assert.ok(progress);
      const growing = project(progress.index, progress.timestamp, 0);
      assert.strictEqual(growing?.progress, 1 / 3);
      assert.strictEqual(growing?.actorPosition, 8 / 3);
      const action = getProcessAnimationState(growing!);
      assert.strictEqual(action.actionLabel, "RNA elongation");
      assert.strictEqual(action.transcriptBases, 2);
      assert.strictEqual(action.product, "AU");
      const halfway = project(progress.index - 1, progress.timestamp - 1000, 0);
      assert.strictEqual(halfway?.progress, 1 / 6);
    } finally {
      timeline.cleanup();
    }
  });

  test("failed RCSB requests and rejected parse caches can be retried", async () => {
    let attempts = 0;
    const loadCoordinates = createStructureCoordinateLoader(async () => {
      attempts++;
      return attempts === 1
        ? new Response("unavailable", { status: 503 })
        : new Response("data_test\n_atom_site.", { status: 200 });
    });
    const url = "https://example.invalid/test.cif";

    await assert.rejects(loadCoordinates(url), /HTTP 503/);
    assert.strictEqual(await loadCoordinates(url), "data_test\n_atom_site.");
    assert.strictEqual(await loadCoordinates(url), "data_test\n_atom_site.");
    assert.strictEqual(attempts, 2);
    loadCoordinates.invalidate(url);
    assert.strictEqual(await loadCoordinates(url), "data_test\n_atom_site.");
    assert.strictEqual(attempts, 3);
  });

  test("translation maps reading-frame codon, ribosome position, and peptide", () => {
    const timeline = new DeterministicProcessTimeline({
      sequence: "AUGGCCUAA",
      polymer: "RNA",
      speed: 1,
      autoPlay: false,
      frame: 1,
    });
    try {
      const events = timeline.getState().events;
      const project = createMolecularVisualProjector(events, "translation");
      const firstCodon = events.find(event => event.type === "translation_progress");
      assert.ok(firstCodon);
      const visual = project(firstCodon.index, firstCodon.timestamp, 1);
      assert.strictEqual(visual?.process, "translation");
      assert.strictEqual(visual?.activeCodonStart, 1);
      assert.strictEqual(visual?.codons[0], "UGG");
      assert.strictEqual(visual?.productSequence, "W");
      const action = getProcessAnimationState(visual!);
      assert.strictEqual(action.activeCodon, "UGG");
      assert.strictEqual(action.activeCodonIndex, 0);
      assert.strictEqual(visual?.actorPosition, 1);
    } finally {
      timeline.cleanup();
    }
  });

  test("mode projection follows step, pause, and reset timeline state", async () => {
    const timeline = new DeterministicProcessTimeline({
      sequence: "ATGCGTAC",
      polymer: "DNA",
      speed: 1,
      autoPlay: false,
    });
    try {
      const state = timeline.getState();
      const project = createMolecularVisualProjector(state.events, "transcription");
      const transcriptionStart = state.events.find(event => event.type === "transcription_start");
      assert.ok(transcriptionStart);

      timeline.goToEvent(transcriptionStart.index);
      let current = timeline.getState();
      const stepped = project(current.currentEventIndex, current.currentTime, 0);
      assert.strictEqual(stepped?.event.index, transcriptionStart.index);
      assert.strictEqual(stepped?.progress, 0);

      timeline.play();
      await new Promise(resolve => setTimeout(resolve, 45));
      timeline.pause();
      current = timeline.getState();
      const paused = project(current.currentEventIndex, current.currentTime, 0);
      assert.strictEqual(current.isPaused, true);
      assert.ok(paused && paused.progress > 0, "playback advances molecular progress");
      await new Promise(resolve => setTimeout(resolve, 30));
      const stillPaused = timeline.getState();
      assert.strictEqual(stillPaused.currentTime, current.currentTime);
      assert.deepStrictEqual(
        project(stillPaused.currentEventIndex, stillPaused.currentTime, 0),
        paused,
        "a frozen timeline snapshot maps to a frozen molecular state",
      );

      timeline.resume();
      await new Promise(resolve => setTimeout(resolve, 40));
      timeline.pause();
      current = timeline.getState();
      const resumed = project(current.currentEventIndex, current.currentTime, 0);
      assert.ok(resumed && paused && resumed.progress > paused.progress, "resume continues molecular progress");

      timeline.reset();
      current = timeline.getState();
      assert.strictEqual(current.currentEventIndex, 0);
      assert.strictEqual(project(current.currentEventIndex, current.currentTime, 0), null);
    } finally {
      timeline.cleanup();
    }
  });
});

describe("Process sequence updates", () => {
  test("a new sequence updates generated events and resets the timeline", () => {
    const timeline = new DeterministicProcessTimeline({
      sequence: "ATGCGTACGTTAGCCATGCA",
      polymer: "DNA",
      speed: 1,
      autoPlay: false,
      frame: 0,
    });
    try {
      timeline.stepForward();
      timeline.play();
      assert.strictEqual(timeline.getState().isPlaying, true);

      const nextSequence = parseSequence("> Updated DNA\nGAT TACA", "DNA").sequence;
      assert.strictEqual(nextSequence, "GATTACA");
      timeline.updateConfig({ sequence: nextSequence });

      const state = timeline.getState();
      assert.strictEqual(state.events[0].state.replication?.parental, nextSequence);
      assert.strictEqual(state.currentEventIndex, 0);
      assert.strictEqual(state.currentTime, 0);
      assert.strictEqual(state.isPlaying, false);
      assert.strictEqual(state.isPaused, false);
      assert.strictEqual(timeline.getCurrentEvent()?.index, 0);
    } finally {
      timeline.cleanup();
    }
  });
});

describe("Biological sequence and translation rules", () => {
  test("only canonical DNA sequences are passed from the helix lab to ProcessLab", () => {
    const dna = parseSequence("> DNA\nATGCGT", "DNA");
    assert.strictEqual(getProcessLabSequence(dna, "DNA"), "ATGCGT");

    const ambiguousDna = parseSequence("ATGN", "DNA");
    assert.strictEqual(getProcessLabSequence(ambiguousDna, "DNA"), null);
    assert.strictEqual(getProcessLabSequence(parseSequence("ATGX", "DNA"), "DNA"), null);
    assert.strictEqual(getProcessLabSequence(parseSequence("AUGC", "RNA"), "RNA"), null);
  });

  test("DNA replication/transcription reject RNA bases; RNA supports translation only", () => {
    assert.strictEqual(ProcessLabUtils.validateSequence("ATGC", "DNA").valid, true);
    assert.strictEqual(ProcessLabUtils.validateSequence("AUGC", "DNA").valid, false);
    assert.strictEqual(ProcessLabUtils.validateSequence("AUGC", "RNA").valid, true);
    assert.strictEqual(ProcessLabUtils.validateSequence("ATGC", "RNA").valid, false);
    assert.ok(ProcessLabUtils.validateSequence("AUGX", "RNA").errors[0].includes("X"));

    const rnaTimeline = new DeterministicProcessTimeline({
      sequence: "AUGGCC",
      polymer: "RNA",
      speed: 1,
      autoPlay: false,
      frame: 0,
    });
    try {
      const events = rnaTimeline.getState().events;
      assert.ok(events.length > 0);
      assert.ok(events.every(event => event.type.startsWith("translation_")));
      assert.ok(events.every(event => !event.state.replication && !event.state.transcription));
    } finally {
      rnaTimeline.cleanup();
    }

    const dnaTimeline = new DeterministicProcessTimeline({
      sequence: "ATGC",
      polymer: "DNA",
      speed: 1,
      autoPlay: false,
      frame: 0,
    });
    try {
      const events = dnaTimeline.getState().events;
      assert.ok(events.some(event => event.type === "replication_complete"));
      assert.ok(events.some(event => event.type === "transcription_complete"));
      assert.ok(events.some(event => event.type === "translation_complete"));
      const transcribedRna = events.find(event => event.type === "transcription_complete")?.state.transcription?.rna;
      assert.ok(transcribedRna && /^[ACGU]+$/.test(transcribedRna));
    } finally {
      dnaTimeline.cleanup();
    }
  });

  test("reading frames apply offsets and ignore incomplete trailing codons", () => {
    const frames = ProcessLabUtils.getReadingFrames("AUGGCCUAA");
    assert.deepStrictEqual(frames.map(({ codons, peptide }) => ({ codons, peptide })), [
      { codons: ["AUG", "GCC", "UAA"], peptide: "MA" },
      { codons: ["UGG", "CCU"], peptide: "WP" },
      { codons: ["GGC", "CUA"], peptide: "GL" },
    ]);

    const timeline = new DeterministicProcessTimeline({
      sequence: "AUGGCCUAA",
      polymer: "RNA",
      speed: 1,
      autoPlay: false,
      frame: 1,
    });
    try {
      const events = timeline.getState().events;
      const start = events.find(event => event.type === "translation_start");
      const complete = events.find(event => event.type === "translation_complete");
      assert.strictEqual(start?.state.translation?.ribosomePosition, 1);
      assert.deepStrictEqual(complete?.state.translation?.codons, ["UGG", "CCU"]);
      assert.strictEqual(complete?.state.translation?.peptides.join(""), "WP");
      assert.strictEqual(complete?.state.translation?.ribosomePosition, 7);
    } finally {
      timeline.cleanup();
    }
  });

  test("all standard stop codons terminate translation without entering the peptide", () => {
    for (const stopCodon of ["UAA", "UAG", "UGA"]) {
      const timeline = new DeterministicProcessTimeline({
        sequence: `AUG${stopCodon}UGG`,
        polymer: "RNA",
        speed: 1,
        autoPlay: false,
        frame: 0,
      });
      try {
        const events = timeline.getState().events;
        const progress = events.filter(event => event.type === "translation_progress");
        const complete = events.find(event => event.type === "translation_complete");
        assert.strictEqual(progress.length, 2);
        assert.deepStrictEqual(complete?.state.translation?.codons, ["AUG", stopCodon]);
        assert.strictEqual(complete?.state.translation?.peptides.join(""), "M");
        assert.ok(complete?.explanation.includes("terminated at stop codon"));
      } finally {
        timeline.cleanup();
      }
    }
  });

  test("invalid alphabets and reading frames do not generate process events", () => {
    assert.strictEqual(ProcessLabUtils.validateSequence("ATGX", "DNA").valid, false);
    assert.strictEqual(ProcessLabUtils.validateSequence("AUGX", "RNA").valid, false);
    assert.strictEqual(ProcessLabUtils.validateSequence("AUG", "RNA", 3).valid, false);

    const timeline = new DeterministicProcessTimeline({
      sequence: "ATGX",
      polymer: "DNA",
      speed: 1,
      autoPlay: false,
      frame: 0,
    });
    try {
      assert.deepStrictEqual(timeline.getState().events, []);
      assert.strictEqual(timeline.getCurrentEvent(), null);
      timeline.play();
      assert.strictEqual(timeline.getState().isPlaying, false);
    } finally {
      timeline.cleanup();
    }
  });

  test("changing only the polymer regenerates events for the new molecule type", () => {
    const timeline = new DeterministicProcessTimeline({
      sequence: "ACG",
      polymer: "DNA",
      speed: 1,
      autoPlay: false,
      frame: 0,
    });
    try {
      assert.ok(timeline.getState().events.some(event => event.type === "replication_start"));
      timeline.updateConfig({ polymer: "RNA" });
      const events = timeline.getState().events;
      assert.ok(events.some(event => event.type === "translation_start"));
      assert.ok(events.every(event => event.type.startsWith("translation_")));
    } finally {
      timeline.cleanup();
    }
  });
});
