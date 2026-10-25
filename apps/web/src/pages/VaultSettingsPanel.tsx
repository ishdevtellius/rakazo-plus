import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, VaultLoginMetadata } from "@rakazo/contracts";
import { encodeLoginSecret } from "@rakazo/contracts";
import { Button, Input } from "@rakazo/ui-web";
import { useEffect, useId, useState } from "react";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

const fieldLabelClass = "mt-3 block text-[13px] text-muted-foreground";

export function VaultSettingsPanel() {
  const { t } = useLingui();
  const ids = useId();
  const [logins, setLogins] = useState<VaultLoginMetadata[] | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [replacing, setReplacing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function refresh() {
    try {
      const [list, roster] = await Promise.all([rpc.vault.list(), rpc.bots.list()]);
      setLogins(list);
      setBots(roster);
      return true;
    } catch (err) {
      setError(errorText(err, t`Could not load the vault.`));
      return false;
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function clearProtectedFields() {
    setUsername("");
    setPassword("");
  }

  async function save(loginName: string, loginOrigin: string, replace: boolean) {
    if (busy) return false;
    const user = username.trim();
    const secret = password;
    clearProtectedFields();
    setError(null);
    if (!user || !secret) {
      setError(t`Enter a username and password`);
      return false;
    }
    setBusy(true);
    try {
      await rpc.vault.put({
        name: loginName,
        origin: loginOrigin,
        value: encodeLoginSecret({ username: user, password: secret }),
        replace,
      });
      await refresh();
      return true;
    } catch (err) {
      setError(errorText(err, t`Could not save the login`));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitAdd() {
    if (await save(name.trim(), origin.trim(), false)) {
      setAdding(false);
      setName("");
      setOrigin("");
    }
  }

  async function toggleBot(login: VaultLoginMetadata, botId: string, allowed: boolean) {
    if (busy) return;
    const next = allowed
      ? [...new Set([...login.botIds, botId])]
      : login.botIds.filter((id) => id !== botId);
    setBusy(true);
    setError(null);
    try {
      const updated = await rpc.vault.setAccess({ id: login.id, botIds: next });
      setLogins(
        (current) => current?.map((row) => (row.id === updated.id ? updated : row)) ?? null,
      );
    } catch (err) {
      setError(errorText(err, t`Could not change access`));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await rpc.vault.remove({ id });
      setRemoving(null);
      await refresh();
    } catch (err) {
      setError(errorText(err, t`Could not remove the login`));
    } finally {
      setBusy(false);
    }
  }

  const loginFields = (prefix: string) => (
    <>
      <label htmlFor={`${ids}-${prefix}-user`} className={fieldLabelClass}>
        <Trans>Username</Trans>
        <Input
          id={`${ids}-${prefix}-user`}
          data-testid={`vault-${prefix}-username`}
          autoComplete="off"
          spellCheck={false}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-1.5"
        />
      </label>
      <label htmlFor={`${ids}-${prefix}-pass`} className={fieldLabelClass}>
        <Trans>Password</Trans>
        <Input
          id={`${ids}-${prefix}-pass`}
          data-testid={`vault-${prefix}-password`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5"
        />
      </label>
    </>
  );

  return (
    <section data-testid="vault-settings" className="max-w-2xl">
      <h2 className="text-lg font-medium text-foreground">
        <Trans>Vault</Trans>
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        <Trans>
          Website logins you save once and share with the bots you choose. Passwords are encrypted
          and never shown again, and a bot can only type one into its saved site, over HTTPS. The
          bot never sees the password.
        </Trans>
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      {logins === null && !error ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          <Trans>Loading…</Trans>
        </p>
      ) : null}
      {logins?.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          <Trans>No logins saved yet.</Trans>
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {logins?.map((login) => (
          <li
            key={login.id}
            data-testid={`vault-login-${login.name}`}
            className="rounded-xl border border-border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-foreground">{login.name}</div>
                <div className="truncate text-[12px] text-muted-foreground">{login.origin}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setOpen(open === login.id ? null : login.id)}
                >
                  {login.botIds.length === 1 ? t`1 bot` : t`${login.botIds.length} bots`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    clearProtectedFields();
                    setAdding(false);
                    setReplacing(replacing === login.id ? null : login.id);
                  }}
                >
                  <Trans>Replace</Trans>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRemoving(removing === login.id ? null : login.id)}
                >
                  <Trans>Remove</Trans>
                </Button>
              </div>
            </div>
            {open === login.id ? (
              <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                <p className="text-[12px] text-muted-foreground">
                  <Trans>Bots that may sign in with this login:</Trans>
                </p>
                {bots.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    <Trans>No bots yet.</Trans>
                  </p>
                ) : null}
                {bots.map((bot) => (
                  <label key={bot.id} className="flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      data-testid={`vault-access-${login.name}-${bot.id}`}
                      disabled={busy}
                      checked={login.botIds.includes(bot.id)}
                      onChange={(event) => void toggleBot(login, bot.id, event.target.checked)}
                    />
                    <span className="truncate">{bot.name}</span>
                  </label>
                ))}
              </div>
            ) : null}
            {replacing === login.id ? (
              <div className="mt-3 border-t border-border pt-3">
                {loginFields("replace")}
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !username.trim() || !password}
                    onClick={async () => {
                      if (await save(login.name, login.origin, true)) setReplacing(null);
                    }}
                  >
                    <Trans>Save new login</Trans>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      clearProtectedFields();
                      setReplacing(null);
                    }}
                  >
                    <Trans>Cancel</Trans>
                  </Button>
                </div>
              </div>
            ) : null}
            {removing === login.id ? (
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[13px]">
                <span className="flex-1">
                  <Trans>Remove {login.name}? No bot will be able to use it.</Trans>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void confirmRemove(login.id)}
                >
                  <Trans>Remove</Trans>
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setRemoving(null)}>
                  <Trans>Cancel</Trans>
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="mt-4 rounded-xl border border-border p-4">
          <label htmlFor={`${ids}-name`} className={fieldLabelClass}>
            <Trans>Name</Trans>
            <Input
              id={`${ids}-name`}
              data-testid="vault-name"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="example"
              className="mt-1.5"
            />
            <span className="mt-1 block text-[12px] text-muted-foreground/70">
              <Trans>
                Lowercase letters, numbers, hyphens and underscores, starting with a letter.
              </Trans>
            </span>
          </label>
          <label htmlFor={`${ids}-origin`} className={fieldLabelClass}>
            <Trans>Site</Trans>
            <Input
              id={`${ids}-origin`}
              data-testid="vault-origin"
              autoComplete="off"
              spellCheck={false}
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              placeholder="https://app.example.com"
              className="mt-1.5"
            />
          </label>
          {loginFields("add")}
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              data-testid="vault-save"
              disabled={busy || !name.trim() || !origin.trim() || !username.trim() || !password}
              onClick={() => void submitAdd()}
            >
              <Trans>Save login</Trans>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                clearProtectedFields();
                setAdding(false);
              }}
            >
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          className="mt-4"
          data-testid="vault-add"
          onClick={() => {
            // One pair of fields serves both forms, so never carry one form's text into the other.
            clearProtectedFields();
            setReplacing(null);
            setAdding(true);
          }}
        >
          <Trans>Add login</Trans>
        </Button>
      )}
    </section>
  );
}
