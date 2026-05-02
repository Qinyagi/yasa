# YASA Session Checkpoint

## Metadata
- Timestamp: 2026-05-03 01:36:04
- Repo: C:\Users\XyZ\Documents\YASA\yasa
- Branch: master

## Working Tree
- Modified/Deleted/Renamed files: 30
- Untracked files: 877

### Git Status (git status -sb)
```text
## master...Origin/master
 M app/(admin)/index.tsx
 M app/(admin)/space-rules.tsx
 M app/(services)/index.tsx
 M app/(services)/space-members.tsx
 M app/(services)/time-account.tsx
 M app/(services)/timeclock.tsx
 M app/(shift)/calendar.tsx
 M app/(shift)/setup.tsx
 M app/(space)/choose.tsx
 M app/(space)/join.tsx
 M app/(swap)/candidates.tsx
 M app/(team)/today.tsx
 M app/index.tsx
 M constants/theme.ts
 M docs/ai/CURRENT_STATE.md
 M docs/ops/session_latest.md
 M lib/__tests__/timeclock.test.ts
 M lib/autoStamp.ts
 M lib/backend/index.ts
 M lib/backend/shiftSync.ts
 M lib/backend/teamSync.ts
 M lib/storage.ts
 M lib/strategyEngine.ts
 M lib/timeAccount.ts
 M lib/timeAccountEngine.ts
 M package.json
 M reports/claude/implementation_latest.md
 M reports/minimax/QA_review_latest.md
 M types/index.ts
 M types/timeAccount.ts
?? .tools/adb_log_latest.txt
?? app/(services)/info-service.tsx
?? app/(services)/vacation-planning.tsx
?? "app/(shift)/day-detail (# Edit conflict 2026-04-29 r6gnfkC #).tsx"
?? app/(shift)/day-detail.tsx
?? app/(space)/profile-transfer.tsx
?? docs/backend/supabase_add_prepared_id_profiles.sql
?? docs/backend/supabase_add_rule_profile_json.sql
?? docs/backend/supabase_add_space_delete_policies.sql
?? docs/backend/supabase_add_space_status_events.sql
?? docs/ops/agentic_migration_plan.md
?? docs/ops/session_archive/session_20260407_152104.md
?? docs/ops/session_archive/session_20260407_153604.md
?? docs/ops/session_archive/session_20260407_155104.md
?? docs/ops/session_archive/session_20260407_160604.md
?? docs/ops/session_archive/session_20260407_162104.md
?? docs/ops/session_archive/session_20260407_163604.md
?? docs/ops/session_archive/session_20260407_165104.md
?? docs/ops/session_archive/session_20260407_235900.md
?? docs/ops/session_archive/session_20260408_001500.md
?? docs/ops/session_archive/session_20260408_162105.md
?? docs/ops/session_archive/session_20260408_163605.md
?? docs/ops/session_archive/session_20260408_165105.md
?? docs/ops/session_archive/session_20260408_170605.md
?? docs/ops/session_archive/session_20260408_172105.md
?? docs/ops/session_archive/session_20260408_173605.md
?? docs/ops/session_archive/session_20260408_175105.md
?? docs/ops/session_archive/session_20260408_180605.md
?? docs/ops/session_archive/session_20260408_182105.md
?? docs/ops/session_archive/session_20260408_183605.md
?? docs/ops/session_archive/session_20260408_185105.md
?? docs/ops/session_archive/session_20260408_190605.md
?? docs/ops/session_archive/session_20260408_192105.md
?? docs/ops/session_archive/session_20260408_193605.md
?? docs/ops/session_archive/session_20260408_195105.md
?? docs/ops/session_archive/session_20260408_200604.md
?? docs/ops/session_archive/session_20260408_202104.md
?? docs/ops/session_archive/session_20260408_203604.md
?? docs/ops/session_archive/session_20260408_205104.md
?? docs/ops/session_archive/session_20260408_210604.md
?? docs/ops/session_archive/session_20260409_065104.md
?? docs/ops/session_archive/session_20260409_070604.md
?? docs/ops/session_archive/session_20260409_072104.md
?? docs/ops/session_archive/session_20260409_073604.md
?? docs/ops/session_archive/session_20260409_075104.md
?? docs/ops/session_archive/session_20260409_080604.md
?? docs/ops/session_archive/session_20260409_082104.md
?? docs/ops/session_archive/session_20260409_083604.md
?? docs/ops/session_archive/session_20260409_085104.md
?? docs/ops/session_archive/session_20260409_090604.md
?? docs/ops/session_archive/session_20260409_092104.md
?? docs/ops/session_archive/session_20260409_093604.md
?? docs/ops/session_archive/session_20260409_095104.md
?? docs/ops/session_archive/session_20260409_100604.md
?? docs/ops/session_archive/session_20260410_032104.md
?? docs/ops/session_archive/session_20260410_033604.md
?? docs/ops/session_archive/session_20260410_035104.md
?? docs/ops/session_archive/session_20260410_040604.md
?? docs/ops/session_archive/session_20260410_042106.md
?? docs/ops/session_archive/session_20260410_043605.md
?? docs/ops/session_archive/session_20260410_045104.md
?? docs/ops/session_archive/session_20260410_050604.md
?? docs/ops/session_archive/session_20260410_052104.md
?? docs/ops/session_archive/session_20260410_053604.md
?? docs/ops/session_archive/session_20260410_055104.md
?? docs/ops/session_archive/session_20260410_060604.md
?? docs/ops/session_archive/session_20260410_062104.md
?? docs/ops/session_archive/session_20260410_063604.md
?? docs/ops/session_archive/session_20260410_065104.md
?? docs/ops/session_archive/session_20260410_070604.md
?? docs/ops/session_archive/session_20260410_072104.md
?? docs/ops/session_archive/session_20260410_073605.md
?? docs/ops/session_archive/session_20260410_075105.md
?? docs/ops/session_archive/session_20260410_080604.md
?? docs/ops/session_archive/session_20260410_082105.md
?? docs/ops/session_archive/session_20260410_083604.md
?? docs/ops/session_archive/session_20260410_085105.md
?? docs/ops/session_archive/session_20260410_090604.md
?? docs/ops/session_archive/session_20260410_092105.md
?? docs/ops/session_archive/session_20260410_093604.md
?? docs/ops/session_archive/session_20260410_095104.md
?? docs/ops/session_archive/session_20260410_100604.md
?? docs/ops/session_archive/session_20260410_102104.md
?? docs/ops/session_archive/session_20260410_103604.md
?? docs/ops/session_archive/session_20260410_105104.md
?? docs/ops/session_archive/session_20260410_110605.md
?? docs/ops/session_archive/session_20260410_112105.md
?? docs/ops/session_archive/session_20260410_113604.md
?? docs/ops/session_archive/session_20260410_115104.md
?? docs/ops/session_archive/session_20260410_120605.md
?? docs/ops/session_archive/session_20260410_122105.md
?? docs/ops/session_archive/session_20260410_123605.md
?? docs/ops/session_archive/session_20260410_125105.md
?? docs/ops/session_archive/session_20260410_130605.md
?? docs/ops/session_archive/session_20260410_132105.md
?? docs/ops/session_archive/session_20260410_133605.md
?? docs/ops/session_archive/session_20260410_135104.md
?? docs/ops/session_archive/session_20260410_140605.md
?? docs/ops/session_archive/session_20260410_142105.md
?? docs/ops/session_archive/session_20260410_143605.md
?? docs/ops/session_archive/session_20260410_145105.md
?? docs/ops/session_archive/session_20260410_150605.md
?? docs/ops/session_archive/session_20260410_152104.md
?? docs/ops/session_archive/session_20260410_153606.md
?? docs/ops/session_archive/session_20260410_155105.md
?? docs/ops/session_archive/session_20260410_160605.md
?? docs/ops/session_archive/session_20260410_162105.md
?? docs/ops/session_archive/session_20260410_163605.md
?? docs/ops/session_archive/session_20260410_165106.md
?? docs/ops/session_archive/session_20260410_170605.md
?? docs/ops/session_archive/session_20260410_172105.md
?? docs/ops/session_archive/session_20260410_173605.md
?? docs/ops/session_archive/session_20260410_175105.md
?? docs/ops/session_archive/session_20260410_180605.md
?? docs/ops/session_archive/session_20260410_182105.md
?? docs/ops/session_archive/session_20260410_183605.md
?? docs/ops/session_archive/session_20260410_185105.md
?? docs/ops/session_archive/session_20260410_190605.md
?? docs/ops/session_archive/session_20260410_192104.md
?? docs/ops/session_archive/session_20260410_193604.md
?? docs/ops/session_archive/session_20260410_195104.md
?? docs/ops/session_archive/session_20260410_200604.md
?? docs/ops/session_archive/session_20260410_202105.md
?? docs/ops/session_archive/session_20260410_203604.md
?? docs/ops/session_archive/session_20260410_205105.md
?? docs/ops/session_archive/session_20260410_210605.md
?? docs/ops/session_archive/session_20260410_212105.md
?? docs/ops/session_archive/session_20260410_213604.md
?? docs/ops/session_archive/session_20260410_215104.md
?? docs/ops/session_archive/session_20260410_220604.md
?? docs/ops/session_archive/session_20260410_222105.md
?? docs/ops/session_archive/session_20260410_223604.md
?? docs/ops/session_archive/session_20260410_225105.md
?? docs/ops/session_archive/session_20260410_230604.md
?? docs/ops/session_archive/session_20260410_232105.md
?? docs/ops/session_archive/session_20260411_063605.md
?? docs/ops/session_archive/session_20260411_065105.md
?? docs/ops/session_archive/session_20260411_070605.md
?? docs/ops/session_archive/session_20260411_072105.md
?? docs/ops/session_archive/session_20260411_073605.md
?? docs/ops/session_archive/session_20260411_075105.md
?? docs/ops/session_archive/session_20260411_080605.md
?? docs/ops/session_archive/session_20260411_082105.md
?? docs/ops/session_archive/session_20260411_083605.md
?? docs/ops/session_archive/session_20260411_085105.md
?? docs/ops/session_archive/session_20260411_090605.md
?? docs/ops/session_archive/session_20260411_092105.md
?? docs/ops/session_archive/session_20260411_093605.md
?? docs/ops/session_archive/session_20260411_095105.md
?? docs/ops/session_archive/session_20260411_100605.md
?? docs/ops/session_archive/session_20260411_102105.md
?? docs/ops/session_archive/session_20260411_103605.md
?? docs/ops/session_archive/session_20260411_105105.md
?? docs/ops/session_archive/session_20260411_110605.md
?? docs/ops/session_archive/session_20260411_112105.md
?? docs/ops/session_archive/session_20260411_113605.md
?? docs/ops/session_archive/session_20260411_115105.md
?? docs/ops/session_archive/session_20260411_120605.md
?? docs/ops/session_archive/session_20260411_122105.md
?? docs/ops/session_archive/session_20260411_123605.md
?? docs/ops/session_archive/session_20260411_155105.md
?? docs/ops/session_archive/session_20260411_160605.md
?? docs/ops/session_archive/session_20260411_162105.md
?? docs/ops/session_archive/session_20260411_163605.md
?? docs/ops/session_archive/session_20260411_165106.md
?? docs/ops/session_archive/session_20260411_170605.md
?? docs/ops/session_archive/session_20260411_172105.md
?? docs/ops/session_archive/session_20260411_173605.md
?? docs/ops/session_archive/session_20260411_175106.md
?? docs/ops/session_archive/session_20260411_180605.md
?? docs/ops/session_archive/session_20260411_182107.md
?? docs/ops/session_archive/session_20260411_183605.md
?? docs/ops/session_archive/session_20260411_185106.md
?? docs/ops/session_archive/session_20260411_190605.md
?? docs/ops/session_archive/session_20260411_192105.md
?? docs/ops/session_archive/session_20260411_193605.md
?? docs/ops/session_archive/session_20260411_195106.md
?? docs/ops/session_archive/session_20260411_200605.md
?? docs/ops/session_archive/session_20260411_202106.md
?? docs/ops/session_archive/session_20260411_203606.md
?? docs/ops/session_archive/session_20260412_070607.md
?? docs/ops/session_archive/session_20260412_072105.md
?? docs/ops/session_archive/session_20260412_073605.md
?? docs/ops/session_archive/session_20260412_075105.md
?? docs/ops/session_archive/session_20260412_080605.md
?? docs/ops/session_archive/session_20260412_082105.md
?? docs/ops/session_archive/session_20260412_083605.md
?? docs/ops/session_archive/session_20260412_085105.md
?? docs/ops/session_archive/session_20260412_090605.md
?? docs/ops/session_archive/session_20260412_092105.md
?? docs/ops/session_archive/session_20260412_093605.md
?? docs/ops/session_archive/session_20260412_095105.md
?? docs/ops/session_archive/session_20260412_100605.md
?? docs/ops/session_archive/session_20260412_102105.md
?? docs/ops/session_archive/session_20260412_103606.md
?? docs/ops/session_archive/session_20260412_105106.md
?? docs/ops/session_archive/session_20260412_110606.md
?? docs/ops/session_archive/session_20260412_112105.md
?? docs/ops/session_archive/session_20260412_113605.md
?? docs/ops/session_archive/session_20260412_115105.md
?? docs/ops/session_archive/session_20260412_120605.md
?? docs/ops/session_archive/session_20260412_122108.md
?? docs/ops/session_archive/session_20260412_123605.md
?? docs/ops/session_archive/session_20260412_125105.md
?? docs/ops/session_archive/session_20260412_132107.md
?? docs/ops/session_archive/session_20260412_135106.md
?? docs/ops/session_archive/session_20260412_140611.md
?? docs/ops/session_archive/session_20260412_142105.md
?? docs/ops/session_archive/session_20260412_143605.md
?? docs/ops/session_archive/session_20260412_145105.md
?? docs/ops/session_archive/session_20260412_150605.md
?? docs/ops/session_archive/session_20260412_152105.md
?? docs/ops/session_archive/session_20260412_153605.md
?? docs/ops/session_archive/session_20260412_155106.md
?? docs/ops/session_archive/session_20260412_160606.md
?? docs/ops/session_archive/session_20260412_162105.md
?? docs/ops/session_archive/session_20260412_163605.md
?? docs/ops/session_archive/session_20260412_165105.md
?? docs/ops/session_archive/session_20260412_170605.md
?? docs/ops/session_archive/session_20260412_172105.md
?? docs/ops/session_archive/session_20260412_173605.md
?? docs/ops/session_archive/session_20260412_175105.md
?? docs/ops/session_archive/session_20260412_180605.md
?? docs/ops/session_archive/session_20260412_182105.md
?? docs/ops/session_archive/session_20260412_183606.md
?? docs/ops/session_archive/session_20260412_185106.md
?? docs/ops/session_archive/session_20260412_190605.md
?? docs/ops/session_archive/session_20260412_192106.md
?? docs/ops/session_archive/session_20260412_193607.md
?? docs/ops/session_archive/session_20260412_195106.md
?? docs/ops/session_archive/session_20260412_200605.md
?? docs/ops/session_archive/session_20260412_202106.md
?? docs/ops/session_archive/session_20260412_203605.md
?? docs/ops/session_archive/session_20260412_205105.md
?? docs/ops/session_archive/session_20260412_210605.md
?? docs/ops/session_archive/session_20260412_212105.md
?? docs/ops/session_archive/session_20260412_213606.md
?? docs/ops/session_archive/session_20260412_215106.md
?? docs/ops/session_archive/session_20260412_220605.md
?? docs/ops/session_archive/session_20260412_222105.md
?? docs/ops/session_archive/session_20260412_223605.md
?? docs/ops/session_archive/session_20260412_225105.md
?? docs/ops/session_archive/session_20260412_230606.md
?? docs/ops/session_archive/session_20260412_232105.md
?? docs/ops/session_archive/session_20260412_233605.md
?? docs/ops/session_archive/session_20260412_235105.md
?? docs/ops/session_archive/session_20260413_000605.md
?? docs/ops/session_archive/session_20260413_002106.md
?? docs/ops/session_archive/session_20260413_003606.md
?? docs/ops/session_archive/session_20260413_005105.md
?? docs/ops/session_archive/session_20260413_010606.md
?? docs/ops/session_archive/session_20260413_012105.md
?? docs/ops/session_archive/session_20260413_013606.md
?? docs/ops/session_archive/session_20260413_093607.md
?? docs/ops/session_archive/session_20260413_095108.md
?? docs/ops/session_archive/session_20260413_100606.md
?? docs/ops/session_archive/session_20260413_102107.md
?? docs/ops/session_archive/session_20260413_103606.md
?? docs/ops/session_archive/session_20260413_105107.md
?? docs/ops/session_archive/session_20260413_110607.md
?? docs/ops/session_archive/session_20260413_112107.md
?? docs/ops/session_archive/session_20260413_113607.md
?? docs/ops/session_archive/session_20260413_115107.md
?? docs/ops/session_archive/session_20260413_120607.md
?? docs/ops/session_archive/session_20260413_122107.md
?? docs/ops/session_archive/session_20260413_123607.md
?? docs/ops/session_archive/session_20260413_125107.md
?? docs/ops/session_archive/session_20260413_130607.md
?? docs/ops/session_archive/session_20260413_132108.md
?? docs/ops/session_archive/session_20260413_133607.md
?? docs/ops/session_archive/session_20260413_135108.md
?? docs/ops/session_archive/session_20260413_140607.md
?? docs/ops/session_archive/session_20260413_142108.md
?? docs/ops/session_archive/session_20260413_143607.md
?? docs/ops/session_archive/session_20260413_145107.md
?? docs/ops/session_archive/session_20260413_150607.md
?? docs/ops/session_archive/session_20260413_152107.md
?? docs/ops/session_archive/session_20260413_153607.md
?? docs/ops/session_archive/session_20260413_155107.md
?? docs/ops/session_archive/session_20260413_160608.md
?? docs/ops/session_archive/session_20260413_162108.md
?? docs/ops/session_archive/session_20260413_163608.md
?? docs/ops/session_archive/session_20260413_165108.md
?? docs/ops/session_archive/session_20260413_170607.md
?? docs/ops/session_archive/session_20260413_172107.md
?? docs/ops/session_archive/session_20260413_173607.md
?? docs/ops/session_archive/session_20260413_175107.md
?? docs/ops/session_archive/session_20260413_180607.md
?? docs/ops/session_archive/session_20260413_182108.md
?? docs/ops/session_archive/session_20260413_183607.md
?? docs/ops/session_archive/session_20260413_185107.md
?? docs/ops/session_archive/session_20260413_190609.md
?? docs/ops/session_archive/session_20260413_192108.md
?? docs/ops/session_archive/session_20260413_193607.md
?? docs/ops/session_archive/session_20260413_195107.md
?? docs/ops/session_archive/session_20260413_200607.md
?? docs/ops/session_archive/session_20260413_202107.md
?? docs/ops/session_archive/session_20260413_203609.md
?? docs/ops/session_archive/session_20260413_205109.md
?? docs/ops/session_archive/session_20260413_210607.md
?? docs/ops/session_archive/session_20260413_212108.md
?? docs/ops/session_archive/session_20260413_213607.md
?? docs/ops/session_archive/session_20260413_215107.md
?? docs/ops/session_archive/session_20260413_220610.md
?? docs/ops/session_archive/session_20260413_222107.md
?? docs/ops/session_archive/session_20260413_223607.md
?? docs/ops/session_archive/session_20260413_225107.md
?? docs/ops/session_archive/session_20260413_230607.md
?? docs/ops/session_archive/session_20260413_232108.md
?? docs/ops/session_archive/session_20260413_233607.md
?? docs/ops/session_archive/session_20260413_235108.md
?? docs/ops/session_archive/session_20260414_000608.md
?? docs/ops/session_archive/session_20260414_002107.md
?? docs/ops/session_archive/session_20260414_003608.md
?? docs/ops/session_archive/session_20260414_005109.md
?? docs/ops/session_archive/session_20260414_010608.md
?? docs/ops/session_archive/session_20260414_012107.md
?? docs/ops/session_archive/session_20260414_013608.md
?? docs/ops/session_archive/session_20260414_015108.md
?? docs/ops/session_archive/session_20260414_020608.md
?? docs/ops/session_archive/session_20260414_022107.md
?? docs/ops/session_archive/session_20260414_083607.md
?? docs/ops/session_archive/session_20260414_085107.md
?? docs/ops/session_archive/session_20260414_090608.md
?? docs/ops/session_archive/session_20260414_092107.md
?? docs/ops/session_archive/session_20260414_093608.md
?? docs/ops/session_archive/session_20260414_095108.md
?? docs/ops/session_archive/session_20260414_100609.md
?? docs/ops/session_archive/session_20260414_102108.md
?? docs/ops/session_archive/session_20260414_103607.md
?? docs/ops/session_archive/session_20260414_105107.md
?? docs/ops/session_archive/session_20260414_110607.md
?? docs/ops/session_archive/session_20260414_112107.md
?? docs/ops/session_archive/session_20260414_113607.md
?? docs/ops/session_archive/session_20260414_115108.md
?? docs/ops/session_archive/session_20260414_120608.md
?? docs/ops/session_archive/session_20260414_122107.md
?? docs/ops/session_archive/session_20260414_123608.md
?? docs/ops/session_archive/session_20260414_124041.md
?? docs/ops/session_archive/session_20260414_125111.md
?? docs/ops/session_archive/session_20260414_130606.md
?? docs/ops/session_archive/session_20260414_132105.md
?? docs/ops/session_archive/session_20260414_133606.md
?? docs/ops/session_archive/session_20260414_135105.md
?? docs/ops/session_archive/session_20260414_140607.md
?? docs/ops/session_archive/session_20260414_142106.md
?? docs/ops/session_archive/session_20260414_143606.md
?? docs/ops/session_archive/session_20260414_145106.md
?? docs/ops/session_archive/session_20260414_150607.md
?? docs/ops/session_archive/session_20260414_152106.md
?? docs/ops/session_archive/session_20260414_153608.md
?? docs/ops/session_archive/session_20260414_155107.md
?? docs/ops/session_archive/session_20260414_160608.md
?? docs/ops/session_archive/session_20260414_162106.md
?? docs/ops/session_archive/session_20260414_163607.md
?? docs/ops/session_archive/session_20260414_165106.md
?? docs/ops/session_archive/session_20260414_170608.md
?? docs/ops/session_archive/session_20260414_171253.md
?? docs/ops/session_archive/session_20260414_171424.md
?? docs/ops/session_archive/session_20260414_172108.md
?? docs/ops/session_archive/session_20260415_135111.md
?? docs/ops/session_archive/session_20260415_140606.md
?? docs/ops/session_archive/session_20260415_142106.md
?? docs/ops/session_archive/session_20260415_143606.md
?? docs/ops/session_archive/session_20260415_145106.md
?? docs/ops/session_archive/session_20260415_150607.md
?? docs/ops/session_archive/session_20260415_152106.md
?? docs/ops/session_archive/session_20260415_153606.md
?? docs/ops/session_archive/session_20260415_155106.md
?? docs/ops/session_archive/session_20260415_162107.md
?? docs/ops/session_archive/session_20260415_163606.md
?? docs/ops/session_archive/session_20260415_165106.md
?? docs/ops/session_archive/session_20260415_170606.md
?? docs/ops/session_archive/session_20260415_172106.md
?? docs/ops/session_archive/session_20260415_173606.md
?? docs/ops/session_archive/session_20260415_175107.md
?? docs/ops/session_archive/session_20260415_180606.md
?? docs/ops/session_archive/session_20260415_182107.md
?? docs/ops/session_archive/session_20260415_183609.md
?? docs/ops/session_archive/session_20260415_185106.md
?? docs/ops/session_archive/session_20260415_190606.md
?? docs/ops/session_archive/session_20260415_192106.md
?? docs/ops/session_archive/session_20260415_193607.md
?? docs/ops/session_archive/session_20260415_193616.md
?? docs/ops/session_archive/session_20260415_194210.md
?? docs/ops/session_archive/session_20260415_195108.md
?? docs/ops/session_archive/session_20260415_200608.md
?? docs/ops/session_archive/session_20260415_201131.md
?? docs/ops/session_archive/session_20260415_202107.md
?? docs/ops/session_archive/session_20260415_203606.md
?? docs/ops/session_archive/session_20260416_163608.md
?? docs/ops/session_archive/session_20260416_165107.md
?? docs/ops/session_archive/session_20260416_170607.md
?? docs/ops/session_archive/session_20260416_172106.md
?? docs/ops/session_archive/session_20260416_173606.md
?? docs/ops/session_archive/session_20260416_175106.md
?? docs/ops/session_archive/session_20260416_180607.md
?? docs/ops/session_archive/session_20260416_182107.md
?? docs/ops/session_archive/session_20260416_183608.md
?? docs/ops/session_archive/session_20260416_185106.md
?? docs/ops/session_archive/session_20260416_190606.md
?? docs/ops/session_archive/session_20260416_192106.md
?? docs/ops/session_archive/session_20260416_193606.md
?? docs/ops/session_archive/session_20260416_195106.md
?? docs/ops/session_archive/session_20260416_200606.md
?? docs/ops/session_archive/session_20260416_202107.md
?? docs/ops/session_archive/session_20260416_203606.md
?? docs/ops/session_archive/session_20260416_205107.md
?? docs/ops/session_archive/session_20260416_210607.md
?? docs/ops/session_archive/session_20260416_211223.md
?? docs/ops/session_archive/session_20260417_170602.md
?? docs/ops/session_archive/session_20260417_172102.md
?? docs/ops/session_archive/session_20260417_173602.md
?? docs/ops/session_archive/session_20260417_175102.md
?? docs/ops/session_archive/session_20260417_180603.md
?? docs/ops/session_archive/session_20260417_182102.md
?? docs/ops/session_archive/session_20260417_183603.md
?? docs/ops/session_archive/session_20260417_185103.md
?? docs/ops/session_archive/session_20260417_190603.md
?? docs/ops/session_archive/session_20260417_192103.md
?? docs/ops/session_archive/session_20260417_193603.md
?? docs/ops/session_archive/session_20260417_195102.md
?? docs/ops/session_archive/session_20260417_200603.md
?? docs/ops/session_archive/session_20260417_202103.md
?? docs/ops/session_archive/session_20260417_203603.md
?? docs/ops/session_archive/session_20260417_204844.md
?? docs/ops/session_archive/session_20260417_205102.md
?? docs/ops/session_archive/session_20260417_210603.md
?? docs/ops/session_archive/session_20260419_072104.md
?? docs/ops/session_archive/session_20260419_073604.md
?? docs/ops/session_archive/session_20260419_075104.md
?? docs/ops/session_archive/session_20260419_080604.md
?? docs/ops/session_archive/session_20260419_082104.md
?? docs/ops/session_archive/session_20260419_133604.md
?? docs/ops/session_archive/session_20260419_140604.md
?? docs/ops/session_archive/session_20260419_142104.md
?? docs/ops/session_archive/session_20260419_143604.md
?? docs/ops/session_archive/session_20260419_145104.md
?? docs/ops/session_archive/session_20260419_150604.md
?? docs/ops/session_archive/session_20260419_152104.md
?? docs/ops/session_archive/session_20260419_153606.md
?? docs/ops/session_archive/session_20260419_155104.md
?? docs/ops/session_archive/session_20260419_160604.md
?? docs/ops/session_archive/session_20260419_162104.md
?? docs/ops/session_archive/session_20260419_163604.md
?? docs/ops/session_archive/session_20260419_165104.md
?? docs/ops/session_archive/session_20260419_170603.md
?? docs/ops/session_archive/session_20260419_172103.md
?? docs/ops/session_archive/session_20260419_173602.md
?? docs/ops/session_archive/session_20260419_175102.md
?? docs/ops/session_archive/session_20260419_180603.md
?? docs/ops/session_archive/session_20260419_182103.md
?? docs/ops/session_archive/session_20260419_183603.md
?? docs/ops/session_archive/session_20260419_185103.md
?? docs/ops/session_archive/session_20260420_065103.md
?? docs/ops/session_archive/session_20260420_070603.md
?? docs/ops/session_archive/session_20260420_072102.md
?? docs/ops/session_archive/session_20260420_073602.md
?? docs/ops/session_archive/session_20260420_075102.md
?? docs/ops/session_archive/session_20260420_080602.md
?? docs/ops/session_archive/session_20260420_082102.md
?? docs/ops/session_archive/session_20260420_083602.md
?? docs/ops/session_archive/session_20260420_085102.md
?? docs/ops/session_archive/session_20260420_090602.md
?? docs/ops/session_archive/session_20260420_092102.md
?? docs/ops/session_archive/session_20260420_093602.md
?? docs/ops/session_archive/session_20260420_095103.md
?? docs/ops/session_archive/session_20260420_100602.md
?? docs/ops/session_archive/session_20260420_102102.md
?? docs/ops/session_archive/session_20260420_103603.md
?? docs/ops/session_archive/session_20260420_105103.md
?? docs/ops/session_archive/session_20260420_110603.md
?? docs/ops/session_archive/session_20260420_112103.md
?? docs/ops/session_archive/session_20260420_113603.md
?? docs/ops/session_archive/session_20260420_115102.md
?? docs/ops/session_archive/session_20260420_120603.md
?? docs/ops/session_archive/session_20260420_122103.md
?? docs/ops/session_archive/session_20260420_123603.md
?? docs/ops/session_archive/session_20260420_125103.md
?? docs/ops/session_archive/session_20260420_130603.md
?? docs/ops/session_archive/session_20260420_132103.md
?? docs/ops/session_archive/session_20260420_133603.md
?? docs/ops/session_archive/session_20260421_052103.md
?? docs/ops/session_archive/session_20260421_053603.md
?? docs/ops/session_archive/session_20260421_055102.md
?? docs/ops/session_archive/session_20260421_060602.md
?? docs/ops/session_archive/session_20260421_062102.md
?? docs/ops/session_archive/session_20260421_063602.md
?? docs/ops/session_archive/session_20260421_065102.md
?? docs/ops/session_archive/session_20260421_070602.md
?? docs/ops/session_archive/session_20260421_072102.md
?? docs/ops/session_archive/session_20260421_073602.md
?? docs/ops/session_archive/session_20260421_075103.md
?? docs/ops/session_archive/session_20260421_080603.md
?? docs/ops/session_archive/session_20260421_082102.md
?? docs/ops/session_archive/session_20260421_083602.md
?? docs/ops/session_archive/session_20260421_085103.md
?? docs/ops/session_archive/session_20260421_090603.md
?? docs/ops/session_archive/session_20260421_092103.md
?? docs/ops/session_archive/session_20260421_093603.md
?? docs/ops/session_archive/session_20260421_095103.md
?? docs/ops/session_archive/session_20260421_100603.md
?? docs/ops/session_archive/session_20260421_102103.md
?? docs/ops/session_archive/session_20260421_103603.md
?? docs/ops/session_archive/session_20260421_105103.md
?? docs/ops/session_archive/session_20260421_110603.md
?? docs/ops/session_archive/session_20260421_112103.md
?? docs/ops/session_archive/session_20260421_113603.md
?? docs/ops/session_archive/session_20260421_115103.md
?? docs/ops/session_archive/session_20260421_120603.md
?? docs/ops/session_archive/session_20260421_122103.md
?? docs/ops/session_archive/session_20260421_123603.md
?? docs/ops/session_archive/session_20260421_125103.md
?? docs/ops/session_archive/session_20260421_130603.md
?? docs/ops/session_archive/session_20260421_132103.md
?? docs/ops/session_archive/session_20260421_133603.md
?? docs/ops/session_archive/session_20260421_135103.md
?? docs/ops/session_archive/session_20260421_140602.md
?? docs/ops/session_archive/session_20260421_142102.md
?? docs/ops/session_archive/session_20260421_143602.md
?? docs/ops/session_archive/session_20260421_145102.md
?? docs/ops/session_archive/session_20260421_150602.md
?? docs/ops/session_archive/session_20260421_152103.md
?? docs/ops/session_archive/session_20260421_153602.md
?? docs/ops/session_archive/session_20260421_155102.md
?? docs/ops/session_archive/session_20260421_160602.md
?? docs/ops/session_archive/session_20260421_162102.md
?? docs/ops/session_archive/session_20260421_163602.md
?? docs/ops/session_archive/session_20260421_165102.md
?? docs/ops/session_archive/session_20260421_170602.md
?? docs/ops/session_archive/session_20260421_172102.md
?? docs/ops/session_archive/session_20260421_173603.md
?? docs/ops/session_archive/session_20260421_175102.md
?? docs/ops/session_archive/session_20260421_180602.md
?? docs/ops/session_archive/session_20260421_182102.md
?? docs/ops/session_archive/session_20260421_183602.md
?? docs/ops/session_archive/session_20260421_185102.md
?? docs/ops/session_archive/session_20260421_190603.md
?? docs/ops/session_archive/session_20260421_192102.md
?? docs/ops/session_archive/session_20260421_193602.md
?? docs/ops/session_archive/session_20260421_195102.md
?? docs/ops/session_archive/session_20260421_200602.md
?? docs/ops/session_archive/session_20260421_202103.md
?? docs/ops/session_archive/session_20260421_203602.md
?? docs/ops/session_archive/session_20260421_205102.md
?? docs/ops/session_archive/session_20260421_210602.md
?? docs/ops/session_archive/session_20260421_212102.md
?? docs/ops/session_archive/session_20260421_213602.md
?? docs/ops/session_archive/session_20260421_215102.md
?? docs/ops/session_archive/session_20260421_220602.md
?? docs/ops/session_archive/session_20260421_222102.md
?? docs/ops/session_archive/session_20260421_223602.md
?? docs/ops/session_archive/session_20260421_225102.md
?? docs/ops/session_archive/session_20260421_230602.md
?? docs/ops/session_archive/session_20260421_232102.md
?? docs/ops/session_archive/session_20260422_090603.md
?? docs/ops/session_archive/session_20260422_092102.md
?? docs/ops/session_archive/session_20260422_093602.md
?? docs/ops/session_archive/session_20260422_095102.md
?? docs/ops/session_archive/session_20260422_100602.md
?? docs/ops/session_archive/session_20260422_102102.md
?? docs/ops/session_archive/session_20260422_103602.md
?? docs/ops/session_archive/session_20260422_105102.md
?? docs/ops/session_archive/session_20260422_110602.md
?? docs/ops/session_archive/session_20260422_112102.md
?? docs/ops/session_archive/session_20260422_113602.md
?? docs/ops/session_archive/session_20260422_115102.md
?? docs/ops/session_archive/session_20260422_120602.md
?? docs/ops/session_archive/session_20260422_122102.md
?? docs/ops/session_archive/session_20260422_123602.md
?? docs/ops/session_archive/session_20260422_125102.md
?? docs/ops/session_archive/session_20260422_130602.md
?? docs/ops/session_archive/session_20260422_132102.md
?? docs/ops/session_archive/session_20260422_133602.md
?? docs/ops/session_archive/session_20260422_135102.md
?? docs/ops/session_archive/session_20260422_140602.md
?? docs/ops/session_archive/session_20260422_142102.md
?? docs/ops/session_archive/session_20260422_143602.md
?? docs/ops/session_archive/session_20260422_145102.md
?? docs/ops/session_archive/session_20260422_150602.md
?? docs/ops/session_archive/session_20260422_152103.md
?? docs/ops/session_archive/session_20260422_153602.md
?? docs/ops/session_archive/session_20260422_155103.md
?? docs/ops/session_archive/session_20260422_160602.md
?? docs/ops/session_archive/session_20260422_162102.md
?? docs/ops/session_archive/session_20260422_163603.md
?? docs/ops/session_archive/session_20260422_165103.md
?? docs/ops/session_archive/session_20260422_170603.md
?? docs/ops/session_archive/session_20260422_172103.md
?? docs/ops/session_archive/session_20260422_173602.md
?? docs/ops/session_archive/session_20260422_175103.md
?? docs/ops/session_archive/session_20260422_180603.md
?? docs/ops/session_archive/session_20260422_182103.md
?? docs/ops/session_archive/session_20260422_183603.md
?? docs/ops/session_archive/session_20260423_001725.md
?? docs/ops/session_archive/session_20260423_002102.md
?? docs/ops/session_archive/session_20260423_003603.md
?? docs/ops/session_archive/session_20260423_005102.md
?? docs/ops/session_archive/session_20260423_010602.md
?? docs/ops/session_archive/session_20260423_012102.md
?? docs/ops/session_archive/session_20260423_013602.md
?? docs/ops/session_archive/session_20260423_015102.md
?? docs/ops/session_archive/session_20260423_020602.md
?? docs/ops/session_archive/session_20260423_022102.md
?? docs/ops/session_archive/session_20260423_023602.md
?? docs/ops/session_archive/session_20260423_025102.md
?? docs/ops/session_archive/session_20260423_030602.md
?? docs/ops/session_archive/session_20260423_032102.md
?? docs/ops/session_archive/session_20260423_033602.md
?? docs/ops/session_archive/session_20260423_035102.md
?? docs/ops/session_archive/session_20260423_040602.md
?? docs/ops/session_archive/session_20260423_042103.md
?? docs/ops/session_archive/session_20260423_043602.md
?? docs/ops/session_archive/session_20260423_045102.md
?? docs/ops/session_archive/session_20260423_050603.md
?? docs/ops/session_archive/session_20260423_052103.md
?? docs/ops/session_archive/session_20260423_120602.md
?? docs/ops/session_archive/session_20260423_122102.md
?? docs/ops/session_archive/session_20260423_123603.md
?? docs/ops/session_archive/session_20260423_125102.md
?? docs/ops/session_archive/session_20260423_130602.md
?? docs/ops/session_archive/session_20260423_132102.md
?? docs/ops/session_archive/session_20260423_133603.md
?? docs/ops/session_archive/session_20260423_135103.md
?? docs/ops/session_archive/session_20260423_140602.md
?? docs/ops/session_archive/session_20260423_142102.md
?? docs/ops/session_archive/session_20260423_143602.md
?? docs/ops/session_archive/session_20260423_145103.md
?? docs/ops/session_archive/session_20260423_150603.md
?? docs/ops/session_archive/session_20260423_152103.md
?? docs/ops/session_archive/session_20260423_153603.md
?? docs/ops/session_archive/session_20260423_155103.md
?? docs/ops/session_archive/session_20260423_160603.md
?? docs/ops/session_archive/session_20260423_162103.md
?? docs/ops/session_archive/session_20260423_163603.md
?? docs/ops/session_archive/session_20260423_165103.md
?? docs/ops/session_archive/session_20260423_170603.md
?? docs/ops/session_archive/session_20260423_172103.md
?? docs/ops/session_archive/session_20260423_173603.md
?? docs/ops/session_archive/session_20260423_175103.md
?? docs/ops/session_archive/session_20260423_180603.md
?? docs/ops/session_archive/session_20260423_182103.md
?? docs/ops/session_archive/session_20260423_183603.md
?? docs/ops/session_archive/session_20260423_185103.md
?? docs/ops/session_archive/session_20260423_190603.md
?? docs/ops/session_archive/session_20260423_192103.md
?? docs/ops/session_archive/session_20260423_193603.md
?? docs/ops/session_archive/session_20260423_195103.md
?? docs/ops/session_archive/session_20260423_200603.md
?? docs/ops/session_archive/session_20260423_202103.md
?? docs/ops/session_archive/session_20260423_203603.md
?? docs/ops/session_archive/session_20260423_205103.md
?? docs/ops/session_archive/session_20260423_210603.md
?? docs/ops/session_archive/session_20260423_212103.md
?? docs/ops/session_archive/session_20260423_213603.md
?? docs/ops/session_archive/session_20260423_215103.md
?? docs/ops/session_archive/session_20260423_220603.md
?? docs/ops/session_archive/session_20260423_222103.md
?? docs/ops/session_archive/session_20260423_223603.md
?? docs/ops/session_archive/session_20260423_225103.md
?? docs/ops/session_archive/session_20260423_230216.md
?? docs/ops/session_archive/session_20260423_230603.md
?? docs/ops/session_archive/session_20260423_232103.md
?? docs/ops/session_archive/session_20260423_233603.md
?? docs/ops/session_archive/session_20260423_235051.md
?? docs/ops/session_archive/session_20260423_235103.md
?? docs/ops/session_archive/session_20260424_000604.md
?? docs/ops/session_archive/session_20260424_002104.md
?? docs/ops/session_archive/session_20260424_003604.md
?? docs/ops/session_archive/session_20260424_005104.md
?? docs/ops/session_archive/session_20260424_010604.md
?? docs/ops/session_archive/session_20260424_012104.md
?? docs/ops/session_archive/session_20260424_013604.md
?? docs/ops/session_archive/session_20260424_015104.md
?? docs/ops/session_archive/session_20260424_020604.md
?? docs/ops/session_archive/session_20260424_022104.md
?? docs/ops/session_archive/session_20260424_023604.md
?? docs/ops/session_archive/session_20260424_025104.md
?? docs/ops/session_archive/session_20260424_030604.md
?? docs/ops/session_archive/session_20260424_103603.md
?? docs/ops/session_archive/session_20260424_105104.md
?? docs/ops/session_archive/session_20260424_110603.md
?? docs/ops/session_archive/session_20260424_112103.md
?? docs/ops/session_archive/session_20260424_113603.md
?? docs/ops/session_archive/session_20260424_115103.md
?? docs/ops/session_archive/session_20260424_120603.md
?? docs/ops/session_archive/session_20260424_122104.md
?? docs/ops/session_archive/session_20260424_123603.md
?? docs/ops/session_archive/session_20260424_125103.md
?? docs/ops/session_archive/session_20260424_130603.md
?? docs/ops/session_archive/session_20260424_132103.md
?? docs/ops/session_archive/session_20260424_133604.md
?? docs/ops/session_archive/session_20260424_135104.md
?? docs/ops/session_archive/session_20260424_140603.md
?? docs/ops/session_archive/session_20260424_142104.md
?? docs/ops/session_archive/session_20260424_143604.md
?? docs/ops/session_archive/session_20260424_145104.md
?? docs/ops/session_archive/session_20260424_150604.md
?? docs/ops/session_archive/session_20260424_152104.md
?? docs/ops/session_archive/session_20260424_153603.md
?? docs/ops/session_archive/session_20260424_155104.md
?? docs/ops/session_archive/session_20260424_160604.md
?? docs/ops/session_archive/session_20260424_162104.md
?? docs/ops/session_archive/session_20260424_163604.md
?? docs/ops/session_archive/session_20260424_165104.md
?? docs/ops/session_archive/session_20260424_170603.md
?? docs/ops/session_archive/session_20260424_172103.md
?? docs/ops/session_archive/session_20260424_173603.md
?? docs/ops/session_archive/session_20260424_175103.md
?? docs/ops/session_archive/session_20260424_180603.md
?? docs/ops/session_archive/session_20260424_182103.md
?? docs/ops/session_archive/session_20260424_183603.md
?? docs/ops/session_archive/session_20260424_185104.md
?? docs/ops/session_archive/session_20260426_065104.md
?? docs/ops/session_archive/session_20260426_070604.md
?? docs/ops/session_archive/session_20260426_072104.md
?? docs/ops/session_archive/session_20260426_073604.md
?? docs/ops/session_archive/session_20260426_075104.md
?? docs/ops/session_archive/session_20260426_080604.md
?? docs/ops/session_archive/session_20260426_082104.md
?? docs/ops/session_archive/session_20260426_083604.md
?? docs/ops/session_archive/session_20260426_085104.md
?? docs/ops/session_archive/session_20260426_090604.md
?? docs/ops/session_archive/session_20260426_092104.md
?? docs/ops/session_archive/session_20260426_093604.md
?? docs/ops/session_archive/session_20260426_095104.md
?? docs/ops/session_archive/session_20260426_100604.md
?? docs/ops/session_archive/session_20260426_102104.md
?? docs/ops/session_archive/session_20260426_103604.md
?? docs/ops/session_archive/session_20260426_105104.md
?? docs/ops/session_archive/session_20260426_110604.md
?? docs/ops/session_archive/session_20260426_112104.md
?? docs/ops/session_archive/session_20260426_113604.md
?? docs/ops/session_archive/session_20260426_115104.md
?? docs/ops/session_archive/session_20260426_120604.md
?? docs/ops/session_archive/session_20260426_122104.md
?? docs/ops/session_archive/session_20260426_123604.md
?? docs/ops/session_archive/session_20260426_125104.md
?? docs/ops/session_archive/session_20260426_130604.md
?? docs/ops/session_archive/session_20260426_132104.md
?? docs/ops/session_archive/session_20260427_135105.md
?? docs/ops/session_archive/session_20260427_140604.md
?? docs/ops/session_archive/session_20260427_142104.md
?? docs/ops/session_archive/session_20260427_143604.md
?? docs/ops/session_archive/session_20260427_145104.md
?? docs/ops/session_archive/session_20260427_150604.md
?? docs/ops/session_archive/session_20260427_152104.md
?? docs/ops/session_archive/session_20260427_153604.md
?? docs/ops/session_archive/session_20260427_155104.md
?? docs/ops/session_archive/session_20260427_160604.md
?? docs/ops/session_archive/session_20260427_162104.md
?? docs/ops/session_archive/session_20260427_163604.md
?? docs/ops/session_archive/session_20260427_165104.md
?? docs/ops/session_archive/session_20260427_170604.md
?? docs/ops/session_archive/session_20260427_172104.md
?? docs/ops/session_archive/session_20260427_173604.md
?? docs/ops/session_archive/session_20260427_175104.md
?? docs/ops/session_archive/session_20260427_180604.md
?? docs/ops/session_archive/session_20260427_182104.md
?? docs/ops/session_archive/session_20260427_183604.md
?? docs/ops/session_archive/session_20260427_185104.md
?? docs/ops/session_archive/session_20260427_190604.md
?? docs/ops/session_archive/session_20260427_192104.md
?? docs/ops/session_archive/session_20260427_193604.md
?? docs/ops/session_archive/session_20260427_195104.md
?? docs/ops/session_archive/session_20260427_200605.md
?? docs/ops/session_archive/session_20260427_202104.md
?? docs/ops/session_archive/session_20260427_203604.md
?? docs/ops/session_archive/session_20260427_205104.md
?? docs/ops/session_archive/session_20260427_210604.md
?? docs/ops/session_archive/session_20260428_153605.md
?? docs/ops/session_archive/session_20260428_155104.md
?? docs/ops/session_archive/session_20260428_160604.md
?? docs/ops/session_archive/session_20260428_162104.md
?? docs/ops/session_archive/session_20260428_163606.md
?? docs/ops/session_archive/session_20260428_165103.md
?? docs/ops/session_archive/session_20260428_170603.md
?? docs/ops/session_archive/session_20260428_172104.md
?? docs/ops/session_archive/session_20260428_173603.md
?? docs/ops/session_archive/session_20260428_175104.md
?? docs/ops/session_archive/session_20260428_180603.md
?? docs/ops/session_archive/session_20260428_182103.md
?? docs/ops/session_archive/session_20260428_183604.md
?? docs/ops/session_archive/session_20260428_185104.md
?? docs/ops/session_archive/session_20260429_070604.md
?? docs/ops/session_archive/session_20260429_072104.md
?? docs/ops/session_archive/session_20260429_073604.md
?? docs/ops/session_archive/session_20260429_075104.md
?? docs/ops/session_archive/session_20260429_080604.md
?? docs/ops/session_archive/session_20260429_082104.md
?? docs/ops/session_archive/session_20260429_083604.md
?? docs/ops/session_archive/session_20260429_085104.md
?? docs/ops/session_archive/session_20260429_180604.md
?? docs/ops/session_archive/session_20260429_182104.md
?? docs/ops/session_archive/session_20260429_183604.md
?? docs/ops/session_archive/session_20260429_185104.md
?? docs/ops/session_archive/session_20260429_190604.md
?? docs/ops/session_archive/session_20260429_192104.md
?? docs/ops/session_archive/session_20260429_193604.md
?? docs/ops/session_archive/session_20260429_195106.md
?? docs/ops/session_archive/session_20260429_200603.md
?? docs/ops/session_archive/session_20260429_202103.md
?? docs/ops/session_archive/session_20260429_203603.md
?? docs/ops/session_archive/session_20260429_205104.md
?? docs/ops/session_archive/session_20260429_210604.md
?? docs/ops/session_archive/session_20260430_173604.md
?? docs/ops/session_archive/session_20260430_175105.md
?? docs/ops/session_archive/session_20260430_180604.md
?? docs/ops/session_archive/session_20260430_182103.md
?? docs/ops/session_archive/session_20260430_183603.md
?? docs/ops/session_archive/session_20260430_185103.md
?? docs/ops/session_archive/session_20260430_190603.md
?? docs/ops/session_archive/session_20260430_192103.md
?? docs/ops/session_archive/session_20260430_193603.md
?? docs/ops/session_archive/session_20260430_195103.md
?? docs/ops/session_archive/session_20260430_200604.md
?? docs/ops/session_archive/session_20260430_202103.md
?? docs/ops/session_archive/session_20260430_203603.md
?? docs/ops/session_archive/session_20260430_205103.md
?? docs/ops/session_archive/session_20260502_103605.md
?? docs/ops/session_archive/session_20260502_105104.md
?? docs/ops/session_archive/session_20260502_110604.md
?? docs/ops/session_archive/session_20260502_112104.md
?? docs/ops/session_archive/session_20260502_113604.md
?? docs/ops/session_archive/session_20260502_115104.md
?? docs/ops/session_archive/session_20260502_120604.md
?? docs/ops/session_archive/session_20260502_122104.md
?? docs/ops/session_archive/session_20260502_123604.md
?? docs/ops/session_archive/session_20260502_125104.md
?? docs/ops/session_archive/session_20260502_130604.md
?? docs/ops/session_archive/session_20260502_132104.md
?? docs/ops/session_archive/session_20260502_133604.md
?? docs/ops/session_archive/session_20260502_135104.md
?? docs/ops/session_archive/session_20260502_140604.md
?? docs/ops/session_archive/session_20260502_142104.md
?? docs/ops/session_archive/session_20260502_143604.md
?? docs/ops/session_archive/session_20260502_145104.md
?? docs/ops/session_archive/session_20260502_150605.md
?? docs/ops/session_archive/session_20260502_152104.md
?? docs/ops/session_archive/session_20260502_153604.md
?? docs/ops/session_archive/session_20260502_155103.md
?? docs/ops/session_archive/session_20260502_160603.md
?? docs/ops/session_archive/session_20260502_162103.md
?? docs/ops/session_archive/session_20260502_233604.md
?? docs/ops/session_archive/session_20260502_235105.md
?? docs/ops/session_archive/session_20260503_000604.md
?? docs/ops/session_archive/session_20260503_002104.md
?? docs/ops/session_archive/session_20260503_003604.md
?? docs/ops/session_archive/session_20260503_005104.md
?? docs/ops/session_archive/session_20260503_010604.md
?? docs/ops/session_archive/session_20260503_012104.md
?? lib/__tests__/preparedProfilesShiftpals.test.ts
?? lib/__tests__/profileTransfer.test.ts
?? lib/__tests__/ruleSyncMerge.test.ts
?? "lib/__tests__/timeclock.test (# Edit conflict 2026-04-29 iguom8C #).ts"
?? lib/__tests__/vacationPlanningEngine.test.ts
?? lib/__tests__/wDayEngine.test.ts
?? lib/__tests__/zeitkontoEngine.test.ts
?? lib/backend/spaceStatusSync.ts
?? lib/preparedProfilesShiftpals.ts
?? lib/profileTransfer.ts
?? lib/spaceDeleteTombstones.ts
?? lib/spaceStatusRelevance.ts
?? lib/vacationPlanningEngine.ts
?? lib/wDayEngine.ts
?? lib/zeitkontoEngine.ts
?? reports/claude/archive/implementation_2026-04-07_timeclock_runtime_mismatch_fix.md
?? reports/claude/archive/implementation_2026-04-11_timeclock_p0_consistency_fix.md
?? reports/claude/archive/implementation_2026-04-12_zeitkonto_card_p1.md
?? reports/claude/archive/implementation_2026-04-15_ruleprofile_member_sync_fix.md
?? reports/minimax/archive/QA_review_2026-04-07_timeclock_runtime_mismatch_regate.md
?? reports/minimax/archive/QA_review_2026-04-11_timeclock_p0_consistency_regate.md
?? reports/minimax/archive/QA_review_2026-04-12_zeitkonto_card_p1_regate.md
?? scripts/ops/build_install_android_release.ps1
?? types/preparedProfile.ts
?? types/spaceStatus.ts
?? types/vacationPlanning.ts
```

### Last Commits
```text
b8cb44f fix(timeclock): harden pairing fallback + clarify delta/flex semantics
300ad60 build(preview): include latest timeclock holiday/preholiday updates
dd457ab rescue: restore working tree after accidental revert on master
a823fec Revert "Initial commit: YASA Expo MVP"
d13a6f1 Initial commit: YASA Expo MVP
7e75556 Initial commit
```

## Tracked Reference Docs
- reports/kilo/QA_review_latest.md last updated: 2026-03-25 13:14:42
- docs/ai/CURRENT_STATE.md last updated: 2026-05-03 01:28:32
- docs/ai/NEXT_SESSION_ROADMAP_2026-03-24.md last updated: 2026-03-24 08:55:20

## Modified Files
```text
app/(admin)/index.tsx
app/(admin)/space-rules.tsx
app/(services)/index.tsx
app/(services)/space-members.tsx
app/(services)/time-account.tsx
app/(services)/timeclock.tsx
app/(shift)/calendar.tsx
app/(shift)/setup.tsx
app/(space)/choose.tsx
app/(space)/join.tsx
app/(swap)/candidates.tsx
app/(team)/today.tsx
app/index.tsx
constants/theme.ts
docs/ai/CURRENT_STATE.md
docs/ops/session_latest.md
lib/__tests__/timeclock.test.ts
lib/autoStamp.ts
lib/backend/index.ts
lib/backend/shiftSync.ts
lib/backend/teamSync.ts
lib/storage.ts
lib/strategyEngine.ts
lib/timeAccount.ts
lib/timeAccountEngine.ts
package.json
reports/claude/implementation_latest.md
reports/minimax/QA_review_latest.md
types/index.ts
types/timeAccount.ts
```

## Untracked Files
```text
.tools/adb_log_latest.txt
app/(services)/info-service.tsx
app/(services)/vacation-planning.tsx
"app/(shift)/day-detail (# Edit conflict 2026-04-29 r6gnfkC #).tsx"
app/(shift)/day-detail.tsx
app/(space)/profile-transfer.tsx
docs/backend/supabase_add_prepared_id_profiles.sql
docs/backend/supabase_add_rule_profile_json.sql
docs/backend/supabase_add_space_delete_policies.sql
docs/backend/supabase_add_space_status_events.sql
docs/ops/agentic_migration_plan.md
docs/ops/session_archive/session_20260407_152104.md
docs/ops/session_archive/session_20260407_153604.md
docs/ops/session_archive/session_20260407_155104.md
docs/ops/session_archive/session_20260407_160604.md
docs/ops/session_archive/session_20260407_162104.md
docs/ops/session_archive/session_20260407_163604.md
docs/ops/session_archive/session_20260407_165104.md
docs/ops/session_archive/session_20260407_235900.md
docs/ops/session_archive/session_20260408_001500.md
docs/ops/session_archive/session_20260408_162105.md
docs/ops/session_archive/session_20260408_163605.md
docs/ops/session_archive/session_20260408_165105.md
docs/ops/session_archive/session_20260408_170605.md
docs/ops/session_archive/session_20260408_172105.md
docs/ops/session_archive/session_20260408_173605.md
docs/ops/session_archive/session_20260408_175105.md
docs/ops/session_archive/session_20260408_180605.md
docs/ops/session_archive/session_20260408_182105.md
docs/ops/session_archive/session_20260408_183605.md
docs/ops/session_archive/session_20260408_185105.md
docs/ops/session_archive/session_20260408_190605.md
docs/ops/session_archive/session_20260408_192105.md
docs/ops/session_archive/session_20260408_193605.md
docs/ops/session_archive/session_20260408_195105.md
docs/ops/session_archive/session_20260408_200604.md
docs/ops/session_archive/session_20260408_202104.md
docs/ops/session_archive/session_20260408_203604.md
docs/ops/session_archive/session_20260408_205104.md
docs/ops/session_archive/session_20260408_210604.md
docs/ops/session_archive/session_20260409_065104.md
docs/ops/session_archive/session_20260409_070604.md
docs/ops/session_archive/session_20260409_072104.md
docs/ops/session_archive/session_20260409_073604.md
docs/ops/session_archive/session_20260409_075104.md
docs/ops/session_archive/session_20260409_080604.md
docs/ops/session_archive/session_20260409_082104.md
docs/ops/session_archive/session_20260409_083604.md
docs/ops/session_archive/session_20260409_085104.md
docs/ops/session_archive/session_20260409_090604.md
docs/ops/session_archive/session_20260409_092104.md
docs/ops/session_archive/session_20260409_093604.md
docs/ops/session_archive/session_20260409_095104.md
docs/ops/session_archive/session_20260409_100604.md
docs/ops/session_archive/session_20260410_032104.md
docs/ops/session_archive/session_20260410_033604.md
docs/ops/session_archive/session_20260410_035104.md
docs/ops/session_archive/session_20260410_040604.md
docs/ops/session_archive/session_20260410_042106.md
docs/ops/session_archive/session_20260410_043605.md
docs/ops/session_archive/session_20260410_045104.md
docs/ops/session_archive/session_20260410_050604.md
docs/ops/session_archive/session_20260410_052104.md
docs/ops/session_archive/session_20260410_053604.md
docs/ops/session_archive/session_20260410_055104.md
docs/ops/session_archive/session_20260410_060604.md
docs/ops/session_archive/session_20260410_062104.md
docs/ops/session_archive/session_20260410_063604.md
docs/ops/session_archive/session_20260410_065104.md
docs/ops/session_archive/session_20260410_070604.md
docs/ops/session_archive/session_20260410_072104.md
docs/ops/session_archive/session_20260410_073605.md
docs/ops/session_archive/session_20260410_075105.md
docs/ops/session_archive/session_20260410_080604.md
docs/ops/session_archive/session_20260410_082105.md
docs/ops/session_archive/session_20260410_083604.md
docs/ops/session_archive/session_20260410_085105.md
docs/ops/session_archive/session_20260410_090604.md
docs/ops/session_archive/session_20260410_092105.md
docs/ops/session_archive/session_20260410_093604.md
docs/ops/session_archive/session_20260410_095104.md
docs/ops/session_archive/session_20260410_100604.md
docs/ops/session_archive/session_20260410_102104.md
docs/ops/session_archive/session_20260410_103604.md
docs/ops/session_archive/session_20260410_105104.md
docs/ops/session_archive/session_20260410_110605.md
docs/ops/session_archive/session_20260410_112105.md
docs/ops/session_archive/session_20260410_113604.md
docs/ops/session_archive/session_20260410_115104.md
docs/ops/session_archive/session_20260410_120605.md
docs/ops/session_archive/session_20260410_122105.md
docs/ops/session_archive/session_20260410_123605.md
docs/ops/session_archive/session_20260410_125105.md
docs/ops/session_archive/session_20260410_130605.md
docs/ops/session_archive/session_20260410_132105.md
docs/ops/session_archive/session_20260410_133605.md
docs/ops/session_archive/session_20260410_135104.md
docs/ops/session_archive/session_20260410_140605.md
docs/ops/session_archive/session_20260410_142105.md
docs/ops/session_archive/session_20260410_143605.md
docs/ops/session_archive/session_20260410_145105.md
docs/ops/session_archive/session_20260410_150605.md
docs/ops/session_archive/session_20260410_152104.md
docs/ops/session_archive/session_20260410_153606.md
docs/ops/session_archive/session_20260410_155105.md
docs/ops/session_archive/session_20260410_160605.md
docs/ops/session_archive/session_20260410_162105.md
docs/ops/session_archive/session_20260410_163605.md
docs/ops/session_archive/session_20260410_165106.md
docs/ops/session_archive/session_20260410_170605.md
docs/ops/session_archive/session_20260410_172105.md
docs/ops/session_archive/session_20260410_173605.md
docs/ops/session_archive/session_20260410_175105.md
docs/ops/session_archive/session_20260410_180605.md
docs/ops/session_archive/session_20260410_182105.md
docs/ops/session_archive/session_20260410_183605.md
docs/ops/session_archive/session_20260410_185105.md
docs/ops/session_archive/session_20260410_190605.md
docs/ops/session_archive/session_20260410_192104.md
docs/ops/session_archive/session_20260410_193604.md
docs/ops/session_archive/session_20260410_195104.md
docs/ops/session_archive/session_20260410_200604.md
docs/ops/session_archive/session_20260410_202105.md
docs/ops/session_archive/session_20260410_203604.md
docs/ops/session_archive/session_20260410_205105.md
docs/ops/session_archive/session_20260410_210605.md
docs/ops/session_archive/session_20260410_212105.md
docs/ops/session_archive/session_20260410_213604.md
docs/ops/session_archive/session_20260410_215104.md
docs/ops/session_archive/session_20260410_220604.md
docs/ops/session_archive/session_20260410_222105.md
docs/ops/session_archive/session_20260410_223604.md
docs/ops/session_archive/session_20260410_225105.md
docs/ops/session_archive/session_20260410_230604.md
docs/ops/session_archive/session_20260410_232105.md
docs/ops/session_archive/session_20260411_063605.md
docs/ops/session_archive/session_20260411_065105.md
docs/ops/session_archive/session_20260411_070605.md
docs/ops/session_archive/session_20260411_072105.md
docs/ops/session_archive/session_20260411_073605.md
docs/ops/session_archive/session_20260411_075105.md
docs/ops/session_archive/session_20260411_080605.md
docs/ops/session_archive/session_20260411_082105.md
docs/ops/session_archive/session_20260411_083605.md
docs/ops/session_archive/session_20260411_085105.md
docs/ops/session_archive/session_20260411_090605.md
docs/ops/session_archive/session_20260411_092105.md
docs/ops/session_archive/session_20260411_093605.md
docs/ops/session_archive/session_20260411_095105.md
docs/ops/session_archive/session_20260411_100605.md
docs/ops/session_archive/session_20260411_102105.md
docs/ops/session_archive/session_20260411_103605.md
docs/ops/session_archive/session_20260411_105105.md
docs/ops/session_archive/session_20260411_110605.md
docs/ops/session_archive/session_20260411_112105.md
docs/ops/session_archive/session_20260411_113605.md
docs/ops/session_archive/session_20260411_115105.md
docs/ops/session_archive/session_20260411_120605.md
docs/ops/session_archive/session_20260411_122105.md
docs/ops/session_archive/session_20260411_123605.md
docs/ops/session_archive/session_20260411_155105.md
docs/ops/session_archive/session_20260411_160605.md
docs/ops/session_archive/session_20260411_162105.md
docs/ops/session_archive/session_20260411_163605.md
docs/ops/session_archive/session_20260411_165106.md
docs/ops/session_archive/session_20260411_170605.md
docs/ops/session_archive/session_20260411_172105.md
docs/ops/session_archive/session_20260411_173605.md
docs/ops/session_archive/session_20260411_175106.md
docs/ops/session_archive/session_20260411_180605.md
docs/ops/session_archive/session_20260411_182107.md
docs/ops/session_archive/session_20260411_183605.md
docs/ops/session_archive/session_20260411_185106.md
docs/ops/session_archive/session_20260411_190605.md
docs/ops/session_archive/session_20260411_192105.md
docs/ops/session_archive/session_20260411_193605.md
docs/ops/session_archive/session_20260411_195106.md
docs/ops/session_archive/session_20260411_200605.md
docs/ops/session_archive/session_20260411_202106.md
docs/ops/session_archive/session_20260411_203606.md
docs/ops/session_archive/session_20260412_070607.md
docs/ops/session_archive/session_20260412_072105.md
docs/ops/session_archive/session_20260412_073605.md
docs/ops/session_archive/session_20260412_075105.md
docs/ops/session_archive/session_20260412_080605.md
docs/ops/session_archive/session_20260412_082105.md
docs/ops/session_archive/session_20260412_083605.md
docs/ops/session_archive/session_20260412_085105.md
docs/ops/session_archive/session_20260412_090605.md
docs/ops/session_archive/session_20260412_092105.md
docs/ops/session_archive/session_20260412_093605.md
docs/ops/session_archive/session_20260412_095105.md
docs/ops/session_archive/session_20260412_100605.md
docs/ops/session_archive/session_20260412_102105.md
docs/ops/session_archive/session_20260412_103606.md
docs/ops/session_archive/session_20260412_105106.md
docs/ops/session_archive/session_20260412_110606.md
docs/ops/session_archive/session_20260412_112105.md
docs/ops/session_archive/session_20260412_113605.md
docs/ops/session_archive/session_20260412_115105.md
docs/ops/session_archive/session_20260412_120605.md
docs/ops/session_archive/session_20260412_122108.md
docs/ops/session_archive/session_20260412_123605.md
docs/ops/session_archive/session_20260412_125105.md
docs/ops/session_archive/session_20260412_132107.md
docs/ops/session_archive/session_20260412_135106.md
docs/ops/session_archive/session_20260412_140611.md
docs/ops/session_archive/session_20260412_142105.md
docs/ops/session_archive/session_20260412_143605.md
docs/ops/session_archive/session_20260412_145105.md
docs/ops/session_archive/session_20260412_150605.md
docs/ops/session_archive/session_20260412_152105.md
docs/ops/session_archive/session_20260412_153605.md
docs/ops/session_archive/session_20260412_155106.md
docs/ops/session_archive/session_20260412_160606.md
docs/ops/session_archive/session_20260412_162105.md
docs/ops/session_archive/session_20260412_163605.md
docs/ops/session_archive/session_20260412_165105.md
docs/ops/session_archive/session_20260412_170605.md
docs/ops/session_archive/session_20260412_172105.md
docs/ops/session_archive/session_20260412_173605.md
docs/ops/session_archive/session_20260412_175105.md
docs/ops/session_archive/session_20260412_180605.md
docs/ops/session_archive/session_20260412_182105.md
docs/ops/session_archive/session_20260412_183606.md
docs/ops/session_archive/session_20260412_185106.md
docs/ops/session_archive/session_20260412_190605.md
docs/ops/session_archive/session_20260412_192106.md
docs/ops/session_archive/session_20260412_193607.md
docs/ops/session_archive/session_20260412_195106.md
docs/ops/session_archive/session_20260412_200605.md
docs/ops/session_archive/session_20260412_202106.md
docs/ops/session_archive/session_20260412_203605.md
docs/ops/session_archive/session_20260412_205105.md
docs/ops/session_archive/session_20260412_210605.md
docs/ops/session_archive/session_20260412_212105.md
docs/ops/session_archive/session_20260412_213606.md
docs/ops/session_archive/session_20260412_215106.md
docs/ops/session_archive/session_20260412_220605.md
docs/ops/session_archive/session_20260412_222105.md
docs/ops/session_archive/session_20260412_223605.md
docs/ops/session_archive/session_20260412_225105.md
docs/ops/session_archive/session_20260412_230606.md
docs/ops/session_archive/session_20260412_232105.md
docs/ops/session_archive/session_20260412_233605.md
docs/ops/session_archive/session_20260412_235105.md
docs/ops/session_archive/session_20260413_000605.md
docs/ops/session_archive/session_20260413_002106.md
docs/ops/session_archive/session_20260413_003606.md
docs/ops/session_archive/session_20260413_005105.md
docs/ops/session_archive/session_20260413_010606.md
docs/ops/session_archive/session_20260413_012105.md
docs/ops/session_archive/session_20260413_013606.md
docs/ops/session_archive/session_20260413_093607.md
docs/ops/session_archive/session_20260413_095108.md
docs/ops/session_archive/session_20260413_100606.md
docs/ops/session_archive/session_20260413_102107.md
docs/ops/session_archive/session_20260413_103606.md
docs/ops/session_archive/session_20260413_105107.md
docs/ops/session_archive/session_20260413_110607.md
docs/ops/session_archive/session_20260413_112107.md
docs/ops/session_archive/session_20260413_113607.md
docs/ops/session_archive/session_20260413_115107.md
docs/ops/session_archive/session_20260413_120607.md
docs/ops/session_archive/session_20260413_122107.md
docs/ops/session_archive/session_20260413_123607.md
docs/ops/session_archive/session_20260413_125107.md
docs/ops/session_archive/session_20260413_130607.md
docs/ops/session_archive/session_20260413_132108.md
docs/ops/session_archive/session_20260413_133607.md
docs/ops/session_archive/session_20260413_135108.md
docs/ops/session_archive/session_20260413_140607.md
docs/ops/session_archive/session_20260413_142108.md
docs/ops/session_archive/session_20260413_143607.md
docs/ops/session_archive/session_20260413_145107.md
docs/ops/session_archive/session_20260413_150607.md
docs/ops/session_archive/session_20260413_152107.md
docs/ops/session_archive/session_20260413_153607.md
docs/ops/session_archive/session_20260413_155107.md
docs/ops/session_archive/session_20260413_160608.md
docs/ops/session_archive/session_20260413_162108.md
docs/ops/session_archive/session_20260413_163608.md
docs/ops/session_archive/session_20260413_165108.md
docs/ops/session_archive/session_20260413_170607.md
docs/ops/session_archive/session_20260413_172107.md
docs/ops/session_archive/session_20260413_173607.md
docs/ops/session_archive/session_20260413_175107.md
docs/ops/session_archive/session_20260413_180607.md
docs/ops/session_archive/session_20260413_182108.md
docs/ops/session_archive/session_20260413_183607.md
docs/ops/session_archive/session_20260413_185107.md
docs/ops/session_archive/session_20260413_190609.md
docs/ops/session_archive/session_20260413_192108.md
docs/ops/session_archive/session_20260413_193607.md
docs/ops/session_archive/session_20260413_195107.md
docs/ops/session_archive/session_20260413_200607.md
docs/ops/session_archive/session_20260413_202107.md
docs/ops/session_archive/session_20260413_203609.md
docs/ops/session_archive/session_20260413_205109.md
docs/ops/session_archive/session_20260413_210607.md
docs/ops/session_archive/session_20260413_212108.md
docs/ops/session_archive/session_20260413_213607.md
docs/ops/session_archive/session_20260413_215107.md
docs/ops/session_archive/session_20260413_220610.md
docs/ops/session_archive/session_20260413_222107.md
docs/ops/session_archive/session_20260413_223607.md
docs/ops/session_archive/session_20260413_225107.md
docs/ops/session_archive/session_20260413_230607.md
docs/ops/session_archive/session_20260413_232108.md
docs/ops/session_archive/session_20260413_233607.md
docs/ops/session_archive/session_20260413_235108.md
docs/ops/session_archive/session_20260414_000608.md
docs/ops/session_archive/session_20260414_002107.md
docs/ops/session_archive/session_20260414_003608.md
docs/ops/session_archive/session_20260414_005109.md
docs/ops/session_archive/session_20260414_010608.md
docs/ops/session_archive/session_20260414_012107.md
docs/ops/session_archive/session_20260414_013608.md
docs/ops/session_archive/session_20260414_015108.md
docs/ops/session_archive/session_20260414_020608.md
docs/ops/session_archive/session_20260414_022107.md
docs/ops/session_archive/session_20260414_083607.md
docs/ops/session_archive/session_20260414_085107.md
docs/ops/session_archive/session_20260414_090608.md
docs/ops/session_archive/session_20260414_092107.md
docs/ops/session_archive/session_20260414_093608.md
docs/ops/session_archive/session_20260414_095108.md
docs/ops/session_archive/session_20260414_100609.md
docs/ops/session_archive/session_20260414_102108.md
docs/ops/session_archive/session_20260414_103607.md
docs/ops/session_archive/session_20260414_105107.md
docs/ops/session_archive/session_20260414_110607.md
docs/ops/session_archive/session_20260414_112107.md
docs/ops/session_archive/session_20260414_113607.md
docs/ops/session_archive/session_20260414_115108.md
docs/ops/session_archive/session_20260414_120608.md
docs/ops/session_archive/session_20260414_122107.md
docs/ops/session_archive/session_20260414_123608.md
docs/ops/session_archive/session_20260414_124041.md
docs/ops/session_archive/session_20260414_125111.md
docs/ops/session_archive/session_20260414_130606.md
docs/ops/session_archive/session_20260414_132105.md
docs/ops/session_archive/session_20260414_133606.md
docs/ops/session_archive/session_20260414_135105.md
docs/ops/session_archive/session_20260414_140607.md
docs/ops/session_archive/session_20260414_142106.md
docs/ops/session_archive/session_20260414_143606.md
docs/ops/session_archive/session_20260414_145106.md
docs/ops/session_archive/session_20260414_150607.md
docs/ops/session_archive/session_20260414_152106.md
docs/ops/session_archive/session_20260414_153608.md
docs/ops/session_archive/session_20260414_155107.md
docs/ops/session_archive/session_20260414_160608.md
docs/ops/session_archive/session_20260414_162106.md
docs/ops/session_archive/session_20260414_163607.md
docs/ops/session_archive/session_20260414_165106.md
docs/ops/session_archive/session_20260414_170608.md
docs/ops/session_archive/session_20260414_171253.md
docs/ops/session_archive/session_20260414_171424.md
docs/ops/session_archive/session_20260414_172108.md
docs/ops/session_archive/session_20260415_135111.md
docs/ops/session_archive/session_20260415_140606.md
docs/ops/session_archive/session_20260415_142106.md
docs/ops/session_archive/session_20260415_143606.md
docs/ops/session_archive/session_20260415_145106.md
docs/ops/session_archive/session_20260415_150607.md
docs/ops/session_archive/session_20260415_152106.md
docs/ops/session_archive/session_20260415_153606.md
docs/ops/session_archive/session_20260415_155106.md
docs/ops/session_archive/session_20260415_162107.md
docs/ops/session_archive/session_20260415_163606.md
docs/ops/session_archive/session_20260415_165106.md
docs/ops/session_archive/session_20260415_170606.md
docs/ops/session_archive/session_20260415_172106.md
docs/ops/session_archive/session_20260415_173606.md
docs/ops/session_archive/session_20260415_175107.md
docs/ops/session_archive/session_20260415_180606.md
docs/ops/session_archive/session_20260415_182107.md
docs/ops/session_archive/session_20260415_183609.md
docs/ops/session_archive/session_20260415_185106.md
docs/ops/session_archive/session_20260415_190606.md
docs/ops/session_archive/session_20260415_192106.md
docs/ops/session_archive/session_20260415_193607.md
docs/ops/session_archive/session_20260415_193616.md
docs/ops/session_archive/session_20260415_194210.md
docs/ops/session_archive/session_20260415_195108.md
docs/ops/session_archive/session_20260415_200608.md
docs/ops/session_archive/session_20260415_201131.md
docs/ops/session_archive/session_20260415_202107.md
docs/ops/session_archive/session_20260415_203606.md
docs/ops/session_archive/session_20260416_163608.md
docs/ops/session_archive/session_20260416_165107.md
docs/ops/session_archive/session_20260416_170607.md
docs/ops/session_archive/session_20260416_172106.md
docs/ops/session_archive/session_20260416_173606.md
docs/ops/session_archive/session_20260416_175106.md
docs/ops/session_archive/session_20260416_180607.md
docs/ops/session_archive/session_20260416_182107.md
docs/ops/session_archive/session_20260416_183608.md
docs/ops/session_archive/session_20260416_185106.md
docs/ops/session_archive/session_20260416_190606.md
docs/ops/session_archive/session_20260416_192106.md
docs/ops/session_archive/session_20260416_193606.md
docs/ops/session_archive/session_20260416_195106.md
docs/ops/session_archive/session_20260416_200606.md
docs/ops/session_archive/session_20260416_202107.md
docs/ops/session_archive/session_20260416_203606.md
docs/ops/session_archive/session_20260416_205107.md
docs/ops/session_archive/session_20260416_210607.md
docs/ops/session_archive/session_20260416_211223.md
docs/ops/session_archive/session_20260417_170602.md
docs/ops/session_archive/session_20260417_172102.md
docs/ops/session_archive/session_20260417_173602.md
docs/ops/session_archive/session_20260417_175102.md
docs/ops/session_archive/session_20260417_180603.md
docs/ops/session_archive/session_20260417_182102.md
docs/ops/session_archive/session_20260417_183603.md
docs/ops/session_archive/session_20260417_185103.md
docs/ops/session_archive/session_20260417_190603.md
docs/ops/session_archive/session_20260417_192103.md
docs/ops/session_archive/session_20260417_193603.md
docs/ops/session_archive/session_20260417_195102.md
docs/ops/session_archive/session_20260417_200603.md
docs/ops/session_archive/session_20260417_202103.md
docs/ops/session_archive/session_20260417_203603.md
docs/ops/session_archive/session_20260417_204844.md
docs/ops/session_archive/session_20260417_205102.md
docs/ops/session_archive/session_20260417_210603.md
docs/ops/session_archive/session_20260419_072104.md
docs/ops/session_archive/session_20260419_073604.md
docs/ops/session_archive/session_20260419_075104.md
docs/ops/session_archive/session_20260419_080604.md
docs/ops/session_archive/session_20260419_082104.md
docs/ops/session_archive/session_20260419_133604.md
docs/ops/session_archive/session_20260419_140604.md
docs/ops/session_archive/session_20260419_142104.md
docs/ops/session_archive/session_20260419_143604.md
docs/ops/session_archive/session_20260419_145104.md
docs/ops/session_archive/session_20260419_150604.md
docs/ops/session_archive/session_20260419_152104.md
docs/ops/session_archive/session_20260419_153606.md
docs/ops/session_archive/session_20260419_155104.md
docs/ops/session_archive/session_20260419_160604.md
docs/ops/session_archive/session_20260419_162104.md
docs/ops/session_archive/session_20260419_163604.md
docs/ops/session_archive/session_20260419_165104.md
docs/ops/session_archive/session_20260419_170603.md
docs/ops/session_archive/session_20260419_172103.md
docs/ops/session_archive/session_20260419_173602.md
docs/ops/session_archive/session_20260419_175102.md
docs/ops/session_archive/session_20260419_180603.md
docs/ops/session_archive/session_20260419_182103.md
docs/ops/session_archive/session_20260419_183603.md
docs/ops/session_archive/session_20260419_185103.md
docs/ops/session_archive/session_20260420_065103.md
docs/ops/session_archive/session_20260420_070603.md
docs/ops/session_archive/session_20260420_072102.md
docs/ops/session_archive/session_20260420_073602.md
docs/ops/session_archive/session_20260420_075102.md
docs/ops/session_archive/session_20260420_080602.md
docs/ops/session_archive/session_20260420_082102.md
docs/ops/session_archive/session_20260420_083602.md
docs/ops/session_archive/session_20260420_085102.md
docs/ops/session_archive/session_20260420_090602.md
docs/ops/session_archive/session_20260420_092102.md
docs/ops/session_archive/session_20260420_093602.md
docs/ops/session_archive/session_20260420_095103.md
docs/ops/session_archive/session_20260420_100602.md
docs/ops/session_archive/session_20260420_102102.md
docs/ops/session_archive/session_20260420_103603.md
docs/ops/session_archive/session_20260420_105103.md
docs/ops/session_archive/session_20260420_110603.md
docs/ops/session_archive/session_20260420_112103.md
docs/ops/session_archive/session_20260420_113603.md
docs/ops/session_archive/session_20260420_115102.md
docs/ops/session_archive/session_20260420_120603.md
docs/ops/session_archive/session_20260420_122103.md
docs/ops/session_archive/session_20260420_123603.md
docs/ops/session_archive/session_20260420_125103.md
docs/ops/session_archive/session_20260420_130603.md
docs/ops/session_archive/session_20260420_132103.md
docs/ops/session_archive/session_20260420_133603.md
docs/ops/session_archive/session_20260421_052103.md
docs/ops/session_archive/session_20260421_053603.md
docs/ops/session_archive/session_20260421_055102.md
docs/ops/session_archive/session_20260421_060602.md
docs/ops/session_archive/session_20260421_062102.md
docs/ops/session_archive/session_20260421_063602.md
docs/ops/session_archive/session_20260421_065102.md
docs/ops/session_archive/session_20260421_070602.md
docs/ops/session_archive/session_20260421_072102.md
docs/ops/session_archive/session_20260421_073602.md
docs/ops/session_archive/session_20260421_075103.md
docs/ops/session_archive/session_20260421_080603.md
docs/ops/session_archive/session_20260421_082102.md
docs/ops/session_archive/session_20260421_083602.md
docs/ops/session_archive/session_20260421_085103.md
docs/ops/session_archive/session_20260421_090603.md
docs/ops/session_archive/session_20260421_092103.md
docs/ops/session_archive/session_20260421_093603.md
docs/ops/session_archive/session_20260421_095103.md
docs/ops/session_archive/session_20260421_100603.md
docs/ops/session_archive/session_20260421_102103.md
docs/ops/session_archive/session_20260421_103603.md
docs/ops/session_archive/session_20260421_105103.md
docs/ops/session_archive/session_20260421_110603.md
docs/ops/session_archive/session_20260421_112103.md
docs/ops/session_archive/session_20260421_113603.md
docs/ops/session_archive/session_20260421_115103.md
docs/ops/session_archive/session_20260421_120603.md
docs/ops/session_archive/session_20260421_122103.md
docs/ops/session_archive/session_20260421_123603.md
docs/ops/session_archive/session_20260421_125103.md
docs/ops/session_archive/session_20260421_130603.md
docs/ops/session_archive/session_20260421_132103.md
docs/ops/session_archive/session_20260421_133603.md
docs/ops/session_archive/session_20260421_135103.md
docs/ops/session_archive/session_20260421_140602.md
docs/ops/session_archive/session_20260421_142102.md
docs/ops/session_archive/session_20260421_143602.md
docs/ops/session_archive/session_20260421_145102.md
docs/ops/session_archive/session_20260421_150602.md
docs/ops/session_archive/session_20260421_152103.md
docs/ops/session_archive/session_20260421_153602.md
docs/ops/session_archive/session_20260421_155102.md
docs/ops/session_archive/session_20260421_160602.md
docs/ops/session_archive/session_20260421_162102.md
docs/ops/session_archive/session_20260421_163602.md
docs/ops/session_archive/session_20260421_165102.md
docs/ops/session_archive/session_20260421_170602.md
docs/ops/session_archive/session_20260421_172102.md
docs/ops/session_archive/session_20260421_173603.md
docs/ops/session_archive/session_20260421_175102.md
docs/ops/session_archive/session_20260421_180602.md
docs/ops/session_archive/session_20260421_182102.md
docs/ops/session_archive/session_20260421_183602.md
docs/ops/session_archive/session_20260421_185102.md
docs/ops/session_archive/session_20260421_190603.md
docs/ops/session_archive/session_20260421_192102.md
docs/ops/session_archive/session_20260421_193602.md
docs/ops/session_archive/session_20260421_195102.md
docs/ops/session_archive/session_20260421_200602.md
docs/ops/session_archive/session_20260421_202103.md
docs/ops/session_archive/session_20260421_203602.md
docs/ops/session_archive/session_20260421_205102.md
docs/ops/session_archive/session_20260421_210602.md
docs/ops/session_archive/session_20260421_212102.md
docs/ops/session_archive/session_20260421_213602.md
docs/ops/session_archive/session_20260421_215102.md
docs/ops/session_archive/session_20260421_220602.md
docs/ops/session_archive/session_20260421_222102.md
docs/ops/session_archive/session_20260421_223602.md
docs/ops/session_archive/session_20260421_225102.md
docs/ops/session_archive/session_20260421_230602.md
docs/ops/session_archive/session_20260421_232102.md
docs/ops/session_archive/session_20260422_090603.md
docs/ops/session_archive/session_20260422_092102.md
docs/ops/session_archive/session_20260422_093602.md
docs/ops/session_archive/session_20260422_095102.md
docs/ops/session_archive/session_20260422_100602.md
docs/ops/session_archive/session_20260422_102102.md
docs/ops/session_archive/session_20260422_103602.md
docs/ops/session_archive/session_20260422_105102.md
docs/ops/session_archive/session_20260422_110602.md
docs/ops/session_archive/session_20260422_112102.md
docs/ops/session_archive/session_20260422_113602.md
docs/ops/session_archive/session_20260422_115102.md
docs/ops/session_archive/session_20260422_120602.md
docs/ops/session_archive/session_20260422_122102.md
docs/ops/session_archive/session_20260422_123602.md
docs/ops/session_archive/session_20260422_125102.md
docs/ops/session_archive/session_20260422_130602.md
docs/ops/session_archive/session_20260422_132102.md
docs/ops/session_archive/session_20260422_133602.md
docs/ops/session_archive/session_20260422_135102.md
docs/ops/session_archive/session_20260422_140602.md
docs/ops/session_archive/session_20260422_142102.md
docs/ops/session_archive/session_20260422_143602.md
docs/ops/session_archive/session_20260422_145102.md
docs/ops/session_archive/session_20260422_150602.md
docs/ops/session_archive/session_20260422_152103.md
docs/ops/session_archive/session_20260422_153602.md
docs/ops/session_archive/session_20260422_155103.md
docs/ops/session_archive/session_20260422_160602.md
docs/ops/session_archive/session_20260422_162102.md
docs/ops/session_archive/session_20260422_163603.md
docs/ops/session_archive/session_20260422_165103.md
docs/ops/session_archive/session_20260422_170603.md
docs/ops/session_archive/session_20260422_172103.md
docs/ops/session_archive/session_20260422_173602.md
docs/ops/session_archive/session_20260422_175103.md
docs/ops/session_archive/session_20260422_180603.md
docs/ops/session_archive/session_20260422_182103.md
docs/ops/session_archive/session_20260422_183603.md
docs/ops/session_archive/session_20260423_001725.md
docs/ops/session_archive/session_20260423_002102.md
docs/ops/session_archive/session_20260423_003603.md
docs/ops/session_archive/session_20260423_005102.md
docs/ops/session_archive/session_20260423_010602.md
docs/ops/session_archive/session_20260423_012102.md
docs/ops/session_archive/session_20260423_013602.md
docs/ops/session_archive/session_20260423_015102.md
docs/ops/session_archive/session_20260423_020602.md
docs/ops/session_archive/session_20260423_022102.md
docs/ops/session_archive/session_20260423_023602.md
docs/ops/session_archive/session_20260423_025102.md
docs/ops/session_archive/session_20260423_030602.md
docs/ops/session_archive/session_20260423_032102.md
docs/ops/session_archive/session_20260423_033602.md
docs/ops/session_archive/session_20260423_035102.md
docs/ops/session_archive/session_20260423_040602.md
docs/ops/session_archive/session_20260423_042103.md
docs/ops/session_archive/session_20260423_043602.md
docs/ops/session_archive/session_20260423_045102.md
docs/ops/session_archive/session_20260423_050603.md
docs/ops/session_archive/session_20260423_052103.md
docs/ops/session_archive/session_20260423_120602.md
docs/ops/session_archive/session_20260423_122102.md
docs/ops/session_archive/session_20260423_123603.md
docs/ops/session_archive/session_20260423_125102.md
docs/ops/session_archive/session_20260423_130602.md
docs/ops/session_archive/session_20260423_132102.md
docs/ops/session_archive/session_20260423_133603.md
docs/ops/session_archive/session_20260423_135103.md
docs/ops/session_archive/session_20260423_140602.md
docs/ops/session_archive/session_20260423_142102.md
docs/ops/session_archive/session_20260423_143602.md
docs/ops/session_archive/session_20260423_145103.md
docs/ops/session_archive/session_20260423_150603.md
docs/ops/session_archive/session_20260423_152103.md
docs/ops/session_archive/session_20260423_153603.md
docs/ops/session_archive/session_20260423_155103.md
docs/ops/session_archive/session_20260423_160603.md
docs/ops/session_archive/session_20260423_162103.md
docs/ops/session_archive/session_20260423_163603.md
docs/ops/session_archive/session_20260423_165103.md
docs/ops/session_archive/session_20260423_170603.md
docs/ops/session_archive/session_20260423_172103.md
docs/ops/session_archive/session_20260423_173603.md
docs/ops/session_archive/session_20260423_175103.md
docs/ops/session_archive/session_20260423_180603.md
docs/ops/session_archive/session_20260423_182103.md
docs/ops/session_archive/session_20260423_183603.md
docs/ops/session_archive/session_20260423_185103.md
docs/ops/session_archive/session_20260423_190603.md
docs/ops/session_archive/session_20260423_192103.md
docs/ops/session_archive/session_20260423_193603.md
docs/ops/session_archive/session_20260423_195103.md
docs/ops/session_archive/session_20260423_200603.md
docs/ops/session_archive/session_20260423_202103.md
docs/ops/session_archive/session_20260423_203603.md
docs/ops/session_archive/session_20260423_205103.md
docs/ops/session_archive/session_20260423_210603.md
docs/ops/session_archive/session_20260423_212103.md
docs/ops/session_archive/session_20260423_213603.md
docs/ops/session_archive/session_20260423_215103.md
docs/ops/session_archive/session_20260423_220603.md
docs/ops/session_archive/session_20260423_222103.md
docs/ops/session_archive/session_20260423_223603.md
docs/ops/session_archive/session_20260423_225103.md
docs/ops/session_archive/session_20260423_230216.md
docs/ops/session_archive/session_20260423_230603.md
docs/ops/session_archive/session_20260423_232103.md
docs/ops/session_archive/session_20260423_233603.md
docs/ops/session_archive/session_20260423_235051.md
docs/ops/session_archive/session_20260423_235103.md
docs/ops/session_archive/session_20260424_000604.md
docs/ops/session_archive/session_20260424_002104.md
docs/ops/session_archive/session_20260424_003604.md
docs/ops/session_archive/session_20260424_005104.md
docs/ops/session_archive/session_20260424_010604.md
docs/ops/session_archive/session_20260424_012104.md
docs/ops/session_archive/session_20260424_013604.md
docs/ops/session_archive/session_20260424_015104.md
docs/ops/session_archive/session_20260424_020604.md
docs/ops/session_archive/session_20260424_022104.md
docs/ops/session_archive/session_20260424_023604.md
docs/ops/session_archive/session_20260424_025104.md
docs/ops/session_archive/session_20260424_030604.md
docs/ops/session_archive/session_20260424_103603.md
docs/ops/session_archive/session_20260424_105104.md
docs/ops/session_archive/session_20260424_110603.md
docs/ops/session_archive/session_20260424_112103.md
docs/ops/session_archive/session_20260424_113603.md
docs/ops/session_archive/session_20260424_115103.md
docs/ops/session_archive/session_20260424_120603.md
docs/ops/session_archive/session_20260424_122104.md
docs/ops/session_archive/session_20260424_123603.md
docs/ops/session_archive/session_20260424_125103.md
docs/ops/session_archive/session_20260424_130603.md
docs/ops/session_archive/session_20260424_132103.md
docs/ops/session_archive/session_20260424_133604.md
docs/ops/session_archive/session_20260424_135104.md
docs/ops/session_archive/session_20260424_140603.md
docs/ops/session_archive/session_20260424_142104.md
docs/ops/session_archive/session_20260424_143604.md
docs/ops/session_archive/session_20260424_145104.md
docs/ops/session_archive/session_20260424_150604.md
docs/ops/session_archive/session_20260424_152104.md
docs/ops/session_archive/session_20260424_153603.md
docs/ops/session_archive/session_20260424_155104.md
docs/ops/session_archive/session_20260424_160604.md
docs/ops/session_archive/session_20260424_162104.md
docs/ops/session_archive/session_20260424_163604.md
docs/ops/session_archive/session_20260424_165104.md
docs/ops/session_archive/session_20260424_170603.md
docs/ops/session_archive/session_20260424_172103.md
docs/ops/session_archive/session_20260424_173603.md
docs/ops/session_archive/session_20260424_175103.md
docs/ops/session_archive/session_20260424_180603.md
docs/ops/session_archive/session_20260424_182103.md
docs/ops/session_archive/session_20260424_183603.md
docs/ops/session_archive/session_20260424_185104.md
docs/ops/session_archive/session_20260426_065104.md
docs/ops/session_archive/session_20260426_070604.md
docs/ops/session_archive/session_20260426_072104.md
docs/ops/session_archive/session_20260426_073604.md
docs/ops/session_archive/session_20260426_075104.md
docs/ops/session_archive/session_20260426_080604.md
docs/ops/session_archive/session_20260426_082104.md
docs/ops/session_archive/session_20260426_083604.md
docs/ops/session_archive/session_20260426_085104.md
docs/ops/session_archive/session_20260426_090604.md
docs/ops/session_archive/session_20260426_092104.md
docs/ops/session_archive/session_20260426_093604.md
docs/ops/session_archive/session_20260426_095104.md
docs/ops/session_archive/session_20260426_100604.md
docs/ops/session_archive/session_20260426_102104.md
docs/ops/session_archive/session_20260426_103604.md
docs/ops/session_archive/session_20260426_105104.md
docs/ops/session_archive/session_20260426_110604.md
docs/ops/session_archive/session_20260426_112104.md
docs/ops/session_archive/session_20260426_113604.md
docs/ops/session_archive/session_20260426_115104.md
docs/ops/session_archive/session_20260426_120604.md
docs/ops/session_archive/session_20260426_122104.md
docs/ops/session_archive/session_20260426_123604.md
docs/ops/session_archive/session_20260426_125104.md
docs/ops/session_archive/session_20260426_130604.md
docs/ops/session_archive/session_20260426_132104.md
docs/ops/session_archive/session_20260427_135105.md
docs/ops/session_archive/session_20260427_140604.md
docs/ops/session_archive/session_20260427_142104.md
docs/ops/session_archive/session_20260427_143604.md
docs/ops/session_archive/session_20260427_145104.md
docs/ops/session_archive/session_20260427_150604.md
docs/ops/session_archive/session_20260427_152104.md
docs/ops/session_archive/session_20260427_153604.md
docs/ops/session_archive/session_20260427_155104.md
docs/ops/session_archive/session_20260427_160604.md
docs/ops/session_archive/session_20260427_162104.md
docs/ops/session_archive/session_20260427_163604.md
docs/ops/session_archive/session_20260427_165104.md
docs/ops/session_archive/session_20260427_170604.md
docs/ops/session_archive/session_20260427_172104.md
docs/ops/session_archive/session_20260427_173604.md
docs/ops/session_archive/session_20260427_175104.md
docs/ops/session_archive/session_20260427_180604.md
docs/ops/session_archive/session_20260427_182104.md
docs/ops/session_archive/session_20260427_183604.md
docs/ops/session_archive/session_20260427_185104.md
docs/ops/session_archive/session_20260427_190604.md
docs/ops/session_archive/session_20260427_192104.md
docs/ops/session_archive/session_20260427_193604.md
docs/ops/session_archive/session_20260427_195104.md
docs/ops/session_archive/session_20260427_200605.md
docs/ops/session_archive/session_20260427_202104.md
docs/ops/session_archive/session_20260427_203604.md
docs/ops/session_archive/session_20260427_205104.md
docs/ops/session_archive/session_20260427_210604.md
docs/ops/session_archive/session_20260428_153605.md
docs/ops/session_archive/session_20260428_155104.md
docs/ops/session_archive/session_20260428_160604.md
docs/ops/session_archive/session_20260428_162104.md
docs/ops/session_archive/session_20260428_163606.md
docs/ops/session_archive/session_20260428_165103.md
docs/ops/session_archive/session_20260428_170603.md
docs/ops/session_archive/session_20260428_172104.md
docs/ops/session_archive/session_20260428_173603.md
docs/ops/session_archive/session_20260428_175104.md
docs/ops/session_archive/session_20260428_180603.md
docs/ops/session_archive/session_20260428_182103.md
docs/ops/session_archive/session_20260428_183604.md
docs/ops/session_archive/session_20260428_185104.md
docs/ops/session_archive/session_20260429_070604.md
docs/ops/session_archive/session_20260429_072104.md
docs/ops/session_archive/session_20260429_073604.md
docs/ops/session_archive/session_20260429_075104.md
docs/ops/session_archive/session_20260429_080604.md
docs/ops/session_archive/session_20260429_082104.md
docs/ops/session_archive/session_20260429_083604.md
docs/ops/session_archive/session_20260429_085104.md
docs/ops/session_archive/session_20260429_180604.md
docs/ops/session_archive/session_20260429_182104.md
docs/ops/session_archive/session_20260429_183604.md
docs/ops/session_archive/session_20260429_185104.md
docs/ops/session_archive/session_20260429_190604.md
docs/ops/session_archive/session_20260429_192104.md
docs/ops/session_archive/session_20260429_193604.md
docs/ops/session_archive/session_20260429_195106.md
docs/ops/session_archive/session_20260429_200603.md
docs/ops/session_archive/session_20260429_202103.md
docs/ops/session_archive/session_20260429_203603.md
docs/ops/session_archive/session_20260429_205104.md
docs/ops/session_archive/session_20260429_210604.md
docs/ops/session_archive/session_20260430_173604.md
docs/ops/session_archive/session_20260430_175105.md
docs/ops/session_archive/session_20260430_180604.md
docs/ops/session_archive/session_20260430_182103.md
docs/ops/session_archive/session_20260430_183603.md
docs/ops/session_archive/session_20260430_185103.md
docs/ops/session_archive/session_20260430_190603.md
docs/ops/session_archive/session_20260430_192103.md
docs/ops/session_archive/session_20260430_193603.md
docs/ops/session_archive/session_20260430_195103.md
docs/ops/session_archive/session_20260430_200604.md
docs/ops/session_archive/session_20260430_202103.md
docs/ops/session_archive/session_20260430_203603.md
docs/ops/session_archive/session_20260430_205103.md
docs/ops/session_archive/session_20260502_103605.md
docs/ops/session_archive/session_20260502_105104.md
docs/ops/session_archive/session_20260502_110604.md
docs/ops/session_archive/session_20260502_112104.md
docs/ops/session_archive/session_20260502_113604.md
docs/ops/session_archive/session_20260502_115104.md
docs/ops/session_archive/session_20260502_120604.md
docs/ops/session_archive/session_20260502_122104.md
docs/ops/session_archive/session_20260502_123604.md
docs/ops/session_archive/session_20260502_125104.md
docs/ops/session_archive/session_20260502_130604.md
docs/ops/session_archive/session_20260502_132104.md
docs/ops/session_archive/session_20260502_133604.md
docs/ops/session_archive/session_20260502_135104.md
docs/ops/session_archive/session_20260502_140604.md
docs/ops/session_archive/session_20260502_142104.md
docs/ops/session_archive/session_20260502_143604.md
docs/ops/session_archive/session_20260502_145104.md
docs/ops/session_archive/session_20260502_150605.md
docs/ops/session_archive/session_20260502_152104.md
docs/ops/session_archive/session_20260502_153604.md
docs/ops/session_archive/session_20260502_155103.md
docs/ops/session_archive/session_20260502_160603.md
docs/ops/session_archive/session_20260502_162103.md
docs/ops/session_archive/session_20260502_233604.md
docs/ops/session_archive/session_20260502_235105.md
docs/ops/session_archive/session_20260503_000604.md
docs/ops/session_archive/session_20260503_002104.md
docs/ops/session_archive/session_20260503_003604.md
docs/ops/session_archive/session_20260503_005104.md
docs/ops/session_archive/session_20260503_010604.md
docs/ops/session_archive/session_20260503_012104.md
lib/__tests__/preparedProfilesShiftpals.test.ts
lib/__tests__/profileTransfer.test.ts
lib/__tests__/ruleSyncMerge.test.ts
"lib/__tests__/timeclock.test (# Edit conflict 2026-04-29 iguom8C #).ts"
lib/__tests__/vacationPlanningEngine.test.ts
lib/__tests__/wDayEngine.test.ts
lib/__tests__/zeitkontoEngine.test.ts
lib/backend/spaceStatusSync.ts
lib/preparedProfilesShiftpals.ts
lib/profileTransfer.ts
lib/spaceDeleteTombstones.ts
lib/spaceStatusRelevance.ts
lib/vacationPlanningEngine.ts
lib/wDayEngine.ts
lib/zeitkontoEngine.ts
reports/claude/archive/implementation_2026-04-07_timeclock_runtime_mismatch_fix.md
reports/claude/archive/implementation_2026-04-11_timeclock_p0_consistency_fix.md
reports/claude/archive/implementation_2026-04-12_zeitkonto_card_p1.md
reports/claude/archive/implementation_2026-04-15_ruleprofile_member_sync_fix.md
reports/minimax/archive/QA_review_2026-04-07_timeclock_runtime_mismatch_regate.md
reports/minimax/archive/QA_review_2026-04-11_timeclock_p0_consistency_regate.md
reports/minimax/archive/QA_review_2026-04-12_zeitkonto_card_p1_regate.md
scripts/ops/build_install_android_release.ps1
types/preparedProfile.ts
types/spaceStatus.ts
types/vacationPlanning.ts
```
