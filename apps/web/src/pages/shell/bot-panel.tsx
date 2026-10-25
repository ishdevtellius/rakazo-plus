import { Trans, useLingui } from "@lingui/react/macro";
import type {
  AgentSkillCatalogEntry,
  Bot,
  ComputerMode,
  ConnectionTool,
  ConnectorToolPolicy,
  ConnectorWriteMode,
  Me,
  ModelCatalogEntry,
  ModelCredential,
  ThinkingLevel,
  VoiceInfo,
} from "@rakazo/contracts";
import {
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_NAME_MAX_LENGTH,
  BOT_TITLE_MAX_LENGTH,
  isBuiltinToolName,
} from "@rakazo/contracts";
import {
  connectedModelChoices,
  credentialForModel,
  modelOptionKey,
  parseModelOptionKey,
  resolveSelectableModelId,
} from "@rakazo/core";
import {
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  Switch,
  Textarea,
  Toggle,
} from "@rakazo/ui-web";
import { X } from "lucide-react";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ErrorBoundary, SectionLoadFailed } from "../../components/ErrorBoundary";
import { InstructionSettings } from "../../components/InstructionSettings";
import { botProfilePatch } from "../../lib/bot-profile-patch";
import { thinkingLevelLabel } from "../../lib/model-catalog";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";
import { AvatarStudioPopover } from "./avatar-studio-popover";
import { BotCredentialsSection } from "./bot-credentials";

const ScratchpadSection = lazy(() =>
  import("../ScratchpadSection").then((module) => ({ default: module.ScratchpadSection })),
);

const KnowledgeSection = lazy(() =>
  import("../KnowledgeSection").then((module) => ({ default: module.KnowledgeSection })),
);

const fieldLabelClass = "mt-4 block text-[14px] text-muted-foreground";

function ComputerModePicker({
  value,
  onChange,
  teamTestId,
  privateTestId,
}: {
  value: ComputerMode;
  onChange: (value: ComputerMode) => void;
  teamTestId?: string;
  privateTestId?: string;
}) {
  return (
    <div className="mt-4">
      <div className="text-[14px] text-muted-foreground">
        <Trans>Computer</Trans>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["team", "dedicated"] as const).map((mode) => (
          <Toggle
            key={mode}
            variant="outline"
            pressed={value === mode}
            data-testid={mode === "team" ? teamTestId : privateTestId}
            onPressedChange={(pressed) => {
              if (pressed) onChange(mode);
            }}
            className="capitalize aria-pressed:border-foreground/40 aria-pressed:text-foreground"
          >
            {mode === "team" ? <Trans>Team</Trans> : <Trans>Private</Trans>}
          </Toggle>
        ))}
      </div>
    </div>
  );
}

export function CreateBotForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: {
    name: string;
    title: string;
    description: string;
    computerMode: ComputerMode;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const ids = useId();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [computerMode, setComputerMode] = useState<ComputerMode>("team");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        title: title.trim(),
        description: description.trim(),
        computerMode,
      });
    } catch (err) {
      setError(errorText(err, t`Could not create bot`));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="create-bot-form">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[13.5px] text-muted-foreground">
          <Trans>New bot</Trans>
        </span>
        <Button variant="ghost" size="icon-sm" aria-label={t`Cancel new bot`} onClick={onCancel}>
          <X size={16} strokeWidth={1.8} />
        </Button>
      </div>
      {error ? (
        <p
          role="alert"
          data-testid="create-bot-error"
          className="mb-3 text-[13px] text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label htmlFor={`${ids}-name`} className="mt-6 block text-[14px] text-muted-foreground">
        <Trans>Name</Trans>
        <Input
          id={`${ids}-name`}
          value={name}
          maxLength={BOT_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
          placeholder={t`Name this bot`}
          className="mt-2"
        />
      </label>
      <label htmlFor={`${ids}-title`} className={fieldLabelClass}>
        <Trans>Title</Trans>
        <Input
          id={`${ids}-title`}
          value={title}
          maxLength={BOT_TITLE_MAX_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t`Describe what this bot does`}
          className="mt-2"
        />
      </label>
      <label htmlFor={`${ids}-description`} className={fieldLabelClass}>
        <Trans>Description</Trans>
        <Textarea
          id={`${ids}-description`}
          value={description}
          maxLength={BOT_DESCRIPTION_MAX_LENGTH}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t`What this bot is for`}
          rows={4}
          className="mt-2"
        />
      </label>
      <div data-testid="create-bot-computer">
        <ComputerModePicker
          value={computerMode}
          onChange={setComputerMode}
          teamTestId="create-bot-team"
          privateTestId="create-bot-private"
        />
      </div>
      <Button
        className="mt-5"
        disabled={!name.trim() || submitting}
        onClick={() => void handleSubmit()}
      >
        {submitting ? <Trans>Creating…</Trans> : <Trans>Create</Trans>}
      </Button>
    </div>
  );
}

export function BotSettings({
  bot,
  memoryProviderConfigured,
  onSkillsChange,
  onSave,
  onExport,
  onClear,
}: {
  bot: Bot;
  onSkillsChange: (skills: AgentSkillCatalogEntry[]) => void;
  memoryProviderConfigured: boolean;
  onSave: (patch: {
    name?: string;
    title?: string;
    description?: string;
    instructions?: string;
    color?: string;
    notifyOnFinish?: boolean;
    computerMode?: ComputerMode;
    memoryScope?: "isolated" | "shared" | null;
    autoSpeak?: boolean;
    fleetManagement?: boolean;
    voiceId?: string | null;
    modelProvider?: string | null;
    modelId?: string | null;
    thinkingLevel?: ThinkingLevel | null;
    disabledBuiltinTools?: string[];
    connectorToolPolicy?: ConnectorToolPolicy | null;
    computerHost?: "docker" | "this-mac" | null;
  }) => Promise<void>;
  onExport: () => Promise<void>;
  onClear: () => void;
}) {
  const { t } = useLingui();
  const [advancedOpened, setAdvancedOpened] = useState(false);
  const ids = useId();
  const [name, setName] = useState(bot.name);
  const [title, setTitle] = useState(bot.title);
  const savedNameRef = useRef(bot.name);
  const savedTitleRef = useRef(bot.title);
  const [description, setDescription] = useState(bot.description);
  // A roster refresh can skip replacing bots while a reorder is in flight, so
  // this prop keeps the description from when the panel opened. Later saves
  // compare against the description last saved here; otherwise a model or
  // voice change treats that stale text as an edit and overwrites instructions.
  const savedDescriptionRef = useRef(bot.description ?? "");
  const [color, setColor] = useState(bot.color);
  const [notifyOnFinish, setNotifyOnFinish] = useState(bot.notifyOnFinish ?? true);
  const [computerMode, setComputerMode] = useState(bot.computerMode);
  const [memoryScope, setMemoryScope] = useState(bot.memoryScope);
  const [autoSpeak, setAutoSpeak] = useState(bot.autoSpeak);
  const [fleetManagement, setFleetManagement] = useState(bot.fleetManagement);
  useEffect(() => setFleetManagement(bot.fleetManagement), [bot.fleetManagement]);
  const [connectorPolicy, setConnectorPolicy] = useState<ConnectorToolPolicy | null>(
    bot.connectorToolPolicy ?? null,
  );
  useEffect(() => {
    // A roster refresh must not undo a toggle whose save is still on its way.
    if (pendingSavesRef.current === 0) setConnectorPolicy(bot.connectorToolPolicy ?? null);
  }, [bot.connectorToolPolicy]);
  const [computerHost, setComputerHost] = useState<"docker" | "this-mac" | null>(
    bot.computerHost ?? null,
  );
  useEffect(() => {
    if (pendingSavesRef.current === 0) setComputerHost(bot.computerHost ?? null);
  }, [bot.computerHost]);
  const [allowToolDraft, setAllowToolDraft] = useState("");
  const [blockToolDraft, setBlockToolDraft] = useState("");
  const hasConnectorPolicy = connectorPolicy !== null;
  const [toolApps, setToolApps] = useState<string[]>([]);
  const [toolApp, setToolApp] = useState("");
  const [appTools, setAppTools] = useState<ConnectionTool[] | null>(null);
  const [appToolsLoading, setAppToolsLoading] = useState(false);
  const [toolFilter, setToolFilter] = useState("");
  useEffect(() => {
    if (!hasConnectorPolicy || toolApps.length > 0) return;
    let live = true;
    void rpc.connections
      .list()
      .then((rows) => {
        if (!live) return;
        const providers = rows
          .filter((row) => row.status === "connected")
          .map((row) => row.provider);
        setToolApps([...new Set(providers)].sort());
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hasConnectorPolicy, toolApps.length]);
  const [voiceId, setVoiceId] = useState(bot.voiceId ?? "");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [modelKey, setModelKey] = useState(
    bot.modelProvider && bot.modelId ? modelOptionKey(bot.modelProvider, bot.modelId) : "",
  );
  const [thinkingLevel, setThinkingLevel] = useState(bot.thinkingLevel ?? "");
  const [disabledBuiltinTools, setDisabledBuiltinTools] = useState<string[]>(
    bot.disabledBuiltinTools ?? [],
  );
  // The list on screen is updated before the save returns. This stays on the
  // last list the server accepted so a rejection can undo that preview.
  const persistedDisabledToolsRef = useRef(disabledBuiltinTools);
  const serverDisabledToolsRef = useRef(disabledBuiltinTools);
  const pendingSavesRef = useRef(0);
  useEffect(() => {
    const next = bot.disabledBuiltinTools ?? [];
    if (serverDisabledToolsRef.current === next) return;
    serverDisabledToolsRef.current = next;
    persistedDisabledToolsRef.current = next;
    if (pendingSavesRef.current === 0) setDisabledBuiltinTools(next);
  }, [bot.disabledBuiltinTools]);
  const [toolNameDraft, setToolNameDraft] = useState("");
  const [credentials, setCredentials] = useState<ModelCredential[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [modelMetaReady, setModelMetaReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const executeSaveRef = useRef<
    (patchOverrides?: {
      name?: string;
      title?: string;
      description?: string;
      color?: string;
      notifyOnFinish?: boolean;
      fleetManagement?: boolean;
      disabledBuiltinTools?: string[];
      baseDisabledBuiltinTools?: string[];
    }) => Promise<void>
  >(async () => undefined);
  useEffect(() => {
    void rpc.voice
      .voices({})
      .then(setVoices)
      .catch(() => setVoices([]));
    void Promise.all([rpc.models.credentials(), rpc.models.list(), rpc.me()])
      .then(([nextCredentials, nextCatalog, nextMe]) => {
        setCredentials(nextCredentials);
        setCatalog(nextCatalog);
        setMe(nextMe);
        // Only mark ready on success — a failed catalog load must not clear
        // an existing thinkingLevel override on save.
        setModelMetaReady(true);
      })
      .catch(() => undefined);
  }, []);

  const connectedOptions = connectedModelChoices(credentials, catalog);
  const storedModel = modelKey ? parseModelOptionKey(modelKey) : null;
  const selectedModel = storedModel
    ? {
        provider: storedModel.provider,
        modelId: resolveSelectableModelId(catalog, storedModel.provider, storedModel.modelId),
      }
    : null;
  const selectedModelKey = selectedModel
    ? modelOptionKey(selectedModel.provider, selectedModel.modelId)
    : "";

  const effectiveProvider = selectedModel?.provider ?? me?.defaultProvider ?? null;
  const effectiveModelId = selectedModel?.modelId ?? me?.defaultModel ?? null;
  const effectiveEntry =
    effectiveProvider && effectiveModelId
      ? catalog.find(
          (entry) =>
            entry.provider === effectiveProvider &&
            resolveSelectableModelId(catalog, entry.provider, entry.id) === effectiveModelId,
        )
      : undefined;
  const effectiveCredential = credentialForModel(credentials, effectiveProvider, effectiveModelId);
  const thinkingOptions = (
    effectiveCredential?.thinkingLevels ??
    effectiveEntry?.thinkingLevels ??
    []
  ).filter((level) => level !== "off");
  const defaultThinkingLevel = effectiveCredential?.thinkingLevel ?? "medium";

  async function executeSave(patchOverrides?: {
    name?: string;
    title?: string;
    description?: string;
    color?: string;
    notifyOnFinish?: boolean;
    fleetManagement?: boolean;
    connectorToolPolicy?: ConnectorToolPolicy | null;
    computerHost?: "docker" | "this-mac" | null;
    disabledBuiltinTools?: string[];
    baseDisabledBuiltinTools?: string[];
  }) {
    try {
      setSaving(true);
      setError(null);
      if (patchOverrides?.computerHost !== undefined) {
        await onSave({ computerHost: patchOverrides.computerHost });
        return;
      }
      if (patchOverrides?.fleetManagement !== undefined) {
        await onSave({ fleetManagement: patchOverrides.fleetManagement });
        return;
      }
      if (patchOverrides?.connectorToolPolicy !== undefined) {
        await onSave({ connectorToolPolicy: patchOverrides.connectorToolPolicy });
        return;
      }
      const selected = selectedModel;
      const nextName = (patchOverrides?.name !== undefined ? patchOverrides.name : name).trim();
      const nextTitle = (patchOverrides?.title !== undefined ? patchOverrides.title : title).trim();
      const nextDescription = (
        patchOverrides?.description !== undefined ? patchOverrides.description : description
      ).trim();
      const nextColor = patchOverrides?.color !== undefined ? patchOverrides.color : color;
      const nextNotify =
        patchOverrides?.notifyOnFinish !== undefined
          ? patchOverrides.notifyOnFinish
          : notifyOnFinish;

      if (nextName) setName(nextName);
      setTitle(nextTitle);
      setDescription(nextDescription);
      const patch = {
        ...(nextName && nextName !== savedNameRef.current.trim() ? { name: nextName } : {}),
        ...(nextTitle !== savedTitleRef.current.trim() ? { title: nextTitle } : {}),
        // Keep untouched profile fields off the wire.
        ...botProfilePatch(savedDescriptionRef.current, nextDescription),
        // Unchanged color stays off the wire so a legacy named value cannot fail a name save.
        ...(nextColor !== bot.color ? { color: nextColor } : {}),
        notifyOnFinish: nextNotify,
        computerMode,
        memoryScope,
        autoSpeak,
        voiceId: voiceId || null,
        modelProvider: selected?.provider ?? null,
        modelId: selected?.modelId ?? null,
        ...(modelMetaReady &&
        (thinkingOptions.length > 0 ||
          (selected?.provider ?? null) !== bot.modelProvider ||
          (selected?.modelId ?? null) !== bot.modelId)
          ? {
              thinkingLevel: thinkingOptions.length
                ? ((thinkingLevel || null) as ThinkingLevel | null)
                : null,
            }
          : {}),
      };
      const requestedTools = patchOverrides?.disabledBuiltinTools;
      const baseTools = patchOverrides?.baseDisabledBuiltinTools ?? [];
      // Preserve this edit's additions/removals against any refreshed server list.
      // Retry if a refresh arrives while the request is in flight.
      for (;;) {
        const serverTools = serverDisabledToolsRef.current;
        const nextTools =
          requestedTools === undefined
            ? undefined
            : [
                ...persistedDisabledToolsRef.current.filter(
                  (name) => !baseTools.includes(name) || requestedTools.includes(name),
                ),
                ...requestedTools.filter(
                  (name) =>
                    !baseTools.includes(name) && !persistedDisabledToolsRef.current.includes(name),
                ),
              ];
        // Unrelated saves omit the list, preserving changes from other sessions.
        await onSave({
          ...patch,
          ...(nextTools !== undefined ? { disabledBuiltinTools: nextTools } : {}),
        });
        if (nextTools === undefined) break;
        if (
          serverTools !== serverDisabledToolsRef.current &&
          !sameStringList(nextTools, serverDisabledToolsRef.current)
        )
          continue;
        persistedDisabledToolsRef.current = nextTools;
        break;
      }
      if (nextName) savedNameRef.current = nextName;
      savedTitleRef.current = nextTitle;
      savedDescriptionRef.current = nextDescription;
    } catch (err) {
      if (patchOverrides?.fleetManagement !== undefined)
        setFleetManagement(!patchOverrides.fleetManagement);
      // A choice that did not save must not keep showing as if it had: go back to what is saved.
      if (patchOverrides?.connectorToolPolicy !== undefined)
        setConnectorPolicy(bot.connectorToolPolicy ?? null);
      if (patchOverrides?.computerHost !== undefined) setComputerHost(bot.computerHost ?? null);
      setError(errorText(err, t`Could not save`));
    } finally {
      pendingSavesRef.current -= 1;
      if (pendingSavesRef.current === 0) {
        setDisabledBuiltinTools([...persistedDisabledToolsRef.current]);
      }
      setSaving(pendingSavesRef.current > 0);
    }
  }
  executeSaveRef.current = executeSave;

  function disableBuiltinTool(raw: string) {
    const name = raw.trim();
    if (!name) return;
    if (!isBuiltinToolName(name)) {
      setError(t`Unknown tool`);
      return;
    }
    setToolNameDraft("");
    setError(null);
    if (disabledBuiltinTools.includes(name)) return;
    const next = [...disabledBuiltinTools, name];
    setDisabledBuiltinTools(next);
    void enqueueSave({ disabledBuiltinTools: next });
  }

  const toolAppRequestRef = useRef(0);
  async function chooseToolApp(provider: string) {
    const request = ++toolAppRequestRef.current;
    setToolApp(provider);
    setAppTools(null);
    setToolFilter("");
    if (!provider) return;
    setAppToolsLoading(true);
    try {
      const tools = await rpc.connections.toolkitTools({ provider });
      // A slower answer for an app the user has already left must not replace the current list.
      if (request === toolAppRequestRef.current) setAppTools(tools);
    } catch {
      if (request === toolAppRequestRef.current) setAppTools([]);
    } finally {
      if (request === toolAppRequestRef.current) setAppToolsLoading(false);
    }
  }

  function connectorToolEnabled(tool: ConnectionTool) {
    if (!connectorPolicy) return true;
    const key = tool.slug.toLowerCase();
    if (connectorPolicy.blockTools.some((entry) => entry.toLowerCase() === key)) return false;
    if (!tool.write || connectorPolicy.writes !== "block") return true;
    return connectorPolicy.allowWriteTools.some((entry) => entry.toLowerCase() === key);
  }

  function toggleConnectorTool(tool: ConnectionTool, enable: boolean) {
    if (!connectorPolicy) return;
    const key = tool.slug.toLowerCase();
    const without = (list: string[]) => list.filter((entry) => entry.toLowerCase() !== key);
    let allowWriteTools = without(connectorPolicy.allowWriteTools);
    let blockTools = without(connectorPolicy.blockTools);
    if (enable) {
      if (tool.write && connectorPolicy.writes === "block")
        allowWriteTools = [...allowWriteTools, tool.slug];
    } else if (!tool.write || connectorPolicy.writes !== "block") {
      blockTools = [...blockTools, tool.slug];
    }
    saveConnectorPolicy({ ...connectorPolicy, allowWriteTools, blockTools });
  }

  function saveConnectorPolicy(next: ConnectorToolPolicy | null) {
    setConnectorPolicy(next);
    void enqueueSave({ connectorToolPolicy: next });
  }

  function addPolicyTool(list: "allowWriteTools" | "blockTools", raw: string) {
    const slug = raw.trim();
    if (!slug || !connectorPolicy) return;
    if (connectorPolicy[list].some((entry) => entry.toLowerCase() === slug.toLowerCase())) return;
    saveConnectorPolicy({ ...connectorPolicy, [list]: [...connectorPolicy[list], slug] });
  }

  function removePolicyTool(list: "allowWriteTools" | "blockTools", slug: string) {
    if (!connectorPolicy) return;
    saveConnectorPolicy({
      ...connectorPolicy,
      [list]: connectorPolicy[list].filter((entry) => entry !== slug),
    });
  }

  function enqueueSave(patchOverrides?: {
    name?: string;
    title?: string;
    description?: string;
    color?: string;
    notifyOnFinish?: boolean;
    fleetManagement?: boolean;
    connectorToolPolicy?: ConnectorToolPolicy | null;
    computerHost?: "docker" | "this-mac" | null;
    disabledBuiltinTools?: string[];
  }) {
    // Serialize full-object auto-saves so an older in-flight request cannot
    // finish after a newer one and clobber fields. Always call through a ref so
    // queued work reads the latest field values, not a stale render closure.
    pendingSavesRef.current += 1;
    const queuedPatch =
      patchOverrides?.disabledBuiltinTools === undefined
        ? patchOverrides
        : {
            ...patchOverrides,
            baseDisabledBuiltinTools: [...persistedDisabledToolsRef.current],
          };
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => executeSaveRef.current(queuedPatch));
    return saveQueueRef.current;
  }

  return (
    <div data-testid="bot-settings">
      <div className="flex justify-center py-4">
        <AvatarStudioPopover
          value={color}
          identity={bot.id}
          status={bot.status}
          size={76}
          onChange={(newColor) => {
            setColor(newColor);
            void enqueueSave({ color: newColor });
          }}
        />
      </div>
      <label htmlFor={`${ids}-name`} className="mt-4 block text-[13.5px] text-muted-foreground/80">
        <Trans>Name</Trans>
        <Input
          id={`${ids}-name`}
          value={name}
          maxLength={BOT_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void enqueueSave()}
          className="mt-1.5"
        />
      </label>
      <label htmlFor={`${ids}-title`} className={fieldLabelClass}>
        <Trans>Title</Trans>
        <Input
          id={`${ids}-title`}
          value={title}
          maxLength={BOT_TITLE_MAX_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void enqueueSave()}
          placeholder={t`e.g. Hivenet Agent, Presales, Timesheets bot`}
          className="mt-1.5"
        />
      </label>
      <label htmlFor={`${ids}-description`} className={fieldLabelClass}>
        <Trans>Description</Trans>
        <Textarea
          id={`${ids}-description`}
          value={description}
          maxLength={BOT_DESCRIPTION_MAX_LENGTH}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => void enqueueSave()}
          rows={3}
          className="mt-1.5"
        />
      </label>
      <div className="mt-6 flex items-center justify-between pt-4 border-t border-border/20">
        <div className="space-y-0.5 pe-4">
          <div
            id={`${ids}-notify-finish-label`}
            className="text-[13.5px] font-medium text-foreground"
          >
            <Trans>Notifications</Trans>
          </div>
          <div id={`${ids}-notify-finish-desc`} className="text-[12px] text-muted-foreground/70">
            <Trans>Get notified when this Bot finishes or needs input</Trans>
          </div>
        </div>
        <Switch
          id={`${ids}-notify-finish`}
          checked={notifyOnFinish}
          aria-labelledby={`${ids}-notify-finish-label`}
          aria-describedby={`${ids}-notify-finish-desc`}
          onCheckedChange={(checked) => {
            setNotifyOnFinish(checked);
            void enqueueSave({ notifyOnFinish: checked });
          }}
        />
      </div>
      <details
        data-testid="bot-settings-advanced"
        className="group mt-5"
        onToggle={(event) => {
          if (event.currentTarget.open) setAdvancedOpened(true);
        }}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] text-muted-foreground">
          <span className="text-muted-foreground">
            <Trans>Advanced</Trans>
          </span>
          <span aria-hidden="true" className="transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <InstructionSettings key={bot.id} bot={bot} />
        <ComputerModePicker value={computerMode} onChange={setComputerMode} />
        {me?.canChooseHostComputer ? (
          <div data-testid="bot-computer-host" className={fieldLabelClass}>
            {computerMode === "dedicated" ? (
              <label htmlFor={`${ids}-computer-host`}>
                <Trans>Where this bot runs</Trans>
                <NativeSelect
                  id={`${ids}-computer-host`}
                  data-testid="bot-computer-host-select"
                  className="mt-2 w-full"
                  value={computerHost ?? ""}
                  onChange={(event) => {
                    const next = (event.target.value || null) as "docker" | "this-mac" | null;
                    setComputerHost(next);
                    void enqueueSave({ computerHost: next });
                  }}
                >
                  <NativeSelectOption value="">
                    {me.computerHost === "this-mac"
                      ? t`Follow the default (This Mac)`
                      : t`Follow the default (Docker computer)`}
                  </NativeSelectOption>
                  <NativeSelectOption value="docker">{t`Docker computer`}</NativeSelectOption>
                  <NativeSelectOption value="this-mac">{t`This Mac`}</NativeSelectOption>
                </NativeSelect>
                <span className="mt-1 block text-[12px] text-muted-foreground/70">
                  <Trans>
                    Takes effect the next time this bot's computer starts. Moving to your Mac brings
                    over up to 512 MB of its files, but not logins kept inside the Docker computer
                    (such as GitHub). Your old computer stays untouched, so you can move back. Bots
                    on your Mac share one sandbox folder and can see each other's files, and files
                    made there are not included when you export a bot.
                  </Trans>
                </span>
              </label>
            ) : (
              <span className="block text-[12px] text-muted-foreground/70">
                <Trans>
                  This bot shares the Team Computer, so it runs wherever the default says (Settings,
                  Where bots run). Give it a dedicated computer to choose separately.
                </Trans>
              </span>
            )}
          </div>
        ) : null}
        <ErrorBoundary fallback={<SectionLoadFailed />}>
          <Suspense fallback={null}>
            <ScratchpadSection botId={bot.id} />
          </Suspense>
        </ErrorBoundary>
        {advancedOpened ? (
          <ErrorBoundary fallback={<SectionLoadFailed />}>
            <Suspense fallback={null}>
              <KnowledgeSection botId={bot.id} onSkillsChange={onSkillsChange} />
            </Suspense>
          </ErrorBoundary>
        ) : null}
        <label htmlFor={`${ids}-model`} className={fieldLabelClass}>
          <Trans>Model</Trans>
          <NativeSelect
            id={`${ids}-model`}
            className="mt-2 w-full"
            value={selectedModelKey}
            onChange={(event) => {
              setModelKey(event.target.value);
              setThinkingLevel("");
            }}
          >
            <NativeSelectOption value="">
              {t`Space default`}
              {me?.defaultModel
                ? ` (${catalogLabel(catalog, me.defaultProvider, me.defaultModel) ?? me.defaultModel})`
                : ""}
            </NativeSelectOption>
            {selectedModelKey &&
            !connectedOptions.some((option) => option.key === selectedModelKey) ? (
              <NativeSelectOption value={selectedModelKey}>
                {selectedModel?.modelId ?? selectedModelKey}
              </NativeSelectOption>
            ) : null}
            {connectedOptions.map((option) => (
              <NativeSelectOption key={option.key} value={option.key}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        {thinkingOptions.length ? (
          <label htmlFor={`${ids}-thinking`} className={fieldLabelClass}>
            <Trans>Thinking</Trans>
            <NativeSelect
              id={`${ids}-thinking`}
              className="mt-2 w-full"
              value={thinkingLevel}
              onChange={(event) => setThinkingLevel(event.target.value)}
            >
              <NativeSelectOption value="">
                {t`Default (${thinkingLevelLabel(defaultThinkingLevel)})`}
              </NativeSelectOption>
              {thinkingOptions.map((level) => (
                <NativeSelectOption key={level} value={level}>
                  {thinkingLevelLabel(level)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ) : null}
        {memoryProviderConfigured ? (
          <div className="mt-4 text-[14px] text-muted-foreground">
            <Trans>Memory scope</Trans>
            <div className="mt-2 flex gap-2">
              {(
                [
                  { value: null, label: t`Inherit default` },
                  { value: "isolated" as const, label: t`Isolated` },
                  { value: "shared" as const, label: t`Shared` },
                ] satisfies Array<{ value: "isolated" | "shared" | null; label: string }>
              ).map((option) => (
                <Toggle
                  key={option.label}
                  variant="outline"
                  size="sm"
                  pressed={memoryScope === option.value}
                  onPressedChange={(pressed) => {
                    if (pressed) setMemoryScope(option.value);
                  }}
                  className="flex-1 aria-pressed:border-foreground/40 aria-pressed:text-foreground"
                >
                  {option.label}
                </Toggle>
              ))}
            </div>
          </div>
        ) : null}
        <label
          htmlFor={`${ids}-auto-speak`}
          className="mt-5 flex cursor-pointer items-center gap-3 text-[14px] text-foreground/75"
        >
          <Switch
            id={`${ids}-auto-speak`}
            checked={autoSpeak}
            onCheckedChange={(checked) => setAutoSpeak(checked)}
          />
          <Trans>Read replies aloud</Trans>
        </label>
        <label
          htmlFor={`${ids}-fleet-management`}
          className="mt-5 flex cursor-pointer items-center gap-3 text-[14px] text-foreground/75"
        >
          <Switch
            id={`${ids}-fleet-management`}
            checked={fleetManagement}
            disabled={saving}
            onCheckedChange={(checked) => {
              setFleetManagement(checked);
              void enqueueSave({ fleetManagement: checked });
            }}
          />
          <Trans>Fleet management</Trans>
        </label>
        <div className="text-[12px] text-muted-foreground/70">
          <Trans>
            Lets this bot organize, retune and schedule the bots it creates. You approve each
            change.
          </Trans>
        </div>
        {voices.length ? (
          <label htmlFor={`${ids}-voice`} className={fieldLabelClass}>
            <Trans>Voice</Trans>
            <NativeSelect
              id={`${ids}-voice`}
              className="mt-2 w-full"
              value={voiceId}
              onChange={(event) => setVoiceId(event.target.value)}
            >
              <NativeSelectOption value="">{t`Account default`}</NativeSelectOption>
              {voices.map((voice) => (
                <NativeSelectOption key={voice.id} value={voice.id}>
                  {voice.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ) : null}
        <label htmlFor={`${ids}-disabled-tools`} className={fieldLabelClass}>
          <Trans>Disabled tools</Trans>
          <Input
            id={`${ids}-disabled-tools`}
            value={toolNameDraft}
            placeholder="web_search"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => {
              setToolNameDraft(event.target.value);
              // This message is about the name being typed. Leave other save errors alone.
              setError((current) => (current === t`Unknown tool` ? null : current));
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              disableBuiltinTool(event.currentTarget.value);
            }}
            onBlur={(event) => {
              if (event.currentTarget.value.trim()) disableBuiltinTool(event.currentTarget.value);
            }}
            className="mt-1.5 font-mono"
          />
        </label>
        {disabledBuiltinTools.map((toolName) => (
          <label
            key={toolName}
            htmlFor={`${ids}-disabled-${toolName}`}
            className="mt-2 flex items-center justify-between gap-3 text-[13px] text-foreground/80"
          >
            <span className="font-mono">{toolName}</span>
            <Switch
              id={`${ids}-disabled-${toolName}`}
              checked
              onCheckedChange={(checked) => {
                if (checked) return;
                const next = disabledBuiltinTools.filter((entry) => entry !== toolName);
                setDisabledBuiltinTools(next);
                void enqueueSave({ disabledBuiltinTools: next });
              }}
            />
          </label>
        ))}
        <label htmlFor={`${ids}-connector-writes`} className={fieldLabelClass}>
          <Trans>Connector tools that change data</Trans>
          <NativeSelect
            id={`${ids}-connector-writes`}
            className="mt-2 w-full"
            value={connectorPolicy?.writes ?? "off"}
            onChange={(event) => {
              const value = event.target.value;
              saveConnectorPolicy(
                value === "off"
                  ? null
                  : {
                      writes: value as ConnectorWriteMode,
                      allowWriteTools: connectorPolicy?.allowWriteTools ?? [],
                      blockTools: connectorPolicy?.blockTools ?? [],
                    },
              );
            }}
          >
            <NativeSelectOption value="block">{t`Blocked`}</NativeSelectOption>
            <NativeSelectOption value="ask">{t`Ask me every time`}</NativeSelectOption>
            <NativeSelectOption value="allow">{t`Allowed, with normal approvals`}</NativeSelectOption>
            <NativeSelectOption value="off">{t`No policy, approvals only`}</NativeSelectOption>
          </NativeSelect>
        </label>
        <div className="text-[12px] text-muted-foreground/70">
          <Trans>
            Reading (list, get, search) always works. Sending, posting, creating and deleting follow
            this setting, except for the tools you allow below.
          </Trans>
        </div>
        {connectorPolicy ? (
          <>
            <label htmlFor={`${ids}-allow-write-tool`} className={fieldLabelClass}>
              <Trans>Allowed write tools</Trans>
              <Input
                id={`${ids}-allow-write-tool`}
                value={allowToolDraft}
                placeholder="SLACK_SEND_MESSAGE"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => setAllowToolDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addPolicyTool("allowWriteTools", event.currentTarget.value);
                  setAllowToolDraft("");
                }}
                className="mt-1.5 font-mono"
              />
            </label>
            {connectorPolicy.allowWriteTools.map((slug) => (
              <label
                key={slug}
                htmlFor={`${ids}-allow-${slug}`}
                className="mt-2 flex items-center justify-between gap-3 text-[13px] text-foreground/80"
              >
                <span className="font-mono">{slug}</span>
                <Switch
                  id={`${ids}-allow-${slug}`}
                  checked
                  onCheckedChange={(checked) => {
                    if (!checked) removePolicyTool("allowWriteTools", slug);
                  }}
                />
              </label>
            ))}
            <label htmlFor={`${ids}-block-tool`} className={fieldLabelClass}>
              <Trans>Blocked tools</Trans>
              <Input
                id={`${ids}-block-tool`}
                value={blockToolDraft}
                placeholder="SLACK_SEARCH_MESSAGES"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => setBlockToolDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addPolicyTool("blockTools", event.currentTarget.value);
                  setBlockToolDraft("");
                }}
                className="mt-1.5 font-mono"
              />
            </label>
            {connectorPolicy.blockTools.map((slug) => (
              <label
                key={slug}
                htmlFor={`${ids}-block-${slug}`}
                className="mt-2 flex items-center justify-between gap-3 text-[13px] text-foreground/80"
              >
                <span className="font-mono">{slug}</span>
                <Switch
                  id={`${ids}-block-${slug}`}
                  checked
                  onCheckedChange={(checked) => {
                    if (!checked) removePolicyTool("blockTools", slug);
                  }}
                />
              </label>
            ))}
            <label htmlFor={`${ids}-browse-app`} className={fieldLabelClass}>
              <Trans>Browse an app's tools</Trans>
              <NativeSelect
                id={`${ids}-browse-app`}
                className="mt-2 w-full"
                value={toolApp}
                onChange={(event) => void chooseToolApp(event.target.value)}
              >
                <NativeSelectOption value="">{t`Choose a connected app`}</NativeSelectOption>
                {toolApps.map((provider) => (
                  <NativeSelectOption key={provider} value={provider}>
                    {provider}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            {appToolsLoading ? (
              <div className="mt-2 text-[12px] text-muted-foreground/70">
                <Trans>Loading tools…</Trans>
              </div>
            ) : null}
            {appTools ? (
              <>
                {appTools.length === 0 ? (
                  <div className="mt-2 text-[12px] text-muted-foreground/70">
                    <Trans>No tools found for this app.</Trans>
                  </div>
                ) : null}
                <div className="mt-2 text-[12px] text-muted-foreground/70">
                  {appTools.filter(connectorToolEnabled).length} / {appTools.length}{" "}
                  <Trans>tools on</Trans>
                  {" · "}
                  {appTools.filter((tool) => tool.write).length} <Trans>can change data</Trans>
                </div>
                <Input
                  value={toolFilter}
                  placeholder={t`Filter tools`}
                  aria-label={t`Filter tools`}
                  spellCheck={false}
                  onChange={(event) => setToolFilter(event.target.value)}
                  className="mt-1.5 font-mono"
                />
                {appTools
                  .filter((tool) =>
                    `${tool.slug} ${tool.name}`
                      .toLowerCase()
                      .includes(toolFilter.trim().toLowerCase()),
                  )
                  .slice(0, 100)
                  .map((tool) => (
                    <label
                      key={tool.slug}
                      htmlFor={`${ids}-tool-${tool.slug}`}
                      title={tool.description}
                      className="mt-2 flex items-center justify-between gap-3 text-[13px] text-foreground/80"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono">{tool.slug}</span>
                        <span className="text-[11px] text-muted-foreground/70">
                          {tool.write ? t`Changes data` : t`Read only`}
                        </span>
                      </span>
                      <Switch
                        id={`${ids}-tool-${tool.slug}`}
                        checked={connectorToolEnabled(tool)}
                        onCheckedChange={(checked) => toggleConnectorTool(tool, checked)}
                      />
                    </label>
                  ))}
              </>
            ) : null}
          </>
        ) : null}
        {advancedOpened ? <BotCredentialsSection botId={bot.id} /> : null}
      </details>
      {error ? <p className="mt-2 text-[13px] text-destructive">{error}</p> : null}
      <div className="mt-5 flex flex-col items-start gap-3">
        <Button
          disabled={saving}
          onClick={() => {
            void enqueueSave({
              name,
              title,
              description,
              color,
              notifyOnFinish,
            });
          }}
        >
          <Trans>Save</Trans>
        </Button>
        <Button variant="ghost" size="sm" className="-ms-2.5" onClick={() => void onExport()}>
          <Trans>Export</Trans>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="-ms-2.5 text-destructive hover:text-destructive"
          onClick={onClear}
        >
          <Trans>Clear conversation</Trans>
        </Button>
      </div>
    </div>
  );
}

function sameStringList(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function catalogLabel(
  catalog: ModelCatalogEntry[],
  provider: string | null | undefined,
  modelId: string,
) {
  if (!provider) return undefined;
  return catalog.find((entry) => entry.provider === provider && entry.id === modelId)?.label;
}
