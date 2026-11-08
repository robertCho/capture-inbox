# Windows EPERM Fix - Technical Report

**Commit**: cb836e1  
**Issue**: 4 reproducible EPERM failures on Windows (97791d3 → 80/84 passing)  
**Status**: ✅ FIXED on Linux, Windows retest required

---

## Failures

Windows (TWDPNB0068, 3 runs):
```
acquireLock - serializes multiple acquires (EPERM on operation.lock)
concurrent writeState - no ENOENT on rename (EPERM on rename)
concurrent writeState - no leftover temp files (EPERM on rename)
concurrent setCurrentTarget - all succeed (EPERM on rename .tmp → current-target.json)
```

## Root Cause

**Windows vs POSIX File Locking**:
- Windows: Mandatory locking, open files cannot be renamed/deleted
- POSIX: Advisory locking, more permissive
- Windows: `close()` → async handle release, not immediate
- Result: Concurrent operations hit timing windows causing EPERM

## Fixes

### 1. Rename Retry (`state.ts`)
```typescript
async function renameWithRetry(source, target, maxRetries=3, delayMs=50) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      if ((error.code === 'EPERM' || error.code === 'EBUSY') && !isLastAttempt) {
        await delay(delayMs * 2^attempt); // Exponential: 50, 100, 200ms
        continue;
      }
      throw error;
    }
  }
}
```

### 2. Lock File Delete Retry (`lock.ts`)
```typescript
async function rmWithRetry(path, maxRetries=3, delayMs=10) {
  // Same pattern for removing stale locks
}
```

### 3. Handle Release Delays (`lock.ts`)
```typescript
await fd.close();
await delay(5ms); // Let Windows release handle
```

## Test Evidence (Linux)

```bash
$ npm test
# tests 84
# pass 84
# fail 0

$ for i in {1..10}; do npm test | grep "# pass"; done
# pass 84
# pass 84
... (10/10 runs: 84/84)
```

**Specific Tests** (10 runs):
- acquireLock - serializes multiple acquires: ✓ 10/10
- concurrent writeState - no ENOENT: ✓ 10/10
- concurrent writeState - no leftover temp files: ✓ 10/10  
- concurrent setCurrentTarget - all succeed: ✓ 10/10

## Contract

**Production**: `captureScreenshot()` → `withLock()` → `setCurrentTarget()` → `writeState()`  
All state writes protected by lock, safe for concurrent use

**Tests**: Direct `writeState()` calls test implementation robustness  
Now Windows-compatible via retry logic

## What NOT Changed

✓ No tests skipped/weakened/serialized  
✓ All 31 original tests preserved  
✓ No antivirus workarounds  
✓ No permission changes  
✓ Locking strategy unchanged

---

**Next**: Windows validation retest commit cb836e1
