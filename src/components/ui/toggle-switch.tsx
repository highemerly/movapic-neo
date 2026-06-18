"use client";

/**
 * オプトイン設定用のトグルスイッチ（見た目のみ）。
 * 視覚的なスイッチ＋スクリーンリーダー用の隠しチェックボックスを描画する。
 * 通常は <label> 内に他の説明要素と並べて配置する。
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  /** true の間はスイッチを半透明＋操作不可にする（保存中など） */
  disabled?: boolean;
}) {
  return (
    <>
      <div
        className={`relative flex-shrink-0 w-11 h-6 rounded-full border transition-colors ${
          checked ? "bg-primary border-primary" : "bg-input border-border"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
    </>
  );
}
