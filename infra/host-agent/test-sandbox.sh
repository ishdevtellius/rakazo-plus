#!/bin/sh
# Proves the sandbox profile holds: a harmless canary file in your home folder must be unreadable,
# nothing may be written in your home folder, and the work folder must stay usable.
D="${HOST_AGENT_DIR:-$HOME/.rakazo/host-agent}"
. "$D/config.env"
REAL_HOME="$(cd "$HOME" && pwd -P)"
CANARY="$REAL_HOME/.rakazo-sandbox-canary"
fail=0
echo "canary" > "$CANARY"
check() { # description, expected (deny|allow), command...
  desc="$1"; want="$2"; shift 2
  if /usr/bin/sandbox-exec -f "$D/agent.sb" "$@" >/dev/null 2>&1; then got=allow; else got=deny; fi
  if [ "$got" = "$want" ]; then echo "ok   $desc"; else echo "FAIL $desc (expected $want)"; fail=1; fi
}
check "cannot read a file in your home folder" deny /bin/cat "$CANARY"
check "cannot list ~/.ssh" deny /bin/ls "$HOME/.ssh"
check "cannot write in your home folder" deny /bin/sh -c "echo x > '$REAL_HOME/.rakazo-sandbox-write-test'"
check "can write in the work folder" allow /bin/sh -c "echo x > '$WORK_DIR/.sandbox-write-test' && rm '$WORK_DIR/.sandbox-write-test'"
rm -f "$CANARY" "$REAL_HOME/.rakazo-sandbox-write-test"
exit $fail
