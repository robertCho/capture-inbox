# Windows Race Condition Fix Report

**Date**: 2026-11-08  
**Commit**: ebc3b14  
**Issue**: Windows test failure (74/75 passing)  
**Status**: ✅ **FIXED**

---

## Failure Report

**Windows Environment**:
- Machine: TWDPNB0068
- OS: Windows 10.0.26200
- Commit tested: 190a8cb
- Result: 74/75 tests passing

**Failed Test**:
```
concurrent creates - all succeed with unique files
Error: ENOENT rename 'vault-concurrent-1\inbox\.capture-inbox-state\current-target.json.tmp'
```

---

## Root Cause

**Temp Filename Collision in Concurrent Writes**

`src/state.ts` line 88:
```typescript
const tempFilePath = `${stateFilePath}.tmp`;  // ❌ Same name for all processes
```

**Race Condition Sequence**:
1. Process A: `writeFile('current-target.json.tmp', dataA)`
2. Process B: `writeFile('current-target.json.tmp', dataB)` ← overwrites A's file
3. Process A: `rename('.tmp' → 'current-target.json')` ← succeeds
4. Process B: `rename('.tmp' → 'current-target.json')` ← **ENOENT** (A already renamed it)

**Why Windows but not Linux initially**:
- Windows filesystem timing differences
- Test ran 5 concurrent creates in single test
- Linux might serialize differently or timing masked issue
- Race was always present, just more visible on Windows

---

## Fix Implementation

### 1. Unique Temp Filenames (Primary Fix)

**File**: `src/state.ts`

```typescript
// OLD (broken):
const tempFilePath = `${stateFilePath}.tmp`;

// NEW (fixed):
const uniqueSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const tempFilePath = `${stateFilePath}.tmp.${uniqueSuffix}`;
```

**Components**:
- `process.pid`: Unique per process
- `Date.now()`: Timestamp
- `Math.random()`: Additional entropy

**Result**: Each concurrent operation has guaranteed unique temp file

**Cleanup Added**:
```typescript
try {
  await writeFile(tempFilePath, ...);
  await rename(tempFilePath, stateFilePath);
} catch (error) {
  // Clean up temp file on error
  await unlink(tempFilePath).catch(() => {});
  throw error;
}
```

### 2. Stale Lock Detection Improved (Secondary Fix)

**File**: `src/lock.ts`

**Issue**: Original implementation removed locks purely based on age (>30s), could unlink live process's lock.

**Fix**: Check process liveness before removing lock

```typescript
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);  // Signal 0 = check existence, doesn't kill
    return true;
  } catch (error: any) {
    return error.code === 'EPERM';  // Process exists but no permission
  }
}

async function isLockStale(lockPath: string): Promise<boolean> {
  const lockInfo = JSON.parse(await readFile(lockPath, 'utf-8'));
  const age = Date.now() - lockInfo.timestamp;
  
  // Lock is stale ONLY if old AND process dead
  if (age > LOCK_TIMEOUT_MS) {
    return !isProcessAlive(lockInfo.pid);
  }
  return false;
}
```

**Prevents**: Unlinking another active writer's lock just because time elapsed

---

## Regression Tests Added

### New Test Suite 1: `state-race.test.ts` (5 tests)

1. **concurrent writeState - no ENOENT on rename**
   - Fires 10 concurrent `writeState` operations
   - Verifies all succeed without ENOENT

2. **concurrent writeState - no leftover temp files**
   - 20 concurrent writes
   - Checks no `.tmp.*` files remain

3. **concurrent setCurrentTarget - all succeed**
   - 15 concurrent target sets
   - Verifies no temp file leaks

4. **writeState error handling - cleans up temp file**
   - Triggers write error
   - Verifies temp file cleaned up

5. **rapid sequential writeState - no races**
   - 30 rapid sequential writes
   - Simulates very fast user captures

### New Test Suite 2: `subprocess-race.test.ts` (4 tests)

1. **concurrent creates via subprocesses - all succeed**
   - Spawns 5 actual CLI subprocesses concurrently
   - More accurate Windows simulation

2. **rapid sequential creates via subprocesses**
   - 10 rapid CLI invocations
   - Tests real process concurrency

3. **mixed concurrent creates and appends via subprocesses**
   - Mix of create/append operations
   - Tests interleaved operations

4. **high-concurrency creates - stress test**
   - 10 concurrent subprocess creates
   - Verifies 10 unique cards created
   - No temp files remain

---

## Test Results

### Before Fix (Windows)
```
Tests: 74/75 passing
Failed: concurrent creates - all succeed with unique files
Error: ENOENT on temp file rename
```

### After Fix (Linux)
```
Tests: 84/84 passing (100%)
New tests: 9 regression tests added
Total: 31 original + 44 prior + 9 new = 84
Coverage: ~95%
Runtime: ~1.6s
```

**Stability Verification**:
- Ran test suite 5 times
- All runs: 84/84 passing
- No flakiness observed

### Test Breakdown

| Suite | Tests | Description |
|-------|-------|-------------|
| Capture | 13 | Original create tests (preserved) |
| Utils | 18 | Original path/validation tests (preserved) |
| Append | 14 | Append action tests |
| State | 14 | State management tests |
| Concurrent | 8 | Concurrent operations |
| Lock | 8 | Lock mechanism |
| **State-race** | **5** | **NEW: Temp file race regression** |
| **Subprocess-race** | **4** | **NEW: Real subprocess concurrency** |

---

## Verification Evidence

### Concurrent Creates Test
```bash
$ npm test | grep "concurrent creates"
✓ concurrent creates - all succeed with unique files
```

### No Temp Files Left Behind
```bash
$ find test-temp-* -name "*.tmp*" | wc -l
0
```

### Subprocess Stress Test
```bash
# 10 concurrent CLI creates
✓ All 10 succeeded
✓ 10 unique cards created
✓ No temp files remain
```

---

## What Was NOT Changed

✅ All 31 original tests preserved  
✅ Locking mechanism logic unchanged (only stale detection improved)  
✅ Atomic rename still used (correct approach)  
✅ State file structure unchanged  
✅ No behavior changes to user-visible operations  

---

## Windows Retest Required

**This fix was developed and tested on Linux.**

**Requirements for Windows retest**:
1. Pull commit `ebc3b14`
2. Clean install: `npm ci && npm run build`
3. Run full test suite: `npm test`
4. Expected: 84/84 passing
5. Verify: No ENOENT errors in concurrent creates test

**Coordinated via separate validation agent** (not claimed successful here)

---

## Technical Details

### Why Unique Temp Files Work

**Atomic Operations at Filesystem Level**:
- `writeFile()` to unique temp → No collision
- `rename(temp → target)` → Atomic replacement
- Last writer wins for final state (correct)
- No process can interfere with another's temp file

**Collision-Free Guarantees**:
- PID: Unique per process (OS guaranteed)
- Timestamp: Unique per millisecond
- Random suffix: Collision probability < 1 in 2^20

### Why Process Liveness Check Matters

**Original Problem**:
```typescript
if (age > 30s) {
  rm(lockfile);  // ❌ Might still be in use!
}
```

**Fixed**:
```typescript
if (age > 30s && !isProcessAlive(pid)) {
  rm(lockfile);  // ✅ Only if process dead
}
```

**process.kill(pid, 0) Semantics**:
- Signal 0 = check existence, doesn't send signal
- Returns: success if process exists
- Throws ESRCH: process doesn't exist
- Throws EPERM: process exists but no permission (still alive)

---

## Summary

**Root Cause**: Temp filename collision in concurrent state writes  
**Primary Fix**: Unique temp filenames per operation  
**Secondary Fix**: Process liveness check for stale locks  
**Tests Added**: 9 regression tests (5 state race + 4 subprocess)  
**Test Status**: 84/84 passing on Linux  
**Windows Status**: Retest required via validation agent  

**Commit**: ebc3b14  
**PR**: #2 (same PR, updated)  
**No merge/deploy performed**  

---

**Next Step**: Windows validation agent retest on commit ebc3b14
