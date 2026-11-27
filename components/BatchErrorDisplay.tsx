"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCw } from "lucide-react";
import { SubtitleItem } from "@/components/SubtitleTranslator";
import { useI18n } from "@/lib/i18n/I18nContext";

interface BatchErrorDisplayProps {
  failedBatches: { index: number; items: SubtitleItem[] }[];
  onRetryBatch: (batchIndex: number) => Promise<void>;
  isProcessing: boolean;
  batchSize?: number;
}

export default function BatchErrorDisplay({
  failedBatches,
  onRetryBatch,
  isProcessing,
  batchSize = 10,
}: BatchErrorDisplayProps) {
  const { t } = useI18n();
  const [retryingBatches, setRetryingBatches] = useState<number[]>([]);

  if (failedBatches.length === 0) {
    return null;
  }

  const handleRetry = async (batchIndex: number) => {
    console.log(`BatchErrorDisplay: Retrying batch ${batchIndex}`);
    
    // Log các failedBatches hiện tại để debug
    console.log("BatchErrorDisplay: Current failedBatches:", failedBatches.map(b => ({
      index: b.index,
      firstId: b.items[0]?.id,
      calcIndex: Math.floor((b.items[0]?.id - 1) / batchSize)
    })));
    
    // Kiểm tra batch có tồn tại trong danh sách hiện tại không
    const batchExists = failedBatches.some(batch => {
      if (!batch || !batch.items.length) return false;
      const firstId = batch.items[0]?.id || 0;
      const calculatedBatchIndex = Math.floor((firstId - 1) / batchSize);
      console.log(`Check batch: firstId=${firstId}, calculatedIndex=${calculatedBatchIndex}, targetIndex=${batchIndex}`);
      return calculatedBatchIndex === batchIndex;
    });
    
    if (!batchExists) {
      console.warn(`BatchErrorDisplay: Batch ${batchIndex} không còn tồn tại trong danh sách lỗi`);
      return;
    }
    
    setRetryingBatches(prev => [...prev, batchIndex]);
    
    try {
      await onRetryBatch(batchIndex);
      console.log(`BatchErrorDisplay: Successfully retried batch ${batchIndex}`);
    } catch (error) {
      console.error(`BatchErrorDisplay: Error retrying batch ${batchIndex}:`, error);
    } finally {
      setRetryingBatches(prev => prev.filter(index => index !== batchIndex));
    }
  };

  const handleRetryAll = async () => {
    // Create a copy of the indices to retry - filter out invalid batches
    const indicesToRetry = failedBatches
      .filter(batch => batch && batch.items && batch.items.length > 0)
      .map(batch => {
        // Tính toán lại batchIndex từ ID đầu tiên của batch
        const firstId = batch.items[0]?.id || 0;
        return Math.floor((firstId - 1) / batchSize);
      });
    
    if (indicesToRetry.length === 0) {
      console.warn("BatchErrorDisplay: Không có batch nào để thử lại");
      return;
    }
    
    // Mark all batches as retrying
    setRetryingBatches(indicesToRetry);
    
    // Retry each batch sequentially
    const retrySequentially = async () => {
      for (const index of indicesToRetry) {
        try {
          await onRetryBatch(index);
          console.log(`BatchErrorDisplay: Successfully retried batch ${index}`);
        } catch (error) {
          console.error(`BatchErrorDisplay: Error retrying batch ${index}:`, error);
        } finally {
          // Remove this batch from retrying state regardless of success/failure
          setRetryingBatches(prev => prev.filter(i => i !== index));
        }
      }
    };
    
    retrySequentially();
  };

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-lg shadow-sm overflow-hidden mb-4">
      <div className="p-3 border-b border-rose-200 bg-rose-100/50 flex items-start gap-2">
        <AlertTriangle className="text-rose-500 h-5 w-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-medium text-rose-800">
            {t('batchErrorDisplay.failedBatches', { 
              count: failedBatches.length, 
              batches: failedBatches.length === 1 
                ? t('batchErrorDisplay.batch') 
                : t('batchErrorDisplay.batches') 
            })}
          </h3>
          <p className="text-sm text-rose-700">
            {t('batchErrorDisplay.description')}
          </p>
        </div>
        {failedBatches.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetryAll}
            disabled={isProcessing || retryingBatches.length > 0}
            className="bg-white border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 whitespace-nowrap"
          >
            {t('common.retryAll')}
          </Button>
        )}
      </div>

      <div className="p-2 grid gap-2 max-h-[300px] overflow-y-auto">
        {failedBatches.map(({ index, items }) => {
          const firstId = items[0]?.id;
          const lastId = items[items.length - 1]?.id;
          const errorMessage = items[0]?.error || "Translation error occurred";
          
          // Tính toán lại batchIndex chính xác dựa trên ID đầu tiên của batch
          const actualBatchIndex = Math.floor((firstId - 1) / batchSize);
          const isRetrying = retryingBatches.includes(actualBatchIndex);
          
          return (
            <div
              key={`batch-${actualBatchIndex}`}
              className="p-2 border border-rose-100 rounded bg-white flex justify-between items-start gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 text-sm">
                  Batch {actualBatchIndex + 1}: Subtitle {firstId} → {lastId}
                </div>
                <div className="text-xs text-rose-600 truncate">{errorMessage}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={isRetrying || isProcessing}
                onClick={() => handleRetry(actualBatchIndex)}
                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8 px-2 flex-shrink-0"
              >
                {isRetrying ? (
                  <>
                    <RotateCw className="h-3 w-3 mr-1 animate-spin" />
                    {t('common.retrying')}
                  </>
                ) : (
                  <>
                    <RotateCw className="h-3 w-3 mr-1" />
                    {t('batchErrorDisplay.retryBatch')}
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
} 