import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

type Host = "docker" | "this-mac";

/** Choose where every bot's computer runs: the isolated Docker computer, or this machine. */
export function ComputerHostSettingsPanel() {
  const { t } = useLingui();
  const [current, setCurrent] = useState<Host | null | undefined>(undefined);
  const [pending, setPending] = useState<Host | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void rpc
      .me()
      .then((me) => {
        if (live) setCurrent(me.computerHost);
      })
      .catch((err: unknown) => {
        if (live) setError(errorText(err, t`Could not load this setting.`));
      });
    return () => {
      live = false;
    };
  }, [t]);

  async function choose(next: Host) {
    if (pending) return;
    setPending(next);
    setError(null);
    try {
      await rpc.deployment.update({ computerHost: next });
      setCurrent(next);
      setConfirming(false);
    } catch (err) {
      setError(errorText(err, t`Could not save that choice`));
    } finally {
      setPending(null);
    }
  }

  const onMac = current === "this-mac";
  return (
    <section data-testid="computer-host-settings" className="max-w-2xl">
      <h2 className="text-lg font-medium text-foreground">
        <Trans>Where bots run</Trans>
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        <Trans>
          This applies to every bot. Switching does not delete anything, and you can switch back at
          any time.
        </Trans>
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      {current === undefined && !error ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          <Trans>Loading…</Trans>
        </p>
      ) : null}
      {current !== undefined ? (
        <div className="mt-4 space-y-3">
          <div
            data-testid="host-option-docker"
            className="rounded-xl border border-border p-4"
            aria-current={!onMac}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium text-foreground">
                  <Trans>Docker computer</Trans>
                  {!onMac ? (
                    <span className="ml-2 text-[12px] text-muted-foreground">✓</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  <Trans>
                    Each bot works in an isolated computer with a desktop you can watch. Safest, but
                    slower to start and to use.
                  </Trans>
                </p>
              </div>
              {onMac ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="use-docker"
                  disabled={pending !== null}
                  onClick={() => void choose("docker")}
                >
                  {pending === "docker" ? t`Switching…` : t`Use Docker`}
                </Button>
              ) : null}
            </div>
          </div>
          <div
            data-testid="host-option-mac"
            className="rounded-xl border border-border p-4"
            aria-current={onMac}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium text-foreground">
                  <Trans>This Mac</Trans>
                  {onMac ? <span className="ml-2 text-[12px] text-muted-foreground">✓</span> : null}
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  <Trans>
                    Bots run commands on this machine and browse with a separate Chrome window. Much
                    faster. Commands run as you without asking, inside the folders the host agent
                    allows.
                  </Trans>
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  <Trans>
                    Needs the host agent and its Chrome running (start-agent.sh and
                    start-chrome.sh).
                  </Trans>
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  <Trans>
                    Only the first part of a bot's saved files comes along (up to 512 MB), and
                    logins stored inside the Docker computer, such as GitHub access, are not there.
                    Bots that work from repository clones should stay on Docker. Bots on your Mac
                    share one sandbox folder and can see each other's files, and files made there
                    are not included when you export a bot.
                  </Trans>
                </p>
              </div>
              {!onMac && !confirming ? (
                <Button
                  type="button"
                  size="sm"
                  data-testid="use-mac"
                  disabled={pending !== null}
                  onClick={() => setConfirming(true)}
                >
                  <Trans>Use this Mac</Trans>
                </Button>
              ) : null}
            </div>
            {!onMac && confirming ? (
              <div
                data-testid="use-mac-confirm"
                className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[13px]"
              >
                <span className="flex-1">
                  <Trans>Every bot will be able to run commands on this machine. Continue?</Trans>
                </span>
                <Button
                  type="button"
                  size="sm"
                  data-testid="use-mac-yes"
                  disabled={pending !== null}
                  onClick={() => void choose("this-mac")}
                >
                  {pending === "this-mac" ? t`Switching…` : t`Yes, switch`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                >
                  <Trans>Cancel</Trans>
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
