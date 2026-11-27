"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RotateCw } from "lucide-react";
import { SubtitleItem } from "@/components/SubtitleTranslator";
import { useI18n } from "@/lib/i18n/I18nContext";

interface BatchSuccessDisplayProps {
  successBatches: { index: number; items: SubtitleItem[] }[];
  onRetranslateBatch: (batchIndex: number) => Promise<void>;
  isProcessing: boolean;
}

const BATCH_SIZE = 10;

export default function BatchSuccessDisplay({
  successBatches,
  onRetranslateBatch,
  isProcessing,
}: BatchSuccessDisplayProps) {
  const { t } = useI18n();
  const [retranslatingBatches, setRetranslatingBatches] = useState<number[]>([]);

  if (successBatches.length === 0) {
    return null;
  }

  const handleRetranslate = async (batchIndex: number) => {
    setRetranslatingBatches(prev => [...prev, batchIndex]);
    try {
      await onRetranslateBatch(batchIndex);
    } catch (error) {
      console.error(`BatchSuccessDisplay: Error retranslating batch ${batchIndex}:`, error);
    } finally {
      setRetranslatingBatches(prev => prev.filter(index => index !== batchIndex));
    }
  };

  const handleRetranslateAll = async () => {
    const indices = successBatches.map(batch => batch.index);
    setRetranslatingBatches(indices);
    for (const index of indices) {
      try {
        await onRetranslateBatch(index);
      } catch (error) {
        console.error(`BatchSuccessDisplay: Error retranslating batch ${index}:`, error);
      } finally {
        setRetranslatingBatches(prev => prev.filter(i => i !== index));
      }
    }
  };

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-lg shadow-sm overflow-hidden mb-4">
      <div className="p-3 border-b border-emerald-200 bg-emerald-100/50 flex items-start gap-2">
        <CheckCircle2 className="text-emerald-500 h-5 w-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-medium text-emerald-800">
            {t('batchSuccessDisplay.successBatches', {
              count: successBatches.length,
              batches: successBatches.length === 1
                ? t('batchSuccessDisplay.batch')
                : t('batchSuccessDisplay.batches')
            })}
          </h3>
          <p className="text-sm text-emerald-700">
            {t('batchSuccessDisplay.description')}
          </p>
        </div>
        {successBatches.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetranslateAll}
            disabled={isProcessing || retranslatingBatches.length > 0}
            className="bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 whitespace-nowrap"
          >
            {t('batchSuccessDisplay.retranslateAll')}
          </Button>
        )}
      </div>

      <div className="p-2 grid gap-2 max-h-[300px] overflow-y-auto">
        {successBatches.map(({ index, items }) => {
          const firstId = items[0]?.id;
          const lastId = items[items.length - 1]?.id;
          const isRetranslating = retranslatingBatches.includes(index);

          return (
            <div
              key={`success-batch-${index}`}
              className="p-2 border border-emerald-100 rounded bg-white flex justify-between items-start gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 text-sm">
                  Batch {index + 1}: Subtitle {firstId} → {lastId}
                </div>
                <div className="text-xs text-emerald-600">
                  {t('batchSuccessDisplay.itemCount', { count: items.length })}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={isRetranslating || isProcessing}
                onClick={() => handleRetranslate(index)}
                className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 px-2 flex-shrink-0"
              >
                {isRetranslating ? (
                  <>
                    <RotateCw className="h-3 w-3 mr-1 animate-spin" />
                    {t('batchSuccessDisplay.retranslating')}
                  </>
                ) : (
                  <>
                    <RotateCw className="h-3 w-3 mr-1" />
                    {t('batchSuccessDisplay.retranslateBatch')}
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
