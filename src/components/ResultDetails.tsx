"use client";

interface ResultInfo {
  fileSize: number;
  format: string;
  width: number;
  height: number;
  processingTime: number;
  originalFileSize: number;
  originalFormat: string;
  originalWidth: number;
  originalHeight: number;
  requestId: string;
}

// ファイルサイズをフォーマットする関数
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface ResultDetailsProps {
  resultInfo: ResultInfo;
}

export function ResultDetails({ resultInfo }: ResultDetailsProps) {
  return (
    <div className="rounded-lg border bg-muted/50 p-3">
      <p className="text-xs font-medium text-foreground mb-2">生成結果</p>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">処理時間:</span>{" "}
          {resultInfo.processingTime >= 1000
            ? `${(resultInfo.processingTime / 1000).toFixed(2)}秒`
            : `${resultInfo.processingTime}ms`}
        </div>
        <div>
          <span className="font-medium text-foreground">元ファイル:</span>{" "}
          {resultInfo.originalFormat} / {formatFileSize(resultInfo.originalFileSize)} / {resultInfo.originalWidth} × {resultInfo.originalHeight}
        </div>
        <div>
          <span className="font-medium text-foreground">出力ファイル:</span>{" "}
          {resultInfo.format} / {formatFileSize(resultInfo.fileSize)} / {resultInfo.width} × {resultInfo.height}
        </div>
      </div>
      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Request ID:</span>{" "}
        <code className="bg-muted px-1 py-0.5 rounded">{resultInfo.requestId}</code>
      </div>
    </div>
  );
}
