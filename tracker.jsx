import React, { useState, useEffect, useMemo, useCallback } from "react";

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `entry:${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayDate = () => new Date();
const dayLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const shortDow = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });

function calcSleepHours(bed, wake) {
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let start = bh * 60 + bm;
  let end = wh * 60 + wm;
  if (end <= start) end += 24 * 60; // crossed midnight
  const mins = end - start;
  return Math.round((mins / 60) * 10) / 10;
}

function lastNDates(n) {
  const arr = [];
  const base = todayDate();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    arr.push(isoOf(d));
  }
  return arr;
}

const EXERCISE_OPTIONS = [
  { key: "run", label: "Run" },
  { key: "walk", label: "Walk" },
  { key: "strength", label: "Strength" },
  { key: "pushups", label: "Push-ups" },
  { key: "none", label: "None" },
];

const TRIGGER_OPTIONS = [
  { key: "boredom", label: "Boredom" },
  { key: "stress", label: "Stress" },
  { key: "habit-bedtime", label: "Bedtime habit" },
  { key: "content-exposure", label: "Content exposure" },
  { key: "other", label: "Other" },
];

const TIME_OF_DAY = [
  { key: "morning", label: "Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Evening" },
  { key: "late-night", label: "Late night" },
];

const emptyEntry = (iso) => ({
  date: iso,
  sleepTime: "",
  wakeTime: "",
  sleepHours: null,
  energyLevel: null,
  exerciseDone: [],
  habitOccurred: null, // null = unset, true/false
  timeOfDay: "",
  trigger: "",
  triggerNote: "",
  urgeVsAutopilot: "urge", // 'urge' | 'autopilot'
  mood: null,
  moodNote: "",
  notes: "",
});

// ---------- small UI atoms ----------
function SegButton({ active, onClick, children, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-4 py-3 rounded-xl text-sm font-medium transition-all border " +
        (active
          ? "bg-stone-800 text-stone-50 border-stone-800 shadow-sm"
          : "bg-white text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700") +
        " " +
        className
      }
    >
      {children}
    </button>
  );
}

function NumberScale({ value, onChange, max = 5, labels }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          title={labels ? labels[n - 1] : undefined}
          className={
            "flex-1 aspect-square rounded-xl text-base font-semibold border transition-all " +
            (value === n
              ? "bg-teal-700 text-white border-teal-700 shadow-sm scale-[1.03]"
              : "bg-white text-stone-400 border-stone-200 hover:border-teal-300 hover:text-teal-700")
          }
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={"bg-white rounded-2xl border border-stone-200 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] " + className}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="text-[11px] font-semibold tracking-wide uppercase text-stone-400 mb-2">{children}</div>;
}

// ---------- main component ----------
export default function HabitTracker() {
  const [entries, setEntries] = useState({}); // iso -> entry
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [selectedDate, setSelectedDate] = useState(isoOf(todayDate()));
  const [tab, setTab] = useState("entry"); // entry | week | insights
  const [rangeDays, setRangeDays] = useState(7); // 7 or 30 for insights

  const todayIso = isoOf(todayDate());

  // load last 60 days on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const dates = lastNDates(60);
        const results = {};
        await Promise.all(
          dates.map(async (iso) => {
            try {
              const r = await window.storage.get(`entry:${iso}`, false);
              if (r && r.value) {
                results[iso] = JSON.parse(r.value);
              }
            } catch (e) {
              // key not found is expected/normal; ignore
            }
          })
        );
        if (!cancelled) setEntries(results);
      } catch (e) {
        if (!cancelled) setError("Couldn't load your data. Try refreshing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = entries[selectedDate] || emptyEntry(selectedDate);

  const updateCurrent = useCallback(
    (patch) => {
      setEntries((prev) => {
        const base = prev[selectedDate] || emptyEntry(selectedDate);
        const next = { ...base, ...patch };
        // auto-calc sleep hours if both times present and not manually overridden in same patch
        if ((patch.sleepTime !== undefined || patch.wakeTime !== undefined) && patch.sleepHours === undefined) {
          const auto = calcSleepHours(next.sleepTime, next.wakeTime);
          next.sleepHours = auto;
        }
        return { ...prev, [selectedDate]: next };
      });
    },
    [selectedDate]
  );

  const saveEntry = useCallback(async () => {
    setSaveState("saving");
    try {
      const entry = entries[selectedDate] || emptyEntry(selectedDate);
      const result = await window.storage.set(`entry:${selectedDate}`, JSON.stringify(entry), false);
      if (!result) throw new Error("no result");
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (e) {
      setSaveState("error");
    }
  }, [entries, selectedDate]);

  // debounce autosave whenever current entry changes (only if it has any real data)
  useEffect(() => {
    const entry = entries[selectedDate];
    if (!entry) return;
    const hasData =
      entry.sleepTime || entry.wakeTime || entry.energyLevel || entry.exerciseDone.length ||
      entry.habitOccurred !== null || entry.mood || entry.notes || entry.moodNote || entry.triggerNote;
    if (!hasData) return;
    const t = setTimeout(() => {
      saveEntry();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries[selectedDate]]);

  const toggleExercise = (key) => {
    const cur = current.exerciseDone || [];
    let next;
    if (key === "none") {
      next = cur.includes("none") ? [] : ["none"];
    } else {
      const withoutNone = cur.filter((k) => k !== "none");
      next = withoutNone.includes(key) ? withoutNone.filter((k) => k !== key) : [...withoutNone, key];
    }
    updateCurrent({ exerciseDone: next });
  };

  // ---------- computed data for week/insights ----------
  const weekDates = useMemo(() => lastNDates(7), [entries]);
  const rangeDates = useMemo(() => lastNDates(rangeDays), [rangeDays]);

  const insights = useMemo(() => {
    const relevant = rangeDates.map((d) => entries[d]).filter(Boolean);
    const occurred = relevant.filter((e) => e.habitOccurred === true);
    const notOccurred = relevant.filter((e) => e.habitOccurred === false);

    const avg = (arr, key) => {
      const vals = arr.map((e) => e[key]).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
      if (!vals.length) return null;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    };

    const triggerCounts = {};
    const timeCounts = {};
    occurred.forEach((e) => {
      if (e.trigger) triggerCounts[e.trigger] = (triggerCounts[e.trigger] || 0) + 1;
      if (e.timeOfDay) timeCounts[e.timeOfDay] = (timeCounts[e.timeOfDay] || 0) + 1;
    });
    const topOf = (counts) => {
      const keys = Object.keys(counts);
      if (!keys.length) return null;
      return keys.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
    };
    const topTrigger = topOf(triggerCounts);
    const topTime = topOf(timeCounts);

    // current streak: consecutive days since last occurrence, walking back from today
    let streak = 0;
    const allDatesDesc = lastNDates(365).slice().reverse();
    for (const d of allDatesDesc) {
      const e = entries[d];
      if (!e || e.habitOccurred === null || e.habitOccurred === undefined) {
        if (d === todayIso) continue; // today may be unfilled, skip without breaking
        break;
      }
      if (e.habitOccurred === true) break;
      streak += 1;
    }

    return {
      count: relevant.length,
      occurredCount: occurred.length,
      notOccurredCount: notOccurred.length,
      avgSleepOccurred: avg(occurred, "sleepHours"),
      avgSleepNot: avg(notOccurred, "sleepHours"),
      avgEnergyOccurred: avg(occurred, "energyLevel"),
      avgEnergyNot: avg(notOccurred, "energyLevel"),
      topTrigger,
      topTime,
      streak,
    };
  }, [entries, rangeDates, todayIso]);

  const triggerLabel = (key) => TRIGGER_OPTIONS.find((t) => t.key === key)?.label || key;
  const timeLabel = (key) => TIME_OF_DAY.find((t) => t.key === key)?.label || key;

  // ---------- render ----------
  if (loading) {
    return (
      <div className="min-h-[500px] flex items-center justify-center bg-stone-50 rounded-2xl">
        <div className="text-stone-400 text-sm">Loading your log…</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto bg-stone-50 rounded-2xl overflow-hidden" style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      {/* header */}
      <div className="px-5 pt-6 pb-4 bg-stone-50">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-semibold text-stone-800 tracking-tight">Daily Log</h1>
          <div className="text-xs text-stone-400 min-w-[60px] text-right">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && <span className="text-teal-700">Saved ✓</span>}
            {saveState === "error" && <span className="text-rose-500">Save failed</span>}
          </div>
        </div>
        <p className="text-sm text-stone-400">Private. Just data, no judgment.</p>

        {error && (
          <div className="mt-3 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* tabs */}
        <div className="flex gap-1 mt-4 bg-stone-200/60 p-1 rounded-xl">
          {[
            { key: "entry", label: "Today" },
            { key: "week", label: "Week" },
            { key: "insights", label: "Insights" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "flex-1 py-2 rounded-lg text-sm font-medium transition-all " +
                (tab === t.key ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-8">
        {tab === "entry" && (
          <EntryForm
            entries={entries}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            current={current}
            updateCurrent={updateCurrent}
            toggleExercise={toggleExercise}
            todayIso={todayIso}
          />
        )}

        {tab === "week" && (
          <WeekView weekDates={weekDates} entries={entries} onSelectDay={(d) => { setSelectedDate(d); setTab("entry"); }} />
        )}

        {tab === "insights" && (
          <InsightsView
            insights={insights}
            rangeDays={rangeDays}
            setRangeDays={setRangeDays}
            triggerLabel={triggerLabel}
            timeLabel={timeLabel}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Entry form ----------
function EntryForm({ entries, selectedDate, setSelectedDate, current, updateCurrent, toggleExercise, todayIso }) {
  const dates = useMemo(() => lastNDates(7), []);

  return (
    <div className="space-y-4 pt-4">
      {/* date picker strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {dates.map((d) => {
          const has = entries[d];
          const active = d === selectedDate;
          return (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={
                "flex flex-col items-center justify-center min-w-[56px] py-2 rounded-xl border text-xs font-medium transition-all " +
                (active
                  ? "bg-stone-800 border-stone-800 text-white"
                  : "bg-white border-stone-200 text-stone-500 hover:border-stone-300")
              }
            >
              <span>{shortDow(d)}</span>
              <span className={"text-[10px] mt-0.5 " + (active ? "text-stone-300" : "text-stone-400")}>
                {new Date(d + "T00:00:00").getDate()}
              </span>
              {has && <span className={"w-1 h-1 rounded-full mt-1 " + (active ? "bg-teal-300" : "bg-teal-500")} />}
            </button>
          );
        })}
      </div>
      <div className="text-sm text-stone-500 font-medium">{dayLabel(selectedDate)}</div>

      {/* Sleep */}
      <Card>
        <SectionLabel>Sleep</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-stone-400 mb-1 block">Bedtime</span>
            <input
              type="time"
              value={current.sleepTime}
              onChange={(e) => updateCurrent({ sleepTime: e.target.value })}
              className="w-full px-3 py-3 rounded-xl border border-stone-200 text-stone-800 text-base focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
          <label className="block">
            <span className="text-xs text-stone-400 mb-1 block">Wake time</span>
            <input
              type="time"
              value={current.wakeTime}
              onChange={(e) => updateCurrent({ wakeTime: e.target.value })}
              className="w-full px-3 py-3 rounded-xl border border-stone-200 text-stone-800 text-base focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
        </div>
        {current.sleepHours !== null && current.sleepHours !== undefined && (
          <div className="text-sm text-stone-500 mt-2">≈ {current.sleepHours}h sleep</div>
        )}
      </Card>

      {/* Energy */}
      <Card>
        <SectionLabel>Energy on waking</SectionLabel>
        <NumberScale value={current.energyLevel} onChange={(n) => updateCurrent({ energyLevel: n })} labels={["Very low", "Low", "OK", "Good", "Great"]} />
      </Card>

      {/* Exercise */}
      <Card>
        <SectionLabel>Exercise</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {EXERCISE_OPTIONS.map((opt) => (
            <SegButton key={opt.key} active={current.exerciseDone.includes(opt.key)} onClick={() => toggleExercise(opt.key)} className="flex-1 min-w-[90px]">
              {opt.label}
            </SegButton>
          ))}
        </div>
      </Card>

      {/* Habit occurred */}
      <Card>
        <SectionLabel>Habit today</SectionLabel>
        <div className="flex gap-2">
          <SegButton
            active={current.habitOccurred === false}
            onClick={() => updateCurrent({ habitOccurred: false, timeOfDay: "", trigger: "", triggerNote: "" })}
            className="flex-1 py-4"
          >
            Didn't happen
          </SegButton>
          <SegButton active={current.habitOccurred === true} onClick={() => updateCurrent({ habitOccurred: true })} className="flex-1 py-4">
            It happened
          </SegButton>
        </div>

        {current.habitOccurred === true && (
          <div className="mt-4 space-y-4 pt-4 border-t border-stone-100">
            <div>
              <span className="text-xs text-stone-400 mb-2 block">Time of day</span>
              <div className="grid grid-cols-2 gap-2">
                {TIME_OF_DAY.map((t) => (
                  <SegButton key={t.key} active={current.timeOfDay === t.key} onClick={() => updateCurrent({ timeOfDay: t.key })}>
                    {t.label}
                  </SegButton>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs text-stone-400 mb-2 block">Trigger</span>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGER_OPTIONS.map((t) => (
                  <SegButton key={t.key} active={current.trigger === t.key} onClick={() => updateCurrent({ trigger: t.key })}>
                    {t.label}
                  </SegButton>
                ))}
              </div>
              {current.trigger === "other" && (
                <input
                  type="text"
                  placeholder="Describe the trigger…"
                  value={current.triggerNote}
                  onChange={(e) => updateCurrent({ triggerNote: e.target.value })}
                  className="w-full mt-2 px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              )}
            </div>

            <div>
              <span className="text-xs text-stone-400 mb-2 block">In the moment</span>
              <div className="flex gap-2">
                <SegButton active={current.urgeVsAutopilot === "urge"} onClick={() => updateCurrent({ urgeVsAutopilot: "urge" })} className="flex-1">
                  Clear urge
                </SegButton>
                <SegButton active={current.urgeVsAutopilot === "autopilot"} onClick={() => updateCurrent({ urgeVsAutopilot: "autopilot" })} className="flex-1">
                  Autopilot
                </SegButton>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Mood */}
      <Card>
        <SectionLabel>Mood</SectionLabel>
        <NumberScale value={current.mood} onChange={(n) => updateCurrent({ mood: n })} labels={["Rough", "Low", "OK", "Good", "Great"]} />
        <input
          type="text"
          placeholder="Anything about your mood? (optional)"
          value={current.moodNote}
          onChange={(e) => updateCurrent({ moodNote: e.target.value })}
          className="w-full mt-3 px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </Card>

      {/* Notes */}
      <Card>
        <SectionLabel>Notes</SectionLabel>
        <textarea
          placeholder="Anything else worth remembering… (optional)"
          value={current.notes}
          onChange={(e) => updateCurrent({ notes: e.target.value })}
          rows={2}
          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
        />
      </Card>
    </div>
  );
}

// ---------- Week view ----------
function WeekView({ weekDates, entries, onSelectDay }) {
  return (
    <div className="pt-4 space-y-3">
      <div className="text-sm text-stone-500 font-medium mb-1">Last 7 days</div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-separate border-spacing-y-2 min-w-[480px]">
          <thead>
            <tr className="text-[11px] text-stone-400 uppercase tracking-wide">
              <th className="text-left font-medium pl-1">Day</th>
              <th className="text-center font-medium">Habit</th>
              <th className="text-center font-medium">Sleep</th>
              <th className="text-center font-medium">Energy</th>
              <th className="text-center font-medium">Exercise</th>
            </tr>
          </thead>
          <tbody>
            {weekDates.map((d) => {
              const e = entries[d];
              const has = !!e;
              return (
                <tr key={d} onClick={() => onSelectDay(d)} className="cursor-pointer">
                  <td className="pl-1 py-2 bg-white rounded-l-xl border-y border-l border-stone-200">
                    <div className="font-medium text-stone-700">{shortDow(d)}</div>
                    <div className="text-[11px] text-stone-400">{new Date(d + "T00:00:00").getDate()}</div>
                  </td>
                  <td className="text-center bg-white border-y border-stone-200">
                    {has && e.habitOccurred === true && <span className="inline-block w-3 h-3 rounded-full bg-amber-400" title="Occurred" />}
                    {has && e.habitOccurred === false && <span className="inline-block w-3 h-3 rounded-full bg-teal-400" title="Didn't occur" />}
                    {(!has || e.habitOccurred === null) && <span className="text-stone-300 text-xs">—</span>}
                  </td>
                  <td className="text-center bg-white border-y border-stone-200 text-stone-600">
                    {has && e.sleepHours != null ? `${e.sleepHours}h` : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="text-center bg-white border-y border-stone-200 text-stone-600">
                    {has && e.energyLevel != null ? e.energyLevel : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="text-center bg-white rounded-r-xl border-y border-r border-stone-200 text-stone-600">
                    {has && e.exerciseDone && e.exerciseDone.length && !e.exerciseDone.includes("none") ? (
                      <span className="text-teal-600 text-xs font-medium">{e.exerciseDone.length}✓</span>
                    ) : has && e.exerciseDone && e.exerciseDone.includes("none") ? (
                      <span className="text-stone-300 text-xs">none</span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 text-xs text-stone-400 pt-1 pl-1">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> occurred</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-400 inline-block" /> didn't occur</span>
        <span>Tap a row to edit that day</span>
      </div>
    </div>
  );
}

// ---------- Insights view ----------
function InsightsView({ insights, rangeDays, setRangeDays, triggerLabel, timeLabel }) {
  const {
    count, occurredCount, notOccurredCount,
    avgSleepOccurred, avgSleepNot, avgEnergyOccurred, avgEnergyNot,
    topTrigger, topTime, streak,
  } = insights;

  return (
    <div className="pt-4 space-y-4">
      <div className="flex gap-1 bg-stone-200/60 p-1 rounded-xl w-fit">
        {[7, 30].map((n) => (
          <button
            key={n}
            onClick={() => setRangeDays(n)}
            className={
              "px-4 py-1.5 rounded-lg text-xs font-medium transition-all " +
              (rangeDays === n ? "bg-white text-stone-800 shadow-sm" : "text-stone-500")
            }
          >
            {n === 7 ? "7 days" : "30 days"}
          </button>
        ))}
      </div>

      {count === 0 ? (
        <Card>
          <p className="text-sm text-stone-400">No entries yet in this range. Fill in a few days to see patterns here.</p>
        </Card>
      ) : (
        <>
          <Card className="!bg-teal-800 !border-teal-800">
            <div className="text-teal-100 text-xs uppercase tracking-wide font-semibold mb-1">Current streak</div>
            <div className="text-3xl font-bold text-white">{streak} {streak === 1 ? "day" : "days"}</div>
            <div className="text-teal-200 text-xs mt-1">since last occurrence</div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <SectionLabel>Most common trigger</SectionLabel>
              <div className="text-lg font-semibold text-stone-800">{topTrigger ? triggerLabel(topTrigger) : "—"}</div>
            </Card>
            <Card>
              <SectionLabel>Most common time</SectionLabel>
              <div className="text-lg font-semibold text-stone-800">{topTime ? timeLabel(topTime) : "—"}</div>
            </Card>
          </div>

          <Card>
            <SectionLabel>Sleep vs. habit</SectionLabel>
            <div className="flex items-center justify-between text-sm">
              <div>
                <div className="text-stone-400 text-xs">On occurred days</div>
                <div className="text-xl font-semibold text-stone-800">{avgSleepOccurred != null ? `${avgSleepOccurred}h` : "—"}</div>
              </div>
              <div className="text-stone-300">vs</div>
              <div>
                <div className="text-stone-400 text-xs">On other days</div>
                <div className="text-xl font-semibold text-stone-800">{avgSleepNot != null ? `${avgSleepNot}h` : "—"}</div>
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel>Energy vs. habit</SectionLabel>
            <div className="flex items-center justify-between text-sm">
              <div>
                <div className="text-stone-400 text-xs">On occurred days</div>
                <div className="text-xl font-semibold text-stone-800">{avgEnergyOccurred != null ? avgEnergyOccurred : "—"}</div>
              </div>
              <div className="text-stone-300">vs</div>
              <div>
                <div className="text-stone-400 text-xs">On other days</div>
                <div className="text-xl font-semibold text-stone-800">{avgEnergyNot != null ? avgEnergyNot : "—"}</div>
              </div>
            </div>
          </Card>

          <div className="text-xs text-stone-400 px-1">
            Based on {count} logged {count === 1 ? "day" : "days"} ({occurredCount} occurred, {notOccurredCount} didn't) in the last {rangeDays} days. These are simple averages, not proof of causation — just patterns worth noticing.
          </div>
        </>
      )}
    </div>
  );
}