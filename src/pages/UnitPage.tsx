import { useEffect, useMemo, useState } from "react";
import { Button, Field, Panel, SegmentButton } from "../components/Panel";
import { usePageChrome } from "../hooks/usePageChrome";
import { getSetting, setSetting } from "../lib/storage";
import type { UsageDraft } from "../lib/storage";
import { toolById } from "../lib/toolRegistry";
import {
  convertUnits,
  createUnitHistoryEntry,
  formatUnitHistoryLabel,
  pushUnitHistory,
  unitCategories,
  type UnitCategoryKey,
  type UnitHistoryEntry
} from "../lib/tools/unit";

const unitHistorySettingKey = "tool:unit:history";
const unitHistoryLimit = 12;

export function UnitPage({ recordUsage }: { recordUsage: (entry: UsageDraft) => Promise<void> }) {
  const [categoryKey, setCategoryKey] = useState<UnitCategoryKey>("storage");
  const category = unitCategories[categoryKey];
  const [value, setValue] = useState(category.sample.value);
  const [from, setFrom] = useState(category.sample.unit);
  const [history, setHistory] = useState<UnitHistoryEntry[]>([]);

  const switchCategory = (key: UnitCategoryKey) => {
    const next = unitCategories[key];
    setCategoryKey(key);
    setValue(next.sample.value);
    setFrom(next.sample.unit);
  };

  const result = useMemo(() => convertUnits(categoryKey, value, from), [categoryKey, from, value]);
  const unitKeys = Object.keys(category.units);
  const metrics = [
    { label: "分类", value: category.label },
    { label: "单位数", value: unitKeys.length },
    { label: "历史", value: history.length },
    { label: "基准值", value: result.baseMetric, compact: true }
  ];
  usePageChrome({
    tool: toolById.unit,
    metrics
  });

  useEffect(() => {
    let alive = true;
    void getSetting<UnitHistoryEntry[]>(unitHistorySettingKey, []).then((entries) => {
      if (!alive) return;
      setHistory(Array.isArray(entries) ? entries : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  const applyHistoryEntry = (entry: UnitHistoryEntry) => {
    setCategoryKey(entry.categoryKey);
    setValue(entry.value);
    setFrom(entry.fromUnit);
  };

  const saveHistoryEntry = async () => {
    const entry = createUnitHistoryEntry({
      categoryKey,
      value,
      fromUnit: from,
      baseMetric: result.baseMetric,
      ok: result.ok
    });
    const nextHistory = pushUnitHistory(history, entry, unitHistoryLimit);
    setHistory(nextHistory);
    await setSetting(unitHistorySettingKey, nextHistory);
    await recordUsage({
      toolId: "unit",
      action: category.label,
      input: `${value} ${from}`,
      output: result.baseMetric,
      status: result.ok ? "ok" : "error"
    });
  };

  const clearHistory = async () => {
    setHistory([]);
    await setSetting(unitHistorySettingKey, []);
  };

  return (
    <section className="tool-shell">
      <div className="mode-strip unit-category-strip">
        <div className="segmented-control unit-category-control">
          {(Object.keys(unitCategories) as UnitCategoryKey[]).map((key) => (
            <SegmentButton active={key === categoryKey} key={key} onClick={() => switchCategory(key)}>
              {unitCategories[key].label}
            </SegmentButton>
          ))}
        </div>
      </div>
      <div className="single-workbench">
        <div className="single-main">
          <Panel
            title={category.kind === "radix" ? "进制转换" : `${category.label}单位换算`}
            actions={
              <Button
                onClick={() => {
                  setValue(category.sample.value);
                  setFrom(category.sample.unit);
                }}
              >
                示例
              </Button>
            }
          >
            <div className="form-grid">
              <Field label="输入值">
                <input value={value} onChange={(event) => setValue(event.target.value)} />
              </Field>
              <Field label="源单位">
                <select value={from} onChange={(event) => setFrom(event.target.value)}>
                  {unitKeys.map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="convert-result-grid">
              {result.results.map((item) => (
                <div className="convert-unit-card" key={item.unit}>
                  <span>{item.unit}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="convert-note">{category.note}</div>
          </Panel>
        </div>
        <aside className="side-stack">
          <Panel title="基准">
            <div className="tiny-list">
              {unitKeys.slice(0, 5).map((unit) => (
                <div className="tiny-row" key={unit}>
                  <span>{unit}</span>
                  <code>{category.kind === "radix" ? `base ${category.units[unit]}` : category.units[unit]}</code>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="历史">
            <div className="button-grid">
              <Button variant="primary" onClick={() => void saveHistoryEntry()}>
                记录本次换算
              </Button>
              <Button disabled={history.length === 0} onClick={() => void clearHistory()}>
                清空历史
              </Button>
            </div>
            <div className="history-list">
              {history.length ? (
                history.map((entry) => (
                  <button
                    className="sample-chip unit-history-chip"
                    key={entry.id}
                    onClick={() => applyHistoryEntry(entry)}
                    type="button"
                  >
                    <span>{formatUnitHistoryLabel(entry)}</span>
                    <span>{entry.baseMetric}</span>
                  </button>
                ))
              ) : (
                <div className="empty-state">还没有历史记录，记录一次后可点击回填。</div>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </section>
  );
}
