# YASA QA Report – Iteration 17 (Pre-Implementation)

**Typ:** Domain Stabilization Blocker Report  
**Datum:** 2026-02-19  
**Status:** 🔴 BLOCKED – Kritische Issues verhindern Iteration 18

---

## Blocker Summary

Iteration 17 (Domain Stabilization) wurde **nicht durchgeführt**. Die folgenden HIGH-Severity Issues blockieren den Fortschritt:

### BLOCKER #1: `isStrategyApplied()` semantisch falsch

**Datei:** `app/(shift)/strategy.tsx`  
**Zeile:** 57-59

**Problem:**
```typescript
const isStrategyApplied = useCallback((strategy: VacationStrategy): boolean => {
  const strategyKey = strategy.urlaubstage.join(',');
  return currentVacationDays.some(d => strategy.urlaubstage.includes(d));
}, [currentVacationDays]);
```

**Expected:** Eine Strategie ist "angewendet" wenn **ALLE** Urlaubstage bereits eingetragen sind.  
**Actual:** `some()` prüft ob **IRGENDEIN** Tag vorhanden ist → falsch positiv.

**Fix:**
```typescript
return strategy.urlaubstage.every(d => currentVacationDays.includes(d));
```

---

### BLOCKER #2: `acceptSwapRequest()` nicht-atomare Writes

**Datei:** `lib/storage.ts`  
**Zeile:** 735-746

**Problem:**
```typescript
// 1. Shift-Pläne tauschen
await AsyncStorage.setItem(KEYS.SHIFTS, JSON.stringify(allPlans));

// 2. Request-Status updaten
await setAllSwaps(swaps);
```

Zwei separate AsyncStorage-Writes. Bei App-Crash zwischen Schritt 1 und 2:
- Shifts sind getauscht ✓
- Status ist noch "open" ✗

**Fix:** Reihenfolge ändern – Status zuerst:
```typescript
// 1. Request-Status aktualisieren (kritischer für UX)
await setAllSwaps(swaps);

// 2. Shift-Pläne tauschen
await AsyncStorage.setItem(KEYS.SHIFTS, JSON.stringify(allPlans));
```

---

## Additional Issues (P1)

| ID | Issue | Datei | Severity |
|----|-------|-------|----------|
| IT17-003 | `useState<any>` in swap/index.tsx:57 | swap/index.tsx | MEDIUM |
| IT17-003 | `useState<any>` in strategy.tsx:26 | strategy.tsx | MEDIUM |
| IT17-004 | `SHIFT_META` 4-fach dupliziert | setup, calendar, today, swap | LOW |
| IT17-005 | Dead Code (btnDelete*, getMemberName) | choose.tsx, swap/index.tsx | LOW |

---

## Required Actions Before Iteration 18

1. **IT17-001:** Fix `isStrategyApplied()` → `.every()`
2. **IT17-002:** Fix `acceptSwapRequest()` Write-Reihenfolge
3. **IT17-003:** `useState<any>` → `useState<UserProfile | null>(null)`
4. **Run QA:** `npx tsc --noEmit`
5. **Create QA Report:** `reports/QA_iteration17.md`

---

## Decision

**Status:** 🔴 **NOT READY for Iteration 18**

**Next Action:** Führe Iteration 17 Refactoring durch, dann re-run QA.

---

*Report erstellt durch Orchestrator – Iteration 17 Pre-Check*
