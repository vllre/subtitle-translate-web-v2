"use client";

import { useState, useEffect } from "react";
import {
  CustomLlmConfig,
  CustomLlmHeader,
  getCustomLlmConfig,
  getCustomLlmApiKey,
  saveCustomLlmConfig,
  testCustomLlmConnection,
  loadCustomLlmConfig,
} from "@/lib/customLlmApi";
import { useI18n } from "@/lib/i18n/I18nContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Server,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

interface CustomLlmConfigFormProps {
  onConfigChange?: (config: CustomLlmConfig, apiKey: string) => void;
}

type TestStatus = "idle" | "testing" | "success" | "error";

export default function CustomLlmConfigForm({ onConfigChange }: CustomLlmConfigFormProps) {
  const { t } = useI18n();

  // Local form state
  const [displayName, setDisplayName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [rawPromptMode, setRawPromptMode] = useState(false);
  const [extraHeaders, setExtraHeaders] = useState<CustomLlmHeader[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState("");

  // Validation errors
  const [urlError, setUrlError] = useState("");
  const [modelError, setModelError] = useState("");
  const [keyError, setKeyError] = useState("");

  // Load persisted config on mount
  useEffect(() => {
    const cfg = loadCustomLlmConfig();
    const key = getCustomLlmApiKey();
    setDisplayName(cfg.displayName ?? "");
    setBaseUrl(cfg.baseUrl ?? "");
    setModel(cfg.model ?? "");
    setApiKey(key ?? "");
    setRawPromptMode(cfg.rawPromptMode ?? false);
    setExtraHeaders(cfg.headers?.length ? cfg.headers : []);
    if (cfg.baseUrl && cfg.model && key) {
      setIsSaved(true);
    }
  }, []);

  // ── Validators ────────────────────────────────────────────────────────────

  const validateUrl = (val: string) => {
    if (!val.trim()) return t("customLlm.urlRequired");
    try {
      new URL(val.trim());
      return "";
    } catch {
      return t("customLlm.urlInvalid");
    }
  };

  const validateModel = (val: string) =>
    val.trim() ? "" : t("customLlm.modelRequired");

  const validateKey = (val: string) =>
    val.trim() ? "" : t("customLlm.apiKeyRequired");

  const validate = () => {
    const uErr = validateUrl(baseUrl);
    const mErr = validateModel(model);
    const kErr = validateKey(apiKey);
    setUrlError(uErr);
    setModelError(mErr);
    setKeyError(kErr);
    return !uErr && !mErr && !kErr;
  };

  // ── Header management ─────────────────────────────────────────────────────

  const addHeader = () =>
    setExtraHeaders((prev) => [...prev, { key: "", value: "" }]);

  const removeHeader = (idx: number) =>
    setExtraHeaders((prev) => prev.filter((_, i) => i !== idx));

  const updateHeader = (idx: number, field: "key" | "value", val: string) =>
    setExtraHeaders((prev) =>
      prev.map((h, i) => (i === idx ? { ...h, [field]: val } : h))
    );

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = () => {
    if (!validate()) return;
    const cfg: CustomLlmConfig = {
      baseUrl: baseUrl.trim().replace(/\/+$/, ""),
      model: model.trim(),
      headers: extraHeaders.filter((h) => h.key.trim()),
      displayName: displayName.trim(),
      rawPromptMode,
    };
    saveCustomLlmConfig(cfg, apiKey.trim());
    setIsSaved(true);
    setTestStatus("idle");
    onConfigChange?.(cfg, apiKey.trim());
  };

  // ── Test connection ───────────────────────────────────────────────────────

  const handleTest = async () => {
    if (!validate()) return;
    // Persist the current values first so testCustomLlmConnection reads them
    const cfg: CustomLlmConfig = {
      baseUrl: baseUrl.trim().replace(/\/+$/, ""),
      model: model.trim(),
      headers: extraHeaders.filter((h) => h.key.trim()),
      displayName: displayName.trim(),
      rawPromptMode,
    };
    saveCustomLlmConfig(cfg, apiKey.trim());
    onConfigChange?.(cfg, apiKey.trim());
    setTestStatus("testing");
    setTestError("");
    const result = await testCustomLlmConnection();
    if (result.success) {
      setTestStatus("success");
      setIsSaved(true);
    } else {
      setTestStatus("error");
      setTestError(result.error ?? t("customLlm.testFailed"));
    }
  };

  // Mark unsaved whenever user edits any field
  const markUnsaved = () => setIsSaved(false);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-violet-500" />
          <span className="font-medium text-sm">{t("customLlm.sectionTitle")}</span>
        </div>
        {isSaved && (
          <Badge variant="outline" className="text-xs gap-1 text-emerald-600 border-emerald-300 dark:border-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            {t("customLlm.saved")}
          </Badge>
        )}
      </div>

      {/* Display Name */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          {t("customLlm.displayName")}
        </label>
        <Input
          value={displayName}
          onChange={(e) => { setDisplayName(e.target.value); markUnsaved(); }}
          placeholder={t("customLlm.displayNamePlaceholder")}
          className="h-8 text-sm"
        />
      </div>

      {/* Base URL */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          {t("customLlm.baseUrl")} <span className="text-rose-500">*</span>
        </label>
        <Input
          value={baseUrl}
          onChange={(e) => { setBaseUrl(e.target.value); setUrlError(""); markUnsaved(); }}
          onBlur={() => setUrlError(validateUrl(baseUrl))}
          placeholder={t("customLlm.baseUrlPlaceholder")}
          className={`h-8 text-sm font-mono ${urlError ? "border-rose-400" : ""}`}
        />
        {urlError && <p className="text-xs text-rose-500">{urlError}</p>}
      </div>

      {/* Model */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          {t("customLlm.model")} <span className="text-rose-500">*</span>
        </label>
        <Input
          value={model}
          onChange={(e) => { setModel(e.target.value); setModelError(""); markUnsaved(); }}
          onBlur={() => setModelError(validateModel(model))}
          placeholder={t("customLlm.modelPlaceholder")}
          className={`h-8 text-sm font-mono ${modelError ? "border-rose-400" : ""}`}
        />
        {modelError && <p className="text-xs text-rose-500">{modelError}</p>}
      </div>

      {/* API Key */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          {t("customLlm.apiKey")} <span className="text-rose-500">*</span>
        </label>
        <div className="relative">
          <Input
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setKeyError(""); markUnsaved(); }}
            onBlur={() => setKeyError(validateKey(apiKey))}
            placeholder={t("customLlm.apiKeyPlaceholder")}
            className={`h-8 text-sm pr-10 font-mono ${keyError ? "border-rose-400" : ""}`}
            autoComplete="off"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowApiKey((v) => !v)}
            tabIndex={-1}
          >
            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {keyError && <p className="text-xs text-rose-500">{keyError}</p>}
      </div>

      {/* Raw Prompt Mode toggle */}
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <p className="text-xs font-medium">{t("customLlm.rawPromptMode")}</p>
          <p className="text-xs text-muted-foreground">{t("customLlm.rawPromptModeDescription")}</p>
        </div>
        <button
          type="button"
          onClick={() => { setRawPromptMode((v) => !v); markUnsaved(); }}
          className={`flex items-center transition-colors ${rawPromptMode ? "text-violet-500" : "text-muted-foreground"}`}
        >
          {rawPromptMode
            ? <ToggleRight className="h-6 w-6" />
            : <ToggleLeft className="h-6 w-6" />}
        </button>
      </div>

      {/* Custom Headers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            {t("customLlm.headers")}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1 px-2"
            onClick={addHeader}
          >
            <Plus className="h-3 w-3" />
            {t("customLlm.addHeader")}
          </Button>
        </div>
        {extraHeaders.map((h, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input
              value={h.key}
              onChange={(e) => { updateHeader(idx, "key", e.target.value); markUnsaved(); }}
              placeholder={t("customLlm.headerKey")}
              className="h-7 text-xs font-mono flex-1"
            />
            <Input
              value={h.value}
              onChange={(e) => { updateHeader(idx, "value", e.target.value); markUnsaved(); }}
              placeholder={t("customLlm.headerValue")}
              className="h-7 text-xs font-mono flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-rose-500"
              onClick={() => removeHeader(idx)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Test connection result */}
      {testStatus === "error" && (
        <div className="flex items-start gap-2 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{testError || t("customLlm.testFailed")}</span>
        </div>
      )}
      {testStatus === "success" && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{t("customLlm.testSuccess")}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs gap-1 flex-1"
          onClick={handleTest}
          disabled={testStatus === "testing"}
        >
          {testStatus === "testing"
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Server className="h-3 w-3" />}
          {testStatus === "testing" ? t("customLlm.testing") : t("customLlm.testConnection")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="text-xs gap-1 flex-1 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={handleSave}
        >
          <Save className="h-3 w-3" />
          {t("customLlm.save")}
        </Button>
      </div>
    </div>
  );
}
