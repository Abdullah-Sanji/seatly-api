export const meta = {
  name: 'story-delivery',
  description: 'Deliver one Jira story end to end: intake, test cases, contract handshake, parallel BE/FE implementation, verification, PRs',
  whenToUse: 'Invoked by /story <JIRA-KEY>. args: { key: "SEAT-12", date: "2026-10-15" }',
  phases: [
    { title: 'Setup', detail: 'worktrees and branches for both repos' },
    { title: 'Intake', detail: 'readiness, test cases, breakdown, Jira subtasks' },
    { title: 'Contract', detail: 'author + frontend review, at most 2 revision rounds' },
    { title: 'Implement', detail: 'backend and frontend in parallel, TDD' },
    { title: 'Verify', detail: 'per-side verification, retries routed to the implementer' },
    { title: 'Integrate', detail: 'browser e2e across both worktrees' },
    { title: 'Publish', detail: 'PRs, Jira comment, status' },
  ],
}

// ---------- input ----------
const key = (typeof args === 'string' ? args : (args && args.key) || '').trim()
if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
  throw new Error(`Pass the Jira key as args {"key":"SEAT-12"}; got "${key}"`)
}
const date = (args && args.date) || 'unknown date'

// ---------- schemas ----------
const STR_LIST = { type: 'array', items: { type: 'string' } }
const SETUP = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    apiDir: { type: 'string' },
    webDir: { type: 'string' },
    beBranch: { type: 'string' },
    feBranch: { type: 'string' },
    config: { type: 'object' },
    problems: STR_LIST,
  },
  required: ['ok', 'apiDir', 'webDir', 'beBranch', 'feBranch', 'config', 'problems'],
}
const TEST_CASE = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    layer: { type: 'string', enum: ['be-unit', 'be-e2e', 'fe-unit', 'browser'] },
    owner: { type: 'string', enum: ['be', 'fe'] },
    title: { type: 'string' },
  },
  required: ['id', 'layer', 'owner', 'title'],
}
const INTAKE = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    blockers: STR_LIST,
    title: { type: 'string' },
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, side: { type: 'string' }, title: { type: 'string' } },
        required: ['key', 'side', 'title'],
      },
    },
    testCases: { type: 'array', items: TEST_CASE },
    notes: { type: 'string' },
  },
  required: ['ready', 'blockers', 'title', 'subtasks', 'testCases'],
}
const CONTRACT = {
  type: 'object',
  properties: {
    changed: { type: 'boolean' },
    summary: { type: 'string' },
    operations: STR_LIST,
    breaking: { type: 'boolean' },
    commit: { type: 'string' },
    rejectedObjections: STR_LIST,
  },
  required: ['changed', 'summary', 'operations', 'breaking'],
}
const REVIEW = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    objections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'minor'] },
          about: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['id', 'severity', 'about', 'text'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['approved', 'objections', 'summary'],
}
const IMPL = {
  type: 'object',
  properties: {
    done: { type: 'boolean' },
    summary: { type: 'string' },
    commits: STR_LIST,
    testCaseStatus: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, status: { type: 'string' }, test: { type: 'string' } },
        required: ['id', 'status'],
      },
    },
    blockedByContract: { type: ['string', 'null'] },
    notes: { type: 'string' },
  },
  required: ['done', 'summary', 'commits', 'testCaseStatus', 'blockedByContract'],
}
const VERIFY = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    matrix: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tc: { type: 'string' },
          layer: { type: 'string' },
          test: { type: 'string' },
          result: { type: 'string', enum: ['pass', 'fail', 'not-automated'] },
          note: { type: 'string' },
        },
        required: ['tc', 'layer', 'result'],
      },
    },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          side: { type: 'string', enum: ['be', 'fe'] },
          tc: { type: 'string' },
          summary: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['side', 'summary'],
      },
    },
    commandsRun: {
      type: 'array',
      items: {
        type: 'object',
        properties: { command: { type: 'string' }, exitCode: { type: 'number' } },
        required: ['command', 'exitCode'],
      },
    },
  },
  required: ['passed', 'matrix', 'failures', 'commandsRun'],
}
const PUBLISH = {
  type: 'object',
  properties: {
    bePr: { type: ['string', 'null'] },
    fePr: { type: ['string', 'null'] },
    jiraCommented: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['bePr', 'fePr', 'jiraCommented'],
}

// ---------- helpers ----------
let ws = null
let intake = null
const J = (v) => JSON.stringify(v, null, 2)

function paths() {
  return [
    `Story: ${key} (${date}).`,
    `apiDir (seatly-api worktree, branch ${ws.beBranch}): ${ws.apiDir}`,
    `webDir (seatly-web worktree, branch ${ws.feBranch}): ${ws.webDir}`,
    `runDir: ${ws.apiDir}/docs/stories/${key}`,
    `config: ${J(ws.config)}`,
  ].join('\n')
}

function retries(name, fallback) {
  const r = ws && ws.config && ws.config.retries
  return r && typeof r[name] === 'number' ? r[name] : fallback
}

async function stop(stage, reason, extra) {
  log(`Stopping at ${stage}: ${typeof reason === 'string' ? reason : J(reason)}`)
  let escalation = null
  if (ws && ws.ok) {
    phase('Publish')
    escalation = await agent(
      [
        `mode: escalate`,
        paths(),
        `storyTitle: ${intake ? intake.title : '(unknown)'}`,
        `stage: ${stage}`,
        `reason: ${typeof reason === 'string' ? reason : J(reason)}`,
        extra ? `details: ${J(extra)}` : '',
      ].join('\n'),
      { agentType: 'release-publisher', label: 'escalate', phase: 'Publish', schema: PUBLISH },
    )
  }
  return { status: 'stopped', key, stage, reason, escalation }
}

const SIDES = {
  be: { side: 'be', agentType: 'be-implementer', verifyMode: 'be' },
  fe: { side: 'fe', agentType: 'fe-implementer', verifyMode: 'fe' },
}
const casesFor = (side) => intake.testCases.filter((tc) => tc.owner === side)

function implPrompt(s, attempt, failures) {
  return [
    paths(),
    `You own these test cases: ${J(casesFor(s.side))}`,
    attempt === 0
      ? 'First attempt: implement everything you own.'
      : `Retry ${attempt}: the verifier found these failures; reproduce and fix each one, then re-run the full suites:\n${J(failures)}`,
  ].join('\n')
}

function verifyPrompt(mode, cases, attempt) {
  return [
    `mode: ${mode}`,
    paths(),
    `attempt: ${attempt}`,
    `Test cases to verify: ${J(cases)}`,
  ].join('\n')
}

async function implement(s, attempt, failures, phaseName) {
  return agent(implPrompt(s, attempt, failures), {
    agentType: s.agentType,
    label: `${s.side} implement #${attempt + 1}`,
    phase: phaseName,
    schema: IMPL,
  })
}

async function verify(mode, cases, attempt, phaseName, label) {
  return agent(verifyPrompt(mode, cases, attempt), {
    agentType: 'verifier',
    label: label || `${mode} verify #${attempt}`,
    phase: phaseName,
    schema: VERIFY,
  })
}

/** implement → verify, retrying the implementer with the verifier's failures. */
async function implementAndVerify(s) {
  const max = retries('implement', 2)
  let failures = []
  for (let attempt = 0; attempt <= max; attempt++) {
    const impl = await implement(s, attempt, failures, 'Implement')
    if (!impl) return { side: s.side, passed: false, reason: 'implementer returned nothing' }
    if (impl.blockedByContract) {
      return { side: s.side, passed: false, reason: 'blocked by contract', blockedByContract: impl.blockedByContract }
    }
    const v = await verify(s.verifyMode, casesFor(s.side), attempt + 1, 'Verify')
    if (!v) return { side: s.side, passed: false, reason: 'verifier returned nothing' }
    if (v.passed) return { side: s.side, passed: true, matrix: v.matrix }
    failures = v.failures
    log(`${s.side}: verification failed on attempt ${attempt + 1}/${max + 1} (${failures.length} failure(s))`)
  }
  return { side: s.side, passed: false, reason: `still failing after ${max} retries`, failures }
}

// ---------- 0. setup ----------
phase('Setup')
ws = await agent(
  `Prepare the workspace for story ${key}. apiRepo is the current working directory (the seatly-api checkout). Read .claude/story.config.json there.`,
  { agentType: 'workspace-setup', label: 'setup', phase: 'Setup', schema: SETUP },
)
if (!ws || !ws.ok) {
  return { status: 'stopped', key, stage: 'Setup', reason: ws ? ws.problems : 'setup agent returned nothing' }
}
log(`Worktrees ready: ${ws.apiDir} | ${ws.webDir}`)

// ---------- 1. intake ----------
phase('Intake')
intake = await agent(paths(), { agentType: 'story-analyst', label: 'intake', phase: 'Intake', schema: INTAKE })
if (!intake) return stop('Intake', 'story analyst returned nothing')
if (!intake.ready) return stop('Intake', 'story not ready', intake.blockers)
if (!intake.testCases.length) return stop('Intake', 'no test cases produced')
log(`"${intake.title}": ${intake.testCases.length} test cases, ${intake.subtasks.length} subtasks`)

// ---------- 2. contract handshake ----------
phase('Contract')
const contractRounds = 1 + retries('contractReview', 2)
let approved = false
let objections = []
let contract = null
for (let round = 1; round <= contractRounds && !approved; round++) {
  contract = await agent(
    [paths(), `round: ${round}`, round === 1 ? 'First round.' : `Reviewer objections to resolve:\n${J(objections)}`].join('\n'),
    { agentType: 'contract-author', label: `contract author r${round}`, phase: 'Contract', schema: CONTRACT },
  )
  if (!contract) return stop('Contract', 'contract author returned nothing')
  const review = await agent([paths(), `round: ${round}`].join('\n'), {
    agentType: 'contract-reviewer',
    label: `contract review r${round}`,
    phase: 'Contract',
    schema: REVIEW,
  })
  if (!review) return stop('Contract', 'contract reviewer returned nothing')
  approved = review.approved
  objections = review.objections.filter((o) => o.severity === 'blocking')
  log(`Contract round ${round}: ${approved ? 'approved' : `${objections.length} blocking objection(s)`}`)
}
if (!approved) return stop('Contract', `not approved after ${contractRounds} rounds`, objections)
if (contract.breaking) log('Contract has breaking changes; CI will flag them on the backend PR.')

// ---------- 3+4. implement and verify, each side independently ----------
const sideResults = await pipeline([SIDES.be, SIDES.fe], (s) => implementAndVerify(s))
const failedSides = sideResults.filter((r) => !r || !r.passed)
if (failedSides.length) return stop('Verify', 'a side did not pass verification', failedSides)

// ---------- 5. integration (browser e2e across both worktrees) ----------
phase('Integrate')
const browserCases = intake.testCases.filter((tc) => tc.layer === 'browser')
let integration = null
if (!browserCases.length) {
  log('No browser test cases; integration run skipped.')
  integration = { passed: true, matrix: [], failures: [] }
} else {
  const max = retries('integration', 2)
  for (let attempt = 0; attempt <= max; attempt++) {
    integration = await verify('integration', browserCases, attempt + 1, 'Integrate', `integration #${attempt + 1}`)
    if (!integration) return stop('Integrate', 'integration verifier returned nothing')
    if (integration.passed || attempt === max) break
    const bySide = {}
    for (const f of integration.failures) (bySide[f.side] = bySide[f.side] || []).push(f)
    const sides = Object.keys(bySide)
    log(`Integration attempt ${attempt + 1} failed; routing fixes to: ${sides.join(', ')}`)
    const fixes = await parallel(sides.map((side) => () => implement(SIDES[side], attempt + 1, bySide[side], 'Integrate')))
    if (fixes.some((f) => f && f.blockedByContract)) return stop('Integrate', 'a fix is blocked by the contract', fixes)
    // keep each touched side's own suites green after the fix
    const reverify = await parallel(sides.map((side) => () => verify(side, casesFor(side), attempt + 2, 'Integrate', `${side} re-verify`)))
    const broken = reverify.filter((r) => !r || !r.passed)
    if (broken.length) return stop('Integrate', 'a fix broke its own side', broken)
  }
  if (!integration.passed) return stop('Integrate', 'browser e2e still failing', integration.failures)
}

// ---------- 6. publish ----------
phase('Publish')
const matrix = sideResults.flatMap((r) => r.matrix || []).concat(integration.matrix || [])
const published = await agent(
  [`mode: publish`, paths(), `storyTitle: ${intake.title}`, `subtasks: ${J(intake.subtasks)}`, `matrix: ${J(matrix)}`].join('\n'),
  { agentType: 'release-publisher', label: 'publish', phase: 'Publish', schema: PUBLISH },
)
if (!published) return stop('Publish', 'publisher returned nothing')

return {
  status: 'published',
  key,
  title: intake.title,
  bePr: published.bePr,
  fePr: published.fePr,
  jiraCommented: published.jiraCommented,
  testCases: intake.testCases.length,
  matrix,
}
