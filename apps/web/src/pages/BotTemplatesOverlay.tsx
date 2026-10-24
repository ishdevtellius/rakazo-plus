import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot } from "@rakazo/contracts";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@rakazo/ui-web";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BOT_TEMPLATE_CATEGORIES,
  BOT_TEMPLATES,
  type BotTemplate,
  uniqueBotName,
} from "../lib/bot-templates";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

/** Create the bot with its real instructions, model and policy in one call, then its
 * routine (switched off: the user turns it on after connecting the apps). */
export async function installBotTemplate(template: BotTemplate, existingNames: readonly string[]) {
  const bot = await rpc.bots.create({
    name: uniqueBotName(template.name, existingNames),
    title: template.title,
    description: template.description,
    instructions: template.instructions,
    notifyOnFinish: true,
    computerMode: template.computerMode,
    modelProvider: template.model?.provider ?? null,
    modelId: template.model?.modelId ?? null,
    connectorToolPolicy: template.connectorToolPolicy,
  });
  let routineError: string | null = null;
  if (template.routine) {
    await rpc.routines
      .create({
        botId: bot.id,
        name: template.routine.name,
        prompt: template.routine.prompt,
        crons: template.routine.crons,
        timezone: template.routine.timezone,
        notify: true,
        active: false,
      })
      .catch((error: unknown) => {
        routineError = errorText(error);
      });
  }
  return { bot, routineError };
}

const SECTION_PREVIEW = 4;

function appLabel(slug: string) {
  return slug.replace(/^google/, "Google ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function TemplateCard({
  template,
  connected,
  busyId,
  onAdd,
  onOpen,
}: {
  template: BotTemplate;
  connected: ReadonlySet<string>;
  busyId: string | null;
  onAdd: (template: BotTemplate) => void;
  onOpen: (template: BotTemplate) => void;
}) {
  const { t } = useLingui();
  return (
    <div
      data-testid={`bot-template-${template.id}`}
      className="flex flex-col gap-2 rounded-xl border border-border p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          data-testid={`open-template-${template.id}`}
          onClick={() => onOpen(template)}
          className="min-w-0 text-left"
        >
          <div className="truncate text-[15px] font-medium text-foreground hover:underline">
            {template.name}
          </div>
          <div className="text-[12px] text-muted-foreground">{template.category}</div>
        </button>
        <Button
          type="button"
          size="sm"
          data-testid={`add-template-${template.id}`}
          disabled={busyId !== null}
          onClick={() => onAdd(template)}
        >
          {busyId === template.id ? t`Adding…` : t`Add`}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => onOpen(template)}
        className="text-left text-[13px] text-foreground"
      >
        {template.summary}
      </button>
      <p className="text-[12px] text-muted-foreground">{template.never}</p>
      {template.connectors.length ? (
        <p data-testid={`needs-${template.id}`} className="text-[12px] text-muted-foreground">
          <Trans>Needs:</Trans>{" "}
          {template.connectors.map((slug, index) => (
            <span key={slug}>
              {index > 0 ? ", " : ""}
              {appLabel(slug)}
              {connected.has(slug) ? " ✓" : ""}
            </span>
          ))}
        </p>
      ) : null}
      {template.routine ? (
        <p className="text-[12px] text-muted-foreground">
          <Trans>Comes with a routine that is switched off until you turn it on.</Trans>
        </p>
      ) : null}
    </div>
  );
}

function writesLabel(template: BotTemplate) {
  const mode = template.connectorToolPolicy.writes;
  return mode === "block"
    ? "Read-only: changes to connected apps are blocked"
    : mode === "ask"
      ? "Asks you before every change to a connected app"
      : "Changes allowed with normal approvals";
}

function TemplateDetail({
  template,
  connected,
  busyId,
  onAdd,
  onBack,
}: {
  template: BotTemplate;
  connected: ReadonlySet<string>;
  busyId: string | null;
  onAdd: (template: BotTemplate) => void;
  onBack: () => void;
}) {
  const { t } = useLingui();
  return (
    <div
      data-testid={`template-detail-${template.id}`}
      className="min-h-0 flex-1 overflow-y-auto px-8 py-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            data-testid="template-back"
          >
            <Trans>← All templates</Trans>
          </Button>
          <h3 className="mt-2 text-[22px] font-medium text-foreground">{template.name}</h3>
          <p className="text-[13px] text-muted-foreground">
            {template.category} · {template.title}
          </p>
        </div>
        <Button
          type="button"
          data-testid={`detail-add-${template.id}`}
          disabled={busyId !== null}
          onClick={() => onAdd(template)}
        >
          {busyId === template.id ? t`Adding…` : t`Add`}
        </Button>
      </div>
      <p className="mt-4 text-[14px] text-foreground">{template.description}</p>
      <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 text-[13px] md:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">
            <Trans>Access</Trans>
          </dt>
          <dd className="text-foreground">{writesLabel(template)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <Trans>Never without your yes</Trans>
          </dt>
          <dd className="text-foreground">{template.never}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <Trans>Needs</Trans>
          </dt>
          <dd className="text-foreground">
            {template.connectors.length
              ? template.connectors
                  .map(
                    (slug) =>
                      `${appLabel(slug)}${connected.has(slug) ? " ✓ connected" : " (not connected)"}`,
                  )
                  .join(", ")
              : t`No apps`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <Trans>Model</Trans>
          </dt>
          <dd className="text-foreground">{template.model?.modelId ?? t`Your default model`}</dd>
        </div>
        {template.routine ? (
          <div className="md:col-span-2">
            <dt className="text-muted-foreground">
              <Trans>Routine (created switched off)</Trans>
            </dt>
            <dd className="text-foreground">
              {template.routine.name} · {template.routine.crons.join(", ")} ·{" "}
              {template.routine.timezone}
            </dd>
          </div>
        ) : null}
      </dl>
      <h4 className="mt-6 text-[14px] font-medium text-foreground">
        <Trans>Instructions it starts with</Trans>
      </h4>
      <pre
        data-testid="template-instructions"
        className="mt-2 max-h-[340px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-[12px] leading-relaxed text-foreground"
      >
        {template.instructions}
      </pre>
      <p className="mt-2 text-[12px] text-muted-foreground">
        <Trans>You can change anything here after adding it, in the bot's settings.</Trans>
      </p>
    </div>
  );
}

export function BotTemplatesOverlay({
  existingNames,
  onInstalled,
  onClose,
}: {
  existingNames: readonly string[];
  onInstalled: (bot: Bot, routineError: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [chip, setChip] = useState<string>("all");
  const [selected, setSelected] = useState<BotTemplate | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let live = true;
    void rpc.connections
      .list()
      .then((rows) => {
        if (!live) return;
        setConnected(
          new Set(
            rows
              .filter((row) => row.status === "connected")
              .map((row) => row.provider.toLowerCase()),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const matches = (template: BotTemplate) =>
    !needle ||
    `${template.name} ${template.summary} ${template.category} ${template.connectors.join(" ")}`
      .toLowerCase()
      .includes(needle);

  const sections = useMemo(() => {
    const visible = BOT_TEMPLATES.filter(matches);
    if (needle || chip !== "all") {
      const flat =
        chip === "all" ? visible : visible.filter((template) => template.category === chip);
      return [
        { key: "flat", title: null as string | null, items: flat, more: null as string | null },
      ];
    }
    const featured = visible.filter((template) => template.featured);
    return [
      { key: "featured", title: t`Featured`, items: featured, more: null },
      ...BOT_TEMPLATE_CATEGORIES.map((category) => ({
        key: category,
        title: category as string,
        items: visible.filter((template) => template.category === category),
        more: category as string,
      })),
    ].filter((section) => section.items.length > 0);
  }, [needle, chip, t]);

  async function install(template: BotTemplate) {
    if (busyId) return;
    setBusyId(template.id);
    setError(null);
    try {
      const { bot, routineError } = await installBotTemplate(template, existingNames);
      onInstalled(bot, routineError);
    } catch (caught) {
      setError(errorText(caught));
      setBusyId(null);
    }
  }

  const chips: Array<{ id: string; label: string }> = [
    { id: "all", label: t`All` },
    ...BOT_TEMPLATE_CATEGORIES.map((category) => ({ id: category, label: category as string })),
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-testid="bot-templates"
        className="flex h-[760px] max-h-[calc(100%-2rem)] w-[1040px] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl bg-card p-0 sm:max-w-[1040px]"
      >
        <DialogHeader className="flex-row items-start justify-between px-8 pt-7">
          <DialogTitle className="text-2xl text-foreground">
            <Trans>Bot templates</Trans>
          </DialogTitle>
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" aria-label={t`Close bot templates`} />}
          >
            <X />
          </DialogClose>
        </DialogHeader>
        {selected ? (
          <>
            {error ? (
              <p role="alert" className="px-8 pt-3 text-[13px] text-destructive">
                {error}
              </p>
            ) : null}
            <TemplateDetail
              template={selected}
              connected={connected}
              busyId={busyId}
              onAdd={(item) => void install(item)}
              onBack={() => setSelected(null)}
            />
          </>
        ) : (
          <>
            <p className="px-8 pt-1 text-[14px] text-muted-foreground">
              <Trans>
                Ready-made bots with their instructions written. They start read-only: changes to
                connected apps are blocked until you allow them in the bot's settings.
              </Trans>
            </p>
            <div className="flex flex-wrap items-center gap-2 px-8 pt-4">
              {chips.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant={chip === item.id ? "default" : "outline"}
                  aria-pressed={chip === item.id}
                  onClick={() => setChip(item.id)}
                >
                  {item.label}
                </Button>
              ))}
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t`Search templates`}
                aria-label={t`Search templates`}
                className="ml-auto h-8 w-56"
              />
            </div>
            {error ? (
              <p role="alert" className="px-8 pt-3 text-[13px] text-destructive">
                {error}
              </p>
            ) : null}
            <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-8 py-6">
              {sections.every((section) => section.items.length === 0) ? (
                <p className="text-[14px] text-muted-foreground">
                  <Trans>No templates match.</Trans>
                </p>
              ) : null}
              {sections.map((section) => {
                const shown =
                  section.more && section.items.length > SECTION_PREVIEW
                    ? section.items.slice(0, SECTION_PREVIEW)
                    : section.items;
                return (
                  <section key={section.key} data-testid={`templates-section-${section.key}`}>
                    {section.title ? (
                      <div className="mb-3 flex items-baseline justify-between">
                        <h3 className="text-[16px] font-medium text-foreground">{section.title}</h3>
                        {section.more && section.items.length > SECTION_PREVIEW ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={`view-all-${section.key}`}
                            onClick={() => setChip(section.more as string)}
                          >
                            <Trans>View all</Trans>
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {shown.map((template) => (
                        <TemplateCard
                          key={`${section.key}-${template.id}`}
                          template={template}
                          connected={connected}
                          busyId={busyId}
                          onAdd={(item) => void install(item)}
                          onOpen={setSelected}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
