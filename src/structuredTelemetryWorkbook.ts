import type {
  AIPredictionRecord,
  AppPlayerRecord,
  GameSession,
  MatchRecord,
  PlayerProfile,
  RoundRecord,
  UIEventRecord,
} from "./telemetry";

export interface StructuredTelemetryWorkbookInput {
  appPlayers: AppPlayerRecord[];
  profiles: PlayerProfile[];
  sessions: GameSession[];
  matches: MatchRecord[];
  rounds: RoundRecord[];
  predictions: AIPredictionRecord[];
  events: UIEventRecord[];
}

interface TableColumn {
  header: string;
  width: number;
  numFmt?: string;
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
}

interface ProfileWorkbookRow {
  playerName: string;
  playerId: string;
  profileName: string;
  profileId: string | null;
  grade: string;
  school: string | null;
  priorExperience: string | null;
  createdAt: string | null;
  trained: boolean;
  trainingCount: number;
  predictorDefault: boolean;
  preferredBestOf: number | null;
  preferredDifficulty: string | null;
  baseName: string | null;
  version: number | null;
  matchesTotal: number;
  trainingMatches: number;
  challengeMatches: number;
  completedMatches: number;
  rounds: number;
  predictions: number;
  events: number;
  lastActivity: string | null;
  dataSource: string;
}

interface PlayerBreakdownRow {
  playerName: string;
  playerId: string;
  profiles: number;
  sessions: number;
  matches: number;
  rounds: number;
  predictions: number;
  events: number;
  lastActivity: string | null;
}

interface ModeBreakdownRow {
  mode: string;
  matches: number;
  completedMatches: number;
  rounds: number;
  predictions: number;
  events: number;
}

interface SessionWorkbookRow {
  startedAt: Date | null;
  updatedAt: Date | null;
  endedAt: Date | null;
  status: string;
  source: string;
  initialRoute: string;
  playerName: string;
  playerId: string;
  profileName: string;
  profileId: string;
  activeMatchId: string;
  sessionId: string;
}

interface MatchWorkbookRow {
  startedAt: Date | null;
  endedAt: Date | null;
  durationMinutes: number | null;
  mode: string;
  status: string;
  playerName: string;
  playerId: string;
  profileName: string;
  profileId: string;
  sessionId: string;
  matchId: string;
  bestOf: number;
  difficulty: string;
  winner: string;
  scoreYou: number;
  scoreAI: number;
  roundsPlanned: number;
  roundsPlayed: number;
  aiWinRate: number;
  youSwitchedRate: number;
  leaderboardScore: number | null;
  rawMode: string;
  sourceMatchId: string;
  completed: string;
}

interface RoundWorkbookRow {
  timestamp: Date | null;
  mode: string;
  difficulty: string;
  playerName: string;
  playerId: string;
  profileName: string;
  profileId: string;
  sessionId: string;
  matchId: string;
  roundNumber: number;
  bestOf: number;
  outcome: string;
  playerMove: string;
  aiMove: string;
  policy: string;
  confidence: number;
  bucket: string;
  reason: string;
  decisionTimeMs: number | null;
  streakAI: number;
  streakYou: number;
  predictionId: string;
  roundId: string;
}

interface PredictionWorkbookRow {
  timestamp: Date | null;
  mode: string;
  difficulty: string;
  playerName: string;
  playerId: string;
  profileName: string;
  profileId: string;
  sessionId: string;
  matchId: string;
  roundId: string;
  policy: string;
  confidence: number;
  bucket: string;
  counterMove: string;
  aiMoveChosen: string;
  reason: string;
  realtimeWeight: number | null;
  historyWeight: number | null;
  realtimeRounds: number | null;
  historyRounds: number | null;
  predictionId: string;
}

interface EventWorkbookRow {
  timestamp: Date | null;
  surface: string;
  action: string;
  value: string;
  detail: string;
  playerName: string;
  playerId: string;
  profileName: string;
  profileId: string;
  sessionId: string;
  matchId: string;
  roundId: string;
  meta: string;
  eventId: string;
}

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DATE_TIME_FORMAT = "m/d/yyyy h:mm AM/PM";
const DECIMAL_FORMAT = "0.00";
const WHOLE_NUMBER_FORMAT = "0";
const SHEET_TAB_COLORS = {
  overview: "FF1F5EFF",
  playersProfiles: "FF5B8DEF",
  sessions: "FF76B7B2",
  matches: "FF4E79A7",
  rounds: "FF9C755F",
  predictions: "FF59A14F",
  events: "FFE15759",
  dictionary: "FFA0AEC0",
} as const;

function fallbackPlayerLabel(playerId: string | null | undefined) {
  if (!playerId) return "Unknown player";
  return `Player ${playerId.slice(-6)}`;
}

function fallbackProfileLabel(profileId: string | null | undefined) {
  if (!profileId) return "Unknown profile";
  return `Profile ${profileId.slice(-6)}`;
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function safeTimestampMs(value: string | null | undefined): number | null {
  const parsed = asDate(value);
  return parsed ? parsed.getTime() : null;
}

function maxTimestamp(...values: Array<string | null | undefined>) {
  let winner: string | null = null;
  let winnerMs = -Infinity;
  values.forEach(value => {
    const ms = safeTimestampMs(value);
    if (ms === null || ms <= winnerMs) return;
    winnerMs = ms;
    winner = value ?? null;
  });
  return winner;
}

function displayMode(mode: string | null | undefined) {
  if (mode === "training" || mode === "practice") return "Training";
  if (mode === "challenge") return "Challenge";
  return mode ? `${mode.charAt(0).toUpperCase()}${mode.slice(1)}` : "-";
}

function displayWord(value: string | null | undefined) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function displayBoolean(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
}

function stringifyMeta(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function calculateDurationMinutes(startedAt: string | null | undefined, endedAt: string | null | undefined) {
  const start = safeTimestampMs(startedAt);
  const end = safeTimestampMs(endedAt);
  if (start === null || end === null || end < start) return null;
  return Math.round(((end - start) / 60000) * 10) / 10;
}

function triggerDownload(filename: string, contents: BlobPart, mimeType: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function styleWorksheetHeader(worksheet: any, title: string, subtitle: string, columnCount: number) {
  worksheet.views = [{ showGridLines: false }];
  worksheet.mergeCells(1, 1, 1, columnCount);
  worksheet.mergeCells(2, 1, 2, columnCount);

  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { size: 10, color: { argb: "FF475569" } };
  subtitleCell.alignment = { wrapText: true, vertical: "middle", horizontal: "left" };

  worksheet.getRow(1).height = 24;
  worksheet.getRow(2).height = 20;
}

function configureDetailSheet(
  worksheet: any,
  title: string,
  subtitle: string,
  tabColor: string,
  columns: TableColumn[],
  rows: Array<Array<string | number | boolean | Date | null>>,
  tableName: string,
) {
  worksheet.properties.defaultRowHeight = 18;
  worksheet.properties.tabColor = { argb: tabColor };
  worksheet.views = [{ state: "frozen", ySplit: 3, showGridLines: false }];
  styleWorksheetHeader(worksheet, title, subtitle, columns.length);

  worksheet.addTable({
    name: tableName,
    ref: "A3",
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium2",
      showRowStripes: true,
    },
    columns: columns.map(column => ({ name: column.header })),
    rows,
  });

  columns.forEach((column, index) => {
    const worksheetColumn = worksheet.getColumn(index + 1);
    worksheetColumn.width = column.width;
    if (column.numFmt) worksheetColumn.numFmt = column.numFmt;
    if (column.alignment) worksheetColumn.alignment = column.alignment;
  });
}

function makeDerivedTelemetry(input: StructuredTelemetryWorkbookInput) {
  const playerMap = new Map(input.appPlayers.map(player => [player.id, player]));
  const profileMap = new Map(input.profiles.map(profile => [profile.id, profile]));
  const matchMap = new Map(input.matches.map(match => [match.id, match]));
  const roundMap = new Map(input.rounds.map(round => [round.id, round]));

  const getPlayerName = (playerId: string | null | undefined, profileId?: string | null) => {
    const player = playerId ? playerMap.get(playerId) : undefined;
    if (player?.playerName) return player.playerName;
    const profile = profileId ? profileMap.get(profileId) : undefined;
    if (profile?.playerName) return profile.playerName;
    return fallbackPlayerLabel(playerId ?? profile?.playerId ?? null);
  };

  const getProfileName = (profileId: string | null | undefined) => {
    const profile = profileId ? profileMap.get(profileId) : undefined;
    return profile?.name ?? fallbackProfileLabel(profileId);
  };

  const profileRows: ProfileWorkbookRow[] = [];
  input.appPlayers.forEach(player => {
    const relatedProfiles = input.profiles
      .filter(profile => profile.playerId === player.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (relatedProfiles.length === 0) {
      profileRows.push({
          playerName: player.playerName,
          playerId: player.id,
          profileName: "-",
          profileId: null,
          grade: player.grade,
          school: player.school ?? null,
          priorExperience: player.priorExperience ?? null,
          createdAt: null,
          trained: false,
          trainingCount: 0,
          predictorDefault: false,
          preferredBestOf: null,
          preferredDifficulty: null,
          baseName: null,
          version: null,
          matchesTotal: 0,
          trainingMatches: 0,
          challengeMatches: 0,
          completedMatches: 0,
          rounds: 0,
          predictions: 0,
          events: 0,
          lastActivity: null,
          dataSource: "canonical telemetry",
        });
      return;
    }

    relatedProfiles.forEach(profile => {
      const relatedSessions = input.sessions.filter(session => (session.profileId ?? null) === profile.id);
      const relatedMatches = input.matches.filter(match => match.profileId === profile.id);
      const relatedRounds = input.rounds.filter(round => round.profileId === profile.id);
      const relatedPredictions = input.predictions.filter(prediction => prediction.profileId === profile.id);
      const relatedMatchIds = new Set(relatedMatches.map(match => match.id));
      const relatedRoundIds = new Set(relatedRounds.map(round => round.id));
      const relatedSessionIds = new Set(relatedSessions.map(session => session.id));
      const relatedEvents = input.events.filter(event => {
        return (
          (event.profileId ?? null) === profile.id ||
          relatedSessionIds.has(event.sessionId) ||
          (event.matchId ? relatedMatchIds.has(event.matchId) : false) ||
          (event.roundId ? relatedRoundIds.has(event.roundId) : false)
        );
      });
      const lastActivity = [
        profile.createdAt,
        ...relatedSessions.flatMap(session => [session.startedAt, session.updatedAt, session.endedAt ?? null]),
        ...relatedMatches.flatMap(match => [match.startedAt, match.endedAt]),
        ...relatedRounds.map(round => round.timestamp),
        ...relatedPredictions.map(prediction => prediction.timestamp),
        ...relatedEvents.map(event => event.timestamp),
      ].reduce<string | null>((latest, candidate) => maxTimestamp(latest, candidate), null);

      profileRows.push({
        playerName: getPlayerName(player.id, profile.id),
        playerId: player.id,
        profileName: profile.name,
        profileId: profile.id,
        grade: profile.grade || player.grade,
        school: profile.school ?? player.school ?? null,
        priorExperience: profile.priorExperience ?? player.priorExperience ?? null,
        createdAt: profile.createdAt,
        trained: profile.trained,
        trainingCount: profile.trainingCount,
        predictorDefault: profile.predictorDefault,
        preferredBestOf: profile.preferences.bestOf,
        preferredDifficulty: profile.preferences.aiDifficulty,
        baseName: profile.baseName,
        version: profile.version,
        matchesTotal: relatedMatches.length,
        trainingMatches: relatedMatches.filter(match => match.mode === "training").length,
        challengeMatches: relatedMatches.filter(match => match.mode === "challenge").length,
        completedMatches: relatedMatches.filter(match => match.completed).length,
        rounds: relatedRounds.length,
        predictions: relatedPredictions.length,
        events: relatedEvents.length,
        lastActivity,
        dataSource: "canonical telemetry",
      });
    });
  });

  const playerBreakdown: PlayerBreakdownRow[] = input.appPlayers
    .map(player => {
      const relatedProfiles = input.profiles.filter(profile => profile.playerId === player.id);
      const relatedSessions = input.sessions.filter(session => session.playerId === player.id);
      const relatedMatches = input.matches.filter(match => match.playerId === player.id);
      const relatedRounds = input.rounds.filter(round => round.playerId === player.id);
      const relatedPredictions = input.predictions.filter(prediction => prediction.playerId === player.id);
      const relatedEvents = input.events.filter(event => event.playerId === player.id);
      const lastActivity = [
        ...relatedProfiles.map(profile => profile.updatedAt ?? profile.createdAt),
        ...relatedSessions.flatMap(session => [session.startedAt, session.updatedAt, session.endedAt ?? null]),
        ...relatedMatches.flatMap(match => [match.startedAt, match.endedAt]),
        ...relatedRounds.map(round => round.timestamp),
        ...relatedPredictions.map(prediction => prediction.timestamp),
        ...relatedEvents.map(event => event.timestamp),
      ].reduce<string | null>((latest, candidate) => maxTimestamp(latest, candidate), null);
      return {
        playerName: player.playerName,
        playerId: player.id,
        profiles: relatedProfiles.length,
        sessions: relatedSessions.length,
        matches: relatedMatches.length,
        rounds: relatedRounds.length,
        predictions: relatedPredictions.length,
        events: relatedEvents.length,
        lastActivity,
      };
    })
    .sort((a, b) => a.playerName.localeCompare(b.playerName));

  const modeBreakdown: ModeBreakdownRow[] = (["training", "challenge"] as const).map(mode => ({
    mode: displayMode(mode),
    matches: input.matches.filter(match => match.mode === mode).length,
    completedMatches: input.matches.filter(match => match.mode === mode && match.completed).length,
    rounds: input.rounds.filter(round => round.mode === mode).length,
    predictions: input.predictions.filter(prediction => prediction.mode === mode).length,
    events: input.events.filter(event => {
      const round = event.roundId ? roundMap.get(event.roundId) : null;
      const match = event.matchId ? matchMap.get(event.matchId) : null;
      return (round?.mode ?? match?.mode ?? null) === mode;
    }).length,
  }));

  const sessionsRows: SessionWorkbookRow[] = input.sessions
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(session => ({
      startedAt: asDate(session.startedAt),
      updatedAt: asDate(session.updatedAt),
      endedAt: asDate(session.endedAt ?? null),
      status: displayWord(session.status),
      source: session.source,
      initialRoute: session.initialRoute ?? "-",
      playerName: getPlayerName(session.playerId, session.profileId),
      playerId: session.playerId,
      profileName: session.profileId ? getProfileName(session.profileId) : "-",
      profileId: session.profileId ?? "-",
      activeMatchId: session.activeMatchId ?? "-",
      sessionId: session.id,
    }));

  const matchesRows: MatchWorkbookRow[] = input.matches
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(match => ({
      startedAt: asDate(match.startedAt),
      endedAt: asDate(match.endedAt),
      durationMinutes: calculateDurationMinutes(match.startedAt, match.endedAt),
      mode: displayMode(match.mode),
      status: displayWord(match.status),
      playerName: getPlayerName(match.playerId, match.profileId),
      playerId: match.playerId,
      profileName: getProfileName(match.profileId),
      profileId: match.profileId,
      sessionId: match.sessionId,
      matchId: match.id,
      bestOf: match.bestOf,
      difficulty: displayWord(match.difficulty),
      winner: displayWord(match.winner),
      scoreYou: match.score.you,
      scoreAI: match.score.ai,
      roundsPlanned: match.rounds,
      roundsPlayed: match.roundsPlayed,
      aiWinRate: match.aiWinRate,
      youSwitchedRate: match.youSwitchedRate,
      leaderboardScore: match.leaderboardScore ?? null,
      rawMode: match.mode,
      sourceMatchId: match.sourceMatchId ?? "-",
      completed: displayBoolean(match.completed),
    }));

  const roundsRows: RoundWorkbookRow[] = input.rounds
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map(round => ({
      timestamp: asDate(round.timestamp),
      mode: displayMode(round.mode),
      difficulty: displayWord(round.difficulty),
      playerName: getPlayerName(round.playerId, round.profileId),
      playerId: round.playerId,
      profileName: getProfileName(round.profileId),
      profileId: round.profileId,
      sessionId: round.sessionId,
      matchId: round.matchId ?? "-",
      roundNumber: round.roundNumber,
      bestOf: round.bestOf,
      outcome: displayWord(round.outcome),
      playerMove: displayWord(round.player),
      aiMove: displayWord(round.ai),
      policy: displayWord(round.policy),
      confidence: round.confidence,
      bucket: displayWord(round.confidenceBucket),
      reason: round.reason,
      decisionTimeMs: round.decisionTimeMs ?? null,
      streakAI: round.streakAI,
      streakYou: round.streakYou,
      predictionId: round.predictionId ?? "-",
      roundId: round.id,
    }));

  const predictionsRows: PredictionWorkbookRow[] = input.predictions
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map(prediction => ({
      timestamp: asDate(prediction.timestamp),
      mode: displayMode(prediction.mode),
      difficulty: displayWord(prediction.difficulty),
      playerName: getPlayerName(prediction.playerId, prediction.profileId),
      playerId: prediction.playerId,
      profileName: getProfileName(prediction.profileId),
      profileId: prediction.profileId,
      sessionId: prediction.sessionId,
      matchId: prediction.matchId ?? "-",
      roundId: prediction.roundId,
      policy: displayWord(prediction.policy),
      confidence: prediction.confidence,
      bucket: displayWord(prediction.confidenceBucket),
      counterMove: displayWord(prediction.counterMoveChosen ?? null),
      aiMoveChosen: displayWord(prediction.chosenAiMove ?? null),
      reason: prediction.reason,
      realtimeWeight: prediction.realtimeWeight ?? null,
      historyWeight: prediction.historyWeight ?? null,
      realtimeRounds: prediction.realtimeRounds ?? null,
      historyRounds: prediction.historyRounds ?? null,
      predictionId: prediction.id,
    }));

  const eventsRows: EventWorkbookRow[] = input.events
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map(event => ({
      timestamp: asDate(event.timestamp),
      surface: event.surface,
      action: event.action,
      value: event.value ?? "-",
      detail: event.detail ?? "-",
      playerName: getPlayerName(event.playerId ?? null, event.profileId ?? null),
      playerId: event.playerId ?? "-",
      profileName: event.profileId ? getProfileName(event.profileId) : "-",
      profileId: event.profileId ?? "-",
      sessionId: event.sessionId,
      matchId: event.matchId ?? "-",
      roundId: event.roundId ?? "-",
      meta: stringifyMeta(event.meta),
      eventId: event.id,
    }));

  return {
    profileRows,
    playerBreakdown,
    modeBreakdown,
    sessionsRows,
    matchesRows,
    roundsRows,
    predictionsRows,
    eventsRows,
  };
}

function buildOverviewSheet(worksheet: any, input: StructuredTelemetryWorkbookInput, derived: ReturnType<typeof makeDerivedTelemetry>) {
  worksheet.properties.defaultRowHeight = 20;
  worksheet.properties.tabColor = { argb: SHEET_TAB_COLORS.overview };
  worksheet.views = [{ showGridLines: false }];
  worksheet.columns = new Array(13).fill(null).map((_, index) => ({
    width: index === 0 || index === 12 ? 4 : 16,
  }));

  worksheet.mergeCells("B2:K2");
  worksheet.mergeCells("B4:K4");
  worksheet.mergeCells("B6:K6");
  worksheet.getCell("B2").value = "RPS Predictor Telemetry Workbook";
  worksheet.getCell("B2").font = { bold: true, size: 18, color: { argb: "FF0F172A" } };
  worksheet.getCell("B4").value =
    "Combined structured workbook built from the canonical telemetry store. Raw CSV exports remain available for low-level inspection.";
  worksheet.getCell("B4").font = { size: 10, color: { argb: "FF475569" } };
  worksheet.getCell("B4").alignment = { wrapText: true };
  worksheet.getCell("B6").value =
    "Review labels are normalized for readability. Raw IDs remain preserved on the detail sheets, and challenge predictions remain separate from training rounds.";
  worksheet.getCell("B6").font = { size: 10, color: { argb: "FF334155" } };
  worksheet.getCell("B6").alignment = { wrapText: true };

  const metricPairs = [
    ["Players", input.appPlayers.length],
    ["Profiles", input.profiles.length],
    ["Sessions", input.sessions.length],
    ["Matches", input.matches.length],
    ["Completed Matches", input.matches.filter(match => match.completed).length],
    ["Rounds", input.rounds.length],
    ["Predictions", input.predictions.length],
    ["Events", input.events.length],
  ] as const;

  let rowIndex = 9;
  for (let index = 0; index < metricPairs.length; index += 2) {
    const left = metricPairs[index];
    const right = metricPairs[index + 1];
    const leftLabelCell = worksheet.getCell(`B${rowIndex}`);
    const leftValueCell = worksheet.getCell(`C${rowIndex}`);
    leftLabelCell.value = left[0];
    leftLabelCell.font = { bold: true, color: { argb: "FF1E3A8A" } };
    leftLabelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
    leftValueCell.value = left[1];
    leftValueCell.font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
    leftValueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

    if (right) {
      const rightLabelCell = worksheet.getCell(`E${rowIndex}`);
      const rightValueCell = worksheet.getCell(`F${rowIndex}`);
      rightLabelCell.value = right[0];
      rightLabelCell.font = { bold: true, color: { argb: "FF0F766E" } };
      rightLabelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCFBF1" } };
      rightValueCell.value = right[1];
      rightValueCell.font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
      rightValueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    }
    rowIndex += 2;
  }

  worksheet.mergeCells("H9:M9");
  worksheet.getCell("H9").value = "Per-mode breakdown";
  worksheet.getCell("H9").font = { bold: true, color: { argb: "FF1D4ED8" } };
  worksheet.getCell("H9").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  worksheet.addTable({
    name: "OverviewModeBreakdown",
    ref: "H10",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: [
      { name: "Mode" },
      { name: "Matches" },
      { name: "Completed Matches" },
      { name: "Rounds" },
      { name: "Predictions" },
      { name: "Events" },
    ],
    rows: derived.modeBreakdown.map(row => [row.mode, row.matches, row.completedMatches, row.rounds, row.predictions, row.events]),
  });
  ["H", "I", "J", "K", "L", "M"].forEach((columnLetter, index) => {
    const width = [14, 12, 18, 12, 12, 10][index];
    worksheet.getColumn(columnLetter).width = width;
  });

  worksheet.mergeCells("B20:I20");
  worksheet.getCell("B20").value = "Per-player breakdown";
  worksheet.getCell("B20").font = { bold: true, color: { argb: "FF1D4ED8" } };
  worksheet.getCell("B20").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  worksheet.addTable({
    name: "OverviewPlayerBreakdown",
    ref: "B21",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: [
      { name: "Player Name" },
      { name: "Profiles" },
      { name: "Sessions" },
      { name: "Matches" },
      { name: "Rounds" },
      { name: "Predictions" },
      { name: "Events" },
      { name: "Last Activity" },
    ],
    rows: derived.playerBreakdown.map(player => [
      player.playerName,
      player.profiles,
      player.sessions,
      player.matches,
      player.rounds,
      player.predictions,
      player.events,
      asDate(player.lastActivity),
    ]),
  });
  worksheet.getColumn("I").numFmt = DATE_TIME_FORMAT;
  ["B", "C", "D", "E", "F", "G", "H", "I"].forEach((columnLetter, index) => {
    const width = [24, 10, 10, 10, 10, 12, 10, 20][index];
    worksheet.getColumn(columnLetter).width = width;
  });
}

function buildDictionarySheet(worksheet: any) {
  worksheet.properties.defaultRowHeight = 20;
  worksheet.properties.tabColor = { argb: SHEET_TAB_COLORS.dictionary };
  worksheet.views = [{ showGridLines: false }];
  worksheet.columns = [{ width: 20 }, { width: 32 }, { width: 18 }, { width: 64 }];
  worksheet.mergeCells("A1:D1");
  worksheet.getCell("A1").value = "Workbook Notes and Field Guide";
  worksheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF0F172A" } };

  const rows = [
    ["Design notes", "", "", ""],
    ["Mode normalization", "Review-facing mode labels use Training/Challenge for readability.", "", ""],
    ["Multiple players & profiles", "Players_Profiles is the recommended starting sheet for multi-player review.", "", ""],
    ["Predictions", "Predictions should remain challenge-only. Training rows there would indicate an export regression.", "", ""],
    ["Raw IDs", "Raw IDs remain on all detail sheets so workbook review and low-level CSV inspection stay aligned.", "", ""],
    ["", "", "", ""],
    ["Sheet", "Purpose", "Primary key", "Best use"],
    ["Overview", "Counts and quick summary", "-", "Quick scan / QA"],
    ["Players_Profiles", "Player/profile relationship with summary counts", "Player ID + Profile ID", "Multi-player review"],
    ["Sessions", "Session lifecycle", "Session ID", "Restore and session QA"],
    ["Matches", "Match-level records", "Match ID", "Scoreboard and completion review"],
    ["Rounds", "Round-level records", "Round ID", "Gameplay behavior"],
    ["Predictions", "Challenge prediction records", "Prediction ID", "AI behavior"],
    ["Events", "Event stream", "Event ID", "Lifecycle and UI troubleshooting"],
    ["", "", "", ""],
    ["Field", "Meaning", "Where", "Notes"],
    ["Status", "Current lifecycle state for a session or match.", "Sessions / Matches", "Sessions use Active/Ended. Matches use Active/Completed/Abandoned."],
    ["Completed", "Whether a match finished naturally.", "Matches", "Separate from raw status for quick review."],
    ["Raw Mode", "Original telemetry mode value.", "Matches", "Kept beside normalized review-facing Mode."],
    ["Confidence", "Model confidence recorded for a round or prediction.", "Rounds / Predictions", "Kept as a raw decimal from telemetry."],
    ["Bucket", "Confidence bucket label.", "Rounds / Predictions", "Low / Medium / High derived in telemetry."],
    ["Meta", "Serialized event metadata.", "Events", "Useful for troubleshooting developer and routing flows."],
  ];

  rows.forEach((row, index) => {
    const rowNumber = index + 3;
    row.forEach((value, cellIndex) => {
      const cell = worksheet.getCell(rowNumber, cellIndex + 1);
      cell.value = value;
      cell.alignment = { wrapText: true, vertical: "middle" };
      if (index === 0 || index === 6 || index === 15) {
        cell.font = { bold: true, color: { argb: "FF0F172A" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      } else {
        cell.font = { size: 10, color: { argb: "FF334155" } };
      }
    });
  });
}

export async function buildStructuredTelemetryWorkbookBuffer(input: StructuredTelemetryWorkbookInput) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RPS Predictor";
  workbook.company = "RPS Predictor";
  workbook.subject = "Telemetry export";
  workbook.title = "RPS Predictor Telemetry Workbook";
  workbook.created = new Date();
  workbook.modified = new Date();

  const derived = makeDerivedTelemetry(input);

  const overview = workbook.addWorksheet("Overview");
  buildOverviewSheet(overview, input, derived);

  const playersProfiles = workbook.addWorksheet("Players_Profiles");
  configureDetailSheet(
    playersProfiles,
    "Players and Profiles",
    "Primary multi-player / multi-profile review sheet built from canonical telemetry.",
    SHEET_TAB_COLORS.playersProfiles,
    [
      { header: "Player Name", width: 18 },
      { header: "Player ID", width: 38 },
      { header: "Profile Name", width: 18 },
      { header: "Profile ID", width: 44 },
      { header: "Grade", width: 8 },
      { header: "School", width: 14 },
      { header: "Prior Experience", width: 18 },
      { header: "Created At", width: 20, numFmt: DATE_TIME_FORMAT },
      { header: "Trained", width: 10 },
      { header: "Training Count", width: 12, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Predictor Default", width: 14 },
      { header: "Preferred Best Of", width: 14, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Preferred Difficulty", width: 16 },
      { header: "Base Name", width: 11 },
      { header: "Version", width: 10, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Matches Total", width: 12, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Training Matches", width: 14, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Challenge Matches", width: 15, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Completed Matches", width: 15, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Rounds", width: 10, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Predictions", width: 12, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Events", width: 10, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Last Activity", width: 20, numFmt: DATE_TIME_FORMAT },
      { header: "Data Source", width: 28 },
    ],
    derived.profileRows.map(row => [
      row.playerName,
      row.playerId,
      row.profileName,
      row.profileId ?? "-",
      row.grade,
      row.school ?? "-",
      row.priorExperience ?? "-",
      asDate(row.createdAt),
      displayBoolean(row.trained),
      row.trainingCount,
      displayBoolean(row.predictorDefault),
      row.preferredBestOf,
      row.preferredDifficulty ?? "-",
      row.baseName ?? "-",
      row.version,
      row.matchesTotal,
      row.trainingMatches,
      row.challengeMatches,
      row.completedMatches,
      row.rounds,
      row.predictions,
      row.events,
      asDate(row.lastActivity),
      row.dataSource,
    ]),
    "PlayersProfilesTable",
  );

  const sessions = workbook.addWorksheet("Sessions");
  configureDetailSheet(
    sessions,
    "Sessions",
    "Session-level timeline and restore-state review.",
    SHEET_TAB_COLORS.sessions,
    [
      { header: "Started", width: 28, numFmt: DATE_TIME_FORMAT },
      { header: "Updated", width: 28, numFmt: DATE_TIME_FORMAT },
      { header: "Ended", width: 28, numFmt: DATE_TIME_FORMAT },
      { header: "Status", width: 10 },
      { header: "Source", width: 12 },
      { header: "Initial Route", width: 16 },
      { header: "Player Name", width: 16 },
      { header: "Player ID", width: 34 },
      { header: "Profile Name", width: 16 },
      { header: "Profile ID", width: 40 },
      { header: "Active Match ID", width: 22 },
      { header: "Session ID", width: 36 },
    ],
    derived.sessionsRows.map(row => [
      row.startedAt,
      row.updatedAt,
      row.endedAt,
      row.status,
      row.source,
      row.initialRoute,
      row.playerName,
      row.playerId,
      row.profileName,
      row.profileId,
      row.activeMatchId,
      row.sessionId,
    ]),
    "SessionsTable",
  );

  const matches = workbook.addWorksheet("Matches");
  configureDetailSheet(
    matches,
    "Matches",
    "Readable match records. Mode is normalized for review; Raw Mode preserves the original telemetry value.",
    SHEET_TAB_COLORS.matches,
    [
      { header: "Started", width: 20, numFmt: DATE_TIME_FORMAT },
      { header: "Ended", width: 20, numFmt: DATE_TIME_FORMAT },
      { header: "Duration (min)", width: 16, numFmt: DECIMAL_FORMAT },
      { header: "Mode", width: 12 },
      { header: "Status", width: 12 },
      { header: "Player Name", width: 16 },
      { header: "Player ID", width: 34 },
      { header: "Profile Name", width: 16 },
      { header: "Profile ID", width: 40 },
      { header: "Session ID", width: 36 },
      { header: "Match ID", width: 22 },
      { header: "Best Of", width: 10, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Difficulty", width: 12 },
      { header: "Winner", width: 10 },
      { header: "Score You", width: 11, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Score AI", width: 10, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Rounds Planned", width: 16, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Rounds Played", width: 15, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "AI Win Rate", width: 13, numFmt: DECIMAL_FORMAT },
      { header: "You Switched Rate", width: 19, numFmt: DECIMAL_FORMAT },
      { header: "Leaderboard Score", width: 19, numFmt: DECIMAL_FORMAT },
      { header: "Raw Mode", width: 12 },
      { header: "Source Match ID", width: 26 },
      { header: "Completed", width: 11 },
    ],
    derived.matchesRows.map(row => [
      row.startedAt,
      row.endedAt,
      row.durationMinutes,
      row.mode,
      row.status,
      row.playerName,
      row.playerId,
      row.profileName,
      row.profileId,
      row.sessionId,
      row.matchId,
      row.bestOf,
      row.difficulty,
      row.winner,
      row.scoreYou,
      row.scoreAI,
      row.roundsPlanned,
      row.roundsPlayed,
      row.aiWinRate,
      row.youSwitchedRate,
      row.leaderboardScore,
      row.rawMode,
      row.sourceMatchId,
      row.completed,
    ]),
    "MatchesTable",
  );

  const rounds = workbook.addWorksheet("Rounds");
  configureDetailSheet(
    rounds,
    "Rounds",
    "Round-by-round telemetry log enriched with names and linked IDs.",
    SHEET_TAB_COLORS.rounds,
    [
      { header: "Timestamp", width: 20, numFmt: DATE_TIME_FORMAT },
      { header: "Mode", width: 11 },
      { header: "Difficulty", width: 12 },
      { header: "Player Name", width: 16 },
      { header: "Player ID", width: 34 },
      { header: "Profile Name", width: 16 },
      { header: "Profile ID", width: 40 },
      { header: "Session ID", width: 36 },
      { header: "Match ID", width: 22 },
      { header: "Round #", width: 10, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Best Of", width: 10, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Outcome", width: 10 },
      { header: "Player Move", width: 13 },
      { header: "AI Move", width: 10 },
      { header: "Policy", width: 11 },
      { header: "Confidence", width: 20, numFmt: DECIMAL_FORMAT },
      { header: "Bucket", width: 10 },
      { header: "Reason", width: 42, alignment: { wrapText: true, vertical: "top" } },
      { header: "Decision Time (ms)", width: 20, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Streak AI", width: 11, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Streak You", width: 12, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Prediction ID", width: 40 },
      { header: "Round ID", width: 40 },
    ],
    derived.roundsRows.map(row => [
      row.timestamp,
      row.mode,
      row.difficulty,
      row.playerName,
      row.playerId,
      row.profileName,
      row.profileId,
      row.sessionId,
      row.matchId,
      row.roundNumber,
      row.bestOf,
      row.outcome,
      row.playerMove,
      row.aiMove,
      row.policy,
      row.confidence,
      row.bucket,
      row.reason,
      row.decisionTimeMs,
      row.streakAI,
      row.streakYou,
      row.predictionId,
      row.roundId,
    ]),
    "RoundsTable",
  );

  const predictions = workbook.addWorksheet("Predictions");
  configureDetailSheet(
    predictions,
    "Predictions",
    "Challenge-only AI prediction records. Training rows should remain absent here.",
    SHEET_TAB_COLORS.predictions,
    [
      { header: "Timestamp", width: 20, numFmt: DATE_TIME_FORMAT },
      { header: "Mode", width: 11 },
      { header: "Difficulty", width: 12 },
      { header: "Player Name", width: 16 },
      { header: "Player ID", width: 34 },
      { header: "Profile Name", width: 16 },
      { header: "Profile ID", width: 40 },
      { header: "Session ID", width: 36 },
      { header: "Match ID", width: 22 },
      { header: "Round ID", width: 40 },
      { header: "Policy", width: 10 },
      { header: "Confidence", width: 20, numFmt: DECIMAL_FORMAT },
      { header: "Bucket", width: 10 },
      { header: "Counter Move", width: 14 },
      { header: "AI Move Chosen", width: 16 },
      { header: "Reason", width: 44, alignment: { wrapText: true, vertical: "top" } },
      { header: "Realtime Weight", width: 17, numFmt: DECIMAL_FORMAT },
      { header: "History Weight", width: 16, numFmt: DECIMAL_FORMAT },
      { header: "Realtime Rounds", width: 17, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "History Rounds", width: 16, numFmt: WHOLE_NUMBER_FORMAT },
      { header: "Prediction ID", width: 40 },
    ],
    derived.predictionsRows.map(row => [
      row.timestamp,
      row.mode,
      row.difficulty,
      row.playerName,
      row.playerId,
      row.profileName,
      row.profileId,
      row.sessionId,
      row.matchId,
      row.roundId,
      row.policy,
      row.confidence,
      row.bucket,
      row.counterMove,
      row.aiMoveChosen,
      row.reason,
      row.realtimeWeight,
      row.historyWeight,
      row.realtimeRounds,
      row.historyRounds,
      row.predictionId,
    ]),
    "PredictionsTable",
  );

  const events = workbook.addWorksheet("Events");
  configureDetailSheet(
    events,
    "Events",
    "UI and lifecycle event stream for audit review and troubleshooting.",
    SHEET_TAB_COLORS.events,
    [
      { header: "Timestamp", width: 20, numFmt: DATE_TIME_FORMAT },
      { header: "Surface", width: 19 },
      { header: "Action", width: 29 },
      { header: "Value", width: 13 },
      { header: "Detail", width: 19 },
      { header: "Player Name", width: 16 },
      { header: "Player ID", width: 34 },
      { header: "Profile Name", width: 16 },
      { header: "Profile ID", width: 40 },
      { header: "Session ID", width: 36 },
      { header: "Match ID", width: 22 },
      { header: "Round ID", width: 40 },
      { header: "Meta", width: 44, alignment: { wrapText: true, vertical: "top" } },
      { header: "Event ID", width: 22 },
    ],
    derived.eventsRows.map(row => [
      row.timestamp,
      row.surface,
      row.action,
      row.value,
      row.detail,
      row.playerName,
      row.playerId,
      row.profileName,
      row.profileId,
      row.sessionId,
      row.matchId,
      row.roundId,
      row.meta,
      row.eventId,
    ]),
    "EventsTable",
  );

  const dictionary = workbook.addWorksheet("Dictionary");
  buildDictionarySheet(dictionary);

  return workbook.xlsx.writeBuffer();
}

export async function downloadStructuredTelemetryWorkbook(
  input: StructuredTelemetryWorkbookInput,
  filename = "rps-telemetry-structured-workbook.xlsx",
) {
  const buffer = await buildStructuredTelemetryWorkbookBuffer(input);
  triggerDownload(filename, buffer, MIME_XLSX);
}
